"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { SUBJECT_NAMES } from "@/app/(main)/courses/subject-names";

export type SubjectOption = { subject: string; count: number };

// Credits 0–3 cover ~98% of the catalog; the 4+ tail stays reachable via
// search/subject (the backend still honors a "other" bucket if ever passed).
const CREDIT_OPTIONS = ["0", "1", "2", "3"];

// Course level = leading digit of the code number. "5000" is the 5000+ bucket
// (postgraduate); the backend maps it to leading digit ≥ 5.
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
  subjects,
}: {
  credits?: string;
  subject?: string;
  level?: string;
  subjects: SubjectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Set a filter param (empty value clears it), then navigate.
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SubjectCombobox
          subject={subject}
          subjects={subjects}
          onSelect={(v) => setParam("subject", v)}
        />

        <div className="inline-flex items-center rounded-lg border p-0.5">
          <Segment active={!credits} onClick={() => setParam("credits", "")}>
            全部学分
          </Segment>
          {CREDIT_OPTIONS.map((c) => (
            <Segment
              key={c}
              active={credits === c}
              onClick={() => setParam("credits", credits === c ? "" : c)}
            >
              {c}
            </Segment>
          ))}
        </div>

        <div className="inline-flex items-center rounded-lg border p-0.5">
          <Segment active={!level} onClick={() => setParam("level", "")}>
            全部年级
          </Segment>
          {LEVEL_OPTIONS.map((l) => (
            <Segment
              key={l.value}
              active={level === l.value}
              onClick={() =>
                setParam("level", level === l.value ? "" : l.value)
              }
            >
              {l.label}
            </Segment>
          ))}
        </div>
      </div>

      {(subject || credits || level) && (
        <div className="flex flex-wrap items-center gap-2">
          {subject && (
            <Chip onClear={() => setParam("subject", "")}>
              {subject}
              {SUBJECT_NAMES[subject] ? ` ${SUBJECT_NAMES[subject]}` : ""}
            </Chip>
          )}
          {credits && (
            <Chip onClear={() => setParam("credits", "")}>{credits} 学分</Chip>
          )}
          {level && (
            <Chip onClear={() => setParam("level", "")}>
              {level === "5000" ? "5000+" : level} 年级
            </Chip>
          )}
        </div>
      )}
    </div>
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
      onClick={onClick}
      className={cn(
        "min-w-8 rounded-md px-2.5 py-1 text-sm transition-colors",
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
      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <XIcon className="h-3 w-3" />
    </button>
  );
}

// Searchable subject picker: cmdk filters ~130 codes by typing, so the long
// flat list never appears all at once.
function SubjectCombobox({
  subject,
  subjects,
  onSelect,
}: {
  subject?: string;
  subjects: SubjectOption[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  function pick(value: string) {
    onSelect(value);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-9 min-w-36 max-w-56 items-center justify-between gap-2 rounded-lg border bg-background px-3 text-sm transition-colors hover:border-foreground/40">
        <span className={cn("truncate", !subject && "text-muted-foreground")}>
          {subject
            ? SUBJECT_NAMES[subject]
              ? `${subject} ${SUBJECT_NAMES[subject]}`
              : subject
            : "全部学科"}
        </span>
        <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="搜索学科代号…" />
          <CommandList>
            <CommandEmpty>没有匹配的学科</CommandEmpty>
            <CommandGroup>
              <CommandItem value="全部学科" onSelect={() => pick("")}>
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4",
                    subject ? "opacity-0" : "opacity-100",
                  )}
                />
                全部学科
              </CommandItem>
              {subjects.map((s) => {
                const name = SUBJECT_NAMES[s.subject];
                return (
                  <CommandItem
                    key={s.subject}
                    // cmdk filters on this value — include the name so typing
                    // Chinese matches too.
                    value={`${s.subject} ${name ?? ""}`}
                    onSelect={() => pick(s.subject)}
                    className="grid grid-cols-[1rem_4.5rem_minmax(0,1fr)_auto] [&>svg:last-child]:hidden"
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        subject === s.subject ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-mono">{s.subject}</span>
                    {name && (
                      <span className="truncate text-muted-foreground">
                        {name}
                      </span>
                    )}
                    {!name && <span />}
                    <span className="pl-2 text-right text-xs text-muted-foreground">
                      {s.count}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
