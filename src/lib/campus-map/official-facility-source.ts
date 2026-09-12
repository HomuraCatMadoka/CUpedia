import { execFile } from "node:child_process";
import { getCampusMapRepresentativeFacilityManifest } from "@/lib/campus-map/representative-facility-manifest";

import { parse, type DefaultTreeAdapterMap } from "parse5";

import type {
  CampusMapOfficialFacilityBuildingMapping,
  CampusMapOfficialFacilityManifest,
  CampusMapOfficialFacilityManifestDraft,
  CampusMapOfficialFacilityManifestEntry,
  CampusMapOfficialFacilitySourceSnapshot,
} from "@/lib/campus-map/official-facility-manifest";
import {
  CAMPUS_MAP_OFFICIAL_FACILITY_MANIFEST_SCHEMA,
  CAMPUS_MAP_OFFICIAL_FACILITY_RES_EXPECTED_COUNT,
  CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS,
  canonicalCampusMapOfficialFacilityJson,
  campusMapOfficialFacilityFloorId,
  campusMapOfficialFacilitySha256,
  finalizeCampusMapOfficialFacilityManifest,
} from "@/lib/campus-map/official-facility-manifest";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

export const CAMPUS_MAP_OFFICIAL_FACILITY_PARSER_VERSION = "1.1.0";

const RES_URL = CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS["res-classrooms"];
const CUHK_BUILDING_DIRECTORY_URL = "https://www.cuhk.edu.hk/cdo/bldgdir.htm";
const OSA_BOOKING_URL = "https://www6.cuhk.edu.hk/frs/OSALogin.aspx";
const UMSO_BOOKING_URL = "https://booking.umso.cuhk.edu.hk/booking/";

export type CampusMapOfficialFacilitySourceKey =
  keyof typeof CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS;

export interface CampusMapOfficialFacilityFetchedSource {
  key: CampusMapOfficialFacilitySourceKey;
  url: string;
  html: string;
  rawSha256: string;
}

const CURL_METADATA_MARKER = "\n__CUPEDIA_OFFICIAL_SOURCE_METADATA__\n";

function curlFetch(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-redirs",
        "3",
        "--max-time",
        "20",
        "--max-filesize",
        String(5 * 1024 * 1024),
        "--header",
        "Accept: text/html,application/xhtml+xml",
        "--user-agent",
        "CUpedia-official-facility-import/1.0 (+https://cupedia.cuhk.edu.hk/)",
        "--write-out",
        `${CURL_METADATA_MARKER}%{url_effective}\n%{content_type}\n%{http_code}`,
        url,
      ],
      { encoding: "buffer", maxBuffer: 6 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        const marker = Buffer.from(CURL_METADATA_MARKER);
        const metadataOffset = output.lastIndexOf(marker);
        if (metadataOffset < 0) {
          reject(new Error("curl response metadata is missing"));
          return;
        }
        const body = output.subarray(0, metadataOffset);
        const [finalUrl, contentType, statusText] = output
          .subarray(metadataOffset + marker.length)
          .toString("utf8")
          .trim()
          .split("\n");
        const status = Number(statusText);
        if (!finalUrl || !contentType || !Number.isInteger(status)) {
          reject(new Error("curl response metadata is invalid"));
          return;
        }
        resolve({
          ok: status >= 200 && status < 300,
          status,
          url: finalUrl,
          headers: new Headers({ "content-type": contentType }),
          arrayBuffer: async () =>
            body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            ) as ArrayBuffer,
        } as Response);
      },
    );
  });
}

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];

interface ResClassroomRow {
  rawRoomCode: string;
  roomCode: string;
  locationGroup: string;
  sourceLocation: string;
  sourceFloor: string | null;
  capacity: number;
  seatType: string;
  officialUrl: string;
}

interface ResInventory {
  rows: ResClassroomRow[];
  locationLabels: Map<string, string>;
}

interface OsaVenueSpec {
  key: string;
  pageKey: "osa-bfc" | "osa-jfc" | "osa-psc" | "osa-i-lounge" | "osa-pgh-2-3";
  paragraphPrefix: string | null;
  name: string;
  buildingLabel: string;
  sourceLocation: string;
  sourceFloor: string | null;
  placeType: "common-space";
  decision: "publish" | "intentionally-skip";
  skipReason?: string;
}

const OSA_PUBLISHED_NAME_SUFFIXES: Readonly<Record<string, string>> = {
  "bfc-305-conference-room": "会议室",
  "bfc-306-student-activity-room": "学生活动室",
  "bfc-lg13ab-conference-hall-rehearsal-room": "会议厅／排练室",
  "bfc-ground-floor-exhibition-hall": "展览厅（1–6 区）",
  "bfc-ground-floor-exhibition-area": "展览区（A–B 区）",
  "bfc-ground-floor-exhibition-gallery": "展览廊（海报板 E1–E5）",
  "jfc-103a-integrated-activity-room": "综合活动室",
  "jfc-103b-integrated-activity-room": "综合活动室",
  "jfc-103c-integrated-activity-room": "综合活动室",
  "jfc-103d-exhibition-hall": "展览厅",
  "jfc-215-space": "活动空间",
  "psc-g01-multi-purpose-hall": "多用途礼堂",
  "psc-g02-snooker-room": "桌球室",
  "psc-g03-band-room": "乐队室",
  "psc-g04-music-room": "音乐室",
  "psc-g05-piano-room": "琴室",
  "psc-g06-piano-room": "琴室",
  "psc-g07-piano-room": "琴室",
  "psc-204-meeting-room": "会议室",
  "psc-303-multi-purpose-room": "多用途室",
  "psc-309-fitness-room": "健身室",
  "psc-g08-discussion-room": "讨论室",
  "psc-g09-discussion-room": "讨论室",
  "psc-g10-discussion-room": "讨论室",
  "i-lounge": "休闲空间",
};

function osaPublishedName(spec: OsaVenueSpec): string {
  if (spec.decision !== "publish") return spec.name;
  const suffix = OSA_PUBLISHED_NAME_SUFFIXES[spec.key];
  if (!suffix)
    throw new Error(`Missing reviewed OSA Chinese name: ${spec.key}`);
  return `${spec.name}（${suffix}）`;
}

export function canonicalCampusMapOfficialFacilityFloorLabel(
  sourceFloor: string | null,
): string | null {
  const match = /^(LG|G|UG|\d+)\/F$/.exec(sourceFloor ?? "");
  return match?.[1] ?? null;
}

const RES_BUILDINGS: ReadonlyArray<
  Omit<CampusMapOfficialFacilityBuildingMapping, "sourceGroup"> & {
    sourceLabel: string;
  }
