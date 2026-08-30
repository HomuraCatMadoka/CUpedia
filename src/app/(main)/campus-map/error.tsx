"use client";

export default function CampusMapReadError({ reset }: { reset: () => void }) {
  return (
    <div className="w-full px-4 py-12">
      <div
        className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:bg-amber-950 dark:text-amber-50"
        role="alert"
      >
        <h1 className="text-xl font-bold">暂时无法读取 Campus Map 历史</h1>
        <p className="mt-2 text-sm leading-6">
          公开历史没有被修改。数据库恢复后可安全重试。
        </p>
        <button
          className="mt-5 min-h-11 rounded-xl bg-amber-950 px-4 text-sm font-semibold text-amber-50 dark:bg-amber-50 dark:text-amber-950"
          onClick={reset}
          type="button"
        >
          重试
        </button>
      </div>
    </div>
  );
}
