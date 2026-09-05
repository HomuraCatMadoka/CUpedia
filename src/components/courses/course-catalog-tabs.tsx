import Link from "next/link";

import { cn } from "@/lib/utils";

export function CourseCatalogTabs({
  active,
}: {
  active: "courses" | "professors";
}) {
  return (
    <nav aria-label="课程测评目录" className="flex min-h-9 items-center gap-5">
      {[
        { id: "courses" as const, href: "/courses", label: "课程" },
        { id: "professors" as const, href: "/professors", label: "教授" },
      ].map((item) => (
        <Link
          prefetch={false}
          key={item.id}
          href={item.href}
          aria-current={active === item.id ? "page" : undefined}
          className={cn(
            "rounded-sm py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            active === item.id
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
