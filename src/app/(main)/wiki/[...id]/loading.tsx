// Shown instantly on navigation while the read page's server render streams in.
// The sidebar tree now lives in wiki/layout.tsx (above this Suspense boundary)
// and stays rendered, so the fallback only skeletons the content column — no
// sidebar column here, or it would double up beside the persistent rail/nav
// (#137, ADR 0010).
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="加载中"
      className="flex-1 animate-pulse overflow-hidden"
    >
      <span className="sr-only">加载中</span>
      <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-6">
        <div className="h-4 w-1/3 rounded bg-muted" />
        <div className="mt-4 h-8 w-2/3 rounded bg-muted" />
        <div className="mt-8 space-y-3 border-t pt-6">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-11/12 rounded bg-muted" />
          <div className="h-4 w-4/5 rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
