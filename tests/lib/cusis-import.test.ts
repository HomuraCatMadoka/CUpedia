import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCusisImportSnapshot } from "@/lib/cusis-import";

function fixture(name: string) {
  return readFileSync(
    path.join(process.cwd(), "tests/fixtures/cusis", name),
    "utf8",
  );
}

describe("parseCusisImportSnapshot", () => {
  it("normalizes current and previously taken courses without exposing grades", () => {
    const snapshot = parseCusisImportSnapshot({
      capturedAt: "2026-08-27T10:00:00.000Z",
      pages: {
        current: fixture("current-courses.html"),
        history: fixture("course-history.html"),
      },
    });

    expect(snapshot).toMatchObject({
      schemaVersion: "cusis-import-snapshot.v1",
      capturedAt: "2026-08-27T10:00:00.000Z",
      sourceKind: "peoplesoft-page-adapter",
      personalCourseRecords: [
        {
          courseCode: "CSCI3100",
          termLabel: "2025-26 Term 2",
          academicYear: "2025-26",
          term: "2",
          status: "in-progress",
          sourceDataset: "current",
        },
        {
          courseCode: "ENGG2440",
          termLabel: "2025-26 Term 2",
          academicYear: "2025-26",
          term: "2",
          status: "waitlisted",
          sourceDataset: "current",
        },
        {
          courseCode: "CSCI2100",
          termLabel: "2024-25 Term 1",
          academicYear: "2024-25",
          term: "1",
          status: "completed",
          sourceDataset: "history",
        },
      ],
      datasets: {
        current: { status: "parsed", itemCount: 2 },
        history: { status: "parsed", itemCount: 1 },
        cart: { status: "not-provided", itemCount: 0 },
        requirements: { status: "not-provided", itemCount: 0 },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("SECRET_GRADE_VALUE");
  });

  it("keeps the CUSIS Shopping Cart separate and builds an advisory Requirement Snapshot", () => {
    const snapshot = parseCusisImportSnapshot({
      capturedAt: "2026-08-27T10:00:00.000Z",
      pages: {
        cart: fixture("shopping-cart.html"),
        requirements: fixture("academic-requirements.html"),
      },
    });

    expect(snapshot.personalCourseRecords).toEqual([
      {
        courseCode: "CSCI4120",
        termLabel: "2026-27 Term 1",
        academicYear: "2026-27",
        term: "1",
        status: "shopping-cart",
        sourceDataset: "cart",
      },
    ]);
    expect(snapshot.requirementSnapshot.items).toEqual([
      {
        title: "Major elective units",
        status: "not-satisfied",
        candidateCourseCodes: ["CSCI4140", "CSCI4150", "CSCI4180"],
      },
      {
        title: "University core",
        status: "satisfied",
        candidateCourseCodes: ["UGFH1000"],
      },
    ]);
    expect(snapshot.datasets).toMatchObject({
      current: { status: "not-provided", itemCount: 0 },
      history: { status: "not-provided", itemCount: 0 },
      cart: { status: "parsed", itemCount: 1 },
      requirements: { status: "parsed", itemCount: 2 },
    });
  });

  it("reports an unknown page structure instead of treating it as an empty dataset", () => {
    const snapshot = parseCusisImportSnapshot({
      capturedAt: "2026-08-27T10:00:00.000Z",
      pages: { current: fixture("unsupported-page.html") },
    });

    expect(snapshot.personalCourseRecords).toEqual([]);
    expect(snapshot.datasets.current).toEqual({
      status: "unsupported-page",
      itemCount: 0,
      reason: "unrecognized-table-structure",
    });
  });

  it("rejects a CUSIS Import Snapshot without a valid capture time", () => {
    expect(() =>
      parseCusisImportSnapshot({ capturedAt: "not-a-time", pages: {} }),
    ).toThrow("INVALID_CUSIS_CAPTURED_AT");
  });
});