> = [
  [
    "ARC",
    "9131487c-d363-576c-9dac-20e958e746f3",
    "Lee Shau Kee Architecture Building",
  ],
  [
    "BMS",
    "367d9f99-13e6-5805-8447-5b523f7b36d3",
    "Choh-Ming Li Basic Medical Sciences Building",
  ],
  [
    "CK TSE",
    "52bbd70c-af5c-5466-a63c-d6eda21e421e",
    "Elisabeth Luce Moore Library",
  ],
  ["CKB", "42186269-a5d4-57b4-ab6d-a75d13e379bc", "Chen Kou Bun Building"],
  ["CYT", "bfd6b8c3-e574-57d8-bb4f-ff6483f65ebf", "Cheng Yu Tung Building"],
  ["ELB", "4163731c-b233-5e71-ab85-ec5c0fb0c181", "Esther Lee Building"],
  [
    "ERB",
    "c2ddb931-ae2e-5804-a949-9d9a4432b139",
    "William M.W. Mong Engineering Building",
  ],
  ["FYB", "e54996c5-2124-5235-8c7b-612ab47fadd6", "Wong Foo Yuan Building"],
  ["HTB", "e1f47035-39db-5cdf-9d69-ae5a16f12f14", "Ho Tim Building"],
  ["HYS", "2a59baa1-53e6-5c4b-8ca8-fff23b60f01e", "Hui Yeung Shing Building"],
  [
    "ICS",
    "2448a68a-da8c-5ec3-a3f8-3d7604679f36",
    "Institute of Chinese Studies",
  ],
  ["KKB", "d9fa73d3-17d0-541e-ae47-0453b5572fea", "Leung Kau Kui Building"],
  ["LDS", "00c82a5d-6f94-5016-b9ca-5979c0a55589", "Li Dak Sum Building"],
  ["LHC", "9314a872-143d-5dc1-ba03-aa2023c63a62", "Y.C. Liang Hall"],
  ["LKC", "97a9e390-c3d6-558d-ae27-dc60ed677041", "Sino Building"],
  ["LPN LT", "9314a872-143d-5dc1-ba03-aa2023c63a62", "Y.C. Liang Hall"],
  ["LSB", "32585321-1cdb-59cf-a911-26032474d03b", "Lady Shaw Building"],
  ["LSK", "9c77d3f7-37d1-504f-a0b6-51f536a3ff7d", "Lee Shau Kee Building"],
  ["MMW", "c1169ac3-52eb-519c-a762-a5678108e340", "Mong Man Wai Building"],
  ["NAH", "9746c02f-3bd9-50a5-9b1c-261d6c52e01a", "Humanities Building"],
  ["SB", "97a9e390-c3d6-558d-ae27-dc60ed677041", "Sino Building"],
  ["SC", "d0f66212-4138-5ab3-b8e5-04980cf64fb3", "University Science Centre"],
  [
    "SWC LT",
    "75c0a95d-931e-595d-bb07-2f3f4efc73e7",
    "Shaw College Lecture Theatre",
  ],
  ["SWH", "668613bd-aa64-5b4b-ae8a-3f8a3568fea6", "Fung King Hey Building"],
  [
    "TYW LT",
    "53db00f9-33b3-5155-9cce-518fcf3090dd",
    "Ho Sin-Hang Engineering Building",
  ],
  ["UCA", "7c948162-da21-5549-ba39-349fd4b04b3e", "Tsang Shiu Tim Building"],
  ["UCC", "8f18bbbd-2982-59bb-b130-60e295f78cd1", "T.C. Cheng Building"],
  ["WLS", "b7a25b01-633e-5d76-b011-237b829c320f", "Wen Lan Tang"],
  ["WMY", "ff31333b-7806-5d80-a94d-91f45877ae3e", "Wu Ho Man Yuen Building"],
  [
    "YIA",
    "545893b6-b89b-5067-aba0-c86518aa8fa8",
    "Yasumoto International Academic Park",
  ],
].map(([sourceLabel, canonicalBuildingId, canonicalBuildingName]) => ({
  sourceLabel,
  canonicalBuildingId,
  canonicalBuildingName,
  evidenceUrl: sourceLabel === "SWC LT" ? CUHK_BUILDING_DIRECTORY_URL : RES_URL,
  note:
    sourceLabel === "SWC LT"
      ? "The official CUHK Building Directory identifies Shaw College Lecture Theatre as Building S5, so the RES label resolves to that existing canonical Building."
      : sourceLabel === "CK TSE" ||
          sourceLabel === "LPN LT" ||
          sourceLabel === "SWH" ||
          sourceLabel === "TYW LT"
        ? "The RES label names a room or hall inside the mapped parent Building; it must not create a fake Building."
        : "The RES location-code table and canonical CUHK Building directory identify the same Building.",
}));

const OSA_AND_UMSO_BUILDINGS: CampusMapOfficialFacilityBuildingMapping[] = [
  [
    "osa",
    "BFC",
    "35b1dbbd-278f-501a-bd22-26f4f7eb2164",
    "Benjamin Franklin Centre",
    CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS["osa-bfc"],
  ],
  [
    "osa",
    "JFC",
    "68b326f6-075b-5403-ad82-701a0d239b2a",
    "John Fulton Centre",
    CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS["osa-jfc"],
  ],
  [
    "osa",
    "PSC",
    "c25657cd-8d47-5e20-bdd5-8da984f77775",
    "Pommerenke Student Centre",
    CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS["osa-psc"],
  ],
  [
    "osa",
    "i-LOUNGE",
    "545893b6-b89b-5067-aba0-c86518aa8fa8",
    "Yasumoto International Academic Park",
    "https://www.osa.cuhk.edu.hk/wp-content/uploads/2024/03/ilounge-address.jpg",
  ],
  [
    "umso",
    "University Health Centre",
    "a8bfebbd-87bf-5ac9-a089-446c4198e38d",
    "University Health Centre",
    CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS["umso-location"],
  ],
].map(
  ([
    sourceGroup,
    sourceLabel,
    canonicalBuildingId,
    canonicalBuildingName,
    evidenceUrl,
  ]) => ({
    sourceGroup: sourceGroup as "osa" | "umso",
    sourceLabel,
    canonicalBuildingId,
    canonicalBuildingName,
    evidenceUrl,
    note: "The official page location is explicitly resolved to the existing canonical Building.",
  }),
);

export const CAMPUS_MAP_OFFICIAL_FACILITY_BUILDING_MAPPINGS: CampusMapOfficialFacilityBuildingMapping[] =
  [
    ...RES_BUILDINGS.map((mapping) => ({
      ...mapping,
      sourceGroup: "res" as const,
    })),
    ...OSA_AND_UMSO_BUILDINGS,
  ];

function hours(
  intervals: NonNullable<
    CampusMapPublishFactInput["regularHours"]
  >["intervals"],
): CampusMapPublishFactInput["regularHours"] {
  return { timezone: "Asia/Hong_Kong", intervals };
}

