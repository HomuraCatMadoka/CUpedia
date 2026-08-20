import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { classifyChanges, parseNameStatus } from "../scripts/ci-classifier.mjs";

const changes = (...paths: string[]) =>
  paths.map((path) => ({ status: "M", paths: [path] }));

describe("CI change classifier (#670)", () => {
  it.each([
    [["docs/ci-topology.md"], "docs"],
    [["README.md", "docs/adr/0001-public-read-cuhk-gated-write.md"], "docs"],
    [["src/components/canteen/canteen-card.tsx"], "ordinary"],
    [["src/app/(main)/page.tsx"], "full"],
    [["src/app/(main)/campus-bus/page.tsx"], "full"],
    [["src/db/schema.ts"], "full"],
    [["src/db/migrations/0010_example.sql"], "full"],
    [["src/lib/auth.ts"], "full"],
    [["src/lib/wiki-actions.ts"], "full"],
    [["src/components/ui/button.tsx"], "full"],
    [["src/app/(main)/layout.tsx"], "full"],
    [["pnpm-lock.yaml"], "full"],
    [["next.config.ts"], "full"],
    [[".github/workflows/ci.yml"], "full"],
    [["e2e/provision.ts"], "full"],
    [["e2e/fixtures/auth.ts"], "full"],
    [["scripts/run-e2e-shards.ts"], "full"],
    [["unknown-top-level/new.txt"], "full"],
  ])("classifies %j as %s", (paths, tier) => {
    expect(classifyChanges(changes(...paths)).tier).toBe(tier);
  });

  it("does not treat docs plus code as docs-only", () => {
    expect(
      classifyChanges(
        changes(
          "docs/ci-topology.md",
          "src/components/canteen/canteen-card.tsx",
        ),
      ).tier,
    ).toBe("full");
  });

  it.each([
    "docs/campus-transport/data/cold-start/route-1a.staging.json",
    "docs/operations/artifacts/aigens-102830-identity-transition-v5.json",
    "docs/contracts/canteen-menu-identity-preflight-report-v2.schema.json",
  ])("does not treat runtime or persistence data as docs-only: %s", (path) => {
    expect(classifyChanges(changes(path)).tier).toBe("full");
  });

  it("keeps every direct database caller on the full PostgreSQL plan", () => {
    const databaseCallers = execFileSync(
      "git",
      ["grep", "-l", 'from \"@/db\"', "--", "src"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");

    for (const path of databaseCallers) {
      expect(classifyChanges(changes(path)), path).toMatchObject({
        tier: "full",
        postgres: true,
      });
    }
  });

  it.each([
    "src/components/canteen/canteen.css",
    "src/components/home/danmaku.css",
    "src/components/campus-transport/campus-route-map.module.css",
  ])("keeps blocking typecheck for ordinary application styles: %s", (path) => {
    expect(classifyChanges(changes(path))).toMatchObject({
      tier: "ordinary",
      typecheck: true,
    });
  });

  it("assigns the homepage announcement panel to one ordinary domain", () => {
    expect(
      classifyChanges(
        changes("src/components/homepage/announcement-panel.tsx"),
      ),
    ).toMatchObject({ tier: "ordinary", domain: "announcements" });
  });

  it("fails closed for mixed ordinary domains", () => {
    expect(
      classifyChanges(
        changes(
          "src/components/canteen/canteen-card.tsx",
          "src/components/professors/professor-portrait.tsx",
        ),
      ).tier,
    ).toBe("full");
  });

  it.each(["R100", "D", "C100", "T", "U", "X", "B", "Z", "MALFORMED"])(
    "fails closed for %s records",
    (status) => {
      expect(
        classifyChanges([
          {
            status,
            paths:
              status.startsWith("R") || status.startsWith("C")
                ? ["docs/old.md", "docs/new.md"]
                : ["docs/file.md"],
          },
        ]).tier,
      ).toBe("full");
    },
  );

  it("includes both sides of a rename while parsing git output", () => {
    expect(
      parseNameStatus(Buffer.from("R100\0docs/old.md\0docs/new.md\0")),
    ).toEqual([{ status: "R100", paths: ["docs/old.md", "docs/new.md"] }]);
  });

  it("maps capabilities independently from full-run time shards", () => {
    const plan = classifyChanges(
      changes("src/components/canteen/canteen-card.tsx"),
    );
    expect(plan).toMatchObject({
      tier: "ordinary",
      domain: "canteen",
      build: true,
      chromium: true,
      postgres: false,
      minio: false,
      webkit: false,
    });
    expect(plan.e2eMatrix.include).toEqual([
      expect.objectContaining({
        project: "chromium",
        ci_groups: "0",
        specs: "e2e/canteen-*.spec.ts",
      }),
    ]);
  });

  it("keeps main on the bounded full plan", () => {
    const plan = classifyChanges(changes("docs/readme.md"), {
      forceFull: true,
    });
    expect(plan).toMatchObject({
      tier: "full",
      postgres: true,
      build: true,
      chromium: true,
      minio: true,
      webkit: true,
    });
    expect(plan.e2eMatrix.include).toHaveLength(2);
  });

  it.each([null, [], [{ status: "M" }]])(
    "fails closed for malformed input %#",
    (input) => {
      expect(classifyChanges(input).tier).toBe("full");
    },
  );
});
