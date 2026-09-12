import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";
import { getCampusMapRepresentativeFacilityManifest } from "@/lib/campus-map/representative-facility-manifest";

import {
  CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT,
  CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS,
  approveCampusMapOfficialFacilityManifest,
  buildCampusMapOfficialFacilityChunkCommand,
  campusMapOfficialFacilityFloorId,
  campusMapOfficialFacilityManifestHash,
  chunkCampusMapOfficialFacilityManifest,
  parseCampusMapOfficialFacilityManifest,
  validateCampusMapOfficialFacilityManifest,
  type CampusMapOfficialFacilityManifest,
} from "@/lib/campus-map/official-facility-manifest";
import {
  CAMPUS_MAP_OFFICIAL_FACILITY_BUILDING_MAPPINGS,
  buildCampusMapOfficialFacilityManifest,
  canonicalCampusMapOfficialFacilityFloorLabel,
  parseResClassroomInventory,
  type CampusMapOfficialFacilityFetchedSource,
  type CampusMapOfficialFacilitySourceKey,
} from "@/lib/campus-map/official-facility-source";

const manifestPath = new URL(
  "../../docs/campus-map/data/official-facilities-2026-09-07.json",
  import.meta.url,
);

let manifest: CampusMapOfficialFacilityManifest;

function resLocationRows(): string {
  return CAMPUS_MAP_OFFICIAL_FACILITY_BUILDING_MAPPINGS.filter(
    (mapping) => mapping.sourceGroup === "res",
  )
    .map(
      (mapping) =>
        `<tr><td>${mapping.sourceLabel}</td><td>${mapping.canonicalBuildingName}</td></tr>`,
    )
    .join("");
}

const classroomHeader =
  "<tr><th>Location</th><th>Floor</th><th>Room</th><th>Seating Capacity</th><th>Seat Type</th></tr>";

function paragraphs(values: string[]): string {
  return `<main>${values.map((value) => `<p>${value}</p>`).join("")}</main>`;
}

function fetchedSource(
  key: CampusMapOfficialFacilitySourceKey,
  html: string,
): CampusMapOfficialFacilityFetchedSource {
  return {
    key,
    url: CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS[key],
    html,
    rawSha256: "a".repeat(64),
  };
}

