import type { CampusMapPlaceCardProjection } from "@/lib/campus-map/place-card";
import { cn } from "@/lib/utils";

export function CampusMapPlaceCardContent({
  card,
  className,
  showLocation = true,
  compact = false,
}: {
  card: CampusMapPlaceCardProjection;
  className?: string;
  showLocation?: boolean;
  compact?: boolean;
}) {
  const secondaryFacts = [card.primaryFact, ...card.detailFacts].filter(
    (fact) => fact && fact.key !== "regularHours" && fact.key !== "visitNote",
  );
  const hasMoreInformation =
    secondaryFacts.length > 0 ||
    card.verification.length > 0 ||
    card.sources.length > 0;

  return (
    <div className={cn("space-y-5 text-foreground", className)}>
      {showLocation ? (
        <dl>
          <dt className="text-xs font-medium text-muted-foreground">位置</dt>
          <dd className="mt-1 text-sm leading-6">{card.locationLabel}</dd>
        </dl>
      ) : null}

      {card.visitNote ? (
        <section aria-label="到访提示">
          <h3 className="text-sm font-medium">到访提示</h3>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6">
            {card.visitNote}
          </p>
        </section>
      ) : null}

      {card.regularHours ? (
        <section aria-label="通常开放时间">
          <h3 className="text-sm font-medium">通常开放时间</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            香港时间 · 每周通常安排
          </p>
          {card.regularHours.intervals.length > 1 ? (
            <details className="mt-1">
              <summary className="min-h-11 cursor-pointer rounded-lg py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {card.regularHours.summary}
                <span className="mt-1 block text-xs text-muted-foreground">
                  展开完整时间
                </span>
              </summary>
              <ul className="mt-2 space-y-2 text-sm leading-6">
                {card.regularHours.intervals.map((interval, index) => (
                  <li key={`${interval}:${index}`}>{interval}</li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-1 text-sm leading-6">
              {card.regularHours.summary}
            </p>
          )}
        </section>
      ) : null}

      {card.officialActions.length > 0 ? (
        <section aria-label="官方入口">
          <h3 className="mb-2 text-sm font-medium">官方入口</h3>
          <div className="grid gap-2">
            {card.officialActions.map((action) => {
              const opensNewTab = action.url.startsWith("https://");
              return (
                <a
                  key={`${action.label}:${action.url}`}
                  href={action.url}
                  target={opensNewTab ? "_blank" : undefined}
                  rel={opensNewTab ? "noreferrer" : undefined}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="min-w-0 break-words font-medium">
                    {action.label}
                  </span>
                  <span className="min-w-0 max-w-[40%] break-all text-right text-xs text-muted-foreground">
                    {action.destination}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      {!compact && hasMoreInformation ? (
        <details className="rounded-2xl border border-border px-4 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-lg py-2 font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            查看其他已知资料与来源
          </summary>
          <div className="space-y-4 border-t border-border py-4">
            {secondaryFacts.length > 0 ? (
              <dl className="grid gap-3">
                {secondaryFacts.map((fact) =>
                  fact ? (
                    <div key={fact.key}>
                      <dt className="text-xs text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd className="mt-1 leading-6">{fact.value}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            ) : null}
            {card.verification.length > 0 ? (
              <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                {card.verification.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {card.sources.length > 0 ? (
              <div>
                <h3 className="text-xs font-medium">资料来源</h3>
                <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
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
