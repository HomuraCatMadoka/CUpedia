import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  { title: "SG Wiki", href: "/wiki", description: "Survival Guides 百科" },
  { title: "课程", href: "/courses", description: "课程测评" },
  { title: "食堂", href: "/canteen", description: "食堂测评" },
  { title: "生活", href: "/life", description: "生活指南" },
  { title: "交换", href: "/exchange", description: "交换经验" },
  { title: "求职", href: "/career", description: "求职资源" },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">CUpedia</h1>
        <p className="mt-2 text-muted-foreground">你的中大百科全书</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-lg">{m.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