const OSA_VENUES: OsaVenueSpec[] = [
  {
    key: "bfc-305-conference-room",
    pageKey: "osa-bfc",
    paragraphPrefix: "Conference Room Location: Room 305, BFC",
    name: "BFC 305 Conference Room",
    buildingLabel: "BFC",
    sourceLocation: "Room 305, BFC",
    sourceFloor: null,
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "bfc-306-student-activity-room",
    pageKey: "osa-bfc",
    paragraphPrefix: "Student Activity Room Location: Room 306, BFC",
    name: "BFC 306 Student Activity Room",
    buildingLabel: "BFC",
    sourceLocation: "Room 306, BFC",
    sourceFloor: null,
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "bfc-lg13ab-conference-hall-rehearsal-room",
    pageKey: "osa-bfc",
    paragraphPrefix:
      "Conference Hall / Rehearsal Room Location: Room LG13A and LG13B, BFC",
    name: "BFC LG13A/LG13B Conference Hall / Rehearsal Room",
    buildingLabel: "BFC",
    sourceLocation: "Room LG13A and LG13B, BFC",
    sourceFloor: null,
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "bfc-ground-floor-exhibition-hall",
    pageKey: "osa-bfc",
    paragraphPrefix: "Exhibition Hall Location: G/F, BFC",
    name: "BFC G/F Exhibition Hall (Areas 1–6)",
    buildingLabel: "BFC",
    sourceLocation: "G/F, BFC",
    sourceFloor: "G/F",
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "bfc-ground-floor-exhibition-area",
    pageKey: "osa-bfc",
    paragraphPrefix: "Exhibition Hall – Exhibition Area Location: G/F, BFC",
    name: "BFC G/F Exhibition Area (Areas A–B)",
    buildingLabel: "BFC",
    sourceLocation: "G/F, BFC",
    sourceFloor: "G/F",
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "bfc-ground-floor-exhibition-gallery",
    pageKey: "osa-bfc",
    paragraphPrefix:
      "Exhibition Gallery – Fixed Poster Board Location: G/F, BFC",
    name: "BFC G/F Exhibition Gallery (Poster Boards E1–E5)",
    buildingLabel: "BFC",
    sourceLocation: "G/F, BFC",
    sourceFloor: "G/F",
    placeType: "common-space",
    decision: "publish",
  },
  ...[
    [
      "jfc-103a-integrated-activity-room",
      "Integrated Activity Room Location: Room 103A, JFC",
      "JFC 103A Integrated Activity Room",
    ],
    [
      "jfc-103b-integrated-activity-room",
      "Integrated Activity Room Location: Room 103B, JFC",
      "JFC 103B Integrated Activity Room",
    ],
    [
      "jfc-103c-integrated-activity-room",
      "Integrated Activity Room Location: Room 103C, JFC",
      "JFC 103C Integrated Activity Room",
    ],
    [
      "jfc-103d-exhibition-hall",
      "Exhibition Hall Location: Room 103D, JFC",
      "JFC 103D Exhibition Hall",
    ],
  ].map(
    ([key, paragraphPrefix, name]): OsaVenueSpec => ({
      key,
      pageKey: "osa-jfc",
      paragraphPrefix,
      name,
      buildingLabel: "JFC",
      sourceLocation: paragraphPrefix
        .split("Location: ")[1]!
        .split(" Area:")[0]!,
      sourceFloor: null,
      placeType: "common-space",
      decision: "publish",
    }),
  ),
  {
    key: "jfc-215-space",
    pageKey: "osa-jfc",
    paragraphPrefix: "Space@JFC Location: 215, JFC",
    name: "Space@JFC (Room 215)",
    buildingLabel: "JFC",
    sourceLocation: "215, JFC",
    sourceFloor: null,
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "psc-g01-multi-purpose-hall",
    pageKey: "osa-psc",
    paragraphPrefix: "Multi-purpose Hall Location: Room G01, PSC",
    name: "PSC G01 Multi-purpose Hall",
    buildingLabel: "PSC",
    sourceLocation: "Room G01, PSC",
    sourceFloor: null,
    placeType: "common-space",
    decision: "publish",
  },
  ...[
    ["psc-g02-snooker-room", "Snooker Room", "G02"],
    ["psc-g03-band-room", "Band Room", "G03"],
    ["psc-g04-music-room", "Music Room", "G04"],
    ["psc-g05-piano-room", "Piano Room", "G05"],
    ["psc-g06-piano-room", "Piano Room", "G06"],
    ["psc-g07-piano-room", "Piano Room", "G07"],
    ["psc-204-meeting-room", "Meeting Room", "204"],
    ["psc-303-multi-purpose-room", "Multi-purpose Room", "303"],
    ["psc-309-fitness-room", "Fitness Room", "309"],
  ].map(
    ([key, label, room]): OsaVenueSpec => ({
      key,
      pageKey: "osa-psc",
      paragraphPrefix: `${label} Location: Room ${room}, PSC`,
      name: `PSC ${room} ${label}`,
      buildingLabel: "PSC",
      sourceLocation: `Room ${room}, PSC`,
      sourceFloor: null,
      placeType: "common-space",
      decision: "publish",
    }),
  ),
  ...[
    ["psc-g08-discussion-room", "G08"],
    ["psc-g09-discussion-room", "G09"],
    ["psc-g10-discussion-room", "G10"],
  ].map(
    ([key, room]): OsaVenueSpec => ({
      key,
      pageKey: "osa-psc",
      paragraphPrefix: `Discussion Room Location: Room ${room}, PSC`,
      name: `PSC ${room} Discussion Room`,
      buildingLabel: "PSC",
      sourceLocation: `Room ${room}, PSC`,
      sourceFloor: null,
      placeType: "common-space",
      decision: "publish",
    }),
  ),
  ...[
    ["psc-poster-holders", "Poster Holders"],
    ["psc-leaflet-publication-racks", "Leaflet / Publication Racks"],
    ["psc-promotion-area", "Promotion Area"],
  ].map(
    ([key, name]): OsaVenueSpec => ({
      key,
      pageKey: "osa-psc",
      paragraphPrefix: `${name} Use:`,
      name,
      buildingLabel: "PSC",
      sourceLocation: "Pommerenke Student Centre",
      sourceFloor: null,
      placeType: "common-space",
      decision: "intentionally-skip",
      skipReason:
        "The source describes a booking asset without an independently addressable room or destination.",
    }),
  ),
  {
    key: "i-lounge",
    pageKey: "osa-i-lounge",
    paragraphPrefix: null,
    name: "i-LOUNGE",
    buildingLabel: "i-LOUNGE",
    sourceLocation: "3/F, Yasumoto International Academic Park",
    sourceFloor: "3/F",
    placeType: "common-space",
    decision: "publish",
  },
  {
    key: "pgh-2-3-multi-purpose-hall",
    pageKey: "osa-pgh-2-3",
    paragraphPrefix: null,
    name: "Multi-purpose Hall, Jockey Club Postgraduate Halls 2 & 3",
    buildingLabel: "PGH 2/3 Multi-purpose Hall",
    sourceLocation: "1/F, Jockey Club Postgraduate Halls 2 & 3",
    sourceFloor: "1/F",
    placeType: "common-space",
    decision: "intentionally-skip",
    skipReason:
      "The official page describes one hall shared by PGH 2 and PGH 3, but the current containment model accepts only one canonical Building. Choosing either Building would be an unsupported inference.",
  },
];

function childNodes(node: HtmlNode): HtmlNode[] {
  return "childNodes" in node ? (node.childNodes as HtmlNode[]) : [];
}

function walk(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  visit(node);
  for (const child of childNodes(node)) walk(child, visit);
}

