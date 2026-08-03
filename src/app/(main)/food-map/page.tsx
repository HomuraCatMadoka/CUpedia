import type { Metadata } from "next";

import { FoodMapView } from "@/components/food-map/food-map-view";
import { FOOD_MAP_SOURCES } from "@/lib/food-map/data";

export const metadata: Metadata = {
  title: "通勤食图 | CUpedia",
  description:
    "从大学站出发，按 10、20、30 分钟港铁车程发现餐厅，形成自己的想吃候选。",
};

export default function FoodMapPage() {
  return (
    <main className="min-w-0 flex-1 bg-background">
      <div className="mx-auto w-full px-4 pt-4 pb-8 md:px-6 md:pt-6">
        <h1 className="sr-only">通勤食图</h1>

        <FoodMapView />

        <footer className="mx-auto mt-5 w-full max-w-[68rem] border-t pt-4 text-[11px] leading-5 text-muted-foreground">
          <p>
            铁路资料来自香港铁路有限公司及 DATA.GOV.HK。车程采用港铁行程指南在
            2026-07-30
            的静态快照，为预计月台至月台最短时间，可能包括候车、乘车和转乘，
            不包括闸机到月台及月台到出口的步行。
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {FOOD_MAP_SOURCES.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {source.title}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}
