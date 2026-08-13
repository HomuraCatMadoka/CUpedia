"use client";

import { Button } from "@/components/ui/button";

export default function Route2Error({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-full w-full place-items-center px-5 py-12">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold">暫時無法讀取 2 號線</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          請稍後再試，或前往中大交通處查看官方路線資料。
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button type="button" onClick={reset}>
            重新載入
          </Button>
          <Button
            render={
              <a
                href="https://transport.cuhk.edu.hk/tc/route/2/"
                target="_blank"
                rel="noreferrer"
              />
            }
            variant="outline"
          >
            官方資料
          </Button>
        </div>
      </div>
    </div>
  );
}