function elements(node: HtmlNode, name: string): HtmlElement[] {
  const found: HtmlElement[] = [];
  walk(node, (candidate) => {
    if (candidate.nodeName === name) found.push(candidate as HtmlElement);
  });
  return found;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContent(node: HtmlNode): string {
  let text = "";
  walk(node, (candidate) => {
    if (candidate.nodeName === "#text" && "value" in candidate) {
      text += `${candidate.value} `;
    }
  });
  return normalizeWhitespace(text);
}

function attribute(node: HtmlElement, name: string): string | null {
  return node.attrs.find((item) => item.name === name)?.value ?? null;
}

function mainElement(document: HtmlNode): HtmlNode {
  return elements(document, "main")[0] ?? document;
}

function snapshotHash(source: CampusMapOfficialFacilityFetchedSource): string {
  return `sha256:${source.rawSha256}`;
}

function normalizeRoomCode(raw: string, locationGroup: string): string {
  let roomCode = normalizeWhitespace(raw)
    .replace(/\s+\*+$/, "")
    .replace(
      /\s+\((?:Interactive|Breakout Room|Multi-purpose Classroom)\)$/i,
      "",
    );
  if (
    roomCode.startsWith(locationGroup) &&
    roomCode.length > locationGroup.length &&
    !/\s/.test(roomCode[locationGroup.length]!)
  ) {
    roomCode = `${locationGroup} ${roomCode.slice(locationGroup.length)}`;
  }
  return roomCode;
}

function sourceKeyPart(roomCode: string): string {
  return roomCode
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function findResLocationGroup(rawRoomCode: string): string {
  const normalized = normalizeWhitespace(rawRoomCode).toUpperCase();
  const match = RES_BUILDINGS.map((mapping) => mapping.sourceLabel)
    .toSorted((left, right) => right.length - left.length)
    .find(
      (label) =>
        normalized === label ||
        normalized.startsWith(`${label} `) ||
        (label === "CKB" && normalized.startsWith("CKB")),
    );
  if (!match) throw new Error(`Unmapped RES room code: ${rawRoomCode}`);
  return match;
}

export function parseResClassroomInventory(
  html: string,
  expectedCount = CAMPUS_MAP_OFFICIAL_FACILITY_RES_EXPECTED_COUNT,
): ResInventory {
  const document = parse(html) as unknown as HtmlNode;
  const tables = elements(document, "table");
  if (tables.length !== 4) {
    throw new Error(`RES parser expected 4 tables, received ${tables.length}`);
  }
  const rows: ResClassroomRow[] = [];
  for (const table of tables.slice(0, 3)) {
    const tableRows = elements(table, "tr");
    const header = tableRows.shift();
    if (!header || !textContent(header).includes("Seating Capacity")) {
      throw new Error("RES classroom table header changed");
    }
    for (const row of tableRows) {
      const cells = childNodes(row).filter(
        (node) => node.nodeName === "td" || node.nodeName === "th",
      );
      if (cells.length !== 5)
        throw new Error("RES classroom row shape changed");
      const rawRoomCode = textContent(cells[2]!);
      const locationGroup = findResLocationGroup(rawRoomCode);
      const capacity = Number(textContent(cells[3]!));
      const sourceLocation = textContent(cells[0]!);
      const seatType = textContent(cells[4]!);
      const roomLink = elements(cells[2]!, "a")[0];
      const officialHref = roomLink ? attribute(roomLink, "href") : null;
      const officialUrl = officialHref
        ? new URL(officialHref, RES_URL).href
        : RES_URL;
      const officialUrlObject = new URL(officialUrl);
      const officialUrlIsAllowed =
        officialUrl === RES_URL ||
        ((officialUrlObject.protocol === "http:" ||
          officialUrlObject.protocol === "https:") &&
          officialUrlObject.hostname === "www.avsu.cuhk.edu.hk");
      if (
        !Number.isSafeInteger(capacity) ||
        capacity <= 0 ||
        !sourceLocation ||
        !seatType ||
        !officialUrlIsAllowed
      ) {
        throw new Error(`Invalid RES classroom row: ${rawRoomCode}`);
      }
      rows.push({
        rawRoomCode,
        roomCode: normalizeRoomCode(rawRoomCode, locationGroup),
        locationGroup,
        sourceLocation,
        sourceFloor: textContent(cells[1]!) || null,
        capacity,
        seatType,
        officialUrl,
      });
    }
  }
  if (rows.length !== expectedCount) {
    throw new Error(
      `RES classroom count drift: expected ${expectedCount}, received ${rows.length}`,
    );
  }
  const locationLabels = new Map<string, string>();
  for (const row of elements(tables[3]!, "tr")) {
    const cells = childNodes(row).filter(
      (node) => node.nodeName === "td" || node.nodeName === "th",
    );
    if (cells.length !== 2)
      throw new Error("RES location-code row shape changed");
    locationLabels.set(textContent(cells[0]!), textContent(cells[1]!));
  }
  const expectedLabels = RES_BUILDINGS.map((mapping) => mapping.sourceLabel);
  if (
    locationLabels.size !== expectedLabels.length ||
    expectedLabels.some((label) => !locationLabels.has(label))
  ) {
    throw new Error(
      "RES location-code table no longer matches reviewed mappings",
    );
  }
  if (new Set(rows.map((row) => row.roomCode)).size !== rows.length) {
    throw new Error("RES normalized room codes are not unique");
  }
  return { rows, locationLabels };
}

function emptyFact(
  input: Pick<
    CampusMapPublishFactInput,
    "name" | "buildingId" | "floorId" | "placeType" | "location"
  > &
    Partial<CampusMapPublishFactInput>,
): CampusMapPublishFactInput {
  return {
    regularHours: null,
    officialActions: [],
    visitNote: null,
    capabilities: [],
    gender: null,
    wheelchairAccess: null,
    observedAt: null,
    ...input,
  };
}

function officialSource(
  input: Pick<CampusMapPublishSourceInput, "ref" | "url" | "accessedOn"> &
    Partial<CampusMapPublishSourceInput>,
): CampusMapPublishSourceInput {
  return {
    kind: "official",
    owner: "The Chinese University of Hong Kong",
    version: null,
    snapshotHash: null,
    observedAt: null,
    rightsStatus: "unknown",
    limitations:
      "Only normalized short facts and hashes are retained; full source pages are not copied.",
    note: null,
    sourceCoordinate: null,
    ...input,
  };
}

function sourcesForSnapshot(input: {
  identityRef: string;
  source: CampusMapOfficialFacilityFetchedSource;
  accessedOn: string;
  owner: string;
  note: string;
}): CampusMapPublishSourceInput[] {
  return [
    officialSource({
      ref: input.identityRef,
      url: input.source.url,
      accessedOn: input.accessedOn,
      owner: input.owner,
      note: "Stable reviewed source-row identity; fetched snapshot evidence is attached separately.",
    }),
    officialSource({
      ref: `${input.identityRef}:snapshot:${input.source.rawSha256}`,
      url: input.source.url,
      accessedOn: input.accessedOn,
      owner: input.owner,
      version: CAMPUS_MAP_OFFICIAL_FACILITY_PARSER_VERSION,
      snapshotHash: snapshotHash(input.source),
      note: input.note,
    }),
  ];
}

function buildingMapping(sourceGroup: "res" | "osa" | "umso", label: string) {
  const mapping = CAMPUS_MAP_OFFICIAL_FACILITY_BUILDING_MAPPINGS.find(
    (candidate) =>
      candidate.sourceGroup === sourceGroup && candidate.sourceLabel === label,
  );
  if (!mapping)
    throw new Error(
      `Missing reviewed Building mapping: ${sourceGroup}:${label}`,
    );
  return mapping;
}

function resEntries(
  inventory: ResInventory,
  source: CampusMapOfficialFacilityFetchedSource,
  accessedOn: string,
): CampusMapOfficialFacilityManifestEntry[] {
  return inventory.rows
    .map((row) => {
      const mapping = buildingMapping("res", row.locationGroup);
      const floorLabel = canonicalCampusMapOfficialFacilityFloorLabel(
        row.sourceFloor,
      );
      const floorId = floorLabel
        ? campusMapOfficialFacilityFloorId(
            mapping.canonicalBuildingId,
            floorLabel,
          )
        : null;
      const identityRef = `cuhk-res:communal-classroom:${sourceKeyPart(row.roomCode)}`;
      return {
        key: `res-${sourceKeyPart(row.roomCode).toLowerCase()}`,
        batch: "res" as const,
        sourceGroup: "res" as const,
        sourceSnapshotKey: source.key,
        sourceRef: identityRef,
        extracted: {
          name: row.roomCode,
          sourceLocation: row.sourceLocation,
          sourceFloor: row.sourceFloor,
          capacity: row.capacity,
          seatType: row.seatType,
          ordinaryHours: null,
          officialUrl: row.officialUrl,
        },
        decision: {
          status: "publish" as const,
          reason:
            "The live RES classroom row has an explicit reviewed Building mapping. A single source Floor is used only when RES supplies it directly; capacity and seat type remain review-only fields.",
          buildingId: mapping.canonicalBuildingId,
          floorId,
          containmentEvidence: floorLabel
            ? `${row.locationGroup}: ${inventory.locationLabels.get(row.locationGroup)}. ${mapping.note} RES directly supplies ${row.sourceFloor}; the reviewed canonical Floor label is ${floorLabel}.`
            : `${row.locationGroup}: ${inventory.locationLabels.get(row.locationGroup)}. ${mapping.note} RES supplied floor: ${row.sourceFloor ?? "none"}; no single canonical Floor can be assigned without inference.`,
        },
        fact: emptyFact({
          name: row.roomCode,
          buildingId: mapping.canonicalBuildingId,
          floorId,
          placeType: "classroom",
          officialActions: [{ label: "查看 RES 课室资料", url: RES_URL }],
          location: floorId ? { kind: "floor" } : { kind: "building" },
        }),
        sources: sourcesForSnapshot({
          identityRef,
          source,
          accessedOn,
          owner: "Registration and Examinations Section, CUHK",
          note: `RES classroom row ${row.roomCode}; source location ${row.sourceLocation}; supplied floor ${row.sourceFloor ?? "none"}.`,
        }),
      };
    })
    .toSorted((left, right) => left.sourceRef.localeCompare(right.sourceRef));
}

function pageParagraphs(html: string): string[] {
  const document = parse(html) as unknown as HtmlNode;
  return elements(mainElement(document), "p").map(textContent).filter(Boolean);
}

function pageLinks(html: string): Array<{ text: string; url: string }> {
  const document = parse(html) as unknown as HtmlNode;
  return elements(mainElement(document), "a").flatMap((link) => {
    const url = attribute(link, "href");
    return url ? [{ text: textContent(link), url }] : [];
  });
}

function openingHoursText(paragraph: string): string | null {
  return (
    /Opening Hours:\s*(.+?)(?:\s+Use:|\s+User Guidelines|$)/i.exec(
      paragraph,
    )?.[1] ?? null
  );
}

const osaDayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function parseOsaDays(value: string): (typeof osaDayNames)[number][] {
  const aliases = new Map(osaDayNames.map((day) => [day, day] as const));
  const [firstValue, lastValue = firstValue] = value
    .toLowerCase()
    .split(/\s*[–-]\s*/);
  const first = aliases.get(firstValue as (typeof osaDayNames)[number]);
  const last = aliases.get(lastValue as (typeof osaDayNames)[number]);
  if (!first || !last) throw new Error(`Unsupported OSA day range: ${value}`);
  const firstIndex = osaDayNames.indexOf(first);
  const lastIndex = osaDayNames.indexOf(last);
  if (firstIndex > lastIndex) {
    throw new Error(`Unsupported OSA day range: ${value}`);
  }
  return osaDayNames.slice(firstIndex, lastIndex + 1);
}

function parseTwelveHourTime(value: string): string {
  const normalized = value.toLowerCase().replace(/[.\s]/g, "");
  if (normalized === "12nn" || normalized === "12noon") return "12:00";
  const match = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(normalized);
  if (!match) throw new Error(`Unsupported OSA time: ${value}`);
  const minute = Number(match[2] ?? "0");
  let hour = Number(match[1]);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    throw new Error(`Unsupported OSA time: ${value}`);
  }
  if (match[3] === "am") hour %= 12;
  if (match[3] === "pm" && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseOsaRegularHours(
  value: string | null,
): CampusMapPublishFactInput["regularHours"] {
  if (value === null || /^all day$/i.test(value.trim())) return null;
  const intervals = value.split(";").map((part) => {
    const match = /^(.+?)\s+[–-]\s+(.+?)\s+\((.+)\)$/.exec(part.trim());
    if (!match) throw new Error(`Unsupported OSA opening hours: ${value}`);
    return {
      days: parseOsaDays(match[3]!),
      opensAt: parseTwelveHourTime(match[1]!),
      closesAt: parseTwelveHourTime(match[2]!),
    };
  });
  return hours(intervals);
}

type Weekday = (typeof osaDayNames)[number];

function parsePoolTimeRange(
  value: string,
): { opensAt: string; closesAt: string } | null {
  const match = /^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/.exec(value.trim());
  return match ? { opensAt: match[1]!, closesAt: match[2]! } : null;
}

function poolRegularHours(
  paragraphValues: string[],
): NonNullable<CampusMapPublishFactInput["regularHours"]> {
  const groups: Array<{ label: string; days: Weekday[] }> = [
    { label: "Monday to Thursday", days: ["mon", "tue", "wed", "thu"] },
    { label: "Friday", days: ["fri"] },
    { label: "Saturday", days: ["sat"] },
    { label: "Sunday", days: ["sun"] },
  ];
  const schedules = new Map<
    Weekday,
    Array<{ opensAt: string; closesAt: string }>
  >();
  for (const [index, group] of groups.entries()) {
    const start = paragraphValues.indexOf(group.label);
    const endLabel = groups[index + 1]?.label;
    const end = endLabel
      ? paragraphValues.indexOf(endLabel)
      : paragraphValues.length;
    if (start < 0 || end <= start) {
      throw new Error(`OSA pool hours structure changed: ${group.label}`);
    }
    const segment = paragraphValues.slice(start + 1, end);
    const ranges = segment.flatMap((value) => {
      const range = parsePoolTimeRange(value);
      return range ? [range] : [];
    });
    const containsClosure = segment.some((value) => value.startsWith("Closed"));
    const openRanges =
      ranges.length === 3 && !containsClosure
        ? [ranges[0]!, ranges[2]!]
        : ranges.length === 2 && containsClosure
          ? [ranges[1]!]
          : null;
    if (!openRanges) {
      throw new Error(`OSA pool session structure changed: ${group.label}`);
    }
    for (const day of group.days) schedules.set(day, openRanges);
  }

  const rangeKeys = osaDayNames.flatMap((day) =>
    (schedules.get(day) ?? []).map(
      (range) => `${range.opensAt}\u0000${range.closesAt}`,
    ),
  );
  const intervals: NonNullable<
    CampusMapPublishFactInput["regularHours"]
  >["intervals"] = [];
  for (const rangeKey of [...new Set(rangeKeys)]) {
    const [opensAt, closesAt] = rangeKey.split("\u0000") as [string, string];
    let run: Weekday[] = [];
    for (const day of osaDayNames) {
      const active = (schedules.get(day) ?? []).some(
        (range) => range.opensAt === opensAt && range.closesAt === closesAt,
      );
      if (active) {
        run.push(day);
      } else if (run.length > 0) {
        intervals.push({ days: run, opensAt, closesAt });
        run = [];
      }
    }
    if (run.length > 0) intervals.push({ days: run, opensAt, closesAt });
  }
  intervals.sort((left, right) => {
    const dayOrder =
      osaDayNames.indexOf(left.days[0]!) - osaDayNames.indexOf(right.days[0]!);
    return dayOrder || left.opensAt.localeCompare(right.opensAt);
  });
  return hours(intervals)!;
}

function osaVenueEntry(
  spec: OsaVenueSpec,
  source: CampusMapOfficialFacilityFetchedSource,
  accessedOn: string,
): CampusMapOfficialFacilityManifestEntry {
  const paragraphs = pageParagraphs(source.html);
  let paragraph: string;
  if (spec.paragraphPrefix) {
    paragraph =
      paragraphs.find((candidate) =>
        candidate.startsWith(spec.paragraphPrefix!),
      ) ?? "";
    if (!paragraph) throw new Error(`OSA venue disappeared: ${spec.key}`);
  } else {
    paragraph = paragraphs.join(" ");
    if (
      spec.key === "i-lounge" &&
      (!paragraph.includes("The i-LOUNGE provides") ||
        !source.html.includes("ilounge-address.jpg"))
    ) {
      throw new Error("OSA i-LOUNGE parser evidence changed");
    }
    if (
      spec.key === "pgh-2-3-multi-purpose-hall" &&
      !paragraph.includes(spec.sourceLocation)
    ) {
      throw new Error("OSA PGH 2/3 hall containment changed");
    }
  }
  const extractedHours = openingHoursText(paragraph);
  const identityRef = `cuhk-osa:amenity:${spec.key}`;
  if (spec.decision === "intentionally-skip") {
    return {
      key: `osa-${spec.key}`,
      batch: "canary",
      sourceGroup: "osa",
      sourceSnapshotKey: source.key,
      sourceRef: identityRef,
      extracted: {
        name: spec.name,
        sourceLocation: spec.sourceLocation,
        sourceFloor: spec.sourceFloor,
        capacity: null,
        seatType: null,
        ordinaryHours: extractedHours,
        officialUrl: source.url,
      },
      decision: {
        status: "intentionally-skip",
        reason: spec.skipReason!,
      },
      fact: null,
      sources: [],
    };
  }
  const mapping = buildingMapping("osa", spec.buildingLabel);
  const floorLabel = canonicalCampusMapOfficialFacilityFloorLabel(
    spec.sourceFloor,
  );
  const floorId = floorLabel
    ? campusMapOfficialFacilityFloorId(mapping.canonicalBuildingId, floorLabel)
    : null;
  const publishedName = osaPublishedName(spec);
  return {
    key: `osa-${spec.key}`,
    batch: "canary",
    sourceGroup: "osa",
    sourceSnapshotKey: source.key,
    sourceRef: identityRef,
    extracted: {
      name: spec.name,
      sourceLocation: spec.sourceLocation,
      sourceFloor: spec.sourceFloor,
      capacity: null,
      seatType: null,
      ordinaryHours: extractedHours,
      officialUrl: source.url,
    },
    decision: {
      status: "publish",
      reason:
        "The OSA page gives this space an independent name or room identity and supports the reviewed Building containment.",
      buildingId: mapping.canonicalBuildingId,
      floorId,
      containmentEvidence: floorLabel
        ? `${spec.sourceLocation}. ${mapping.note} OSA directly supplies ${spec.sourceFloor}; the reviewed canonical Floor label is ${floorLabel}.`
        : `${spec.sourceLocation}. ${mapping.note} Source floor ${spec.sourceFloor ?? "none"} does not establish a single canonical Floor without inference.`,
    },
    fact: emptyFact({
      name: publishedName,
      buildingId: mapping.canonicalBuildingId,
      floorId,
      placeType: spec.placeType,
      regularHours: parseOsaRegularHours(extractedHours),
      officialActions: [
        { label: "网上预约", url: OSA_BOOKING_URL },
        { label: "查看官方详情", url: source.url },
      ],
      location: floorId ? { kind: "floor" } : { kind: "building" },
    }),
    sources: sourcesForSnapshot({
      identityRef,
      source,
      accessedOn,
      owner: "Office of Student Affairs, CUHK",
      note: `OSA named destination ${spec.name}; reviewed location ${spec.sourceLocation}.`,
    }),
  };
}

function poolEntry(
  source: CampusMapOfficialFacilityFetchedSource,
  accessedOn: string,
): CampusMapOfficialFacilityManifestEntry {
  const paragraphValues = pageParagraphs(source.html);
  const fullText = textContent(parse(source.html) as unknown as HtmlNode);
  const regularHours = poolRegularHours(paragraphValues);
  const studentFee =
    /\bStudents\b.*?\bAdmission fees\b\s*(HK\$\d+(?:\.\d+)?)/.exec(
      fullText,
    )?.[1];
  const hasOctopusEvidence = fullText.includes(
    "Admission fees are payable only with an Octopus Card",
  );
  const hasCuLinkEvidence = fullText.includes(
    "CU Link Card holders are NOT required to apply for swimming card",
  );
  const visitNote =
    studentFee && hasOctopusEvidence && hasCuLinkEvidence
      ? `学生入场 ${studentFee}，只收八达通；持有效 CU Link 无需另办泳证。`
      : null;
  const scheduleUrl = pageLinks(source.html)
    .map((link) => link.url)
    .find((url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.protocol === "https:" &&
          parsed.hostname === "calendar.google.com" &&
          parsed.pathname === "/calendar/embed"
        );
      } catch {
        return false;
      }
    });
  const identityRef = "cuhk-osa:amenity:university-swimming-pool";
  return {
    key: "osa-university-swimming-pool",
    batch: "canary",
    sourceGroup: "osa",
    sourceSnapshotKey: source.key,
    sourceRef: identityRef,
    extracted: {
      name: "大学游泳池（University Swimming Pool）",
      sourceLocation: "Central campus",
      sourceFloor: null,
      capacity: null,
      seatType: null,
      ordinaryHours: regularHours.intervals
        .map(
          (interval) =>
            `${interval.days.join(",")} ${interval.opensAt}–${interval.closesAt}`,
        )
        .join("; "),
      officialUrl: source.url,
    },
    decision: {
      status: "publish",
      reason:
        "The University Swimming Pool is an independently named sports destination with a previously reviewed official approximate WGS84 point.",
      buildingId: null,
      floorId: null,
      containmentEvidence:
        "Official CUHK Campus Map location database item 96 (version 20161006); point is approximate and is not a Building anchor.",
    },
    fact: emptyFact({
      name: "大学游泳池（University Swimming Pool）",
      buildingId: null,
      floorId: null,
      placeType: "sports-facility",
      regularHours,
      officialActions: [
        ...(scheduleUrl
          ? [{ label: "查看最新安排" as const, url: scheduleUrl }]
          : []),
        { label: "查看官方详情", url: source.url },
      ],
      visitNote,
      location: {
        kind: "outdoor-point",
        longitude: 114.20539677143097,
        latitude: 22.417996104088313,
        crs: "wgs84",
        precision: "approximate",
      },
    }),
    sources: [
      ...sourcesForSnapshot({
        identityRef,
        source,
        accessedOn,
        owner: "Office of Student Affairs, CUHK",
        note: "OSA ordinary weekly hours, admission note and current-arrangements action.",
      }),
      // Reuse the immutable location evidence already published by #865.
      ...getCampusMapRepresentativeFacilityManifest()
        .entries.find((entry) => entry.key === "osa-university-swimming-pool")!
        .change.sources.filter((source) => source.sourceCoordinate !== null),
    ],
  };
}

function osaEntries(
  sources: Map<
    CampusMapOfficialFacilitySourceKey,
    CampusMapOfficialFacilityFetchedSource
  >,
  accessedOn: string,
): CampusMapOfficialFacilityManifestEntry[] {
  const index = requireSource(sources, "osa-amenities");
  const indexLinks = new Set(pageLinks(index.html).map((link) => link.url));
  for (const key of [
    "osa-swimming-pool",
    "osa-bfc",
    "osa-jfc",
    "osa-psc",
    "osa-i-lounge",
    "osa-pgh-2-3",
  ] as const) {
    if (!indexLinks.has(CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS[key])) {
      throw new Error(`OSA Amenities index no longer links ${key}`);
    }
  }
  for (const pageKey of ["osa-bfc", "osa-jfc", "osa-psc"] as const) {
    const page = requireSource(sources, pageKey);
    const locationParagraphs = pageParagraphs(page.html).filter((paragraph) =>
      paragraph.includes("Location:"),
    );
    const reviewedPrefixes = OSA_VENUES.filter(
      (spec) =>
        spec.pageKey === pageKey && spec.paragraphPrefix?.includes("Location:"),
    ).map((spec) => spec.paragraphPrefix!);
    if (
      locationParagraphs.length !== reviewedPrefixes.length ||
      locationParagraphs.some(
        (paragraph) =>
          !reviewedPrefixes.some((prefix) => paragraph.startsWith(prefix)),
      )
    ) {
      throw new Error(`OSA named-location inventory changed: ${pageKey}`);
    }
  }
  const entries = OSA_VENUES.map((spec) =>
    osaVenueEntry(spec, requireSource(sources, spec.pageKey), accessedOn),
  );
  entries.push(
    poolEntry(requireSource(sources, "osa-swimming-pool"), accessedOn),
  );
  return entries.toSorted((left, right) =>
    left.sourceRef.localeCompare(right.sourceRef),
  );
}

function umsoSources(
  identityRef: string,
  primary: CampusMapOfficialFacilityFetchedSource,
  others: CampusMapOfficialFacilityFetchedSource[],
  accessedOn: string,
): CampusMapPublishSourceInput[] {
  return [
    ...sourcesForSnapshot({
      identityRef,
      source: primary,
      accessedOn,
      owner: "University Medical Service Office, CUHK",
      note: "UMSO public service action and ordinary operating facts.",
    }),
    ...others.map((source) =>
      officialSource({
        ref: `cuhk-umso:page:${source.key}:snapshot:${source.rawSha256}`,
        url: source.url,
        accessedOn,
        owner: "University Medical Service Office, CUHK",
        version: CAMPUS_MAP_OFFICIAL_FACILITY_PARSER_VERSION,
        snapshotHash: snapshotHash(source),
        note: `Supporting UMSO page ${source.key}.`,
      }),
    ),
  ];
}

function timeRangesFromParagraph(
  paragraph: string,
): Array<{ opensAt: string; closesAt: string }> {
  const matches = [
    ...paragraph.matchAll(
      /(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/gi,
    ),
  ];
  if (matches.length !== 2) {
    throw new Error(`Unsupported UMSO outpatient hours: ${paragraph}`);
  }
  return matches.map((match) => ({
    opensAt: parseTwelveHourTime(match[1]!),
    closesAt: parseTwelveHourTime(match[2]!),
  }));
}

function umsoOutpatientHours(paragraphValues: string[]): {
  ordinaryHours: string;
  regularHours: NonNullable<CampusMapPublishFactInput["regularHours"]>;
} {
  const mondayToThursday = paragraphValues.find((paragraph) =>
    paragraph.startsWith("Monday – Thursday:"),
  );
  const friday = paragraphValues.find((paragraph) =>
    paragraph.startsWith("Friday:"),
  );
  if (!mondayToThursday || !friday) {
    throw new Error("UMSO outpatient hours structure changed");
  }
  const weekdayRanges = timeRangesFromParagraph(mondayToThursday);
  const fridayRanges = timeRangesFromParagraph(friday);
  const intervals = [
    ...weekdayRanges.map((range) => ({
      days: ["mon", "tue", "wed", "thu"] as Weekday[],
      ...range,
    })),
    ...fridayRanges.map((range) => ({
      days: ["fri"] as Weekday[],
      ...range,
    })),
  ];
  return {
    ordinaryHours: `Mon–Thu ${weekdayRanges.map((range) => `${range.opensAt}–${range.closesAt}`).join(", ")}; Fri ${fridayRanges.map((range) => `${range.opensAt}–${range.closesAt}`).join(", ")}`,
    regularHours: hours(intervals)!,
  };
}

function umsoAppointmentAction(
  contactText: string,
  service: "Outpatient Service" | "Dental Service",
): { label: "电话预约"; url: string } {
  const escapedService = service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `${escapedService}\\s+Appointment:\\s*([0-9 ]{8,})`,
  ).exec(contactText);
  const digits = match?.[1]?.replace(/\s/g, "") ?? "";
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`UMSO ${service} appointment contact changed shape`);
  }
  return { label: "电话预约", url: `tel:+852${digits}` };
}

