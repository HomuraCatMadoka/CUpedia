import { createHash } from "node:crypto";
import type { ClientBase } from "pg";
import type { MenuProvider } from "./canteen-provider-menu-identity";
import {
  canonicalMenuIdentityKey,
  createPersistedMenuIdentityInterpreter,
  type PersistedMenuIdentityRow,
  type PersistedMenuIdentitySource,
} from "./canteen-menu-persisted-identity";
import {
  CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT as CONTRACT,
  type CanteenMenuIdentityPreflightCheckCode,
  type CanteenMenuIdentityPreflightReasonCode,
} from "./canteen-menu-identity-preflight-contract";

type IdentityRow = PersistedMenuIdentityRow & {
  id: string;
  voteCount: number;
  commentCount: number;
};

type DiagnosticRow = {
  row: IdentityRow;
  provider: MenuProvider | null;
  reason: CanteenMenuIdentityPreflightReasonCode;
};

type EvaluatedRow = Omit<DiagnosticRow, "reason">;

export type CanteenMenuIdentityPreflightCheck = {
  code: CanteenMenuIdentityPreflightCheckCode;
  status: "pass" | "fail";
  count: number;
  voteCount: number;
  commentCount: number;
  samples: Array<{
    rowFingerprint: string;
    provider?: MenuProvider;
    reason: CanteenMenuIdentityPreflightReasonCode;
  }>;
};

export type CanteenMenuIdentityPreflightReport = {
  schemaVersion: typeof CONTRACT.reportSchemaVersion;
  contractVersion: typeof CONTRACT.contractVersion;
  targetIssue: typeof CONTRACT.targetIssue;
  applicationCommit: string;
  generatedAt: string;
  result: "pass" | "fail";
  resultCode:
    | typeof CONTRACT.resultCodes.safe
    | typeof CONTRACT.resultCodes.unsafe;
  transaction: typeof CONTRACT.transaction;
  sampleLimit: typeof CONTRACT.sampleLimit;
  totals: {
    menuItems: number;
    managedItems: number;
    manualItems: number;
  };
  checks: CanteenMenuIdentityPreflightCheck[];
};

export type CanteenMenuIdentityPreflightOptions = {
  applicationCommit: string;
  generatedAt?: Date;
  /** Test-only fixture schema. The production CLI always audits public. */
  schema?: string;
};

