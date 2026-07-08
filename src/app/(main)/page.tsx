import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const modules = [
  { title: "SG Wiki", href: "/wiki", description: "Survival Guides wiki" },
  { title: "Courses", href: "/courses", description: "Course reviews" },
  {
    title: "Canteen",
    href: "/canteen",
    description: "Canteen reviews",
    disabled: true,
  },
  {
    title: "Life",
    href: "/life",
    description: "Campus life guide",
    disabled: true,
  },
  {
    title: "Exchange",
    href: "/exchange",
    description: "Exchange experiences",
    disabled: true,
  },
  {
    title: "Career",
    href: "/career",
    description: "Career resources",
    disabled: true,
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">CUpedia</h1>
        <p className="mt-2 text-muted-foreground">
          Your CUHK student knowledge base
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {modules.map((module) =>
          module.disabled ? (
            <Card key={module.href} className="cursor-not-allowed opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Soon
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {module.description}
                </p>
              </CardHeader>
            </Card>
          ) : (
            <Link key={module.href} href={module.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {module.description}
                  </p>
                </CardHeader>
              </Card>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
