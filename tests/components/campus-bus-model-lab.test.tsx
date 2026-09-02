/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelLab } from "@/components/campus-transport/model-lab";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Campus Bus Model Lab", () => {
  it("shows read-only replay coverage and revised-route deficits", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(
      <ModelLab
        initialOverview={{
          champion: null,
          coverage: {
            firstArrivalAt: "2026-08-20T12:00:00.000Z",
            lastArrivalAt: "2026-08-20T13:00:00.000Z",
            observationCount: 39,
          },
          coverageDetails: [
            {
              ambiguityRate: 0.25,
              coverageKey:
                "2s:from-2026-09-01|segment|2s:default:2026-09-01|university>pgh1",
              dimension: "segment",
              eventDeficit: 10,
              highlightedRevisionGap: true,
              independentEventCount: 0,
              label: "大學站 → 研究生宿舍一座",
              observationCount: 0,
              patternId: "2s:default",
              patternRevisionId: "2s:default:2026-09-01",
              routeCode: "2S",
              routeId: "2s",
              routeRevisionId: "2s:from-2026-09-01",
              serviceDayCount: 0,
              serviceDayDeficit: 5,
              stopOccurrenceId: null,
            },
            {
              ambiguityRate: 0,
              coverageKey:
                "n:from-2026-09-01|stop|n:default:2026-09-01|cuhk-wp-stop-2552#1",
              dimension: "stop",
              eventDeficit: 10,
              highlightedRevisionGap: false,
              independentEventCount: 1,
              label: "大學站",
              observationCount: 3,
              patternId: "n:default",
              patternRevisionId: "n:default:2026-09-01",
              routeCode: "N",
              routeId: "n",
              routeRevisionId: "n:from-2026-09-01",
              serviceDayCount: 1,
              serviceDayDeficit: 5,
              stopOccurrenceId: "cuhk-wp-stop-2552#1",
            },
            {
              ambiguityRate: 0,
              coverageKey:
                "n:from-2026-09-01|stop|n:default:2026-09-01|cuhk-wp-stop-2552#2",
              dimension: "stop",
              eventDeficit: 10,
              highlightedRevisionGap: false,
              independentEventCount: 1,
              label: "大學站",
              observationCount: 3,
              patternId: "n:default",
              patternRevisionId: "n:default:2026-09-01",
              routeCode: "N",
              routeId: "n",
              routeRevisionId: "n:from-2026-09-01",
              serviceDayCount: 1,
              serviceDayDeficit: 5,
              stopOccurrenceId: "cuhk-wp-stop-2552#2",
            },
          ],
          experiments: [],
          replay: {
            ambiguousObservationCount: 4,
            candidateCount: 52,
            eventCount: 13,
            excludedObservationCount: 4,
            exclusionsByReason: { ambiguous_trip: 4 },
            observationCount: 39,
            trajectoryCount: 3,
          },
          routes: [{ observationCount: 39, routeId: "n" }],
        }}
        isAdmin={false}
        routes={[
          { id: "2s", name: "2S 崇基線" },
          { id: "n", name: "N 晚間線" },
        ]}
      />,
    );

    expect(screen.getByText("39")).toBeTruthy();
    expect(screen.getByText(/重建了 13 個獨立到站事件/)).toBeTruthy();
    expect(screen.getByText("回放覆蓋")).toBeTruthy();
    expect(
      screen.getByText(/每項至少需要 10 個獨立事件、跨 5 個服務日/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("最少事件數")).toBeNull();
    expect(screen.queryByLabelText("最少服務日")).toBeNull();
    expect(
      screen.getByText(/發布門檻固定為至少.*10 個事件、跨.*5.*個服務日/),
    ).toBeTruthy();
    expect(screen.getByText("大學站 → 研究生宿舍一座")).toBeTruthy();
    expect(screen.getByText("新版缺口")).toBeTruthy();
    expect(screen.getAllByText("10 事件 / 5 日")).toHaveLength(3);
    expect(screen.getByText("第 1 次停靠")).toBeTruthy();
    expect(screen.getByText("第 2 次停靠")).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
