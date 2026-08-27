"use client";

import { useCallback, useEffect, useState } from "react";

type SessionStatus = {
  phase: "idle" | "waiting-for-login" | "authenticated";
  startedAt: string | null;
  currentUrl: string | null;
  pageTitle: string | null;
  authenticated: boolean;
};

type PrototypeResult = {
  schemaVersion: string;
  capturedAt: string;
  dataset: Dataset;
  sourceComponent: string;
  courses: Array<{ courseCode: string }>;
  diagnostics: {
    frameCount: number;
    inspectedFrameUrls: string[];
    visibleTextCharacters: number;
    pageTitle: string;
    formCount: number;
    tableCount: number;
    statusSignal:
      | "not-authorized"
      | "no-courses"
      | "component-loaded"
      | "thin-page";
    network: {
      exchanges: Array<{
        method: string;
        url: string;
        resourceType: string;
        queryFieldNames: string[];
        postFieldNames: string[];
        responseStatus: number | null;
        responseContentType: string | null;
      }>;
      truncated: boolean;
      integrationBrokerSeen: boolean;
    };
  };
};

type Dataset = "current" | "history" | "cart" | "requirements";
type ReadTarget = Dataset | "all";

const initialStatus: SessionStatus = {
  phase: "idle",
  startedAt: null,
  currentUrl: null,
  pageTitle: null,
  authenticated: false,
};

async function callSession(
  method: "GET" | "POST" | "PUT" | "DELETE",
  dataset?: ReadTarget,
) {
  const response = await fetch("/api/prototypes/cusis-session", {
    method,
    cache: "no-store",
    headers: dataset ? { "Content-Type": "application/json" } : undefined,
    body: dataset ? JSON.stringify({ dataset }) : undefined,
  });
  const body = (await response.json()) as { error?: string } & Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

export function CusisSyncPrototype() {
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [result, setResult] = useState<
    PrototypeResult | { results: PrototypeResult[] } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = (await callSession("GET")) as SessionStatus;
    setStatus(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void callSession("GET")
        .then((next) => {
          if (!cancelled) setStatus(next as SessionStatus);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (status.phase !== "waiting-for-login") return;
    const interval = window.setInterval(() => {
      void refresh().catch((nextError: unknown) => {
        setError(
          nextError instanceof Error ? nextError.message : "状态读取失败",
        );
      });
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [refresh, status.phase]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const phaseLabel = {
    idle: "尚未连接",
    "waiting-for-login": "等待你完成 CUHK 登录",
    authenticated: "已回到 CUSIS，可以读取",
  }[status.phase];

  function readDataset(dataset: ReadTarget) {
    return run(async () => {
      const next = (await callSession("PUT", dataset)) as
        | PrototypeResult
        | { results: PrototypeResult[] };
      setResult(next);
      setStatus(initialStatus);
    });
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">当前状态</p>
          <p className="font-semibold">{phaseLabel}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status.authenticated
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {status.authenticated ? "Session ready" : "No reusable session"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || status.phase !== "idle"}
          onClick={() =>
            void run(async () => {
              setResult(null);
              setStatus((await callSession("POST")) as SessionStatus);
            })
          }
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          打开 CUSIS 登录窗口
        </button>
        <button
          type="button"
          disabled={busy || status.phase === "idle"}
          onClick={() => void run(refresh)}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          检查登录状态
        </button>
        <button
          type="button"
          disabled={busy || !status.authenticated}
          onClick={() => void readDataset("current")}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          读取本学期课程并销毁窗口
        </button>
        <button
          type="button"
          disabled={busy || !status.authenticated}
          onClick={() => void readDataset("history")}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          读取课程历史并销毁窗口
        </button>
        <button
          type="button"
          disabled={busy || !status.authenticated}
          onClick={() => void readDataset("cart")}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          读取 Shopping Cart 并销毁窗口
        </button>
        <button
          type="button"
          disabled={busy || !status.authenticated}
          onClick={() => void readDataset("requirements")}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          读取学业要求并销毁窗口
        </button>
        <button
          type="button"
          disabled={busy || !status.authenticated}
          onClick={() => void readDataset("all")}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          读取全部并销毁窗口
        </button>
        <button
          type="button"
          disabled={busy || status.phase === "idle"}
          onClick={() =>
            void run(async () => {
              await callSession("DELETE");
              setStatus(initialStatus);
            })
          }
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
        >
          取消并销毁窗口
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-muted-foreground">页面标题</p>
          <p className="mt-1 break-words font-medium">
            {status.pageTitle ?? "—"}
          </p>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-muted-foreground">当前地址（已移除查询参数）</p>
          <p className="mt-1 break-all font-mono text-xs">
            {status.currentUrl ?? "—"}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">原型输出</p>
        <pre className="max-h-80 overflow-auto rounded-xl bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
          {JSON.stringify(result ?? status, null, 2)}
        </pre>
      </div>

      <p className="text-xs text-muted-foreground">
        会话最长保留 10 分钟。成功、取消或超时都会关闭 browser
        context；原型不会写入数据库，也不会导出 cookie、storageState、成绩或页面
        HTML。
      </p>
    </section>
  );
}
