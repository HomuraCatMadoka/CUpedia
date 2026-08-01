/**
 * 香港区议会分区（民政事务总署 18 区口径）。
 * 11 个通勤范围内的区用鲜明色，范围外 7 区用低饱和衬托色。
 * 区界几何在 hk-geometry.ts（OSM admin_level=6，真实海岸线裁剪见 hk-land.ts）。
 */

export type HkDistrictId =
  | "nc" // 北区
  | "yl" // 元朗区
  | "tp" // 大埔区
  | "st" // 沙田区
  | "ssp" // 深水埗区
  | "ktc" // 九龙城区
  | "wts" // 黄大仙区
  | "kt" // 观塘区
  | "ytm" // 油尖旺区
  | "wc" // 湾仔区
  | "cw" // 中西区
  | "ed" // 东区
  | "sd" // 南区
  | "kc" // 葵青区
  | "tw" // 荃湾区
  | "tm" // 屯门区
  | "sk" // 西贡区
  | "is"; // 离岛区

export interface HkDistrict {
  id: HkDistrictId;
  nameZh: string;
  color: string;
}

/** 30 分钟通勤范围内的 11 区用鲜明色，范围外 7 区用低饱和衬托色。 */
export const HK_DISTRICTS: readonly HkDistrict[] = [
  { id: "nc", nameZh: "北区", color: "#5b8c5a" },
  { id: "yl", nameZh: "元朗区", color: "#8a6fbe" },
  { id: "tp", nameZh: "大埔区", color: "#e08e45" },
  { id: "st", nameZh: "沙田区", color: "#3e92cc" },
  { id: "ssp", nameZh: "深水埗区", color: "#c0557a" },
  { id: "ktc", nameZh: "九龙城区", color: "#b0722f" },
  { id: "wts", nameZh: "黄大仙区", color: "#c9a227" },
  { id: "kt", nameZh: "观塘区", color: "#2e8b8b" },
  { id: "ytm", nameZh: "油尖旺区", color: "#c1443c" },
  { id: "wc", nameZh: "湾仔区", color: "#5b7ec9" },
  { id: "cw", nameZh: "中西区", color: "#6a994e" },
  { id: "ed", nameZh: "东区", color: "#8fa3a8" },
  { id: "sd", nameZh: "南区", color: "#a8ab8f" },
  { id: "kc", nameZh: "葵青区", color: "#ab9a8a" },
  { id: "tw", nameZh: "荃湾区", color: "#98a2ad" },
  { id: "tm", nameZh: "屯门区", color: "#a3a3b8" },
  { id: "sk", nameZh: "西贡区", color: "#93a98a" },
  { id: "is", nameZh: "离岛区", color: "#b0a89b" },
] as const;

const districtById = new Map(HK_DISTRICTS.map((d) => [d.id, d]));

export function getHkDistrict(id: HkDistrictId): HkDistrict {
  const district = districtById.get(id);
  if (!district) throw new Error(`Unknown district: ${id}`);
  return district;
}
