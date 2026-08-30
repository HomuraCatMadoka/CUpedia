import Link from "next/link";

import type {
  CampusMapChangesetSummary,
  CampusMapPlaceHistoryHead,
  CampusMapPlaceHistoryItem,
  CampusMapPublicChange,
  CampusMapPublicChangeset,
} from "@/lib/campus-map/fact-store";
import { CopyDeepLinkButton } from "@/components/campus-map/copy-deep-link-button";

const operationLabels = {
  create: "建立地点",
  update: "更新地点",
  retire: "停用地点",
  restore: "恢复地点",
  merge: "合并地点",
} as const;

const statusLabels = {
  active: "使用中",
  retired: "已停用",
  merged: "已合并",
} as const;

export function CampusMapHistoryPage({
  placeId,
  mapHref,
  head,
  items,
  nextHref,
}: {
  placeId: string;
  mapHref: string;
  head: CampusMapPlaceHistoryHead | null;
  items: CampusMapPlaceHistoryItem[];
  nextHref: string | null;
}) {
  const name = head?.name ?? "地点";

  return (
    <CampusMapReadShell
      eyebrow="校园地图"
      title={`${name}的编辑记录`}
      actions={
        <div className="flex flex-wrap gap-2">
          <ReadLink href={mapHref}>返回地图</ReadLink>
          <ReadLink href={`/campus-map/places/${placeId}`}>地点详情</ReadLink>
          <CopyDeepLinkButton />
        </div>
      }
    >
      {head?.status === "retired" ? (
        <Notice>这个地点已停用；过去的公开修订仍可读取。</Notice>
      ) : null}
      {head?.status === "merged" && head.mergedIntoPlaceId ? (
        <Notice>
          这个地点已合并。继续查看
          <Link
            className="ml-1 font-semibold underline underline-offset-4"
            href={`/campus-map/places/${head.mergedIntoPlaceId}`}
          >
            保留地点
          </Link>
          。
        </Notice>
      ) : null}
      {items.length === 0 ? (
        <EmptyState>暂无公开历史</EmptyState>
      ) : (
        <ol className="grid gap-3" aria-label="修订时间线">
          {items.map((item) => (
            <li
              key={item.id}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_180px] rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill>{statusLabels[item.status]}</StatusPill>
                <span className="text-sm font-semibold">
                  {operationLabels[item.operation]}
                </span>
                {item.content.visibility === "redacted" ? (
                  <StatusPill>内容已隐藏</StatusPill>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {item.actor.nickname} · {formatDate(item.publishedAt)}
              </p>
              <p className="mt-3 font-semibold">{item.comment}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                来源摘要：{item.sourceSummary}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ReadLink
                  href={`/campus-map/places/${placeId}/history/${item.id}`}
                >
                  查看修改详情
                </ReadLink>
              </div>
            </li>
          ))}
        </ol>
      )}
      {nextHref ? (
        <div>
          <ReadLink href={nextHref}>下一页修订</ReadLink>
        </div>
      ) : null}
    </CampusMapReadShell>
  );
}

export function CampusMapRevisionPage({
  revision,
}: {
  revision: CampusMapPlaceHistoryItem & {
    schema: {
      version: number;
      displayMetadata: Record<string, { label: string }>;
    };
  };
}) {
  const title =
    revision.content.visibility === "public"
      ? revision.content.fact.name
      : `修订 ${shortId(revision.id)}`;
  return (
    <CampusMapReadShell
      eyebrow="PLACE REVISION"
      title={title}
      description={`${operationLabels[revision.operation]} · ${formatDate(revision.publishedAt)}`}
      actions={<CopyDeepLinkButton />}
    >
      <div className="rounded-2xl border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <StatusPill>{statusLabels[revision.status]}</StatusPill>
          <StatusPill>Schema v{revision.schema.version}</StatusPill>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          作者：{revision.actor.nickname}
        </p>
        <p className="mt-3 font-semibold">{revision.comment}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          来源摘要：{revision.sourceSummary}
        </p>
        <StableId label="Revision" value={revision.id} />
        <StableId label="Changeset" value={revision.changesetId} />
        <StableId label="Place" value={revision.placeId} />
        {revision.status === "merged" && revision.mergedIntoPlaceId ? (
          <Notice>
            此地点已合并至
            <Link
              className="ml-1 font-semibold underline underline-offset-4"
              href={`/campus-map/places/${revision.mergedIntoPlaceId}`}
            >
              {revision.mergedIntoPlaceId}
            </Link>
            。
          </Notice>
        ) : null}
        {revision.content.visibility === "redacted" ? (
          <EmptyState>
            此修订内容已隐藏；稳定编号与公开时间线仍保留。
          </EmptyState>
        ) : revision.fieldDiff === null ? (
          <EmptyState>
            此修订仍公开，但较早修订已隐藏，因此不显示前后差异。
          </EmptyState>
        ) : (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(revision.fieldDiff).map(([key, value]) => (
              <DiffRow
                key={key}
                label={value.label}
                before={value.before}
                after={value.after}
              />
            ))}
          </dl>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <ReadLink href={`/campus-map/changesets/${revision.changesetId}`}>
            查看 Changeset
          </ReadLink>
          <ReadLink href={`/campus-map/places/${revision.placeId}/history`}>
            返回修订历史
          </ReadLink>
        </div>
      </div>
    </CampusMapReadShell>
  );
}

export function CampusMapChangesetPage({
  changeset,
}: {
  changeset: CampusMapPublicChangeset;
}) {
  return (
    <CampusMapReadShell
      eyebrow="CHANGESET"
      title={`Changeset ${shortId(changeset.id)}`}
      description={`${changeset.actor.nickname} · ${formatDate(changeset.publishedAt)}`}
      actions={<CopyDeepLinkButton />}
    >
      <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2">
          {changeset.reviewRequested ? (
            <StatusPill>已请求检查</StatusPill>
          ) : null}
          <StatusPill>{changeset.counts.affected} 个地点</StatusPill>
        </div>
        <h2 className="text-lg font-semibold">{changeset.comment}</h2>
        <p className="text-sm text-muted-foreground">
          来源摘要：{changeset.sourceSummary}
        </p>
        <StableId label="Changeset" value={changeset.id} />
        {changeset.revertsChangesetId ? (
          <Notice>
            这次发布恢复了较早事实，并追溯到
            <Link
              className="ml-1 font-semibold underline underline-offset-4"
              href={`/campus-map/changesets/${changeset.revertsChangesetId}`}
            >
              原 Changeset
            </Link>
            。
          </Notice>
        ) : null}
      </div>
      <div className="grid gap-4" aria-label="Changeset 修改">
        {changeset.changes.map((change) => (
          <CampusMapChangeCard key={change.revisionId} change={change} />
        ))}
      </div>
    </CampusMapReadShell>
  );
}

function CampusMapChangeCard({ change }: { change: CampusMapPublicChange }) {
  if (change.visibility === "redacted") {
    return (
      <article className="rounded-2xl border bg-card p-4 sm:p-6">
        <StatusPill>内容已隐藏</StatusPill>
        <p className="mt-3 text-sm text-muted-foreground">
          此项修改保留稳定占位，不公开原始内容。
        </p>
        <StableId label="Revision" value={change.revisionId} />
      </article>
    );
  }
  return (
    <article className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap gap-2">
        <StatusPill>{operationLabels[change.operation]}</StatusPill>
        <StatusPill>Schema v{change.schema.version}</StatusPill>
      </div>
      <StableId label="Place" value={change.placeId} />
      <StableId label="Revision" value={change.revisionId} />
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {Object.entries(change.diff.fields).map(([key, value]) => (
          <DiffRow
            key={key}
            label={value.label}
            before={value.before}
            after={value.after}
          />
        ))}
        {change.diff.position ? (
          <DiffRow
            label={change.diff.position.label}
            before={change.diff.position.before}
            after={change.diff.position.after}
          />
        ) : null}
        <DiffRow
          label="来源摘要"
          before={change.diff.provenance.before}
          after={change.diff.provenance.after}
        />
      </dl>
      <div className="mt-5">
        <ReadLink
          href={`/campus-map/places/${change.placeId}/history/${change.revisionId}`}
        >
          查看地点修订
        </ReadLink>
      </div>
    </article>
  );
}

export function CampusMapChangesetFeed({
  items,
  nextHref,
  mineHref,
}: {
  items: CampusMapChangesetSummary[];
  nextHref: string | null;
  mineHref: string | null;
}) {
  return (
    <CampusMapReadShell
      eyebrow="CAMPUS MAP"
      title="公开编辑记录"
      description="按明确范围读取已发布 Changeset；请求检查只是历史标签，不是审批队列。"
    >
      <nav className="flex flex-wrap gap-2" aria-label="编辑记录范围">
        <ReadLink href="/campus-map/changesets">最近编辑</ReadLink>
        <ReadLink href="/campus-map/changesets?scope=reviewRequested">
          已请求检查
        </ReadLink>
        <ReadLink href="/campus-map/changesets?scope=bbox&west=114.17&south=22.37&east=114.24&north=22.44">
          校园范围
        </ReadLink>
        {mineHref ? <ReadLink href={mineHref}>我的编辑</ReadLink> : null}
      </nav>
      <form
        className="flex flex-col gap-2 rounded-2xl border bg-card p-4 sm:flex-row"
        action="/campus-map/changesets"
      >
        <input type="hidden" name="scope" value="actor" />
        <label className="grow text-sm font-medium">
          作者公开 ID
          <input
            className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 font-mono text-sm"
            name="actor"
            required
          />
        </label>
        <button
          className="min-h-11 self-end rounded-xl bg-foreground px-4 text-sm font-semibold text-background"
          type="submit"
        >
          查看作者记录
        </button>
      </form>
      {items.length === 0 ? (
        <EmptyState>这个范围内暂无公开 Changeset</EmptyState>
      ) : (
        <ol className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap gap-2">
                {item.reviewRequested ? (
                  <StatusPill>已请求检查</StatusPill>
                ) : null}
                <StatusPill>{item.counts.affected} 个地点</StatusPill>
              </div>
              <h2 className="mt-3 font-semibold">{item.comment}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.actor.nickname} · {formatDate(item.publishedAt)}
              </p>
              <div className="mt-4">
                <ReadLink href={`/campus-map/changesets/${item.id}`}>
                  查看 Changeset
                </ReadLink>
              </div>
            </li>
          ))}
        </ol>
      )}
      {nextHref ? (
        <div>
          <ReadLink href={nextHref}>下一页</ReadLink>
        </div>
      ) : null}
    </CampusMapReadShell>
  );
}

