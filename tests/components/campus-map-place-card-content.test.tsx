/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampusMapPlaceCardContent } from "@/components/campus-map/place-card-content";
import { projectCampusMapPlaceCard } from "@/lib/campus-map/place-card";

afterEach(cleanup);
describe("Campus Map visit information (#908)", () => {
  it("shows visitor facts and useful contact details without map-card maintenance metadata", () => {
    const card = projectCampusMapPlaceCard({
      placeType: "health-service",
      locationLabel: "大学保健处",
      visitNote: "登记时须出示个人身份证明。",
      regularHours: {
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: ["mon"], opensAt: "08:45", closesAt: "13:00" }],
      },
      officialActions: [
        { label: "网上预约", url: "https://booking.umso.cuhk.edu.hk/" },
        { label: "电话预约", url: "tel:+85239436439" },
      ],
      capabilities: [],
      gender: null,
      wheelchairAccess: "limited",
      observedAt: "2026-09-02",
      verifiedAt: "2026-09-03",
      provenance: [
        {
          kind: "official",
          accessedOn: "2026-09-03",
          observedAt: null,
          hasLocationEvidence: true,
        },
      ],
    });
    const view = render(
      <CampusMapPlaceCardContent card={card} presentation="map" />,
    );
    expect(screen.getByText(card.visitNote!)).toBeTruthy();
    const accessibility = card.detailFacts.find(
      (fact) => fact.key === "wheelchairAccess",
    )!;
    expect(screen.getByText(accessibility.value).closest("details")).toBeNull();
    expect(
      screen.getByRole("link", { name: "网上预约" }).getAttribute("href"),
    ).toBe("https://booking.umso.cuhk.edu.hk/");
    expect(screen.getByText("电话 +85239436439")).toBeTruthy();
    expect(screen.queryByText("booking.umso.cuhk.edu.hk")).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /资料来源|核对于|资料观察于|含位置依据|香港时间/u,
    );
    view.rerender(<CampusMapPlaceCardContent card={card} />);
    expect(
      screen.getByText("资料来源与核对时间").closest("details")?.open,
    ).toBe(false);
    expect(screen.getByText("booking.umso.cuhk.edu.hk")).toBeTruthy();
    expect(screen.getByText("核对于 2026-09-03")).toBeTruthy();
  });
  it("keeps known accessibility facts visible in both detail and map presentations", () => {
    const card = projectCampusMapPlaceCard({
      placeType: "water",
      locationLabel: "室外 · 精确位置",
      visitNote: null,
      officialActions: [],
      regularHours: null,
      capabilities: [],
      gender: null,
      wheelchairAccess: "yes",
      observedAt: null,
      verifiedAt: null,
      provenance: [],
    });
    const view = render(<CampusMapPlaceCardContent card={card} />);
    expect(screen.getByText("可通行").closest("details")).toBeNull();
    view.rerender(
      <CampusMapPlaceCardContent
        card={card}
        showLocation={false}
        presentation="map"
      />,
    );
    expect(screen.getByText("可通行").closest("details")).toBeNull();
  });
  it("makes a stored restriction readable before the neutral booking link", () => {
    const card = projectCampusMapPlaceCard({
      placeType: "common-space",
      locationLabel: "范克廉楼 · 地下（G）",
      visitNote:
        "展览厅 1–6 区自 2026 年 5 月 15 日起装修关闭，预约暂停；恢复安排请查看官网。",
      officialActions: [
        { label: "查看预约页面", url: "https://www.osa.cuhk.edu.hk/booking/" },
      ],
      regularHours: null,
      capabilities: [],
      gender: null,
      wheelchairAccess: null,
      observedAt: null,
      verifiedAt: null,
      provenance: [],
    });
    render(<CampusMapPlaceCardContent card={card} showLocation={false} />);
    const note = screen.getByText(card.visitNote!);
    const booking = screen.getByRole("link", { name: /查看预约页面/u });
    expect(note.closest("details")).toBeNull();
    expect(
      note.compareDocumentPosition(booking) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(booking.getAttribute("href")).toBe(
      "https://www.osa.cuhk.edu.hk/booking/",
    );
    expect(booking.getAttribute("aria-disabled")).toBeNull();
    expect(booking.className).not.toContain("bg-[#174b38]");
  });
  it("shows both the pool's visit note and a compact usual-hours summary with every interval available", () => {
    const card = projectCampusMapPlaceCard({
      placeType: "sports-facility",
      locationLabel: "室外位置",
      visitNote: "学生入场 HK$5，只收八达通。",
      officialActions: [],
      regularHours: {
        timezone: "Asia/Hong_Kong",
        intervals: [
          {
            days: ["mon", "tue", "wed", "thu"],
            opensAt: "10:30",
            closesAt: "13:30",
          },
          { days: ["sun"], opensAt: "15:00", closesAt: "18:00" },
        ],
      },
      capabilities: [],
      gender: null,
      wheelchairAccess: null,
      observedAt: null,
      verifiedAt: null,
      provenance: [],
    });
    render(<CampusMapPlaceCardContent card={card} />);
    expect(screen.getByText(card.visitNote!).closest("details")).toBeNull();
    const summary = screen.getByText("周一至周四 10:30–13:30 · 等 2 段时间");
    expect(summary.tagName).toBe("SUMMARY");
    expect(screen.getByText("周日 15:00–18:00").closest("details")).toBe(
      summary.closest("details"),
    );
    expect(document.body.textContent).not.toMatch(/营业中|今日关闭|当前开放/u);
  });
});
