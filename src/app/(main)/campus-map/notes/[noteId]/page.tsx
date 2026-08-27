import Link from "next/link";
import { notFound } from "next/navigation";

import { CampusMapReadShell } from "@/components/campus-map/history-shell";
import { CampusMapNoteControls } from "@/components/campus-map/map-note-controls";
import { getOptionalUser } from "@/lib/auth-guard";
import { getCampusMapNote } from "@/lib/campus-map/map-notes";
import { createCampusMapNoteCorrectionContext } from "@/lib/campus-map/map-notes-contract";

export const dynamic = "force-dynamic";

const eventLabels = {
  "opening-comment": "建立备注",
  comment: "新增评论",
  resolve: "解决备注",
  reopen: "重新打开",
} as const;

const reasonLabels = {
  fixed: "已修正",
  "not-an-issue": "不是问题",
  duplicate: "重复备注",
  "insufficient-information": "资料不足",
  other: "其他",
} as const;

export default async function CampusMapNoteRoute({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;
  const user = await getOptionalUser();
  const note = await getCampusMapNote(noteId, user?.id ?? null);
  if (!note) notFound();
  const hidden = note.status === "moderator-hidden";
  const correction = note.placeId
    ? createCampusMapNoteCorrectionContext(note.id, note.placeId)
    : null;
  return (
    <CampusMapReadShell
      eyebrow="MAP NOTE"
      title={`地图备注 ${note.id.slice(0, 8)}`}
      description={`Revision ${note.revision} · ${note.status === "open" ? "处理中" : hidden ? "内容已隐藏" : "已关闭"}`}
      actions={
        <Link href="/campus-map/notes" className={secondaryLink}>
          返回备注列表
        </Link>
      }
    >
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Info
            label="作者"
            value={hidden ? "内容已隐藏" : note.author.nickname}
          />
          <Info label="更新时间" value={formatDate(note.updatedAt)} />
          {note.placeId ? <Info label="Place" value={note.placeId} /> : null}
          {note.position ? (
            <Info
              label="WGS84"
              value={`${note.position.longitude}, ${note.position.latitude}`}
            />
          ) : null}
        </dl>
        {!hidden && note.placeId ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/campus-map/places/${note.placeId}`}
              className={secondaryLink}
            >
              查看地点
            </Link>
            {correction ? (
              <Link href={correction.editHref} className={primaryLink}>
                编辑关联地点
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      {hidden ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          此备注内容已由管理员隐藏；稳定编号和事件顺序仍然保留。
        </div>
      ) : (
        <ol className="grid gap-3" aria-label="备注时间线">
          {note.events.map((event) => (
            <li
              id={`event-${event.id}`}
              key={event.id}
              className="scroll-mt-24 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                  {eventLabels[event.kind]}
                </span>
                <span className="text-sm text-muted-foreground">
                  Revision {event.revision}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {event.actor.nickname} · {formatDate(event.createdAt)}
              </p>
              {event.comment ? (
                <p className="mt-3 whitespace-pre-wrap break-words">
                  {event.comment}
                </p>
              ) : null}
              {event.resolution ? (
                <div className="mt-4 rounded-xl bg-muted/60 p-3 text-sm">
                  <p>解决原因：{reasonLabels[event.resolution.reason]}</p>
                  {event.resolution.resolvedByChangesetId ? (
                    <Link
                      href={`/campus-map/changesets/${event.resolution.resolvedByChangesetId}`}
                      className="mt-2 inline-flex font-semibold underline underline-offset-4"
                    >
                      查看关联 Changeset
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {!hidden ? (
        user?.id ? (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <CampusMapNoteControls
              noteId={note.id}
              revision={note.revision}
              status={note.status === "closed" ? "closed" : "open"}
              subscribed={note.subscribed}
            />
          </section>
        ) : (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/campus-map/notes/${note.id}`)}`}
            className={primaryLink}
          >
            登录后评论或订阅
          </Link>
        )
      ) : null}
    </CampusMapReadShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

const primaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const secondaryLink =
  "inline-flex min-h-11 items-center rounded-xl border bg-background px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
