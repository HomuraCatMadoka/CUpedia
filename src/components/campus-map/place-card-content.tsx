import {
  Clock3Icon,
  ExternalLinkIcon,
  GlobeIcon,
  InfoIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";

import type { CampusMapPlaceCardProjection } from "@/lib/campus-map/place-card";
import { cn } from "@/lib/utils";

export function CampusMapPlaceCardContent({
  card,
  className,
  showLocation = true,
  presentation = "detail",
}: {
  card: CampusMapPlaceCardProjection;
  className?: string;
  showLocation?: boolean;
  presentation?: "detail" | "map";
}) {
  const visibleFacts = [card.primaryFact, ...card.detailFacts].filter(
    (fact) => fact && fact.key !== "regularHours" && fact.key !== "visitNote",
  );
  const hasMoreInformation =
    card.verification.length > 0 || card.sources.length > 0;

  const supplementary = (
    <div className="space-y-4 text-sm">
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
  );

  return (
    <div className={cn("space-y-4 text-foreground", className)}>
      {showLocation ? (
        <dl>
          <dt className="text-xs font-medium text-muted-foreground">位置</dt>
          <dd className="mt-1 text-sm leading-6">{card.locationLabel}</dd>
        </dl>
      ) : null}

      {card.visitNote ? (
        <section aria-label="到访提示" className="flex items-start gap-3">
          <InfoIcon
            aria-hidden="true"
            className="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
          />
          <h3 className="sr-only">到访提示</h3>
          <p className="whitespace-pre-line break-words text-sm leading-[1.65] text-muted-foreground">
            {card.visitNote}
          </p>
        </section>
      ) : null}

      {card.regularHours ? (
        <section aria-label="通常开放时间" className="flex items-start gap-3">
          <Clock3Icon
            aria-hidden="true"
            className="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] text-muted-foreground">通常开放时间</h3>
            {card.regularHours.intervals.length > 1 ? (
              <details>
                <summary className="min-h-11 cursor-pointer rounded-lg py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {card.regularHours.summary}
                  <span className="sr-only">展开完整时间</span>
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
            {presentation === "detail" ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                香港时间 · 每周通常安排
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {visibleFacts.length > 0 ? (
        <dl className="grid gap-3">
          {visibleFacts.map((fact) =>
            fact ? (
              <div key={fact.key}>
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="mt-1 text-sm leading-6">{fact.value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}

      {card.officialActions.length > 0 ? (
        <section aria-label="官方入口">
          <h3 className="sr-only">官方入口</h3>
          <div className="grid">
            {card.officialActions.map((action) => {
              const opensNewTab = action.url.startsWith("https://");
              const ActionIcon = action.url.startsWith("tel:")
                ? PhoneIcon
                : action.url.startsWith("mailto:")
                  ? MailIcon
                  : GlobeIcon;
              return (
                <a
                  key={`${action.label}:${action.url}`}
                  href={action.url}
                  target={opensNewTab ? "_blank" : undefined}
                  rel={opensNewTab ? "noreferrer" : undefined}
                  className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ActionIcon
                    aria-hidden="true"
                    className="size-[18px] shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {action.label}
                    {presentation === "detail" || !opensNewTab ? (
                      <span className="block break-all text-xs leading-5 text-muted-foreground">
                        {action.destination}
                      </span>
                    ) : null}
                  </span>
                  {opensNewTab ? (
                    <ExternalLinkIcon
                      aria-hidden="true"
                      className="size-[15px] shrink-0 text-muted-foreground"
                    />
                  ) : null}
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      {presentation === "detail" && hasMoreInformation ? (
        <details className="border-t border-border/50 text-sm">
          <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-[13px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            资料来源与核对时间
          </summary>
          <div className="pb-3">{supplementary}</div>
        </details>
      ) : null}
    </div>
  );
}
