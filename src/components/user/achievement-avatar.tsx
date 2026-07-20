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
  const hasTitle = Boolean(title && size !== "xs");
  const avatarDimensions = {
    xs: "size-7 rounded-md after:rounded-md",
    sm: cn(
      hasTitle ? "size-20" : "size-11",
      hasTitle ? "rounded-xl after:rounded-xl" : "rounded-lg after:rounded-lg",
    ),
    md: cn(hasTitle ? "size-20" : "size-16", "rounded-xl after:rounded-xl"),
    lg: "size-28 rounded-xl after:rounded-xl",
    preview: "size-44 rounded-xl after:rounded-xl sm:size-48",
  }[size];
  const frameWidth = {
    xs: "w-7",
    sm: "w-20",
    md: "w-20",
    lg: "w-28",
    preview: "w-44 sm:w-48",
  }[size];
  const titleDimensions = {
    xs: "",
    sm: "min-h-7 px-1 py-0.5 text-[9px] leading-[11px]",
    md: "min-h-8 px-2 py-1 text-[10px] leading-3",
    lg: "min-h-10 px-3 py-1 text-xs leading-4",
    preview: "min-h-12 px-3 py-1 text-sm leading-5",
  }[size];

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        className={cn(
          "inline-flex flex-col",
          hasTitle &&
            cn(frameWidth, "overflow-hidden rounded-xl ring-1 ring-[#b8862e]"),
        )}
      >
        <Avatar
          className={cn(
            avatarDimensions,
            "overflow-hidden bg-white after:border-black/10",
            hasTitle && "rounded-b-none after:rounded-b-none after:border-0",
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
              "flex w-full items-center justify-center break-all border-t border-[#d8b766] bg-[#fffaf0] text-center font-medium whitespace-normal text-[#9a6815]",
              titleDimensions,
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
