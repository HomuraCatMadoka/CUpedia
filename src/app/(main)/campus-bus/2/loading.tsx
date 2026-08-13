export default function Route2Loading() {
  return (
    <div className="min-h-full w-full bg-[#f5f3f7] sm:px-4 sm:py-6">
      <div
        className="mx-auto max-w-4xl overflow-hidden bg-background shadow-sm ring-1 ring-black/5 sm:rounded-2xl"
        role="status"
        aria-label="正在載入 2 號線"
      >
        <div className="h-24 animate-pulse bg-[#5b2a73] motion-reduce:animate-none" />
        <div className="h-12 animate-pulse border-b bg-muted/45 motion-reduce:animate-none" />
        <div className="h-80 animate-pulse border-b bg-muted motion-reduce:animate-none md:h-[23rem]" />
        <div className="space-y-px bg-border">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse bg-background motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
