import { Badge } from "@/components/ui/badge";
import {
  PRODUCT_UPDATE_AREA_LABELS,
  PRODUCT_UPDATE_TYPE_LABELS,
  type PublicProductUpdate,
} from "@/lib/product-update-types";
import { cn } from "@/lib/utils";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Hong_Kong",
});

export function ProductUpdateMeta({
  update,
  className,
}: {
  update: PublicProductUpdate;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Badge
        variant="secondary"
        className={cn(
          update.type === "feature" &&
            "bg-emerald-950/8 text-emerald-900 dark:bg-emerald-200/12 dark:text-emerald-200",
        )}
      >
        {PRODUCT_UPDATE_TYPE_LABELS[update.type]}
      </Badge>
      {update.areas.map((area) => (
        <Badge key={area} variant="secondary">
          {PRODUCT_UPDATE_AREA_LABELS[area]}
        </Badge>
      ))}
      <time dateTime={update.publishedAt}>
        {DATE_FORMATTER.format(new Date(update.publishedAt))}
      </time>
    </div>
  );
}
