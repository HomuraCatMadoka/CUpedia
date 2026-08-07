"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  searchProfessorDirectory,
  type ProfessorDepartmentOption,
  type ProfessorDirectorySearchOption,
} from "@/lib/professor-actions";
import { cn } from "@/lib/utils";

type ProfessorSort = "name" | "rating-count" | "rating";

export function ProfessorDirectoryFilters({
  departments,
  initialDepartment,
  initialQuery,
  sort,
  ratedOnly,
}: {
  departments: ProfessorDepartmentOption[];
  initialDepartment?: string;
  initialQuery?: string;
  sort: ProfessorSort;
  ratedOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [department, setDepartment] = useState(
    departments.some((option) => option.id === initialDepartment)
      ? initialDepartment!
      : "",
  );
  const [query, setQuery] = useState(initialQuery ?? "");
  const [options, setOptions] = useState<ProfessorDirectorySearchOption[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchRequest = useRef(0);
  const searchContainer = useRef<HTMLDivElement>(null);
  const filterState = useRef({
    query: initialQuery ?? "",
    department: departments.some((option) => option.id === initialDepartment)
      ? initialDepartment!
      : "",
    sort,
    ratedOnly,
  });
  function buildParams(values: {
    query?: string;
    department?: string;
    sort?: ProfessorSort;
    ratedOnly?: boolean;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const next = { ...filterState.current, ...values };
    const nextQuery = next.query;
    const nextDepartment = next.department;
    const nextSort = next.sort;
    const nextRatedOnly = next.ratedOnly;
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    else params.delete("q");
    if (nextDepartment) params.set("department", nextDepartment);
    else params.delete("department");
    if (nextSort === "rating-count") params.delete("sort");
    else params.set("sort", nextSort);
    if (nextRatedOnly) params.set("rated", "1");
    else params.delete("rated");
    return params;
  }

  function navigate(values: Parameters<typeof buildParams>[0]) {
    filterState.current = { ...filterState.current, ...values };
    const params = buildParams(values);
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  useEffect(() => {
    const request = searchRequest.current;
    const value = query.trim();
    if (!value) return;
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        try {
          const matches = await searchProfessorDirectory(
            value,
            department || undefined,
          );
          if (request === searchRequest.current) {
            setOptions(matches);
            setSearchError("");
          }
        } catch {
          if (request === searchRequest.current) {
            setOptions([]);
            setSearchError("搜索失败，请重试");
          }
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [department, query, searchAttempt]);

  function retrySearch() {
    searchRequest.current += 1;
    setSearchError("");
    setSearchAttempt((attempt) => attempt + 1);
  }

  function updateProfessorQuery(value: string) {
    searchRequest.current += 1;
    filterState.current.query = value;
    setQuery(value);
    setOptions([]);
    setSearchError("");
    setSuggestionsOpen(Boolean(value.trim()));
  }

  function pickDepartment(value: string) {
    searchRequest.current += 1;
    filterState.current.department = value;
    setDepartment(value);
    setOptions([]);
    navigate({ department: value });
  }

  function openProfessor(publicId: string) {
    const params = buildParams({});
    const currentQuery = params.toString();
    const from = `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
    router.push(`/professors/${publicId}?from=${encodeURIComponent(from)}`);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSuggestionsOpen(false);
        navigate({ query });
      }}
      className="mt-8 space-y-3"
    >
      <div className="min-w-0">
        <Command
          ref={searchContainer}
          shouldFilter={false}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setSuggestionsOpen(false);
            }
          }}
          className="relative overflow-visible rounded-none bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:h-12 [&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:bg-background"
        >
          <CommandInput
            aria-label="搜索教授"
            name="q"
            aria-expanded={suggestionsOpen}
            value={query}
            onValueChange={updateProfessorQuery}
            onFocus={() => setSuggestionsOpen(Boolean(query.trim()))}
            placeholder="姓名、别名或任教课程…"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSuggestionsOpen(false);
            }}
            className="h-auto"
          />
          {suggestionsOpen ? (
            <CommandList className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 max-h-64 rounded-xl border bg-popover p-1 shadow-md">
              <div aria-live="polite">
                <CommandEmpty>
                  {searching ? (
                    "搜索中…"
                  ) : searchError ? (
                    <button
                      type="button"
                      onClick={retrySearch}
                      className="min-h-11 rounded-md px-3 underline underline-offset-4"
                    >
                      搜索失败，点击重试
                    </button>
                  ) : (
                    "没有匹配的教授"
                  )}
                </CommandEmpty>
              </div>
              {options.map((option) => (
                <CommandItem
                  key={option.publicId}
                  value={`${option.name} ${option.publicId}`}
                  onSelect={() => openProfessor(option.publicId)}
                  className="block px-3 py-2 [&>svg:last-child]:hidden"
                >
                  <span className="block">{option.name}</span>
                  {option.description ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
          ) : null}
        </Command>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 md:flex md:items-center">
        <ProfessorDepartmentPicker
          departments={departments}
          value={department}
          onSelect={pickDepartment}
        />
        <ProfessorRatedFilter
          ratedOnly={ratedOnly}
          onChange={(nextRatedOnly) => navigate({ ratedOnly: nextRatedOnly })}
        />
      </div>
    </form>
  );
}

export function ProfessorDirectorySort({ sort }: { sort: ProfessorSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(nextSort: ProfessorSort) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (nextSort === "rating-count") params.delete("sort");
    else params.set("sort", nextSort);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const label =
    sort === "name" ? "姓名 A-Z" : sort === "rating" ? "评分最高" : "评价最多";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        排序
        <span className="font-medium text-foreground">{label}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {[
          ["rating-count", "评价最多"],
          ["rating", "评分最高"],
          ["name", "姓名 A-Z"],
        ].map(([value, optionLabel]) => (
          <DropdownMenuItem
            key={value}
            className="min-h-11 px-3"
            onClick={() => select(value as ProfessorSort)}
          >
            {optionLabel}
            {sort === value ? <CheckIcon className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfessorDepartmentPicker({
  departments,
  value,
  onSelect,
}: {
  departments: ProfessorDepartmentOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = departments.find((option) => option.id === value);

  function pick(nextValue: string) {
    onSelect(nextValue);
    setMobileOpen(false);
    setDesktopOpen(false);
  }

  const label = selected?.name ?? "全部学系";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="按学系或学院筛选"
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
        className="flex min-h-11 min-w-0 touch-manipulation items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
      >
        <span
          className={cn(
            "min-w-0 truncate",
            value ? "font-medium text-foreground" : "text-muted-foreground",
          )}
          title={selected?.name}
        >
          {label}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground"
        />
      </button>

      <Drawer.Root
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        swipeDirection="down"
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/30 opacity-100 backdrop-blur-[1px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden" />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-hidden md:hidden">
            <Drawer.Popup
              initialFocus={closeRef}
              finalFocus={triggerRef}
              className="pointer-events-auto max-h-[82dvh] w-full translate-y-0 rounded-t-3xl bg-background shadow-2xl outline-none transition-transform duration-300 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full"
            >
              <Drawer.Content className="flex max-h-[82dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" />
                <div className="flex min-h-14 shrink-0 items-center border-b px-4">
                  <Drawer.Title className="text-lg font-semibold tracking-tight">
                    选择学系
                  </Drawer.Title>
                  <Drawer.Close
                    ref={closeRef}
                    className="ml-auto flex size-11 touch-manipulation items-center justify-center rounded-xl bg-muted text-muted-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="关闭学系选择"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </Drawer.Close>
                </div>
                <ProfessorDepartmentCommand
                  departments={departments}
                  value={value}
                  onSelect={pick}
                  className="min-h-0 rounded-none! bg-background p-3 pt-2"
                  listClassName="max-h-[58dvh] overscroll-contain"
                />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>

      <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
        <PopoverTrigger
          type="button"
          aria-label="按学系或学院筛选"
          className="hidden h-11 min-w-0 items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex md:w-80"
        >
          <span
            className={cn(
              "min-w-0 truncate",
              value ? "font-medium text-foreground" : "text-muted-foreground",
            )}
            title={selected?.name}
          >
            {label}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-0">
          <ProfessorDepartmentCommand
            departments={departments}
            value={value}
            onSelect={pick}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

function ProfessorDepartmentCommand({
  departments,
  value,
  onSelect,
  className,
  listClassName,
}: {
  departments: ProfessorDepartmentOption[];
  value: string;
  onSelect: (value: string) => void;
  className?: string;
  listClassName?: string;
}) {
  return (
    <Command className={className}>
      <CommandInput
        aria-label="搜索学系或学院"
        name="department-query"
        autoComplete="off"
        placeholder="搜索学系或学院…"
      />
      <CommandList className={listClassName}>
        <CommandEmpty>没有匹配的学系或学院</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value="全部学系 学院"
            onSelect={() => onSelect("")}
            className="min-h-11"
          >
            <CheckIcon
              className={cn("mr-2 size-4", value ? "opacity-0" : "opacity-100")}
            />
            <span className="text-muted-foreground">全部学系</span>
          </CommandItem>
          {departments.map((option) => (
            <CommandItem
              key={option.id}
              value={`${option.name} ${option.id}`}
              onSelect={() => onSelect(option.id)}
              className="grid min-h-11 grid-cols-[1rem_minmax(0,1fr)_auto] items-start py-2 [&>svg:last-child]:hidden"
            >
              <CheckIcon
                className={cn(
                  "mt-0.5 mr-2 size-4 shrink-0",
                  value === option.id ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="line-clamp-2 break-words leading-5">
                {option.name}
              </span>
              <span className="pt-0.5 pl-2 text-xs text-muted-foreground tabular-nums">
                {option.count}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function ProfessorRatedFilter({
  ratedOnly,
  onChange,
}: {
  ratedOnly: boolean;
  onChange: (value: boolean) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={mobileOpen}
      className={cn(
        "flex h-11 min-w-24 touch-manipulation items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        ratedOnly ? "border-foreground/40 bg-muted" : "bg-background",
        "md:hidden",
      )}
    >
      <SlidersHorizontalIcon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      {ratedOnly ? "筛选 · 1" : "筛选"}
    </button>
  );

  return (
    <>
      {trigger}
      <Drawer.Root
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        swipeDirection="down"
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/30 opacity-100 backdrop-blur-[1px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden" />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-hidden md:hidden">
            <Drawer.Popup
              finalFocus={triggerRef}
              className="pointer-events-auto w-full translate-y-0 rounded-t-3xl bg-background shadow-2xl outline-none transition-transform duration-300 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full"
            >
              <Drawer.Content className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" />
                <div className="flex min-h-14 items-center border-b px-4">
                  <Drawer.Title className="text-lg font-semibold tracking-tight">
                    筛选教授
                  </Drawer.Title>
                </div>
                <ProfessorRatingChoices
                  ratedOnly={ratedOnly}
                  onChange={onChange}
                  className="space-y-1 px-4 pt-4"
                />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>

      <Popover>
        <PopoverTrigger
          type="button"
          className={cn(
            "hidden h-11 min-w-24 touch-manipulation items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex",
            ratedOnly ? "border-foreground/40 bg-muted" : "bg-background",
          )}
        >
          <SlidersHorizontalIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          {ratedOnly ? "筛选 · 1" : "筛选"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <ProfessorRatingChoices ratedOnly={ratedOnly} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </>
  );
}

function ProfessorRatingChoices({
  ratedOnly,
  onChange,
  className,
}: {
  ratedOnly: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="sr-only">评价状态</legend>
      {[
        [false, "全部教授"],
        [true, "只看有评价"],
      ].map(([value, label]) => (
        <label
          key={String(value)}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-secondary"
        >
          <input
            type="radio"
            name="professor-rating-status"
            checked={ratedOnly === value}
            onChange={() => onChange(Boolean(value))}
            className="size-4 accent-foreground"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
