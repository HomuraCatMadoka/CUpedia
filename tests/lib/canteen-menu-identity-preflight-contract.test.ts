import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT as contract } from "@/lib/canteen-menu-identity-preflight-contract";
import reportSchema from "../../docs/contracts/canteen-menu-identity-preflight-report-v1.schema.json";
import fixtureMatrix from "../db/fixtures/canteen-menu-identity-preflight-v1.json";

const execFileAsync = promisify(execFile);
const validateReport = addFormats(new Ajv2020({ allErrors: true })).compile(
  reportSchema,
);

describe("canteen menu identity preflight contract (#639)", () => {
  it("keeps the versioned schema and mandatory #643 parity matrix aligned", () => {
    expect(reportSchema.properties.schemaVersion.const).toBe(
      contract.reportSchemaVersion,
    );
    expect(reportSchema.properties.contractVersion.const).toBe(
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
    expect(fixtureMatrix).toMatchObject({
      contractVersion: contract.contractVersion,
      targetIssue: contract.targetIssue,
      mandatoryParityInput: true,
    });
    expect(fixtureMatrix.fixtureSchema).toBe(
      "canteen-menu-identity-history-0081.sql",
    );
    expect(
      new Set(
        fixtureMatrix.parityCases.flatMap((fixture) =>
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