export function CampusMapReadShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full min-w-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--color-emerald-500)_10%,transparent),transparent_42%)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-6">
        <header className="min-w-0">
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
            {eyebrow}
          </p>
          <div className="mt-2 flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {actions}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function CampusMapReadAlert({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CampusMapReadShell
      eyebrow="CAMPUS MAP"
      title="暂时无法显示"
      description="公开历史没有被修改，请稍后重试。"
    >
      <div
        role="alert"
        className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
      >
        {children}
      </div>
    </CampusMapReadShell>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50">
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      {children}
    </span>
  );
}

function StableId({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-2 min-w-0 break-all font-mono text-xs text-muted-foreground">
      <span className="font-sans font-semibold text-foreground">{label}：</span>
      {value}
    </p>
  );
}

function DiffRow({
  label,
  before,
  after,
}: {
  label: string;
  before: unknown;
  after: unknown;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 grid min-w-0 gap-1 text-sm">
        <span className="break-words text-red-700 line-through dark:text-red-300">
          {displayValue(before)}
        </span>
        <span className="break-words text-emerald-800 dark:text-emerald-200">
          {displayValue(after)}
        </span>
      </dd>
    </div>
  );
}

function ReadLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-xl border bg-background px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      {children}
    </Link>
  );
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(value);
}

function shortId(value: string) {
  return value.slice(0, 8);
}
