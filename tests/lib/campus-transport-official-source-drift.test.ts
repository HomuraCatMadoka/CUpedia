import { describe, expect, it } from "vitest";

import {
  detectCampusBusOfficialSourceDrift,
  type OfficialServiceBaseline,
  type OfficialServiceObservation,
} from "@/lib/campus-transport/official-source-drift";
import { discoverOfficialPdfUrls } from "@/lib/campus-transport/official-source-discovery";

const baseline: OfficialServiceBaseline = {
  pdfs: [
    {
      sha256: "pdf-v1",
      sourceId: "shuttle",
      url: "https://transport.cuhk.edu.hk/Shuttle.pdf",
    },
  ],
  restCollection: {
    sha256: "rest-v1",
    url: "https://transport.cuhk.edu.hk/wp-json/wp/v2/route",
  },
  routes: [
    {
      departureMinutes: [0, 30],
      displayCode: "2S",
      modified: "2026-09-01T00:00:00",
      routeId: "2s",
      serviceWindows: ["08:00-18:30"],
      sourceSemanticSha256: "page-v1",
      sourceSha256: "raw-page-v1",
      sourceUrl: "https://transport.cuhk.edu.hk/route/1b/",
      title: "2S NA/UC (S)",
      wordpressPostId: 2567,
      wordpressSlug: "1b",
    },
  ],
};

const observation: OfficialServiceObservation = {
  fetchedAt: "2026-09-02T00:00:00Z",
  pdfs: [
    {
      sha256: "pdf-v1",
      sourceId: "shuttle",
      url: "https://transport.cuhk.edu.hk/Shuttle.pdf",
    },
  ],
  restCollectionSha256: "rest-v1",
  routes: [
    {
      departureMinutes: [0, 30],
      displayedCode: "2S",
      modified: "2026-09-01T00:00:00",
      rawPageSha256: "raw-page-v1",
      semanticSha256: "page-v1",
      serviceWindows: ["08:00-18:30"],
      sourceUrl: "https://transport.cuhk.edu.hk/route/1b/",
      title: "2S NA/UC (S)",
      wordpressPostId: 2567,
      wordpressSlug: "1b",
    },
  ],
};

describe("CUHK official campus-bus source drift", () => {
  it("matches a repeated fresh fetch without changing the reviewed service", () => {
    expect(detectCampusBusOfficialSourceDrift(baseline, observation)).toEqual({
      drift: [],
      fetchedAt: observation.fetchedAt,
      requiresManualReview: false,
      status: "matched",
    });
  });

  it("reports identity, timetable, route-page, and fixed-PDF drift for review", () => {
    const result = detectCampusBusOfficialSourceDrift(baseline, {
      ...observation,
      pdfs: [{ ...observation.pdfs[0]!, sha256: "pdf-v2" }],
      restCollectionSha256: "rest-v2",
      routes: [
        {
          ...observation.routes[0]!,
          departureMinutes: [15, 45],
          displayedCode: "1B",
          rawPageSha256: "raw-page-v2",
          semanticSha256: "page-v2",
          serviceWindows: ["08:15-18:15"],
          sourceUrl: "https://transport.cuhk.edu.hk/route/reused/",
          title: "1B Retired",
          wordpressSlug: "reused",
        },
      ],
    });

    expect(result.status).toBe("review_required");
    expect(result.requiresManualReview).toBe(true);
    expect(result.drift.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "content_hash",
        "display_code",
        "pdf_hash",
        "route_semantic_hash",
        "service_window",
        "source_url",
        "timetable_minutes",
        "wordpress_slug",
        "wordpress_title",
      ]),
    );
    expect(result.drift.every((item) => item.requiresManualReview)).toBe(true);
  });

  it("ignores dynamic page bytes when a reviewed semantic hash is available", () => {
    const rawPageResult = detectCampusBusOfficialSourceDrift(baseline, {
      ...observation,
      routes: [
        {
          ...observation.routes[0]!,
          rawPageSha256: "raw-page-v2",
        },
      ],
    });

    expect(rawPageResult.drift).toEqual([]);
  });

  it("falls back to raw page bytes only without a semantic baseline", () => {
    const rawOnlyBaseline: OfficialServiceBaseline = {
      ...baseline,
      routes: [
        {
          ...baseline.routes[0]!,
          sourceSemanticSha256: undefined,
        },
      ],
    };
    const result = detectCampusBusOfficialSourceDrift(rawOnlyBaseline, {
      ...observation,
      routes: [
        {
          ...observation.routes[0]!,
          rawPageSha256: "raw-page-v2",
        },
      ],
    });

    expect(result.drift.map((item) => item.kind)).toEqual(["route_page_hash"]);
  });

  it("reports extracted route changes as semantic drift", () => {
    const semanticResult = detectCampusBusOfficialSourceDrift(baseline, {
      ...observation,
      routes: [
        {
          ...observation.routes[0]!,
          semanticSha256: "page-v2",
        },
      ],
    });

    expect(semanticResult.drift.map((item) => item.kind)).toEqual([
      "route_semantic_hash",
    ]);
  });

  it("reports a replacement PDF URL even when the old bytes are unchanged", () => {
    const result = detectCampusBusOfficialSourceDrift(baseline, {
      ...observation,
      pdfs: [
        {
          ...observation.pdfs[0]!,
          url: "https://transport.cuhk.edu.hk/current/Shuttle-2027.pdf",
        },
      ],
    });

    expect(result.drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pdf_url",
          source: "https://transport.cuhk.edu.hk/current/Shuttle-2027.pdf",
        }),
      ]),
    );
  });

  it("discovers current PDF links by their official homepage labels", () => {
    const discovered = discoverOfficialPdfUrls(
      `<a href="/school-bus-service/meet-class-school-bus-service/">Meet-Class School Bus Service</a>
       <a href="/documents/Shuttle-2027.pdf"><span>Monday to Saturday<br>(wef 1 Sep 2027)</span></a>
       <a href="https://cdn.example/meet.pdf"><span>Meet-Class<br>School Bus Service</span></a>`,
      [
        { sourceId: "shuttle", linkText: "Monday to Saturday" },
        { sourceId: "meet-class", linkText: "Meet-Class School Bus Service" },
      ],
      "https://transport.cuhk.edu.hk/",
    );

    expect(discovered).toEqual([
      {
        sourceId: "shuttle",
        url: "https://transport.cuhk.edu.hk/documents/Shuttle-2027.pdf",
      },
      { sourceId: "meet-class", url: "https://cdn.example/meet.pdf" },
    ]);
  });

  it("prefers a versioned PDF over a same-label HTML page", () => {
    const discovered = discoverOfficialPdfUrls(
      `<a href="/school-bus-service/meet-class/">Meet-Class School Bus Service</a>
       <a href="/documents/meet-class.pdf?v=2">Meet-Class School Bus Service</a>`,
      [{ sourceId: "meet-class", linkText: "Meet-Class School Bus Service" }],
      "https://transport.cuhk.edu.hk/",
    );

    expect(discovered).toEqual([
      {
        sourceId: "meet-class",
        url: "https://transport.cuhk.edu.hk/documents/meet-class.pdf?v=2",
      },
    ]);
  });
});
