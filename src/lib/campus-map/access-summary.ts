import type { CampusMapBrowsePlace } from "@/lib/campus-map/browse-projection";

type CampusMapAccess = CampusMapBrowsePlace["access"];

export function summarizeCampusMapAccess(
  access: CampusMapAccess,
): string | null {
  const conditions: string[] = [];

  if (access.audience === "cuhk-member") {
    conditions.push("限中大成员");
  } else if (access.audience === "library-member") {
    conditions.push("限图书馆成员");
  }

  if (access.credentialRequirement === "campus-card") {
    conditions.push("需校园卡");
  } else if (access.credentialRequirement === "library-card") {
    conditions.push("需图书证");
  } else if (access.credentialRequirement === "other") {
    conditions.push("需其他凭证");
  }

  if (access.schedule.kind === "weekly") {
    conditions.push("按时段开放");
  }
  if (access.reservationRequirement === "required") {
    conditions.push("需要预约");
  }
  if (access.temporaryStatus === "temporarily-closed") {
    conditions.push("暂时关闭");
  }

  if (conditions.length > 0) return conditions.join(" · ");

  const everyDimensionIsKnown =
    access.audience !== "unknown" &&
    access.credentialRequirement !== "unknown" &&
    access.schedule.kind !== "unknown" &&
    access.reservationRequirement !== "unknown" &&
    access.temporaryStatus !== "unknown";

  return everyDimensionIsKnown ? "公众可达" : null;
}
