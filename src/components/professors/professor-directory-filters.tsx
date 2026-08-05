"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

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
  rankingMinimum,
}: {
  departments: ProfessorDepartmentOption[];
  initialDepartment?: string;
  initialQuery?: string;
  sort: ProfessorSort;
  rankingMinimum: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [department, setDepartment] = useState(
    departments.some((option) => option.id === initialDepartment)
      ? initialDepartment!
      : "",
  );
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [options, setOptions] = useState<ProfessorDirectorySearchOption[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchRequest = useRef(0);
  const selectedDepartment = departments.find(
    (option) => option.id === department,
  );

  function updateProfessorQuery(value: string, departmentId = department) {
    const request = ++searchRequest.current;
    setQuery(value);
    setSuggestionsOpen(Boolean(value.trim()));
    if (!value.trim()) {
      setOptions([]);
      return;
    }
    setOptions([]);
    startSearch(async () => {
      try {
        const matches = await searchProfessorDirectory(
          value,
          departmentId || undefined,
        );
        if (request === searchRequest.current) setOptions(matches);
      } catch {
        if (request === searchRequest.current) setOptions([]);
      }
    });
  }

  function pickDepartment(value: string) {
    setDepartment(value);
    setDepartmentOpen(false);
    if (query.trim()) updateProfessorQuery(query, value);
  }

  function openProfessor(publicId: string) {
    const currentQuery = searchParams.toString();
    const from = `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
    router.push(`/professors/${publicId}?from=${encodeURIComponent(from)}`);
  }

  return (
    <form className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px_200px_auto]">
      <Command
        shouldFilter={false}
        className="relative overflow-visible rounded-xl border bg-background p-0"
      >
        <CommandInput
          aria-label="搜索教授"
          name="q"
          value={query}
          onValueChange={updateProfessorQuery}
          onFocus={() => setSuggestionsOpen(Boolean(query.trim()))}
          placeholder="搜索教授姓名或别名…"
          autoComplete="off"
          spellCheck={false}
          className="h-10"
        />
        {suggestionsOpen ? (
          <CommandList className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 max-h-64 rounded-xl border bg-popover p-1 shadow-md">
            <CommandEmpty>
              {searching ? "搜索中…" : "没有匹配的教授"}
            </CommandEmpty>
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

      <input type="hidden" name="department" value={department} />
      <Popover open={departmentOpen} onOpenChange={setDepartmentOpen}>
        <PopoverTrigger
          type="button"
          aria-label="按学系或学院筛选"
          className="inline-flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-xl border bg-background px-4 text-sm outline-none transition-[border-color,box-shadow] hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
        >
          <span
            className={cn(
              "truncate",
              !selectedDepartment && "text-muted-foreground",
            )}
            title={selectedDepartment?.name}
          >
            {selectedDepartment?.name ?? "全部学系 / 学院"}
          </span>
          <ChevronsUpDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2.5rem))] p-0"
        >
          <Command>
            <CommandInput placeholder="搜索学系或学院…" />
            <CommandList>
              <CommandEmpty>没有匹配的学系或学院</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="全部学系 学院"
                  onSelect={() => pickDepartment("")}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      department ? "opacity-0" : "opacity-100",
                    )}
                  />
                  全部学系 / 学院
                </CommandItem>
                {departments.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${option.name} ${option.id}`}
                    onSelect={() => pickDepartment(option.id)}
                    className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start py-2 [&>svg:last-child]:hidden"
                  >
                    <CheckIcon
                      className={cn(
                        "mt-0.5 mr-2 size-4 shrink-0",
                        department === option.id ? "opacity-100" : "opacity-0",
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
        </PopoverContent>
      </Popover>

      <label>
        <span className="sr-only">教授排序</span>
        <select
          name="sort"
          defaultValue={sort}
          className="min-h-12 w-full rounded-xl border bg-background px-4 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
        >
          <option value="name">按姓名</option>
          <option value="rating-count">按测评数</option>
          <option value="rating">评分最高（至少 {rankingMinimum} 份）</option>
        </select>
      </label>
      <button
        type="submit"
        className="min-h-12 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        搜索
      </button>
    </form>
  );
}
