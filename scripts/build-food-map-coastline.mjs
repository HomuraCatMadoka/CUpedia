/**
 * 一次性数据管道：把 Overpass natural=coastline 数据组装成陆域多边形。
 * 用法：node scripts/build-food-map-coastline.mjs <overpass.json> <out.ts>
 * 数据获取（POST，大 bbox GET 易 504）：
 *   curl -X POST https://overpass-api.de/api/interpreter \
 *     --data 'data=[out:json];way["natural"="coastline"](22.1,113.9,22.65,114.5);out geom;'
 * 输出：src/lib/food-map/hk-land.ts（提交进仓库）
 *
 * 原理：OSM 海岸线方向约定为「水在右手边」。闭合环 = 陆域（岛屿）；
 * 被 bbox 截断的开放链沿 bbox 边框闭合，选有向面积 > 0（陆地在内）的闭合法，
 * 最后用已知探针（维港/九龙湾=水，旺角/中环=陆）暴力校验所有闭合法组合。
 */
import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("usage: node scripts/build-food-map-coastline.mjs <in.json> <out.ts>");
  process.exit(1);
}

const BBOX = { minLat: 22.1, maxLat: 22.65, minLng: 113.9, maxLng: 114.5 };

// 投影参数（与 geo-projection.ts 一致）
const LNG0 = 114.05;
const LAT_TOP = 22.56;
const K = 1991;
const COS = Math.cos((22.4 * Math.PI) / 180);
const project = ([lng, lat]) => [
  Math.round((lng - LNG0) * COS * K * 2) / 2,
  Math.round((LAT_TOP - lat) * K * 2) / 2,
];

const data = JSON.parse(readFileSync(inputPath, "utf8"));
const ways = data.elements.filter((e) => e.type === "way");
const coordById = new Map();
for (const way of ways) {
  way.nodes.forEach((id, i) => {
    coordById.set(id, [way.geometry[i].lon, way.geometry[i].lat]);
  });
}

// 1. 按共享端点把 way 接成链
const chains = ways.map((w) => [...w.nodes]);
let merged = true;
while (merged) {
  merged = false;
  outer: for (let i = 0; i < chains.length; i += 1) {
    for (let j = i + 1; j < chains.length; j += 1) {
      const a = chains[i];
      const b = chains[j];
      const pairs = [
        [a[a.length - 1] === b[0], () => a.push(...b.slice(1))],
        [a[a.length - 1] === b[b.length - 1], () => a.push(...b.reverse().slice(1))],
        [a[0] === b[b.length - 1], () => a.unshift(...b.slice(0, -1))],
        [a[0] === b[0], () => a.unshift(...b.reverse().slice(0, -1))],
      ];
      for (const [match, join] of pairs) {
        if (match) {
          join();
          chains.splice(j, 1);
          merged = true;
          continue outer;
        }
      }
    }
  }
}

const closedRings = [];
const openChains = [];
for (const chain of chains) {
  const coords = chain.map((id) => coordById.get(id));
  if (chain[0] === chain[chain.length - 1]) closedRings.push(coords);
  else openChains.push(coords);
}
console.log(`ways ${ways.length} → chains ${chains.length} (closed ${closedRings.length}, open ${openChains.length})`);

// 2. 开放链沿 bbox 边框闭合（两种方向），用有向面积选陆地侧
const signedArea = (ring) => {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
};

const CORNERS = [
  [BBOX.minLng, BBOX.minLat],
  [BBOX.maxLng, BBOX.minLat],
  [BBOX.maxLng, BBOX.maxLat],
  [BBOX.minLng, BBOX.maxLat],
];
const snapToFrame = ([lng, lat]) => {
  // 把端点吸附到最近边框
  const dTop = Math.abs(lat - BBOX.maxLat);
  const dBottom = Math.abs(lat - BBOX.minLat);
  const dLeft = Math.abs(lng - BBOX.minLng);
  const dRight = Math.abs(lng - BBOX.maxLng);
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return [lng, BBOX.maxLat];
  if (min === dBottom) return [lng, BBOX.minLat];
  if (min === dLeft) return [BBOX.minLng, lat];
  return [BBOX.maxLng, lat];
};

// 沿边框从 A 走到 B 的两条路径（沿 4 角顺时针/逆时针）
function frameArc(a, b, clockwise) {
  const edges = (p) => {
    if (p[1] === BBOX.minLat) return 0; // 底边
    if (p[0] === BBOX.maxLng) return 1; // 右边
    if (p[1] === BBOX.maxLat) return 2; // 顶边
    return 3; // 左边
  };
  const posOnEdge = (p) => {
    const e = edges(p);
    if (e === 0) return p[0] - BBOX.minLng;
    if (e === 1) return p[1] - BBOX.minLat;
    if (e === 2) return BBOX.maxLng - p[0];
    return BBOX.maxLat - p[1];
  };
  const cornerPoint = (i) => CORNERS[(i + 4) % 4];
  const arc = [];
  let e = edges(a);
  let pos = posOnEdge(a);
  const dir = clockwise ? 1 : -1;
  const edgeLen = [
    BBOX.maxLng - BBOX.minLng,
    BBOX.maxLat - BBOX.minLat,
    BBOX.maxLng - BBOX.minLng,
    BBOX.maxLat - BBOX.minLat,
  ];
  const bEdge = edges(b);
  const bPos = posOnEdge(b);
  // 逐角前进直到抵达 b 所在边
  for (let steps = 0; steps < 8; steps += 1) {
    const nextE = (e + (dir === 1 ? 1 : 3)) % 4;
    const corner = cornerPoint(dir === 1 ? nextE : e);
    if (nextE === bEdge || e === bEdge) break;
    arc.push(corner);
    e = nextE;
    pos = 0;
  }
  void pos;
  void edgeLen;
  return arc;
}

