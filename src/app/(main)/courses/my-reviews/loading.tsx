export default function MyCourseReviewsLoading() {
  return (
    <div
      className="flex-1 overflow-y-auto"
      aria-label="正在加载我的测评"
      role="status"
    >
      <div className="mx-auto max-w-3xl animate-pulse px-6 py-10">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="mt-3 h-4 w-64 rounded bg-muted" />
        <div className="mt-8 h-56 rounded-2xl border bg-muted/40" />
      </div>
    </div>
  );
}