function fullSourceFixtures(input?: {
  jfc215Hours?: string;
  outpatientFridayClose?: string;
  outpatientPhone?: string;
  dentalPhone?: string;
  poolSundayClose?: string;
}): CampusMapOfficialFacilityFetchedSource[] {
  const resRows = Array.from({ length: 257 }, (_, index) => {
    const room = `BMS T${String(index + 1).padStart(3, "0")}`;
    return `<tr><td><a href="https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html">Basic Med Sci Bldg ${room}</a></td><td></td><td><a href="http://www.avsu.cuhk.edu.hk/room/${index + 1}">${room}</a></td><td>40</td><td>Lecture Theatre</td></tr>`;
  }).join("");
  const resHtml = `<main><table>${classroomHeader}${resRows}</table><table>${classroomHeader}</table><table>${classroomHeader}</table><table>${resLocationRows()}</table></main>`;
  const indexHtml = `<main>${[
    "osa-swimming-pool",
    "osa-bfc",
    "osa-jfc",
    "osa-psc",
    "osa-i-lounge",
    "osa-pgh-2-3",
  ]
    .map(
      (key) =>
        `<a href="${CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS[key as CampusMapOfficialFacilitySourceKey]}">${key}</a>`,
    )
    .join("")}</main>`;
  const bfcHtml = paragraphs([
    "Conference Room Location: Room 305, BFC Reservation Time: 9 am – 10 pm (Mon – Fri) Use:",
    "Student Activity Room Location: Room 306, BFC Reservation Time: 9 am – 10 pm (Mon – Sun) Use:",
    "Conference Hall / Rehearsal Room Location: Room LG13A and LG13B, BFC Reservation Time: 9 am – 10 pm (Mon – Sun) Use:",
    "Exhibition Hall Location: G/F, BFC Use:",
    "Exhibition Hall – Exhibition Area Location: G/F, BFC Use:",
    "Exhibition Gallery – Fixed Poster Board Location: G/F, BFC Use:",
  ]);
  const jfcHtml = paragraphs([
    "Integrated Activity Room Location: Room 103A, JFC Reservation Time: 9 am – 10 pm (Mon – Sun) Use:",
    "Integrated Activity Room Location: Room 103B, JFC Reservation Time: 9 am – 10 pm (Mon – Sun) Use:",
    "Integrated Activity Room Location: Room 103C, JFC Reservation Time: 9 am – 10 pm (Mon – Sun) Use:",
    "Exhibition Hall Location: Room 103D, JFC Reservation Time: 9 am – 10 pm (Mon – Sun) Use:",
    `Space@JFC Location: 215, JFC Opening Hours: ${input?.jfc215Hours ?? "12 noon – 8 pm (Mon – Sun)"} Use:`,
  ]);
  const pscHtml = paragraphs([
    "Multi-purpose Hall Location: Room G01, PSC Opening Hours: 12 nn – 10:30pm (Mon); 9 am – 10:30pm (Tue – Fri); 11 am – 6 pm (Sat) Use:",
    ...[
      ["Snooker Room", "G02"],
      ["Band Room", "G03"],
      ["Music Room", "G04"],
      ["Piano Room", "G05"],
      ["Piano Room", "G06"],
      ["Piano Room", "G07"],
      ["Meeting Room", "204"],
      ["Multi-purpose Room", "303"],
      ["Fitness Room", "309"],
    ].map(
      ([name, room]) =>
        `${name} Location: Room ${room}, PSC Opening Hours: 9 am – 10 pm (Mon – Fri); 11 am – 6 pm (Sat) Use:`,
    ),
    ...["G08", "G09", "G10"].map(
      (room) =>
        `Discussion Room Location: Room ${room}, PSC Opening Hours: All day Use:`,
    ),
    "Poster Holders Use:",
    "Leaflet / Publication Racks Use:",
    "Promotion Area Use:",
  ]);
  const poolHtml = `${paragraphs([
    "CU Link Card holders are NOT required to apply for swimming card.",
    "Monday to Thursday",
    "10:30 – 13:30",
    "13:30 – 15:00",
    "15:00 – 19:30",
    "Friday",
    "Closed Weekly Deep Cleaning",
    "13:30 – 15:00",
    "15:00 – 19:30",
    "Saturday",
    "Closed Water Polo Team Practice",
    "13:30 – 15:00",
    "15:00 – 19:30",
    "Sunday",
    "10:30 – 13:30",
    "13:30 – 15:00",
    `15:00 – ${input?.poolSundayClose ?? "18:00"}`,
    "Students",
    "Admission fees",
    "HK$5",
    "Admission fees are payable only with an Octopus Card.",
  ]).replace(
    "</main>",
    '<a href="https://calendar.google.com/calendar/embed?src=swimmingpoolcuhk%40gmail.com&amp;ctz=Asia%2FHong_Kong">schedule</a></main>',
  )}`;
  const homeHtml = paragraphs([
    "Personal identification document is required for registration.",
    "Monday – Thursday: 8:45a.m. – 1:00p.m. 2:00p.m. – 5:30p.m.",
    `Friday: 8:45a.m – 1:00p.m. 2:00p.m. – ${input?.outpatientFridayClose ?? "5:45p.m."}`,
    "Saturdays, Sundays and general holidays: Closed",
  ]);
  const contactHtml = paragraphs([
    `Outpatient Service Appointment: ${input?.outpatientPhone ?? "3943 6439"} Enquiry: 3943 6422`,
    `Dental Service Appointment: ${input?.dentalPhone ?? "3943 6412"} Enquiry: 3943 6410`,
  ]);

  return [
    fetchedSource("res-classrooms", resHtml),
    fetchedSource("osa-amenities", indexHtml),
    fetchedSource("osa-swimming-pool", poolHtml),
    fetchedSource("osa-bfc", bfcHtml),
    fetchedSource("osa-jfc", jfcHtml),
    fetchedSource("osa-psc", pscHtml),
    fetchedSource(
      "osa-i-lounge",
      '<main><p>The i-LOUNGE provides student space.</p><img src="ilounge-address.jpg"></main>',
    ),
    fetchedSource(
      "osa-pgh-2-3",
      paragraphs([
        "1/F, Jockey Club Postgraduate Halls 2 & 3 10:00 a.m. to 10:00 p.m. every Monday to Friday, and from 11:00 a.m. to 6:00 p.m. every Saturday",
      ]),
    ),
    fetchedSource("umso-home", homeHtml),
    fetchedSource(
      "umso-location",
      paragraphs([
        "University Health Centre is a three-storey building at Clinic Road.",
      ]),
    ),
    fetchedSource(
      "umso-medical",
      paragraphs(["Patients can book appointments in advance."]),
    ),
    fetchedSource(
      "umso-dental",
      paragraphs(["How to book appointment for check-up"]),
    ),
    fetchedSource("umso-contact", contactHtml),
  ];
}

