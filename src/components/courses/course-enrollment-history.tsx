"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react";
import type { CourseEnrollmentView } from "@/lib/course-review-actions";

const INITIAL_ROW_LIMIT = 10;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function termsForYear(
  enrollmentHistory: CourseEnrollmentView[],
  academicYear: string,
): string[] {
  return uniqueSorted(
    enrollmentHistory
      .filter((row) => row.academicYear === academicYear)
      .map((row) => row.term),
  );
}

export function CourseEnrollmentHistory({
  enrollmentHistory,
}: {
  enrollmentHistory: CourseEnrollmentView[];
}) {
  const academicYears = useMemo(
    () =>
      uniqueSorted(enrollmentHistory.map((row) => row.academicYear)).reverse(),
    [enrollmentHistory],
  );
  const initialAcademicYear = academicYears[0] ?? "";
  const initialTerms = termsForYear(enrollmentHistory, initialAcademicYear);
  const [academicYear, setAcademicYear] = useState(initialAcademicYear);
  const [term, setTerm] = useState(initialTerms.at(-1) ?? "");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const terms = useMemo(
    () => termsForYear(enrollmentHistory, academicYear),
    [academicYear, enrollmentHistory],
  );
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return enrollmentHistory.filter((row) => {
      if (row.academicYear !== academicYear || row.term !== term) return false;
      if (!normalizedQuery) return true;
      return [row.section ?? "", ...row.instructors].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
  }, [academicYear, enrollmentHistory, query, term]);
  const visibleRows = expanded
    ? filteredRows
    : filteredRows.slice(0, INITIAL_ROW_LIMIT);
  const hiddenCount = filteredRows.length - visibleRows.length;

  function selectAcademicYear(nextAcademicYear: string) {
    const nextTerms = termsForYear(enrollmentHistory, nextAcademicYear);
    setAcademicYear(nextAcademicYear);
    setTerm(nextTerms.at(-1) ?? "");
    setExpanded(false);
  }

  function selectTerm(nextTerm: string) {
    setTerm(nextTerm);
    setExpanded(false);
  }

  return (
    <section
      id="enrollment-history"
      className="mt-4 scroll-mt-36 overflow-hidden rounded-2xl border bg-card"
    >
      <div className="border-b bg-secondary/25 px-4 py-5 sm:px-6">
        <h2 className="text-lg font-semibold">选课人数参考</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          根据 CUHK Teaching Timetable 的名额减剩余名额推算
        </p>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            学年
            <select
              value={academicYear}
              onChange={(event) => selectAcademicYear(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {academicYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-1.5">
            <legend className="text-xs font-medium text-muted-foreground">
              学期
            </legend>
            <div className="flex min-h-10 flex-wrap items-center gap-2">
              {terms.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={term === option}
                  onClick={() => selectTerm(option)}
                  className={
                    term === option
                      ? "rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      : "rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground outline-none hover:border-foreground/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          搜索 Section 或任课教授
          <span className="relative block">
            <SearchIcon
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              type="search"
              name="enrollment-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setExpanded(false);
              }}
              placeholder="例如 AA 或 Rozendaal…"
              autoComplete="off"
              className="h-10 w-full rounded-md border bg-background pr-3 pl-9 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </span>
        </label>

        <div className="overflow-hidden rounded-xl border">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[88px_minmax(0,1fr)_120px] gap-4 border-b bg-secondary/30 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid"
          >
            <span>Section</span>
            <span>任课教授</span>
            <span className="text-right">已选 / 名额</span>
          </div>

          {visibleRows.length ? (
            <ul className="divide-y">
              {visibleRows.map((row) => {
                const percentage = row.quota
                  ? Math.round((row.enrolled / row.quota) * 100)
                  : 0;
                return (
                  <li
                    key={`${row.academicYear}-${row.term}-${row.section ?? "all"}`}
                    data-testid="enrollment-row"
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 [content-visibility:auto] sm:grid-cols-[88px_minmax(0,1fr)_120px] sm:items-center sm:gap-4"
                  >
                    <span className="text-sm font-semibold">
                      {row.section ? `Section ${row.section}` : "全班"}
                    </span>
                    <span className="min-w-0 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {row.instructors.length
                        ? row.instructors.join(" · ")
                        : "未列任课教授"}
                    </span>
                    <span className="col-start-2 row-span-2 row-start-1 self-center text-right sm:col-start-3 sm:row-span-1 sm:row-start-1">
                      <span className="block text-sm font-semibold tabular-nums">
                        {row.enrolled} / {row.quota}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {percentage}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              没有符合条件的开课记录。
            </p>
          )}
        </div>

        <div className="flex justify-end">
          {filteredRows.length > INITIAL_ROW_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium underline decoration-foreground/20 underline-offset-4 outline-none hover:decoration-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? (
                <>
                  收起记录
                  <ChevronUpIcon aria-hidden="true" className="size-3.5" />
                </>
              ) : (
                <>
                  查看其余 {hiddenCount} 个
                  <ChevronDownIcon aria-hidden="true" className="size-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
