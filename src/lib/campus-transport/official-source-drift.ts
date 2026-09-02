export type OfficialRouteExpectation = {
  departureMinutes: number[];
  displayCode: string;
  modified: string;
  routeId: string;
  serviceWindows: string[];
  sourceSha256: string;
  sourceSemanticSha256?: string;
  sourceUrl: string;
  title: string;
  wordpressPostId: number;
  wordpressSlug: string;
};

export type OfficialServiceBaseline = {
  pdfDiscoveryPage?: { url: string };
  pdfs: Array<{
    linkText?: string;
    sha256: string;
    sourceId: string;
    url: string;
  }>;
  restCollection: { sha256: string; url: string };
  routes: OfficialRouteExpectation[];
};

export type OfficialRouteObservation = {
  departureMinutes: number[];
  displayedCode: string;
  modified: string;
  rawPageSha256: string;
  semanticSha256: string;
  serviceWindows: string[];
  sourceUrl: string;
  title: string;
  wordpressPostId: number;
  wordpressSlug: string;
};

export type OfficialServiceObservation = {
  fetchedAt: string;
  pdfs: Array<{ sha256: string; sourceId: string; url: string }>;
  restCollectionSha256: string;
  routes: OfficialRouteObservation[];
};

export type OfficialSourceDrift = {
  actual: unknown;
  expected: unknown;
  kind:
    | "content_hash"
    | "display_code"
    | "missing_source"
    | "pdf_hash"
    | "pdf_url"
    | "route_page_hash"
    | "route_semantic_hash"
    | "service_window"
    | "timetable_minutes"
    | "wordpress_post_id"
    | "wordpress_slug"
    | "wordpress_title"
    | "source_url";
  requiresManualReview: true;
  routeId: string | null;
  source: string;
};

function sameNumbers(left: number[], right: number[]) {
  return (
    [...left].sort((a, b) => a - b).join(",") ===
    [...right].sort((a, b) => a - b).join(",")
  );
}

function sameStrings(left: string[], right: string[]) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

export function detectCampusBusOfficialSourceDrift(
  baseline: OfficialServiceBaseline,
  observation: OfficialServiceObservation,
) {
  const drift: OfficialSourceDrift[] = [];
  const add = (item: Omit<OfficialSourceDrift, "requiresManualReview">) =>
    drift.push({ ...item, requiresManualReview: true });

  if (observation.restCollectionSha256 !== baseline.restCollection.sha256) {
    add({
      actual: observation.restCollectionSha256,
      expected: baseline.restCollection.sha256,
      kind: "content_hash",
      routeId: null,
      source: baseline.restCollection.url,
    });
  }

  for (const expectedPdf of baseline.pdfs) {
    const actualPdf = observation.pdfs.find(
      (candidate) => candidate.sourceId === expectedPdf.sourceId,
    );
    if (!actualPdf) {
      add({
        actual: null,
        expected: expectedPdf.sha256,
        kind: "missing_source",
        routeId: null,
        source: expectedPdf.url,
      });
    } else {
      if (actualPdf.url !== expectedPdf.url) {
        add({
          actual: actualPdf.url,
          expected: expectedPdf.url,
          kind: "pdf_url",
          routeId: null,
          source: actualPdf.url,
        });
      }
      if (actualPdf.sha256 !== expectedPdf.sha256) {
        add({
          actual: actualPdf.sha256,
          expected: expectedPdf.sha256,
          kind: "pdf_hash",
          routeId: null,
          source: actualPdf.url,
        });
      }
    }
  }

  for (const expectedRoute of baseline.routes) {
    const actualRoute = observation.routes.find(
      (candidate) =>
        candidate.wordpressPostId === expectedRoute.wordpressPostId,
    );
    if (!actualRoute) {
      add({
        actual: null,
        expected: expectedRoute.wordpressPostId,
        kind: "missing_source",
        routeId: expectedRoute.routeId,
        source: expectedRoute.sourceUrl,
      });
      continue;
    }
    const comparisons: Array<{
      actual: unknown;
      expected: unknown;
      kind: OfficialSourceDrift["kind"];
      matches: boolean;
    }> = [
      {
        actual: actualRoute.wordpressPostId,
        expected: expectedRoute.wordpressPostId,
        kind: "wordpress_post_id",
        matches: actualRoute.wordpressPostId === expectedRoute.wordpressPostId,
      },
      {
        actual: actualRoute.wordpressSlug,
        expected: expectedRoute.wordpressSlug,
        kind: "wordpress_slug",
        matches: actualRoute.wordpressSlug === expectedRoute.wordpressSlug,
      },
      {
        actual: actualRoute.title,
        expected: expectedRoute.title,
        kind: "wordpress_title",
        matches: actualRoute.title === expectedRoute.title,
      },
      {
        actual: actualRoute.sourceUrl,
        expected: expectedRoute.sourceUrl,
        kind: "source_url",
        matches: actualRoute.sourceUrl === expectedRoute.sourceUrl,
      },
      {
        actual: actualRoute.displayedCode,
        expected: expectedRoute.displayCode,
        kind: "display_code",
        matches:
          actualRoute.displayedCode.toLowerCase() ===
          expectedRoute.displayCode.toLowerCase(),
      },
      {
        actual: actualRoute.serviceWindows,
        expected: expectedRoute.serviceWindows,
        kind: "service_window",
        matches: sameStrings(
          actualRoute.serviceWindows,
          expectedRoute.serviceWindows,
        ),
      },
      {
        actual: actualRoute.departureMinutes,
        expected: expectedRoute.departureMinutes,
        kind: "timetable_minutes",
        matches: sameNumbers(
          actualRoute.departureMinutes,
          expectedRoute.departureMinutes,
        ),
      },
    ];
    // Route pages include request-varying markup. Prefer the reviewed business
    // fields, and use raw bytes only for older baselines without that fingerprint.
    if (expectedRoute.sourceSemanticSha256) {
      comparisons.push({
        actual: actualRoute.semanticSha256,
        expected: expectedRoute.sourceSemanticSha256,
        kind: "route_semantic_hash",
        matches:
          actualRoute.semanticSha256 === expectedRoute.sourceSemanticSha256,
      });
    } else {
      comparisons.push({
        actual: actualRoute.rawPageSha256,
        expected: expectedRoute.sourceSha256,
        kind: "route_page_hash",
        matches: actualRoute.rawPageSha256 === expectedRoute.sourceSha256,
      });
    }
    for (const comparison of comparisons) {
      if (comparison.matches) continue;
      add({
        actual: comparison.actual,
        expected: comparison.expected,
        kind: comparison.kind,
        routeId: expectedRoute.routeId,
        source: expectedRoute.sourceUrl,
      });
    }
  }

  return {
    drift,
    fetchedAt: observation.fetchedAt,
    requiresManualReview: drift.length > 0,
    status:
      drift.length === 0 ? ("matched" as const) : ("review_required" as const),
  };
}
