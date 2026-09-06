import type { CampusMapPlaceCardProjection } from "@/lib/campus-map/place-card";
import { cn } from "@/lib/utils";

export function CampusMapPlaceCardContent({
  card,
  className,
  showLocation = true,
}: {
  card: CampusMapPlaceCardProjection;
  className?: string;
  showLocation?: boolean;
}) {
  const hasMoreInformation =
    card.detailFacts.length > 0 ||
    card.verification.length > 0 ||
    card.sources.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {showLocation || card.primaryFact ? (
        <dl className="grid gap-3">
          {showLocation ? (
            <div
              className={cn(
                card.locationIsPrimary && "rounded-xl bg-[#edf5f1] px-3 py-2.5",
              )}
            >
              <dt
                className={cn(
                  "text-xs font-semibold text-neutral-500",
                  card.locationIsPrimary && "text-[#47685b]",
                )}
              >
                位置
              </dt>
              <dd
                className={cn(
                  "mt-1 text-sm font-medium text-neutral-900",
                  card.locationIsPrimary &&
                    "font-semibold leading-6 text-[#174b38]",
                )}
              >
                {card.locationLabel}
              </dd>
            </div>
          ) : null}
          {card.primaryFact ? (
            <div className="rounded-xl bg-[#edf5f1] px-3 py-2.5">
              <dt className="text-xs font-semibold text-[#47685b]">
                {card.primaryFact.label}
              </dt>
              <dd className="mt-1 text-sm font-semibold leading-6 text-[#174b38]">
                {card.primaryFact.value}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {card.officialActions.length > 0 ? (
        <div aria-label="官方入口" className="grid gap-2 sm:grid-cols-2">
          {card.officialActions.map((action, index) => {
            const opensNewTab = action.url.startsWith("https://");
            return (
              <a
                key={`${action.label}:${action.url}`}
                href={action.url}
                target={opensNewTab ? "_blank" : undefined}
                rel={opensNewTab ? "noreferrer" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2",
                  index === 0
                    ? "border-[#174b38] bg-[#174b38] text-white hover:bg-[#123d2e]"
                    : "border-[#174b38]/30 text-[#174b38] hover:bg-[#edf5f1]",
                )}
              >
                <span className="shrink-0 whitespace-nowrap">
                  {action.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-xs font-normal opacity-75">
                  {action.destination}
                </span>
              </a>
            );
          })}
        </div>
      ) : null}

      {hasMoreInformation ? (
        <details className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm">
          <summary className="min-h-8 cursor-pointer font-semibold text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]">
            查看其他已知资料与来源
          </summary>
          <div className="mt-3 space-y-4 border-t border-black/8 pt-3">
            {card.detailFacts.length > 0 ? (
              <dl className="grid gap-3">
                {card.detailFacts.map((fact) => (
                  <div key={fact.key}>
                    <dt className="text-xs font-semibold text-neutral-500">
                      {fact.label}
                    </dt>
                    <dd className="mt-1 leading-6 text-neutral-800">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {card.verification.length > 0 ? (
              <ul className="space-y-1 text-xs leading-5 text-neutral-600">
                {card.verification.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {card.sources.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold text-neutral-700">
                  资料来源
                </h3>
                <ul className="mt-1 space-y-1 text-xs leading-5 text-neutral-600">
                  {card.sources.map((source, index) => (
                    <li key={`${source}:${index}`}>{source}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