function umsoEntries(
  sources: Map<
    CampusMapOfficialFacilitySourceKey,
    CampusMapOfficialFacilityFetchedSource
  >,
  accessedOn: string,
): CampusMapOfficialFacilityManifestEntry[] {
  const home = requireSource(sources, "umso-home");
  const location = requireSource(sources, "umso-location");
  const medical = requireSource(sources, "umso-medical");
  const dental = requireSource(sources, "umso-dental");
  const contact = requireSource(sources, "umso-contact");
  const homeParagraphs = pageParagraphs(home.html);
  const homeText = homeParagraphs.join(" ");
  const locationText = pageParagraphs(location.html).join(" ");
  const medicalText = pageParagraphs(medical.html).join(" ");
  const dentalText = textContent(parse(dental.html) as unknown as HtmlNode);
  const contactText = textContent(parse(contact.html) as unknown as HtmlNode);
  if (
    !locationText.includes(
      "University Health Centre is a three-storey building",
    )
  ) {
    throw new Error("UMSO Health Centre location changed");
  }
  if (!medicalText.includes("Patients can book appointments in advance")) {
    throw new Error("UMSO outpatient service marker changed");
  }
  if (!dentalText.includes("How to book appointment for check-up")) {
    throw new Error("UMSO dental service marker changed");
  }
  const outpatientHours = umsoOutpatientHours(homeParagraphs);
  const outpatientAppointment = umsoAppointmentAction(
    contactText,
    "Outpatient Service",
  );
  const dentalAppointment = umsoAppointmentAction(
    contactText,
    "Dental Service",
  );
  const requiresIdentification = homeText.includes(
    "Personal identification document is required for registration.",
  );
  const building = buildingMapping("umso", "University Health Centre");
  const commonDecision = {
    status: "publish" as const,
    reason:
      "UMSO gives this service an independent action and operating identity inside University Health Centre.",
    buildingId: building.canonicalBuildingId,
    floorId: null,
    containmentEvidence: `The official UMSO location page identifies University Health Centre as a three-storey Building at Clinic Road. ${building.note}`,
  };
  const outpatientRef = "cuhk-umso:service:outpatient";
  const dentalRef = "cuhk-umso:service:dental";
  return [
    {
      key: "umso-outpatient",
      batch: "canary",
      sourceGroup: "umso",
      sourceSnapshotKey: home.key,
      sourceRef: outpatientRef,
      extracted: {
        name: "门诊（Outpatient Service）",
        sourceLocation: "University Health Centre, Clinic Road",
        sourceFloor: null,
        capacity: null,
        seatType: null,
        ordinaryHours: outpatientHours.ordinaryHours,
        officialUrl: medical.url,
      },
      decision: commonDecision,
      fact: emptyFact({
        name: "门诊（Outpatient Service）",
        buildingId: building.canonicalBuildingId,
        floorId: null,
        placeType: "health-service",
        regularHours: outpatientHours.regularHours,
        officialActions: [
          { label: "网上预约", url: UMSO_BOOKING_URL },
          outpatientAppointment,
          { label: "查看官方详情", url: medical.url },
        ],
        visitNote: requiresIdentification ? "登记时须出示个人身份证明。" : null,
        location: { kind: "building" },
      }),
      sources: umsoSources(
        outpatientRef,
        home,
        [location, medical, contact],
        accessedOn,
      ),
    },
    {
      key: "umso-dental",
      batch: "canary",
      sourceGroup: "umso",
      sourceSnapshotKey: dental.key,
      sourceRef: dentalRef,
      extracted: {
        name: "牙科（Dental Service）",
        sourceLocation: "University Health Centre, Clinic Road",
        sourceFloor: null,
        capacity: null,
        seatType: null,
        ordinaryHours: null,
        officialUrl: dental.url,
      },
      decision: commonDecision,
      fact: emptyFact({
        name: "牙科（Dental Service）",
        buildingId: building.canonicalBuildingId,
        floorId: null,
        placeType: "health-service",
        officialActions: [
          dentalAppointment,
          { label: "查看官方详情", url: dental.url },
        ],
        location: { kind: "building" },
      }),
      sources: umsoSources(dentalRef, dental, [location, contact], accessedOn),
    },
  ];
}

