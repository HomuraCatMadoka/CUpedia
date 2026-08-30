import Link from "next/link";

import { CampusMapReadShell } from "@/components/campus-map/history-shell";
import { getOptionalUser } from "@/lib/auth-guard";
import { listCampusMapNotes } from "@/lib/campus-map/map-notes";
import type { CampusMapNoteQuery } from "@/lib/campus-map/map-notes-contract";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function CampusMapNotesRoute({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const [page, user] = await Promise.all([
    listCampusMapNotes(parseQuery(params)),
    getOptionalUser(),
  ]);
  return (
    <CampusMapReadShell
      eyebrow="MAP NOTES"
      title="地图备注"
      description="公开报告地图问题、补充现场资料，并把修正过程留在不可变时间线中。"
      actions={
        <Link className={primaryLink} href="/campus-map/notes/new">
          建立备注
        </Link>
      }
    >
      <form
        method="get"
        className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_auto]"
      >
        <label className="grid gap-1 text-sm font-semibold">
          搜索公开备注
          <input
            type="search"
            name="q"
            defaultValue={one(params.q)}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <button type="submit" className={`${primaryLink} self-end`}>
          搜索
        </button>
      </form>
      <nav aria-label="地图备注筛选" className="flex flex-wrap gap-2">
        <FilterLink href="/campus-map/notes">最近更新</FilterLink>
        <FilterLink href="/campus-map/notes?status=open">处理中</FilterLink>
        <FilterLink href="/campus-map/notes?status=closed">已关闭</FilterLink>
        {user?.id ? (
          <FilterLink
            href={`/campus-map/notes?author=${encodeURIComponent(user.id)}`}
          >
            我的备注
          </FilterLink>
        ) : null}
      </nav>
      {page.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          没有符合条件的公开备注。
        </div>
      ) : (
        <ol className="grid gap-3" aria-label="地图备注列表">
          {page.items.map((note) => (
            <li key={note.id}>
              <Link
                href={`/campus-map/notes/${note.id}`}
                className="block rounded-2xl border bg-card p-4 shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                    {note.status === "open" ? "处理中" : "已关闭"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Revision {note.revision}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 font-medium">
                  {note.excerpt || "内容不可显示"}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {note.author.nickname} · {formatDate(note.updatedAt)}
                </p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {note.placeId ? `Place ${note.placeId}` : "WGS84 地图位置"}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {page.nextCursor ? (
        <FilterLink href={withQuery(params, "cursor", page.nextCursor)}>
          下一页
        </FilterLink>
      ) : null}
    </CampusMapReadShell>
  );
}

function parseQuery(params: Search): CampusMapNoteQuery {
  const status = one(params.status);
  const common = {
    status: status === "open" || status === "closed" ? status : undefined,
    cursor: one(params.cursor),
    limit: 20,
  } as const;
  const query = one(params.q)?.trim();
  if (query) return { ...common, scope: { kind: "search", text: query } };
  const placeId = one(params.place);
  if (placeId) return { ...common, scope: { kind: "place", placeId } };
  const actorId = one(params.author);
  if (actorId) return { ...common, scope: { kind: "author", actorId } };
  const bounds = ["west", "south", "east", "north"].map((key) =>
    one(params[key]),
  );
  if (bounds.every((value) => value !== undefined)) {
    return {
      ...common,
      scope: {
        kind: "bbox",
        west: Number(bounds[0]),
        south: Number(bounds[1]),
        east: Number(bounds[2]),
        north: Number(bounds[3]),
      },
    };
  }
  return { ...common, scope: { kind: "recent" } };
}

function FilterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={secondaryLink}>
      {children}
    </Link>
  );
}

function one(value: string | string[] | undefined) {
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
  return `/campus-map/notes?${query.toString()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

const fieldClass =
  "min-h-11 rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const secondaryLink =
  "inline-flex min-h-11 items-center rounded-xl border bg-background px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
