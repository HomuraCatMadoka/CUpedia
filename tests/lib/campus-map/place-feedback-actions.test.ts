import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commandFeedback: vi.fn(),
  commandModeration: vi.fn(),
  getFeedbackPage: vi.fn(),
  getFeedbackPageForFeedback: vi.fn(),
  getViewer: vi.fn(),
  headers: vi.fn(),
  requestClientIp: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserStateForApi: mocks.getViewer,
}));
vi.mock("@/lib/campus-map/moderation-governance", () => ({
  commandCampusMapModeration: mocks.commandModeration,
}));
vi.mock("@/lib/campus-map/place-feedback", () => ({
  commandCampusMapPlaceFeedback: mocks.commandFeedback,
  getCampusMapPlaceFeedbackPage: mocks.getFeedbackPage,
  getCampusMapPlaceFeedbackPageForFeedback: mocks.getFeedbackPageForFeedback,
}));
vi.mock("@/lib/campus-map/request-client-ip", () => ({
  requestClientIp: mocks.requestClientIp,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import {
  hideCampusMapPlaceFeedback,
  runCampusMapPlaceFeedbackAction,
} from "@/lib/campus-map/place-feedback-actions";

const placeId = "10000000-0000-4000-8000-000000000001";
const feedbackId = "20000000-0000-4000-8000-000000000001";
const snapshot = {
  placeStatus: "active" as const,
  summary: { placeId, averageRating: null, ratingCount: 0, reviewCount: 0 },
  page: { items: [], nextCursor: null, isPaginated: true },
};

describe("Campus Map place feedback actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.requestClientIp.mockReturnValue("203.0.113.8");
  });

  it("refreshes the current detail page even if the hidden row moves concurrently", async () => {
    mocks.commandModeration.mockResolvedValue({
      status: "decided",
      decisionId: "decision-1",
      decisionRef: "decision-ref-1",
      caseId: null,
      caseRevision: null,
      caseStatus: null,
    });
    mocks.getFeedbackPage.mockResolvedValue(snapshot);

    await expect(
      hideCampusMapPlaceFeedback({
        placeId,
        feedbackId,
        reason: "隐藏违规内容",
        idempotencyKey: "30000000-0000-4000-8000-000000000001",
        reviewsAfter: "opaque-current-page",
      }),
    ).resolves.toMatchObject({ status: "decided", snapshot });
    expect(mocks.getFeedbackPage).toHaveBeenCalledWith(placeId, {
      cursor: "opaque-current-page",
      limit: 10,
    });
    expect(mocks.getFeedbackPageForFeedback).not.toHaveBeenCalled();
  });

  it("does not turn a committed feedback write into a false network failure", async () => {
    mocks.commandFeedback.mockResolvedValue({
      status: "created",
      feedback: {
        id: feedbackId,
        placeId,
        rating: 5,
        content: "很好找",
        version: 1,
        visibility: "public",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    mocks.getFeedbackPage.mockRejectedValue(new Error("snapshot unavailable"));

    await expect(
      runCampusMapPlaceFeedbackAction(
        { kind: "create", placeId, rating: 5, content: "很好找" },
        { placeId, cursor: "opaque-current-page" },
      ),
    ).resolves.toMatchObject({ status: "created", snapshot: null });
  });

  it("keeps a write snapshot on the issuing page if the row moves after commit", async () => {
    const movedPlaceId = "10000000-0000-4000-8000-000000000002";
    mocks.commandFeedback.mockResolvedValue({
      status: "updated",
      feedback: {
        id: feedbackId,
        placeId: movedPlaceId,
        rating: 4,
        content: "合并期间更新",
        version: 2,
        visibility: "public",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:01:00.000Z",
      },
    });
    mocks.getFeedbackPage.mockResolvedValue(snapshot);

    await runCampusMapPlaceFeedbackAction(
      {
        kind: "update",
        feedbackId,
        expectedVersion: 1,
        rating: 4,
        content: "合并期间更新",
      },
      { placeId, cursor: "opaque-current-page" },
    );

    expect(mocks.getFeedbackPage).toHaveBeenCalledWith(placeId, {
      cursor: "opaque-current-page",
      limit: 10,
    });
  });

  it("does not turn a committed moderation decision into a false network failure", async () => {
    mocks.commandModeration.mockResolvedValue({
      status: "decided",
      decisionId: "decision-1",
      decisionRef: "decision-ref-1",
      caseId: null,
      caseRevision: null,
      caseStatus: null,
    });
    mocks.getFeedbackPage.mockRejectedValue(new Error("snapshot unavailable"));

    await expect(
      hideCampusMapPlaceFeedback({
        placeId,
        feedbackId,
        reason: "隐藏违规内容",
        idempotencyKey: "30000000-0000-4000-8000-000000000001",
        reviewsAfter: null,
      }),
    ).resolves.toMatchObject({ status: "decided", snapshot: null });
  });
});