function requireSource(
  sources: Map<
    CampusMapOfficialFacilitySourceKey,
    CampusMapOfficialFacilityFetchedSource
  >,
  key: CampusMapOfficialFacilitySourceKey,
): CampusMapOfficialFacilityFetchedSource {
  const source = sources.get(key);
  if (!source) throw new Error(`Missing fetched source: ${key}`);
  return source;
}

function semanticSnapshot(
  source: CampusMapOfficialFacilityFetchedSource,
  entries: CampusMapOfficialFacilityManifestEntry[],
): CampusMapOfficialFacilitySourceSnapshot {
  const semanticRows = entries
    .filter((entry) => entry.sourceSnapshotKey === source.key)
    .map((entry) => ({
      sourceRef: entry.sourceRef,
      extracted: entry.extracted,
      decision: entry.decision,
      fact: entry.fact,
    }));
  const semanticEvidence =
    semanticRows.length > 0
      ? semanticRows
      : {
          paragraphs: pageParagraphs(source.html),
          links: pageLinks(source.html),
        };
  return {
    key: source.key,
    url: source.url,
    rawSha256: source.rawSha256,
    semanticSha256: campusMapOfficialFacilitySha256(
      canonicalCampusMapOfficialFacilityJson(semanticEvidence),
    ),
  };
}