function closeChain(chain, useArcA) {
  const start = snapToFrame(chain[0]);
  const end = snapToFrame(chain[chain.length - 1]);
  // 闭合环 = chain + 从 end 沿边框回到 start
  const arcA = frameArc(end, start, true);
  const arcB = frameArc(end, start, false);
  const arc = useArcA ? arcA : arcB;
  const ring = [start, ...chain, end, ...arc];
  return ring;
}

// 每个开放链有两种闭合（围出互补区域），暴力枚举 2^N 组合，
// 用探针选出「陆地在环内、海湾在环外」的正确闭合法
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
const PROBES = [
  [114.1694, 22.3191, true, "旺角"],
  [114.158, 22.283, true, "中环"],
  [114.1784, 22.373, true, "大围"],
  [114.2318, 22.4248, true, "马鞍山"],
  [114.1134, 22.5308, true, "罗湖"],
  [114.165, 22.289, false, "维港"],
  [114.215, 22.31, false, "九龙湾"],
  [114.24, 22.44, false, "吐露港"],
  [114.18, 22.23, false, "港岛南海"],
];

const openCandidates = openChains.map((chain) => [
  closeChain(chain, true),
  closeChain(chain, false),
]);

let best = null;
const totalCombos = 1 << openCandidates.length;
for (let mask = 0; mask < totalCombos; mask += 1) {
  const rings = [
    ...closedRings,
    ...openCandidates.map((candidates, i) => candidates[(mask >> i) & 1]),
  ];
  let score = 0;
  for (const [lng, lat, expectLand] of PROBES) {
    const land = rings.some((ring) => inRing(lng, lat, ring));
    if (land === expectLand) score += 1;
  }
  if (!best || score > best.score) {
    best = { score, mask, rings };
  }
}
console.log(`best closure combo: mask=${best.mask}, probes ${best.score}/${PROBES.length}`);
if (best.score < PROBES.length) {
  for (const [lng, lat, expectLand, name] of PROBES) {
    const land = best.rings.some((ring) => inRing(lng, lat, ring));
    if (land !== expectLand)
      console.log(`probe FAIL ${name}: expect ${expectLand ? "land" : "water"}, got ${land ? "land" : "water"}`);
  }
  console.error("probe failures, aborting");
  process.exit(1);
}
const landRings = best.rings;
const onLand = (lng, lat) => landRings.some((ring) => inRing(lng, lat, ring));
void onLand;

// 4. 拆分港岛环与大陆环（九龙侧区界只许画在大陆，港岛两区只许画在港岛，
// 防止 GeoAtlas 区界跨越维港把颜色带到对岸）
const CENTRAL_PROBE = [114.158, 22.283];
const islandIndex = landRings.findIndex((ring) =>
  inRing(CENTRAL_PROBE[0], CENTRAL_PROBE[1], ring),
);
if (islandIndex < 0) {
  console.error("cannot locate Hong Kong Island ring");
  process.exit(1);
}
const islandRing = landRings[islandIndex];
const mainlandRings = landRings.filter((_, i) => i !== islandIndex);
// 主大陆环（九龙+新界+深圳所在的最大陆块）：九龙城区片只允许画在它上面，
// 防止 GeoAtlas 区界压到港内小岛
const continentRing = mainlandRings.reduce((largest, ring) =>
  Math.abs(signedArea(ring)) > Math.abs(signedArea(largest)) ? ring : largest,
);

// 5. 投影 + 抽稀 + 输出
function ringToPath(ring) {
  const pts = [];
  for (const coord of ring) {
    const p = project(coord);
    const last = pts[pts.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1) continue;
    pts.push(p);
  }
  if (pts.length < 3) return "";
  return "M" + pts.map((p) => `${p[0]} ${p[1]}`).join("L") + "Z";
}

const paths = landRings.map(ringToPath).filter(Boolean);
const ts = `/**
 * GENERATED by scripts/build-food-map-coastline.mjs — 请勿手改。
 * 来源：OpenStreetMap natural=coastline（© OpenStreetMap contributors, ODbL），
 * 已投影到通勤食图画布。仅保留陆域环；海由画布底色承担。
 */
export const HK_LAND_PATHS: readonly string[] = ${JSON.stringify(paths, null, 2)};

/** 港岛陆域环（含中环探针的那一个）。 */
export const HK_ISLAND_LAND_PATH: string = ${JSON.stringify(ringToPath(islandRing))};

/** 主大陆陆域环（九龙+新界+深圳所在最大陆块）。 */
export const HK_CONTINENT_LAND_PATH: string = ${JSON.stringify(ringToPath(continentRing))};

/** 大陆及其他岛屿陆域环（不含港岛）。 */
export const HK_MAINLAND_LAND_PATHS: readonly string[] = ${JSON.stringify(mainlandRings.map(ringToPath).filter(Boolean), null, 2)};
`;
writeFileSync(outputPath, ts);
console.log(`wrote ${outputPath}: ${paths.length} land rings, ${ts.length} bytes`);
