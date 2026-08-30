export default function CampusMapReadLoading() {
  return (
    <div className="w-full px-4 py-12" role="status" aria-live="polite">
      <div className="mx-auto max-w-4xl animate-pulse rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        正在读取公开历史…
      </div>
    </div>
  );
}