export function buildCampusMapOfficialFacilityManifest(input: {
  sources: CampusMapOfficialFacilityFetchedSource[];
  accessedOn: string;
  manifestVersion: string;
}): CampusMapOfficialFacilityManifest {
  const sources = new Map(input.sources.map((source) => [source.key, source]));
  if (
    sources.size !==
    Object.keys(CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS).length
  ) {
    throw new Error(
      "Official facility fetch did not return every allowlisted source exactly once",
    );
  }
  const resSource = requireSource(sources, "res-classrooms");
  const inventory = parseResClassroomInventory(resSource.html);
  const entries = [
    ...osaEntries(sources, input.accessedOn),
    ...umsoEntries(sources, input.accessedOn),
    ...resEntries(inventory, resSource, input.accessedOn),
  ];
  const draft: CampusMapOfficialFacilityManifestDraft = {
    schemaVersion: CAMPUS_MAP_OFFICIAL_FACILITY_MANIFEST_SCHEMA,
    manifestVersion: input.manifestVersion,
    parserVersion: CAMPUS_MAP_OFFICIAL_FACILITY_PARSER_VERSION,
    accessedOn: input.accessedOn,
    approval: { status: "pending", reviewedBy: null, reviewedOn: null },
    resExpectedCount: CAMPUS_MAP_OFFICIAL_FACILITY_RES_EXPECTED_COUNT,
    resLiveCount: inventory.rows.length,
    sourceSnapshots: input.sources.map((source) =>
      semanticSnapshot(source, entries),
    ),
    buildingMappings: structuredClone(
      CAMPUS_MAP_OFFICIAL_FACILITY_BUILDING_MAPPINGS,
    ),
    entries,
  };
  return finalizeCampusMapOfficialFacilityManifest(draft);
}