export async function runCanteenMenuIdentityPreflight(
  client: ClientBase,
  options: CanteenMenuIdentityPreflightOptions,
): Promise<CanteenMenuIdentityPreflightReport> {
  const schemaName = options.schema ?? "public";
  const schema = quoteSchema(schemaName);
  const applicationCommit = options.applicationCommit.trim();
  if (!isCanteenMenuIdentityApplicationCommit(applicationCommit)) {
    throw new Error("PREFLIGHT_APPLICATION_COMMIT_REQUIRED");
  }

  await client.query(
    "begin transaction isolation level repeatable read read only",
  );
  try {
    await assertCompleteRlsVisibility(client, schemaName);
    const rows = await readIdentityRows(client, schema);
    const sources = await readIdentitySources(client, schema);
    const checks = evaluateChecks(rows, sources);
    const unsafe = checks.some((check) => check.status === "fail");
    await client.query("commit");
    return {
      schemaVersion: CONTRACT.reportSchemaVersion,
      contractVersion: CONTRACT.contractVersion,
      targetIssue: CONTRACT.targetIssue,
      applicationCommit,
      generatedAt: (options.generatedAt ?? new Date()).toISOString(),
      result: unsafe ? "fail" : "pass",
      resultCode: unsafe
        ? CONTRACT.resultCodes.unsafe
        : CONTRACT.resultCodes.safe,
      transaction: CONTRACT.transaction,
      sampleLimit: CONTRACT.sampleLimit,
      totals: {
        menuItems: rows.length,
        managedItems: rows.filter(
          (row) => row.menuSourceId !== null || row.externalProductId !== null,
        ).length,
        manualItems: rows.filter(
          (row) => row.menuSourceId === null && row.externalProductId === null,
        ).length,
      },
      checks,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export function isCanteenMenuIdentityApplicationCommit(value: string) {
  return /^[0-9a-f]{7,64}$/.test(value);
}

async function assertCompleteRlsVisibility(
  client: ClientBase,
  schemaName: string,
) {
  const role = await client.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    `select rolsuper, rolbypassrls
     from pg_roles
     where rolname = current_user`,
  );
  const capabilities = role.rows[0];
  if (capabilities?.rolsuper || capabilities?.rolbypassrls) return;

  const relations = await client.query<{
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    ownedByCurrentRole: boolean;
  }>(
    `select c.relrowsecurity as "relrowsecurity",
       c.relforcerowsecurity as "relforcerowsecurity",
       pg_get_userbyid(c.relowner) = current_user as "ownedByCurrentRole"
     from pg_class c
     join pg_namespace namespace on namespace.oid = c.relnamespace
     where namespace.nspname = $1
       and c.relname = any($2::text[])`,
    [
      schemaName,
      [
        "canteen_menu_items",
        "canteen_menu_sources",
        "canteen_dish_votes",
        "canteen_dish_comments",
      ],
    ],
  );
  if (
    relations.rows.some(
      (relation) =>
        relation.relrowsecurity &&
        (relation.relforcerowsecurity || !relation.ownedByCurrentRole),
    )
  ) {
    throw new Error("PREFLIGHT_RLS_VISIBILITY_REQUIRED");
  }
}

export function canteenMenuIdentityPreflightExitCode(
  report: CanteenMenuIdentityPreflightReport,
) {
  return report.result === "pass"
    ? CONTRACT.exitCodes.safe
    : CONTRACT.exitCodes.unsafe;
}

export function formatCanteenMenuIdentityPreflightHuman(
  report: CanteenMenuIdentityPreflightReport,
) {
  const failed = report.checks.filter((check) => check.status === "fail");
  const lines = [
    `Canteen menu identity preflight: ${report.resultCode}`,
    `Contract: ${report.contractVersion}`,
    `Target issue: #${report.targetIssue}`,
    `Application commit: ${report.applicationCommit}`,
    `Generated: ${report.generatedAt}`,
    `Rows: ${report.totals.menuItems} total, ${report.totals.managedItems} managed, ${report.totals.manualItems} manual`,
  ];
  if (failed.length === 0) {
    lines.push("Checks: all passed");
  } else {
    lines.push(
      ...failed.map(
        (check) =>
          `${check.code}: ${check.count} row(s), ${check.voteCount} vote(s), ${check.commentCount} comment(s)`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

async function readIdentityRows(client: ClientBase, schema: string) {
  const result = await client.query<IdentityRow>(`
    select
      item.id::text as "id",
      item.canteen_id::text as "canteenId",
      item.menu_source_id::text as "menuSourceId",
      item.external_product_id as "externalProductId",
      item.external_source as "externalSource",
      item.external_key as "externalKey",
      (select count(*)::integer from ${schema}.canteen_dish_votes vote
        where vote.menu_item_id = item.id) as "voteCount",
      (select count(*)::integer from ${schema}.canteen_dish_comments comment
        where comment.menu_item_id = item.id) as "commentCount"
    from ${schema}.canteen_menu_items item
    order by item.id
  `);
  return result.rows;
}

async function readIdentitySources(client: ClientBase, schema: string) {
  const result = await client.query<PersistedMenuIdentitySource>(`
    select
      source.id::text as "id",
      source.canteen_id::text as "canteenId",
      source.provider as "provider",
      source.external_owner_id as "externalOwnerId",
      source.external_store_id as "externalStoreId"
    from ${schema}.canteen_menu_sources source
    order by source.id
  `);
  return result.rows;
}

function evaluateChecks(
  rows: IdentityRow[],
  sources: PersistedMenuIdentitySource[],
): CanteenMenuIdentityPreflightCheck[] {
  const findings = new Map<
    CanteenMenuIdentityPreflightCheckCode,
    DiagnosticRow[]
  >(CONTRACT.checkCodes.map((code) => [code, []]));

  const actualGroups = new Map<string, EvaluatedRow[]>();
  const projectedGroups = new Map<string, EvaluatedRow[]>();
  const interpreter = createPersistedMenuIdentityInterpreter(sources);

  for (const row of rows) {
    const identity = interpreter.interpret(row);
    if (identity.sourceOwnershipMismatch) {
      add(
        findings,
        "SOURCE_CANTEEN_OWNERSHIP_MISMATCH",
        row,
        "source-owner",
        identity.diagnosticProvider,
      );
    }
    if (identity.authoritative.kind === "partial") {
      add(
        findings,
        "AUTHORITATIVE_IDENTITY_NULL_ASYMMETRY",
        row,
        "authoritative-null-asymmetry",
        identity.diagnosticProvider,
      );
    }
    if (identity.authoritative.kind === "managed") {
      group(
        actualGroups,
        canonicalMenuIdentityKey(identity.authoritative.identity),
        {
          row,
          provider: identity.diagnosticProvider,
        },
      );
    }

    if (identity.shadow.kind === "unsupported") {
      add(
        findings,
        "UNSUPPORTED_LEGACY_IDENTITY",
        row,
        identity.shadow.reason,
        identity.diagnosticProvider,
      );
    }
    if (!identity.identitiesAgree) {
      add(
        findings,
        "ROLLOUT_SHADOW_MISMATCH",
        row,
        "shadow-authoritative-disagreement",
        identity.diagnosticProvider,
      );
    }
    if (identity.shadow.kind === "resolved") {
      group(
        projectedGroups,
        canonicalMenuIdentityKey(identity.shadow.identity),
        {
          row,
          provider: identity.diagnosticProvider,
        },
      );
    }
  }

  for (const duplicate of duplicateRows(actualGroups)) {
    add(
      findings,
      "DUPLICATE_AUTHORITATIVE_IDENTITY",
      duplicate.row,
      "duplicate-authoritative-identity",
      duplicate.provider,
    );
    add(
      findings,
      "MERGE_OR_UUID_REPLACEMENT_REQUIRED",
      duplicate.row,
      "multiple-uuids-one-authoritative-identity",
      duplicate.provider,
    );
  }
  for (const collision of duplicateRows(projectedGroups)) {
    add(
      findings,
      "MERGE_OR_UUID_REPLACEMENT_REQUIRED",
      collision.row,
      "multiple-uuids-one-projected-identity",
      collision.provider,
    );
  }

  return CONTRACT.checkCodes.map((code) =>
    makeCheck(code, findings.get(code)!),
  );
}

function group<T>(map: Map<string, T[]>, key: string, row: T) {
  map.set(key, [...(map.get(key) ?? []), row]);
}

function duplicateRows<T>(groups: Map<string, T[]>) {
  return [...groups.values()]
    .filter((groupRows) => groupRows.length > 1)
    .flat();
}

function add(
  findings: Map<CanteenMenuIdentityPreflightCheckCode, DiagnosticRow[]>,
  code: CanteenMenuIdentityPreflightCheckCode,
  row: IdentityRow,
  reason: CanteenMenuIdentityPreflightReasonCode,
  provider: MenuProvider | null,
) {
  const rows = findings.get(code)!;
  if (!rows.some((entry) => entry.row.id === row.id)) {
    rows.push({ row, provider, reason });
  }
}

function makeCheck(
  code: CanteenMenuIdentityPreflightCheckCode,
  findings: DiagnosticRow[],
): CanteenMenuIdentityPreflightCheck {
  return {
    code,
    status: findings.length === 0 ? "pass" : "fail",
    count: findings.length,
    voteCount: findings.reduce(
      (sum, finding) => sum + finding.row.voteCount,
      0,
    ),
    commentCount: findings.reduce(
      (sum, finding) => sum + finding.row.commentCount,
      0,
    ),
    samples: findings
      .slice(0, CONTRACT.sampleLimit)
      .map(({ row, provider, reason }) => ({
        rowFingerprint: createHash("sha256")
          .update(row.id)
          .digest("hex")
          .slice(0, 12),
        ...(provider === null ? {} : { provider }),
        reason,
      })),
  };
}

function quoteSchema(schema: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error("INVALID_PREFLIGHT_SCHEMA");
  }
  return `"${schema}"`;
}
