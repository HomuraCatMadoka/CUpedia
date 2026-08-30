import {
  CampusMapChangesetFeed,
  CampusMapReadAlert,
} from "@/components/campus-map/history-shell";
import { getOptionalUser } from "@/lib/auth-guard";
import {
  CampusMapReadInputError,
  listCampusMapChangesets,
  type CampusMapChangesetFeedScope,
} from "@/lib/campus-map/fact-store";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function CampusMapChangesetsRoute({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const userPromise = getOptionalUser();
  let result:
    | {
        feed: Awaited<ReturnType<typeof listCampusMapChangesets>>;
        user: Awaited<ReturnType<typeof getOptionalUser>>;
      }
    | { inputError: true };
  try {
    const scope = parseScope(params);
    const feedPromise = listCampusMapChangesets({
      scope,
      cursor: one(params.cursor),
      limit: 25,
    });
    const [feed, user] = await Promise.all([feedPromise, userPromise]);
    result = { feed, user };
  } catch (error) {
    await userPromise.catch(() => null);
    if (!(error instanceof CampusMapReadInputError)) throw error;
    result = { inputError: true };
  }
  if ("inputError" in result) {
    return (
      <CampusMapReadAlert>
        无法读取编辑记录。请检查范围或分页链接后重试。
      </CampusMapReadAlert>
    );
  }
  const nextHref = result.feed.nextCursor
    ? withQuery(params, "cursor", result.feed.nextCursor)
    : null;
  return (
    <CampusMapChangesetFeed
      items={result.feed.items}
      nextHref={nextHref}
      mineHref={
        result.user?.id
          ? `/campus-map/changesets?scope=actor&actor=${encodeURIComponent(result.user.id)}`
          : null
      }
    />
  );
}

function parseScope(params: Search): CampusMapChangesetFeedScope {
  const kind = one(params.scope) ?? "recent";
  if (kind === "recent") return { kind: "recent" };
  if (kind === "reviewRequested") return { kind: "reviewRequested" };
  if (kind === "actor") {
    const actorId = one(params.actor);
    if (!actorId) throw new CampusMapReadInputError("Missing actor scope ID");
    return { kind: "actor", actorId };
  }
  if (kind === "bbox") {
    const bounds = {
      west: Number(one(params.west)),
      south: Number(one(params.south)),
      east: Number(one(params.east)),
      north: Number(one(params.north)),
    };
    if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
      throw new CampusMapReadInputError("Invalid bbox scope");
    }
    return { kind: "bbox", bounds };
  }
  throw new CampusMapReadInputError("Unknown feed scope");
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withQuery(params: Search, key: string, value: string) {
  const query = new URLSearchParams();
  for (const [name, item] of Object.entries(params)) {
    if (name === key || item === undefined) continue;
    if (Array.isArray(item)) item.forEach((entry) => query.append(name, entry));
    else query.set(name, item);
  }
  query.set(key, value);
  return `/campus-map/changesets?${query.toString()}`;
}
