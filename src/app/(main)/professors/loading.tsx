export default function ProfessorsLoading() {
  return (
    <div
      className="min-w-0 flex-1"
      aria-label="正在加载教授目录"
      aria-busy="true"
    >
      <div className="mx-auto max-w-6xl px-5 py-8 motion-safe:animate-pulse sm:px-8 sm:py-10">
        <div className="h-9 w-40 rounded-lg bg-secondary" />
        <div className="mt-8 h-12 rounded-xl bg-secondary" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-40 rounded-xl border bg-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
