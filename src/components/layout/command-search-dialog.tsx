"use client";

import { Command } from "cmdk";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface SearchResult {
  id: string;
  title: string;
  snippet?: string;
}

export function CommandSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<
    "initial" | "loading" | "success" | "error"
  >("initial");
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestRef = useRef<AbortController>(undefined);

  const runSearch = useCallback(async (value: string) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setStatus("loading");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`, {
        signal: request.signal,
      });
      if (!res.ok) throw new Error("Search request failed");
      const data = await res.json();
      if (request.signal.aborted) return;
      setResults(data.results ?? []);
      setStatus("success");
    } catch {
      if (request.signal.aborted) return;
      setResults([]);
      setStatus("error");
    }
  }, []);

  const search = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestRef.current?.abort();

      if (value.trim().length < 2) {
        setResults([]);
        setStatus("initial");
        return;
      }

      setStatus("loading");
      debounceRef.current = setTimeout(() => {
        void runSearch(value.trim());
      }, 300);
    },
    [runSearch],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestRef.current?.abort();
    },
    [],
  );

  function handleSelect(pageId: string) {
    router.push(`/wiki/${pageId}`);
    // Let Next commit the route transition before unmounting the command
    // palette. Closing it in the same event can cancel a pending navigation.
    window.setTimeout(() => onOpenChange(false), 0);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] -translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">搜索百科页面</DialogTitle>
        <Command
          label="搜索百科页面"
          shouldFilter={false}
          className="flex flex-col"
        >
          <div className="flex items-center border-b px-3">
            <SearchIcon
              aria-hidden="true"
              className="mr-2 size-4 shrink-0 text-muted-foreground"
            />
            <Command.Input
              value={query}
              onValueChange={search}
              placeholder="搜索百科页面..."
              aria-label="搜索百科页面"
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            {status === "initial" && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                输入至少 2 个字符，搜索百科页面
              </p>
            )}
            {status === "loading" && (
              <Command.Loading>
                <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                  搜索中...
                </p>
              </Command.Loading>
            )}
            {status === "error" && (
              <div
                role="alert"
                className="flex flex-col items-center gap-2 px-2 py-3 text-center"
              >
                <p className="text-sm text-destructive">搜索失败，请重试</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void runSearch(query.trim())}
                >
                  重试
                </Button>
              </div>
            )}
            {status === "success" && results.length === 0 && (
              <Command.Empty className="px-2 py-3 text-center text-sm text-muted-foreground">
                未找到结果
              </Command.Empty>
            )}
            {status === "success" &&
              results.map((result) => (
                <Command.Item
                  key={result.id}
                  value={result.id}
                  onSelect={() => handleSelect(result.id)}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <span className="font-medium">{result.title}</span>
                  {result.snippet && (
                    <span
                      className="line-clamp-1 text-xs text-muted-foreground [&_mark]:bg-yellow-200 [&_mark]:text-foreground"
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  )}
                </Command.Item>
              ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
