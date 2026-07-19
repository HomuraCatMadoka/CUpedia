import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl, type EquippedPersonTitle } from "@/lib/user-avatar";

export function AchievementAvatar({
  image,
  title,
  size = "md",
  className,
}: {
  image?: string | null;
  title?: EquippedPersonTitle | null;
  size?: "xs" | "sm" | "md" | "lg" | "preview";
  className?: string;
}) {
  const dimensions = {
    xs: "size-7 rounded-md after:rounded-md",
    sm: "size-11 rounded-lg after:rounded-lg",
    md: "size-16 rounded-xl after:rounded-xl",
    lg: "size-28 rounded-xl after:rounded-xl",
    preview: "size-44 rounded-xl after:rounded-xl sm:size-48",
  }[size];
  const hasTitle = Boolean(title && size !== "xs");
  const frameRadius = size === "sm" ? "rounded-lg" : "rounded-xl";

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        className={cn(
          "inline-flex flex-col",
          hasTitle && cn(frameRadius, "overflow-hidden ring-1 ring-[#b8862e]"),
        )}
      >
        <Avatar
          className={cn(
            dimensions,
            "overflow-hidden bg-white after:border-black/10",
            hasTitle &&
              "rounded-b-none after:rounded-b-none after:border-[#d8b766]",
          )}
        >
          <AvatarImage
            alt="用户头像"
            className="rounded-[inherit] bg-white object-contain p-[3%]"
            src={resolveAvatarUrl(image)}
          />
          <AvatarFallback className="rounded-[inherit] bg-white">
            CU
          </AvatarFallback>
        </Avatar>
        {hasTitle && title && (
          <span
            className={cn(
              "w-full truncate border-t border-[#d8b766] bg-[#fffaf0] px-1 py-0.5 text-center font-medium text-[#9a6815]",
              size === "sm" ? "text-[10px]" : "text-xs",
              (size === "lg" || size === "preview") && "px-3 py-1 text-sm",
            )}
            title={title.displayName}
          >
            {title.displayName}
          </span>
        )}
      </div>
    </div>
  );
}
