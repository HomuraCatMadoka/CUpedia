import { createHash } from "node:crypto";

import baselineJson from "../docs/campus-transport/data/official-service-2026-09-01.json";
import {
  detectCampusBusOfficialSourceDrift,
  type OfficialRouteObservation,
  type OfficialServiceBaseline,
} from "../src/lib/campus-transport/official-source-drift";
import { discoverOfficialPdfUrls } from "../src/lib/campus-transport/official-source-discovery";

type WordpressRoute = {
  id: number;
  link: string;
  modified: string;
  slug: string;
  title: { rendered: string };
};

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchBytes(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "CUpedia-campus-bus-drift-check/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function decode(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function parseDisplayedCode(title: string) {
  return title.trim().split(/\s+/)[0] ?? "";
}

function parseRoutePage(html: string) {
  const normalize = (value: string) =>
    value
      .replace(/&nbsp;|&#0*160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const serviceBlocks = [
    ...html.matchAll(
      /class=["']rb-2-1["'][^>]*>[\s\S]*?class=["']rb-large["'][^>]*>([^<]+)</gi,
    ),
  ].map((match) => normalize(match[1] ?? ""));
  const minuteBlocks = [
    ...html.matchAll(
      /class=["']rb-2-2["'][^>]*>[\s\S]*?class=["']rb-large["'][^>]*>([^<]+)</gi,
    ),
  ].map((match) => normalize(match[1] ?? ""));
  const serviceWindows = [
    ...serviceBlocks
      .join(" ")
      .matchAll(/\b(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})\b/g),
  ].map((match) => `${match[1]}-${match[2]}`);
  const departureMinutes = minuteBlocks.flatMap((match) =>
    [...match.matchAll(/(?:^|[\s,;＃#])([0-5]?\d)(?=[\s,;＃#]|$)/g)].map(
      (minute) => Number(minute[1]),
    ),
  );
  const stopNames = [
    ...html.matchAll(
      /class=["'](?:route-stop-text|route-stop-bottom-text)["'][^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ]
    .map((match) => normalize(match[1] ?? ""))
    .filter(Boolean);
  return {
    departureMinutes: [...new Set(departureMinutes)],
    serviceWindows: [...new Set(serviceWindows)],
    stopNames,
  };
}

async function main() {
  const baseline = baselineJson as OfficialServiceBaseline;
  const restBytes = await fetchBytes(baseline.restCollection.url);
  const wordpressRoutes = JSON.parse(decode(restBytes)) as WordpressRoute[];
  const routeObservations = await Promise.all(
    baseline.routes.map(async (expected): Promise<OfficialRouteObservation> => {
      const record = wordpressRoutes.find(
        (candidate) => candidate.id === expected.wordpressPostId,
      );
      if (!record) {
        return {
          departureMinutes: [],
          displayedCode: "",
          modified: "",
          rawPageSha256: "",
          semanticSha256: "",
          serviceWindows: [],
          sourceUrl: "",
          title: "",
          wordpressPostId: expected.wordpressPostId,
          wordpressSlug: "",
        };
      }
      const pageBytes = await fetchBytes(record.link);
      const parsedPage = parseRoutePage(decode(pageBytes));
      const pageSemanticSha256 = sha256(
        new TextEncoder().encode(
          JSON.stringify({
            departureMinutes: parsedPage.departureMinutes,
            displayedCode: parseDisplayedCode(record.title.rendered),
            serviceWindows: parsedPage.serviceWindows,
            stopNames: parsedPage.stopNames,
            title: record.title.rendered,
          }),
        ),
      );
      return {
        ...parsedPage,
        displayedCode: parseDisplayedCode(record.title.rendered),
        modified: record.modified,
        rawPageSha256: sha256(pageBytes),
        semanticSha256: pageSemanticSha256,
        sourceUrl: record.link,
        title: record.title.rendered,
        wordpressPostId: record.id,
        wordpressSlug: record.slug,
      };
    }),
  );
  const discoveredPdfUrls = baseline.pdfDiscoveryPage
    ? discoverOfficialPdfUrls(
        decode(await fetchBytes(baseline.pdfDiscoveryPage.url)),
        baseline.pdfs.flatMap((pdf) =>
          pdf.linkText
            ? [{ linkText: pdf.linkText, sourceId: pdf.sourceId }]
            : [],
        ),
        baseline.pdfDiscoveryPage.url,
      )
    : baseline.pdfs.map((pdf) => ({
        sourceId: pdf.sourceId,
        url: pdf.url,
      }));
  const pdfs = await Promise.all(
    discoveredPdfUrls.map(async (pdf) => ({
      sha256: sha256(await fetchBytes(pdf.url)),
      sourceId: pdf.sourceId,
      url: pdf.url,
    })),
  );
  const report = detectCampusBusOfficialSourceDrift(baseline, {
    fetchedAt: new Date().toISOString(),
    pdfs,
    restCollectionSha256: sha256(restBytes),
    routes: routeObservations,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.requiresManualReview) process.exitCode = 2;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
