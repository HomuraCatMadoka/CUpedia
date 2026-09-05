import type {
  CampusMapPublishChange,
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

export const CAMPUS_MAP_REPRESENTATIVE_FACILITY_MANIFEST_VERSION =
  "2026-09-05.1";

export type RepresentativeFacilityKey =
  | "res-bms-lt"
  | "osa-university-swimming-pool"
  | "umso-outpatient"
  | "umso-dental";

export interface CampusMapRepresentativeFacilityManifestEntry {
  key: RepresentativeFacilityKey;
  /** The first source is the stable official identity used for safe replay. */
  change: Extract<CampusMapPublishChange, { operation: "create" }>;
}

const ACCESSED_ON = "2026-09-03";
const CUHK_OWNER = "The Chinese University of Hong Kong";
const SHORT_FACT_LIMITATION =
  "Only a small set of manually reviewed facts is represented; page text and dated notices are not copied.";

function fact(
  input: Pick<
    CampusMapPublishFactInput,
    "name" | "buildingId" | "floorId" | "placeType" | "location"
  > &
    Partial<
      Omit<
        CampusMapPublishFactInput,
        "name" | "buildingId" | "floorId" | "placeType" | "location"
      >
    >,
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
  input: Pick<CampusMapPublishSourceInput, "ref" | "url"> &
    Partial<CampusMapPublishSourceInput>,
): CampusMapPublishSourceInput {
  return {
    kind: "official",
    owner: CUHK_OWNER,
    version: null,
    snapshotHash: null,
    accessedOn: ACCESSED_ON,
    observedAt: null,
    rightsStatus: "unknown",
    limitations: SHORT_FACT_LIMITATION,
    note: null,
    sourceCoordinate: null,
    ...input,
  };
}

const RES_CLASSROOM_URL =
  "https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/";
const POOL_URL =
  "https://www.osa.cuhk.edu.hk/campus-life/amenities/swimming-pool/";
const POOL_SCHEDULE_URL =
  "https://calendar.google.com/calendar/embed?ctz=Asia%2FHong_Kong&src=swimmingpoolcuhk%40gmail.com";
const UMSO_URL = "https://www.umso.cuhk.edu.hk/";
const UMSO_BOOKING_URL = "https://booking.umso.cuhk.edu.hk/booking/";

const entries: CampusMapRepresentativeFacilityManifestEntry[] = [
  {
    key: "res-bms-lt",
    change: {
      operation: "create",
      fact: fact({
        name: "BMS LT",
        buildingId: "367d9f99-13e6-5805-8447-5b523f7b36d3",
        floorId: null,
        placeType: "classroom",
        officialActions: [
          { label: "查看 RES 课室资料", url: RES_CLASSROOM_URL },
        ],
        location: { kind: "building" },
      }),
      sources: [
        officialSource({
          ref: "cuhk-res:communal-classroom:BMS-LT",
          url: RES_CLASSROOM_URL,
          owner: "Registration and Examinations Section, CUHK",
        }),
      ],
    },
  },
  {
    key: "osa-university-swimming-pool",
    change: {
      operation: "create",
      fact: fact({
        name: "大学游泳池（University Swimming Pool）",
        buildingId: null,
        floorId: null,
        placeType: "sports-facility",
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [
            {
              days: ["mon", "tue", "wed", "thu"],
              opensAt: "10:30",
              closesAt: "13:30",
            },
            {
              days: ["mon", "tue", "wed", "thu", "fri", "sat"],
              opensAt: "15:00",
              closesAt: "19:30",
            },
            { days: ["sun"], opensAt: "10:30", closesAt: "13:30" },
            { days: ["sun"], opensAt: "15:00", closesAt: "18:00" },
          ],
        },
        officialActions: [
          { label: "查看最新安排", url: POOL_SCHEDULE_URL },
          { label: "查看官方详情", url: POOL_URL },
        ],
        visitNote: "学生入场 HK$5，只收八达通；持有效 CU Link 无需另办泳证。",
        location: {
          kind: "outdoor-point",
          longitude: 114.20539677143097,
          latitude: 22.417996104088313,
          crs: "wgs84",
          precision: "approximate",
        },
      }),
      sources: [
        officialSource({
          ref: "cuhk-osa:amenity:university-swimming-pool",
          url: POOL_URL,
          owner: "Office of Student Affairs, CUHK",
        }),
        officialSource({
          ref: "cuhk-campus-map:facility:96:20161006",
          url: "https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006",
          version: "20161006",
          snapshotHash:
            "sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda",
          limitations:
            "The official campus map says it is not to scale and is not updated in real time; the point is approximate location evidence only.",
          sourceCoordinate: {
            x: 114.20539677143097,
            y: 22.417996104088313,
            crs: "wgs84",
            conversion: null,
          },
        }),
      ],
    },
  },
  {
    key: "umso-outpatient",
    change: {
      operation: "create",
      fact: fact({
        name: "门诊（Outpatient Service）",
        buildingId: "a8bfebbd-87bf-5ac9-a089-446c4198e38d",
        floorId: null,
        placeType: "health-service",
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [
            {
              days: ["mon", "tue", "wed", "thu", "fri"],
              opensAt: "08:45",
              closesAt: "13:00",
            },
            {
              days: ["mon", "tue", "wed", "thu"],
              opensAt: "14:00",
              closesAt: "17:30",
            },
            { days: ["fri"], opensAt: "14:00", closesAt: "17:45" },
          ],
        },
        officialActions: [
          { label: "网上预约", url: UMSO_BOOKING_URL },
          { label: "电话预约", url: "tel:+85239436439" },
        ],
        visitNote: "登记时须出示个人身份证明。",
        location: { kind: "building" },
      }),
      sources: [
        officialSource({
          ref: "cuhk-umso:service:outpatient",
          url: UMSO_URL,
          owner: "University Medical Service Office, CUHK",
        }),
      ],
    },
  },
  {
    key: "umso-dental",
    change: {
      operation: "create",
      fact: fact({
        name: "牙科（Dental Service）",
        buildingId: "a8bfebbd-87bf-5ac9-a089-446c4198e38d",
        floorId: null,
        placeType: "health-service",
        officialActions: [
          { label: "电话预约", url: "tel:+85239436412" },
          { label: "查看官方详情", url: UMSO_URL },
        ],
        location: { kind: "building" },
      }),
      sources: [
        officialSource({
          ref: "cuhk-umso:service:dental",
          url: UMSO_URL,
          owner: "University Medical Service Office, CUHK",
        }),
      ],
    },
  },
];