beforeAll(async () => {
  const parsed = parseCampusMapOfficialFacilityManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  expect(parsed.status).toBe("valid");
  if (parsed.status === "invalid") throw new Error(parsed.errors.join(", "));
  manifest = parsed.manifest;
});

describe("official facility review manifest", () => {
  it("keeps the fetched artifact pending and hash-protected", () => {
    expect(manifest.approval).toEqual({
      status: "pending",
      reviewedBy: null,
      reviewedOn: null,
    });
    expect(manifest.resExpectedCount).toBe(257);
    expect(manifest.resLiveCount).toBe(257);
    expect(manifest.entries).toHaveLength(289);
    expect(
      validateCampusMapOfficialFacilityManifest(manifest, {
        requireApproval: true,
      }),
    ).toMatchObject({ status: "invalid" });

    const draft = structuredClone(manifest);
    delete (draft as Partial<CampusMapOfficialFacilityManifest>).manifestHash;
    expect(campusMapOfficialFacilityManifestHash(draft)).toBe(
      manifest.manifestHash,
    );
  });

  it("requires explicit approval and creates deterministic chunks", () => {
    const approved = approveCampusMapOfficialFacilityManifest(
      manifest,
      "Campus Map reviewer",
      "2026-09-07",
    );
    expect(
      validateCampusMapOfficialFacilityManifest(approved, {
        requireApproval: true,
      }),
    ).toEqual({ status: "valid", errors: [] });

    const chunks = chunkCampusMapOfficialFacilityManifest(approved);
    expect(chunks).toHaveLength(13);
    expect(chunks.slice(0, 2).map((chunk) => chunk.batch)).toEqual([
      "canary",
      "canary",
    ]);
    expect(chunks.slice(2).every((chunk) => chunk.batch === "res")).toBe(true);
    expect(
      chunks.every(
        (chunk) =>
          chunk.entries.length > 0 &&
          chunk.entries.length <= CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT,
      ),
    ).toBe(true);
    const commands = chunks.map((chunk) =>
      buildCampusMapOfficialFacilityChunkCommand(approved, chunk),
    );
    expect(
      commands.every(
        (command) => Buffer.byteLength(JSON.stringify(command)) <= 512 * 1024,
      ),
    ).toBe(true);
    expect(
      commands.every((command) =>
        command.comment.includes(`manifest sha256:${approved.manifestHash}`),
      ),
    ).toBe(true);
  });

  it("represents every candidate as publish or intentionally-skip", () => {
    const counts = manifest.entries.reduce<Record<string, number>>(
      (result, entry) => {
        const key = `${entry.sourceGroup}:${entry.decision.status}`;
        result[key] = (result[key] ?? 0) + 1;
        return result;
      },
      {},
    );
    expect(counts).toEqual({
      "osa:publish": 26,
      "osa:intentionally-skip": 4,
      "umso:publish": 2,
      "res:publish": 257,
    });
    expect(
      manifest.entries
        .filter((entry) => entry.decision.status === "intentionally-skip")
        .every((entry) => entry.decision.reason.length > 20),
    ).toBe(true);
  });

  it("publishes only directly supplied single Floors from RES", () => {
    const ckb = manifest.entries.find(
      (entry) => entry.sourceRef === "cuhk-res:communal-classroom:CKB-706B",
    );
    expect(ckb?.extracted).toMatchObject({
      name: "CKB 706B",
      capacity: expect.any(Number),
      seatType: expect.any(String),
    });
    expect(ckb?.fact).not.toHaveProperty("capacity");
    expect(ckb?.fact).not.toHaveProperty("seatType");
    expect(ckb?.fact).toMatchObject({
      floorId: campusMapOfficialFacilityFloorId(
        "42186269-a5d4-57b4-ab6d-a75d13e379bc",
        "7",
      ),
      location: { kind: "floor" },
    });

    const resEntries = manifest.entries.filter(
      (entry) => entry.sourceGroup === "res",
    );
    expect(
      resEntries.filter((entry) => entry.fact?.floorId !== null),
    ).toHaveLength(250);
    expect(
      resEntries
        .filter((entry) => entry.fact?.floorId === null)
        .map((entry) => entry.key)
        .toSorted(),
    ).toEqual([
      "res-bms-1",
      "res-bms-2",
      "res-bms-g18",
      "res-bms-lt",
      "res-erb-lt",
      "res-htb-b6",
      "res-tyw-lt",
    ]);
    expect(canonicalCampusMapOfficialFacilityFloorLabel("G/F")).toBe("G");
    expect(canonicalCampusMapOfficialFacilityFloorLabel("UG/F")).toBe("UG");
    expect(
      canonicalCampusMapOfficialFacilityFloorLabel("4/F & 5/F"),
    ).toBeNull();
  });

  it("keeps official English OSA names and adds searchable Chinese names", () => {
    expect(
      manifest.entries.find((entry) => entry.key === "osa-psc-g05-piano-room")
        ?.fact?.name,
    ).toContain("琴室");
    expect(
      manifest.entries.find((entry) => entry.key === "osa-psc-309-fitness-room")
        ?.fact?.name,
    ).toContain("健身室");
    const conference = manifest.entries.find(
      (entry) => entry.key === "osa-bfc-305-conference-room",
    );
    expect(conference?.extracted.name).toBe("BFC 305 Conference Room");
    expect(conference?.fact?.name).toBe("BFC 305 Conference Room（会议室）");
  });

  it("uses checked migration IDs for every published Floor", async () => {
    const sql = await readFile(
      new URL(
        "../../src/db/migrations/0131_campus_map_official_facility_floors.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const floorIds = new Set(
      manifest.entries.flatMap((entry) =>
        entry.decision.status === "publish" && entry.decision.floorId
          ? [entry.decision.floorId]
          : [],
      ),
    );
    expect(floorIds.size).toBe(64);
    for (const floorId of floorIds) {
      expect(sql).toContain(`'${floorId}'::uuid`);
    }
    for (const [buildingId, label] of [
      ["53db00f9-33b3-5155-9cce-518fcf3090dd", "4"],
      ["53db00f9-33b3-5155-9cce-518fcf3090dd", "5"],
      ["c2ddb931-ae2e-5804-a949-9d9a4432b139", "9"],
    ]) {
      expect(sql).toContain(
        `'${campusMapOfficialFacilityFloorId(buildingId!, label!)}'::uuid`,
      );
    }
  });
});

describe("official facility source builder", () => {
  it("preserves previously published pool coordinate provenance across fetch dates", () => {
    const built = buildCampusMapOfficialFacilityManifest({
      sources: fullSourceFixtures(),
      accessedOn: "2026-09-10",
      manifestVersion: "test.3",
    });
    const previous = getCampusMapRepresentativeFacilityManifest()
      .entries.find((entry) => entry.key === "osa-university-swimming-pool")!
      .change.sources.find((source) => source.sourceCoordinate !== null)!;
    for (const candidate of [built, manifest]) {
      expect(
        candidate.entries
          .find((entry) => entry.key === "osa-university-swimming-pool")!
          .sources.find((source) => source.ref === previous.ref),
      ).toEqual(previous);
    }
  });

  it("keeps reservation windows out of regular opening hours", () => {
    const built = buildCampusMapOfficialFacilityManifest({
      sources: fullSourceFixtures(),
      accessedOn: "2026-09-07",
      manifestVersion: "test.1",
    });

    expect(built.entries).toHaveLength(289);
    expect(validateCampusMapOfficialFacilityManifest(built)).toEqual({
      status: "valid",
      errors: [],
    });
    expect(
      built.entries.find((entry) => entry.key === "osa-bfc-305-conference-room")
        ?.fact?.regularHours,
    ).toBeNull();
    expect(
      built.entries.find(
        (entry) => entry.key === "osa-jfc-103a-integrated-activity-room",
      )?.fact?.regularHours,
    ).toBeNull();
    expect(
      built.entries.find((entry) => entry.key === "osa-jfc-215-space")?.fact
        ?.regularHours?.intervals,
    ).toEqual([
      {
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        opensAt: "12:00",
        closesAt: "20:00",
      },
    ]);
    expect(
      built.entries.find(
        (entry) => entry.key === "osa-university-swimming-pool",
      )?.fact?.visitNote,
    ).toBe("学生入场 HK$5，只收八达通；持有效 CU Link 无需另办泳证。");
  });

  it("turns parseable website changes into a reviewable manifest diff", () => {
    const changed = buildCampusMapOfficialFacilityManifest({
      sources: fullSourceFixtures({
        jfc215Hours: "1 pm – 9 pm (Mon – Sun)",
        outpatientFridayClose: "6:00p.m.",
        outpatientPhone: "3943 6000",
        dentalPhone: "3943 6001",
        poolSundayClose: "18:30",
      }),
      accessedOn: "2026-09-08",
      manifestVersion: "test.2",
    });

    expect(
      changed.entries.find((entry) => entry.key === "osa-jfc-215-space")?.fact
        ?.regularHours?.intervals,
    ).toEqual([
      {
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        opensAt: "13:00",
        closesAt: "21:00",
      },
    ]);
    const outpatient = changed.entries.find(
      (entry) => entry.key === "umso-outpatient",
    );
    expect(outpatient?.fact?.regularHours?.intervals.at(-1)?.closesAt).toBe(
      "18:00",
    );
    expect(outpatient?.fact?.officialActions).toContainEqual({
      label: "电话预约",
      url: "tel:+85239436000",
    });
    expect(
      changed.entries.find((entry) => entry.key === "umso-dental")?.fact
        ?.officialActions,
    ).toContainEqual({ label: "电话预约", url: "tel:+85239436001" });
    expect(
      changed.entries
        .find((entry) => entry.key === "osa-university-swimming-pool")
        ?.fact?.regularHours?.intervals.at(-1)?.closesAt,
    ).toBe("18:30");
  });
});

describe("RES parser sentinels", () => {
  it("reads three inventory tables, the code table, and normalizes identity", () => {
    const classroomHeader =
      "<tr><th>Location</th><th>Floor</th><th>Room</th><th>Seating Capacity</th><th>Seat Type</th></tr>";
    const html = `<main>
      <table>${classroomHeader}<tr><td><a href="https://example.edu/building">Chen Kou Bun Building</a></td><td>7/F</td><td><a href="http://www.avsu.cuhk.edu.hk/room/706b">CKB706B (Interactive)</a></td><td>48</td><td>Movable chair</td></tr></table>
      <table>${classroomHeader}</table>
      <table>${classroomHeader}</table>
      <table>${resLocationRows()}</table>
    </main>`;

    const inventory = parseResClassroomInventory(html, 1);
    expect(inventory.rows).toEqual([
      expect.objectContaining({
        rawRoomCode: "CKB706B (Interactive)",
        roomCode: "CKB 706B",
        locationGroup: "CKB",
        sourceFloor: "7/F",
        capacity: 48,
        seatType: "Movable chair",
        officialUrl: "http://www.avsu.cuhk.edu.hk/room/706b",
      }),
    ]);
    expect(inventory.locationLabels.size).toBe(30);
  });

  it("stops when the reviewed RES count drifts", () => {
    const classroomHeader =
      "<tr><th>Location</th><th>Floor</th><th>Room</th><th>Seating Capacity</th><th>Seat Type</th></tr>";
    expect(() =>
      parseResClassroomInventory(
        `<table>${classroomHeader}</table><table>${classroomHeader}</table><table>${classroomHeader}</table><table>${resLocationRows()}</table>`,
        257,
      ),
    ).toThrow("RES classroom count drift: expected 257, received 0");
  });
});
