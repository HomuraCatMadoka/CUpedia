import type { Metadata } from "next";

import { CusisSyncPrototype } from "./prototype-client";

export const metadata: Metadata = {
  title: "CUSIS 本地连接原型 | CUpedia",
};

export default function CusisSyncPrototypePage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-3">
        <p className="text-xs font-bold tracking-[0.18em] text-amber-700 uppercase dark:text-amber-400">
          Prototype · 只在 pnpm dev 下可用
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          用临时窗口连接 CUSIS
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          点击后，本机 Playwright 会打开独立 Chrome。请只在那个窗口登录
          CUHK；CUpedia 不接收密码或
          MFA。原型可分别检查本学期课程、课程历史、Shopping Cart
          和学业要求，也可以在一次登录中依次检查全部数据。
        </p>
      </header>

      <CusisSyncPrototype />
    </main>
  );
}
