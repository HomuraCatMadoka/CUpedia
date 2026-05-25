"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface SearchResult {
  id: string;
  slug: string;
  title: string;
  snippet?: string;
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(value.trim())}`,
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSelect(slug: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/wiki/${slug}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-accent"
        aria-label="搜索 (⌘K)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[20%] -translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <Command shouldFilter={false} className="flex flex-col">
            <div className="flex items-center border-b px-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 shrink-0 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <Command.Input
                value={query}
                onValueChange={search}
                placeholder="搜索页面..."
                className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[300px] overflow-y-auto p-2">
              {loading && (
                <Command.Loading>
                  <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                    搜索中...
                  </p>
                </Command.Loading>
              )}
              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <Command.Empty className="px-2 py-3 text-center text-sm text-muted-foreground">
                  未找到结果
                </Command.Empty>
              )}
              {results.map((r) => (
                <Command.Item
                  key={r.id}
                  value={r.slug}
                  onSelect={() => handleSelect(r.slug)}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <span className="font-medium">{r.title}</span>
                  {r.snippet && (
                    <span
                      className="line-clamp-1 text-xs text-muted-foreground [&_mark]:bg-yellow-200 [&_mark]:text-foreground"
                      dangerouslySetInnerHTML={{ __html: r.snippet }}
                    />
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
