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
        <div className="mt-8 grid grid-cols-3 gap-x-2 gap-y-4 sm:gap-x-5 sm:gap-y-5 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-44 flex-col items-center justify-center px-1 py-3 sm:min-h-56 sm:px-3 sm:py-5"
            >
              <div className="size-20 rounded-full bg-secondary sm:size-32" />
              <div className="mt-3 h-4 w-20 rounded bg-secondary sm:mt-4 sm:w-28" />
              <div className="mt-2 h-3 w-16 rounded bg-secondary sm:w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
