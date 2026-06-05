// Shown instantly on navigation while the read page's server render streams in.
// Mirrors the page's two-column shape — a sidebar-width column plus a content
// skeleton — so the click gives feedback immediately without layout shift (#137).
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="加载中"
      className="flex w-full animate-pulse"
    >
      <span className="sr-only">加载中</span>
      <div
        className="hidden w-[var(--sidebar-width)] shrink-0 border-r md:block"
        style={{ borderColor: "var(--sidebar-border-color)" }}
        aria-hidden
      />
      <div className="flex-1 overflow-hidden">
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
    </div>
  );
}
