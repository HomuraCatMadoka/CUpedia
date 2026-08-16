import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT as contract } from "@/lib/canteen-menu-identity-preflight-contract";
import reportSchema from "../../docs/contracts/canteen-menu-identity-preflight-report-v2.schema.json";
import v1FixtureMatrix from "../db/fixtures/canteen-menu-identity-preflight-v1.json";
import v2FixtureMatrix from "../db/fixtures/canteen-menu-identity-preflight-v2.json";
import v3FixtureMatrix from "../db/fixtures/canteen-menu-identity-preflight-v3.json";

const execFileAsync = promisify(execFile);
const validateReport = addFormats(new Ajv2020({ allErrors: true })).compile(
  reportSchema,
);

describe("canteen menu identity preflight contract v3 (#679)", () => {
  it("keeps the versioned schema and mandatory parity matrices aligned", () => {
    expect(reportSchema.properties.schemaVersion.const).toBe(
      contract.reportSchemaVersion,
    );
    expect(reportSchema.properties.contractVersion.enum).toContain(
      contract.contractVersion,
    );
    expect(reportSchema.properties.targetIssue.const).toBe(
      contract.targetIssue,
    );
    expect(reportSchema.properties.checks.items.properties.code.enum).toEqual(
      contract.checkCodes,
    );
    expect(reportSchema.properties.resultCode.enum).toEqual(
      Object.values(contract.resultCodes),
    );
    expect(
      reportSchema.properties.checks.items.properties.samples.items.properties
        .reason.enum,
    ).toEqual(contract.diagnosticReasonCodes);
    expect(v1FixtureMatrix).toMatchObject({
      contractVersion: "canteen-menu-identity-preconditions/v1",
      targetIssue: 643,
      mandatoryParityInput: true,
    });
    expect(v1FixtureMatrix.fixtureSchema).toBe(
      "canteen-menu-identity-history-0081.sql",
    );
    expect(v2FixtureMatrix.extends).toBe(
      "canteen-menu-identity-preflight-v1.json",
    );
    expect(v2FixtureMatrix).toMatchObject({
      contractVersion: "canteen-menu-identity-preconditions/v2",
      targetIssue: 643,
      mandatoryParityInput: true,
      fixtureSchema: "canteen-menu-identity-history-0081.sql",
    });
    expect(v2FixtureMatrix.parityCases).toEqual([
      expect.objectContaining({
        name: "authoritative-only managed identity",
        expected: { resultCode: "PREFLIGHT_SAFE", failedChecks: {} },
      }),
    ]);
    expect(v3FixtureMatrix).toMatchObject({
      contractVersion: contract.contractVersion,
      targetIssue: contract.targetIssue,
      mandatoryParityInput: true,
      fixtureSchema: "canteen-menu-identity-history-0081.sql",
      extends: "canteen-menu-identity-preflight-v2.json",
      supersededParityCases: ["supported historical identity"],
    });
    expect(v3FixtureMatrix.migrationRequiredHistoricalIdentityNames).toEqual(
      v1FixtureMatrix.supportedHistoricalIdentities
        .filter((identity) => identity.provider === "aigens")
        .map((identity) => identity.name),
    );
    expect(v3FixtureMatrix.parityCases).toEqual([
      expect.objectContaining({
        name: "authoritative-only Aigens period alias requires audited transition",
        expected: expect.objectContaining({
          resultCode: "PREFLIGHT_UNSAFE",
          failedChecks: expect.objectContaining({
            ROLLOUT_SHADOW_MISMATCH: expect.any(Object),
          }),
        }),
      }),
      expect.objectContaining({
        name: "Aigens period-scoped identity requires audited transition",
        expected: expect.objectContaining({
          resultCode: "PREFLIGHT_UNSAFE",
          failedChecks: expect.objectContaining({
            ROLLOUT_SHADOW_MISMATCH: expect.any(Object),
          }),
        }),
      }),
    ]);
    expect(
      new Set(
        v1FixtureMatrix.parityCases.flatMap((fixture) =>
          Object.keys(fixture.expected.failedChecks),
        ),
      ),
    ).toEqual(new Set(contract.checkCodes));
  });

  it("returns a sanitized configuration error without credentials", async () => {
    const script = path.resolve("scripts/preflight-canteen-menu-identity.ts");
    const credential = "must-not-appear-in-output";

    const failure = await captureFailure(
      execFileAsync(
        process.execPath,
        ["--import", "tsx", script, "--format=json"],
        {
          env: {
            ...process.env,
            DATABASE_URL: `postgresql://reader:${credential}@localhost/db`,
            PREFLIGHT_APPLICATION_COMMIT: "",
          },
        },
      ),
    );

    expect(failure).toMatchObject({
      code: 3,
      stdout: expect.not.stringContaining(credential),
    });
    expect(
      validateReport(JSON.parse(failure.stdout)),
      JSON.stringify(validateReport.errors),
    ).toBe(true);
  });

  it("returns a sanitized database error without exception or credentials", async () => {
    const script = path.resolve("scripts/preflight-canteen-menu-identity.ts");
    const credential = "must-not-appear-in-database-error";

    const failure = await captureFailure(
      execFileAsync(
        process.execPath,
        ["--import", "tsx", script, "--format=json"],
        {
          env: {
            ...process.env,
            DATABASE_URL: `postgresql://reader:${credential}@127.0.0.1:1/db`,
            PREFLIGHT_APPLICATION_COMMIT: "0123456789abcdef",
          },
        },
      ),
    );

    expect(failure).toMatchObject({
      code: 4,
      stdout: expect.not.stringContaining(credential),
      stderr: "",
    });
    expect(
      validateReport(JSON.parse(failure.stdout)),
      JSON.stringify(validateReport.errors),
    ).toBe(true);
  });
});

async function captureFailure(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("expected command to fail");
  } catch (error) {
    return error as Error & { code: number; stdout: string; stderr: string };
  }
}
