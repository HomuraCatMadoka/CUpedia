import { createHash } from "node:crypto";
import type { ClientBase } from "pg";
import {
  normalizePublishedProviderIdentity,
  type MenuProvider,
} from "./canteen-provider-menu-identity";
import {
  CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT as CONTRACT,
  type CanteenMenuIdentityPreflightCheckCode,
  type CanteenMenuIdentityPreflightReasonCode,
} from "./canteen-menu-identity-preflight-contract";

type IdentityRow = {
  id: string;
  canteenId: string;
  menuSourceId: string | null;
  externalProductId: string | null;
  externalSource: string | null;
  externalKey: string | null;
  sourceId: string | null;
  sourceCanteenId: string | null;
  provider: string | null;
  externalOwnerId: string | null;
  externalStoreId: string | null;
  voteCount: number;
  commentCount: number;
};

type DiagnosticRow = {
  row: IdentityRow;
  reason: CanteenMenuIdentityPreflightReasonCode;
};

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

const PROVIDERS = new Set<MenuProvider>(["aigens", "ichef", "pinme", "qmai"]);

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
    const checks = evaluateChecks(rows);
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
      source.id::text as "sourceId",
      source.canteen_id::text as "sourceCanteenId",
      source.provider as "provider",
      source.external_owner_id as "externalOwnerId",
      source.external_store_id as "externalStoreId",
      (select count(*)::integer from ${schema}.canteen_dish_votes vote
        where vote.menu_item_id = item.id) as "voteCount",
      (select count(*)::integer from ${schema}.canteen_dish_comments comment
        where comment.menu_item_id = item.id) as "commentCount"
    from ${schema}.canteen_menu_items item
    left join ${schema}.canteen_menu_sources source
      on source.id = item.menu_source_id
    order by item.id
  `);
  return result.rows;
}

function evaluateChecks(
  rows: IdentityRow[],
): CanteenMenuIdentityPreflightCheck[] {
  const findings = new Map<
    CanteenMenuIdentityPreflightCheckCode,
    DiagnosticRow[]
  >(CONTRACT.checkCodes.map((code) => [code, []]));

  const actualGroups = new Map<string, IdentityRow[]>();
  const projectedGroups = new Map<string, IdentityRow[]>();

  for (const row of rows) {
    if (
      row.menuSourceId !== null &&
      (row.sourceId === null || row.sourceCanteenId !== row.canteenId)
    ) {
      add(findings, "SOURCE_CANTEEN_OWNERSHIP_MISMATCH", row, "source-owner");
    }
    if ((row.menuSourceId === null) !== (row.externalProductId === null)) {
      add(
        findings,
        "AUTHORITATIVE_IDENTITY_NULL_ASYMMETRY",
        row,
        "authoritative-null-asymmetry",
      );
    }
    if (row.menuSourceId !== null && row.externalProductId !== null) {
      group(
        actualGroups,
        `${row.menuSourceId}\u0000${row.externalProductId}`,
        row,
      );
    }

    const shadow = projectShadow(row);
    if (shadow.unsupported && shadow.reason !== null) {
      add(findings, "UNSUPPORTED_LEGACY_IDENTITY", row, shadow.reason);
    }
    if (!shadow.matchesAuthoritative) {
      add(
        findings,
        "ROLLOUT_SHADOW_MISMATCH",
        row,
        "shadow-authoritative-disagreement",
      );
    }
    if (shadow.projectedIdentity !== null) {
      group(projectedGroups, shadow.projectedIdentity, row);
    }
  }

  for (const duplicate of duplicateRows(actualGroups)) {
    add(
      findings,
      "DUPLICATE_AUTHORITATIVE_IDENTITY",
      duplicate,
      "duplicate-authoritative-identity",
    );
    add(
      findings,
      "MERGE_OR_UUID_REPLACEMENT_REQUIRED",
      duplicate,
      "multiple-uuids-one-authoritative-identity",
    );
  }
  for (const collision of duplicateRows(projectedGroups)) {
    add(
      findings,
      "MERGE_OR_UUID_REPLACEMENT_REQUIRED",
      collision,
      "multiple-uuids-one-projected-identity",
    );
  }

  return CONTRACT.checkCodes.map((code) =>
    makeCheck(code, findings.get(code)!),
  );
}

function projectShadow(row: IdentityRow): {
  unsupported: boolean;
  reason: CanteenMenuIdentityPreflightReasonCode | null;
  matchesAuthoritative: boolean;
  projectedIdentity: string | null;
} {
  const authoritativeManual =
    row.menuSourceId === null && row.externalProductId === null;
  const shadowManual = row.externalSource === null && row.externalKey === null;
  if (shadowManual) {
    return {
      unsupported: false,
      reason: null,
      matchesAuthoritative: authoritativeManual,
      projectedIdentity: null,
    };
  }
  if (row.externalSource === null || row.externalKey === null) {
    return {
      unsupported: true,
      reason: "shadow-null-asymmetry",
      matchesAuthoritative: false,
      projectedIdentity: null,
    };
  }
  const provider = asProvider(row.provider);
  if (
    provider === null ||
    row.sourceId === null ||
    row.externalStoreId === null ||
    !sourceNamespaceMatches(row, provider)
  ) {
    return {
      unsupported: true,
      reason: "unsupported-source-namespace",
      matchesAuthoritative: false,
      projectedIdentity: null,
    };
  }
  try {
    const productId = normalizePublishedProviderIdentity(
      provider,
      row.externalKey,
    );
    return {
      unsupported: false,
      reason: null,
      matchesAuthoritative:
        row.menuSourceId === row.sourceId &&
        row.externalProductId === productId,
      projectedIdentity: `${row.sourceId}\u0000${productId}`,
    };
  } catch {
    return {
      unsupported: true,
      reason: "unsupported-product-key",
      matchesAuthoritative: false,
      projectedIdentity: null,
    };
  }
}

function sourceNamespaceMatches(row: IdentityRow, provider: MenuProvider) {
  if (provider === "qmai") {
    return (
      row.externalOwnerId !== null &&
      row.externalSource ===
        `qmai:${row.externalOwnerId}:${row.externalStoreId}`
    );
  }
  if (
    provider === "aigens" &&
    row.externalSource === `order-place:${row.externalStoreId}`
  ) {
    return true;
  }
  return row.externalSource === `${provider}:${row.externalStoreId}`;
}

function asProvider(value: string | null): MenuProvider | null {
  return value !== null && PROVIDERS.has(value as MenuProvider)
    ? (value as MenuProvider)
    : null;
}

function group(map: Map<string, IdentityRow[]>, key: string, row: IdentityRow) {
  map.set(key, [...(map.get(key) ?? []), row]);
}

function duplicateRows(groups: Map<string, IdentityRow[]>) {
  return [...groups.values()]
    .filter((groupRows) => groupRows.length > 1)
    .flat();
}

function add(
  findings: Map<CanteenMenuIdentityPreflightCheckCode, DiagnosticRow[]>,
  code: CanteenMenuIdentityPreflightCheckCode,
  row: IdentityRow,
  reason: CanteenMenuIdentityPreflightReasonCode,
) {
  const rows = findings.get(code)!;
  if (!rows.some((entry) => entry.row.id === row.id)) {
    rows.push({ row, reason });
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
    samples: findings.slice(0, CONTRACT.sampleLimit).map(({ row, reason }) => ({
      rowFingerprint: createHash("sha256")
        .update(row.id)
        .digest("hex")
        .slice(0, 12),
      ...(asProvider(row.provider) === null
        ? {}
        : { provider: asProvider(row.provider)! }),
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