/** Returns the stable official source that makes a retry idempotent. */
export function campusMapRepresentativeFacilityIdentitySource(
  entry: CampusMapRepresentativeFacilityManifestEntry,
): CampusMapPublishSourceInput {
  const source = entry.change.sources[0];
  if (!source || source.kind !== "official") {
    throw new Error(
      `Representative facility ${entry.key} has no identity source`,
    );
  }
  return source;
}

/** Returns a fresh copy so callers cannot mutate the reviewed payload. */
export function getCampusMapRepresentativeFacilityManifest(): {
  version: string;
  idempotencyKey: string;
  entries: CampusMapRepresentativeFacilityManifestEntry[];
} {
  return structuredClone({
    version: CAMPUS_MAP_REPRESENTATIVE_FACILITY_MANIFEST_VERSION,
    idempotencyKey: "86500000-0000-4000-8000-000000000002",
    entries,
  });
}

/** Builds the reviewed bulk command consumed by the canonical writer. */
export function buildCampusMapRepresentativeFacilityCommand(): CampusMapPublishCommand {
  const manifest = getCampusMapRepresentativeFacilityManifest();
  return {
    kind: "bulk",
    idempotencyKey: manifest.idempotencyKey,
    comment: "导入 Campus Map V2 代表性官方设施",
    sourceSummary: "人工核对 CUHK RES、OSA 与 UMSO 官方短事实",
    reviewRequested: false,
    client: {
      name: "campus-map-reviewed-manifest",
      version: manifest.version,
    },
    warningAcknowledgements: [],
    changes: manifest.entries.map((entry) => entry.change),
  };
}