export async function fetchCampusMapOfficialFacilitySources(
  fetchImpl: typeof fetch = fetch,
): Promise<CampusMapOfficialFacilityFetchedSource[]> {
  const fetched: CampusMapOfficialFacilityFetchedSource[] = [];
  for (const [key, url] of Object.entries(
    CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS,
  ) as Array<[CampusMapOfficialFacilitySourceKey, string]>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      try {
        response = await fetchImpl(url, {
          cache: "no-store",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent":
              "CUpedia-official-facility-import/1.0 (+https://cupedia.cuhk.edu.hk/)",
          },
        });
      } catch (error) {
        if (fetchImpl !== fetch) throw error;
        response = await curlFetch(url);
      }
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`${response.status} fetching ${key}`);
    const finalUrl = new URL(response.url || url);
    const allowedUrl = new URL(url);
    if (
      finalUrl.protocol !== "https:" ||
      finalUrl.hostname !== allowedUrl.hostname ||
      finalUrl.pathname.replace(/\/$/, "") !==
        allowedUrl.pathname.replace(/\/$/, "")
    ) {
      throw new Error(
        `Unsafe redirect while fetching ${key}: ${finalUrl.href}`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error(`Unexpected content type while fetching ${key}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) {
      throw new Error(`Unexpected response size while fetching ${key}`);
    }
    fetched.push({
      key,
      url,
      html: new TextDecoder().decode(bytes),
      rawSha256: campusMapOfficialFacilitySha256(bytes),
    });
  }
  return fetched;
}
