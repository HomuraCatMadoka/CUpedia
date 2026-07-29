/**
 * Instant Suspense fallback for force-dynamic canteen detail.
 * Without this, soft-nav waits for the full RSC (menu + votes + danmaku)
 * before updating the UI — on mobile that feels like a dead tap.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="加载中"
      className="mx-auto w-full min-w-0 max-w-5xl animate-pulse px-4 py-8 sm:px-6 sm:py-10"
    >
      <span className="sr-only">加载中</span>
      <div className="mb-4 h-11 w-11 rounded bg-[var(--canteen-line)]" />
      <div className="mb-10 space-y-3">
        <div className="h-9 w-2/3 max-w-xs rounded bg-[var(--canteen-line)] sm:h-10" />
        <div className="h-4 w-1/2 max-w-[12rem] rounded bg-[var(--canteen-line)]" />
      </div>
      <div className="mb-10 h-32 rounded-xl border border-[var(--canteen-line)] bg-[var(--canteen-surface)]" />
      <div className="canteen-ledger space-y-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="canteen-ledger-row flex items-center gap-4 px-1 py-4"
          >
            <div className="size-10 shrink-0 rounded-md bg-[var(--canteen-line)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/5 rounded bg-[var(--canteen-line)]" />
              <div className="h-3 w-1/3 rounded bg-[var(--canteen-line)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
