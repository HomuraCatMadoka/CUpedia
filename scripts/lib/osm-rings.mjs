/**
 * OSM way 成员按共享端点接环（build-food-map-admin / build-food-map-rivers 共用）。
 * members: [{ geometry: [{lon, lat}, ...] }]
 * 返回闭合环数组（坐标 [[lng, lat], ...]）。
 * 注意：b.nodes.reverse() 与 b.coords.reverse() 是原地反转，b 随后被移除——
 * 修改时保持这一顺序，避免引入不一致。
 */
export function assembleRings(members) {
  const chains = members.map((m) => ({
    nodes: m.geometry.map((g) => `${g.lon},${g.lat}`),
    coords: m.geometry.map((g) => [g.lon, g.lat]),
  }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i += 1) {
      for (let j = i + 1; j < chains.length; j += 1) {
        const a = chains[i];
        const b = chains[j];
        const tryJoin = () => {
          if (a.nodes[a.nodes.length - 1] === b.nodes[0]) {
            a.nodes.push(...b.nodes.slice(1));
            a.coords.push(...b.coords.slice(1));
            return true;
          }
          if (a.nodes[a.nodes.length - 1] === b.nodes[b.nodes.length - 1]) {
            a.nodes.push(...b.nodes.reverse().slice(1));
            a.coords.push(...b.coords.reverse().slice(1));
            return true;
          }
          if (a.nodes[0] === b.nodes[b.nodes.length - 1]) {
            a.nodes.unshift(...b.nodes.slice(0, -1));
            a.coords.unshift(...b.coords.slice(0, -1));
            return true;
          }
          if (a.nodes[0] === b.nodes[0]) {
            a.nodes.unshift(...b.nodes.reverse().slice(0, -1));
            a.coords.unshift(...b.coords.reverse().slice(0, -1));
            return true;
          }
          return false;
        };
        if (tryJoin()) {
          chains.splice(j, 1);
          merged = true;
          continue outer;
        }
      }
    }
  }
  return chains
    .filter((c) => c.nodes[0] === c.nodes[c.nodes.length - 1])
    .map((c) => c.coords);
}
