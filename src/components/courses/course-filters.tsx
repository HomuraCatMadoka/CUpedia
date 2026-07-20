"use client";

import { useRef, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SubjectOption = {
  subject: string;
  name: string | null;
  count: number;
};

type CourseSort = "latest" | "rating-count";

// Credits 0–3 cover ~98% of the catalog; "other" preserves access to 4+.
const CREDIT_OPTIONS = [
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "other", label: "4+" },
];

const LEVEL_OPTIONS = [
  { value: "1000", label: "1000" },
  { value: "2000", label: "2000" },
  { value: "3000", label: "3000" },
  { value: "4000", label: "4000" },
  { value: "5000", label: "5000+" },
];

export function CourseFilters({
  credits,
  subject,
  level,
  sort,
  subjects,
}: {
  credits?: string;
  subject?: string;
  level?: string;
  sort?: CourseSort;
  subjects: SubjectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function setParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function setParam(key: string, value: string) {
    setParams({ [key]: value });
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
          <MobileSubjectPicker
            subject={subject}
            subjects={subjects}
            onSelect={(value) => setParam("subject", value)}
          />
          <MobileFilterDrawer
            credits={credits}
            level={level}
            onApply={(nextCredits, nextLevel) =>
              setParams({ credits: nextCredits, level: nextLevel })
            }
          />
        </div>

        {(credits || level) && (
          <div className="flex flex-wrap items-center gap-2">
            {credits && (
              <Chip onClear={() => setParam("credits", "")}>
                {credits === "other" ? "4+" : credits} 学分
              </Chip>
            )}
            {level && (
              <Chip onClear={() => setParam("level", "")}>
                {level === "5000" ? "5000+" : level} 年级
              </Chip>
            )}
          </div>
        )}
      </div>

      <div className="hidden space-y-3 md:block">
        <div className="flex flex-wrap items-center gap-3">
          <DesktopSubjectCombobox
            subject={subject}
            subjects={subjects}
            onSelect={(value) => setParam("subject", value)}
          />

          <DesktopFilterPopover
            credits={credits}
            level={level}
            onApply={(nextCredits, nextLevel) =>
              setParams({ credits: nextCredits, level: nextLevel })
            }
          />

          {credits && (
            <Chip onClear={() => setParam("credits", "")}>
              {credits === "other" ? "4+" : credits} 学分
            </Chip>
          )}
          {level && (
            <Chip onClear={() => setParam("level", "")}>
              {level === "5000" ? "5000+" : level} 年级
            </Chip>
          )}

          <div
            className="ml-auto inline-flex items-center rounded-lg border p-0.5"
            role="group"
            aria-label="课程排序"
          >
            <Segment
              active={sort !== "latest"}
              onClick={() => setParam("sort", "")}
            >
              评价最多
            </Segment>
            <Segment
              active={sort === "latest"}
              onClick={() => setParam("sort", "latest")}
            >
              最近更新
            </Segment>
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopFilterPopover({
  credits,
  level,
  onApply,
}: {
  credits?: string;
  level?: string;
  onApply: (credits: string, level: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftCredits, setDraftCredits] = useState(credits ?? "");
  const [draftLevel, setDraftLevel] = useState(level ?? "");

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setDraftCredits(credits ?? "");
      setDraftLevel(level ?? "");
    }
    setOpen(nextOpen);
  }

  function apply() {
    onApply(draftCredits, draftLevel);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          credits || level ? "border-foreground/40 bg-muted" : "bg-background",
        )}
      >
        <SlidersHorizontalIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        筛选
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-5 p-4">
        <DesktopChoiceGroup
          label="学分"
          value={draftCredits}
          options={CREDIT_OPTIONS}
          onChange={setDraftCredits}
        />
        <DesktopChoiceGroup
          label="课程等级"
          value={draftLevel}
          options={LEVEL_OPTIONS}
          onChange={setDraftLevel}
        />
        <button
          type="button"
          onClick={apply}
          className="flex h-9 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          查看课程
        </button>
      </PopoverContent>
    </Popover>
  );
}

function DesktopChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {[{ value: "", label: "全部" }, ...options].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 min-w-11 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              value === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:border-foreground/30",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function MobileCourseSort({ sort }: { sort: CourseSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(nextSort: CourseSort) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (nextSort === "latest") params.set("sort", "latest");
    else params.delete("sort");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden">
        排序
        <span className="font-medium text-foreground">
          {sort === "latest" ? "最近更新" : "评价最多"}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          className="min-h-11 px-3"
          onClick={() => select("latest")}
        >
          最近更新
          {sort === "latest" && <CheckIcon className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 px-3"
          onClick={() => select("rating-count")}
        >
          评价最多
          {sort !== "latest" && <CheckIcon className="ml-auto" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-w-8 rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  onClear,
  children,
}: {
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-8 touch-manipulation items-center gap-1 rounded-full border bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="max-w-64 truncate">{children}</span>
      <XIcon aria-hidden="true" className="size-3" />
    </button>
  );
}

function MobileSubjectPicker({
  subject,
  subjects,
  onSelect,
}: {
  subject?: string;
  subjects: SubjectOption[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = subjects.find((option) => option.subject === subject);

  function pick(value: string) {
    onSelect(value);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 min-w-0 touch-manipulation items-center gap-1.5 rounded-xl border bg-background px-3 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className={cn(
            "min-w-0 truncate",
            subject ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {subject
            ? selected?.name
              ? `${subject} ${selected.name}`
              : subject
            : "全部学科"}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground"
        />
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="down">
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
                    选择学科
                  </Drawer.Title>
                  <Drawer.Close
                    ref={closeRef}
                    className="ml-auto flex size-11 touch-manipulation items-center justify-center rounded-xl bg-muted text-muted-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="关闭学科选择"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </Drawer.Close>
                </div>
                <Command className="min-h-0 rounded-none! bg-background p-3 pt-2">
                  <CommandInput placeholder="搜索学科代码或名称…" />
                  <CommandList className="max-h-[58dvh] overscroll-contain">
                    <CommandEmpty>没有匹配的学科</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="全部学科"
                        onSelect={() => pick("")}
                        className="min-h-12 rounded-lg px-3"
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 size-4",
                            subject ? "opacity-0" : "opacity-100",
                          )}
                        />
                        <span className="text-muted-foreground">全部学科</span>
                      </CommandItem>
                      {subjects.map((option) => (
                        <CommandItem
                          key={option.subject}
                          value={`${option.subject} ${option.name ?? ""}`}
                          onSelect={() => pick(option.subject)}
                          className="grid min-h-12 grid-cols-[1rem_4.25rem_minmax(0,1fr)] rounded-lg px-3 [&>svg:last-child]:hidden"
                        >
                          <CheckIcon
                            className={cn(
                              "size-4",
                              subject === option.subject
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <span className="font-mono text-sm font-medium">
                            {option.subject}
                          </span>
                          <span
                            className="truncate text-muted-foreground"
                            title={option.name ?? undefined}
                          >
                            {option.name ?? "—"}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

function MobileFilterDrawer({
  credits,
  level,
  onApply,
}: {
  credits?: string;
  level?: string;
  onApply: (credits: string, level: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCredits, setSelectedCredits] = useState(credits ?? "");
  const [selectedLevel, setSelectedLevel] = useState(level ?? "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasActiveFilters = open
    ? Boolean(selectedCredits || selectedLevel)
    : Boolean(credits || level);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setSelectedCredits(credits ?? "");
      setSelectedLevel(level ?? "");
    }
    setOpen(nextOpen);
  }

  function selectCredits(value: string) {
    setSelectedCredits(value);
    onApply(value, selectedLevel);
  }

  function selectLevel(value: string) {
    setSelectedLevel(value);
    onApply(selectedCredits, value);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => changeOpen(true)}
        className={cn(
          "flex min-h-11 min-w-24 touch-manipulation items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          hasActiveFilters ? "border-foreground/40 bg-muted" : "bg-background",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontalIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        筛选
      </button>

      <Drawer.Root open={open} onOpenChange={changeOpen} swipeDirection="down">
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
                    筛选课程
                  </Drawer.Title>
                </div>

                <div className="space-y-6 px-4 pt-5">
                  <MobileChoiceGroup
                    label="学分"
                    value={selectedCredits}
                    options={CREDIT_OPTIONS}
                    onChange={selectCredits}
                  />
                  <MobileChoiceGroup
                    label="课程等级"
                    value={selectedLevel}
                    options={LEVEL_OPTIONS}
                    onChange={selectLevel}
                  />
                </div>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

function MobileChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <MobileChoice
          active={!value}
          onClick={() => onChange("")}
          label="全部"
        />
        {options.map((option) => (
          <MobileChoice
            key={option.value}
            active={value === option.value}
            onClick={() => onChange(option.value)}
            label={option.label}
          />
        ))}
      </div>
    </fieldset>
  );
}

function MobileChoice({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 min-w-12 touch-manipulation rounded-xl border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:border-foreground/30",
      )}
    >
      {label}
    </button>
  );
}

function DesktopSubjectCombobox({
  subject,
  subjects,
  onSelect,
}: {
  subject?: string;
  subjects: SubjectOption[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSubjectName = subjects.find(
    (option) => option.subject === subject,
  )?.name;

  function pick(value: string) {
    onSelect(value);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-9 min-w-36 max-w-80 items-center justify-between gap-2 rounded-lg border bg-background px-3 text-sm transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span
          className={cn("truncate", !subject && "text-muted-foreground")}
          title={selectedSubjectName ?? undefined}
        >
          {subject
            ? selectedSubjectName
              ? `${subject} ${selectedSubjectName}`
              : subject
            : "全部学科"}
        </span>
        <ChevronsUpDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <Command>
          <CommandInput placeholder="搜索学科代码或名称…" />
          <CommandList>
            <CommandEmpty>没有匹配的学科</CommandEmpty>
            <CommandGroup>
              <CommandItem value="全部学科" onSelect={() => pick("")}>
                <CheckIcon
                  className={cn(
                    "mr-2 size-4",
                    subject ? "opacity-0" : "opacity-100",
                  )}
                />
                全部学科
              </CommandItem>
              {subjects.map((option) => (
                <CommandItem
                  key={option.subject}
                  value={`${option.subject} ${option.name ?? ""}`}
                  onSelect={() => pick(option.subject)}
                  className="grid grid-cols-[1rem_4.5rem_minmax(0,1fr)_auto] items-start py-2 [&>svg:last-child]:hidden"
                >
                  <CheckIcon
                    className={cn(
                      "mt-0.5 mr-2 size-4 shrink-0",
                      subject === option.subject ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="pt-0.5 font-mono">{option.subject}</span>
                  {option.name ? (
                    <span
                      className="line-clamp-2 break-words leading-5 text-muted-foreground"
                      title={option.name}
                    >
                      {option.name}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="pt-0.5 pl-2 text-right text-xs text-muted-foreground tabular-nums">
                    {option.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
