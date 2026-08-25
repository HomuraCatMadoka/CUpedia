import type {
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishResult,
  CampusMapPublishSourceInput,
  CampusMapPublishValidationIssue,
  CampusMapPublishWarning,
} from "./publish-contract";
import { CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES } from "./publish-contract";

export const CAMPUS_MAP_EDIT_SNAPSHOT_VERSION = 1 as const;

type OutdoorPoint = Extract<
  CampusMapPublishFactInput["location"],
  { kind: "outdoor-point" }
>;

export interface CampusMapPlacement extends Omit<OutdoorPoint, "kind"> {
  method: "pointer" | "keyboard";
}

export interface CampusMapEditDraft {
  mode: "add" | "edit";
  placeId: string | null;
  baseRevisionId: string | null;
  idempotencyKey: string;
  fact: Omit<CampusMapPublishFactInput, "location"> & {
    location: CampusMapPublishFactInput["location"] | null;
  };
  sources: CampusMapPublishSourceInput[];
  baselineFact: CampusMapPublishFactInput | null;
  baselineSources: CampusMapPublishSourceInput[];
  placementMethod: CampusMapPlacement["method"] | null;
  warningAcknowledgements: CampusMapPublishCommand["warningAcknowledgements"];
}

export type CampusMapEditStatus =
  | "placing"
  | "editing"
  | "confirm-discard"
  | "publishing"
  | "warning"
  | "authentication-required"
  | "rate-limited"
  | "temporarily-unavailable"
  | "conflict"
  | "published";

export interface CampusMapEditReceipt {
  placeId: string;
  revisionId: string;
  changesetId: string;
}

export interface CampusMapEditConflict {
  currentRevisionId: string;
  currentFact: CampusMapPublishFactInput;
}

export interface CampusMapEditSession {
  status: CampusMapEditStatus;
  draft: CampusMapEditDraft;
  returnStatus?: Exclude<CampusMapEditStatus, "confirm-discard" | "published">;
  localError?: string;
  serverErrors?: CampusMapPublishValidationIssue[];
  warnings?: CampusMapPublishWarning[];
  retryAfter?: number;
  rateScope?: "actor" | "ip";
  conflict?: CampusMapEditConflict;
  receipt?: CampusMapEditReceipt;
}

export type CampusMapEditCommand =
  | { kind: "scene"; intent: "start-create" | "start-edit" | "cancel-task" }
  | { kind: "persist-snapshot" }
  | { kind: "clear-snapshot" }
  | { kind: "focus"; target: string }
  | { kind: "publish"; command: CampusMapPublishCommand }
  | {
      kind: "schedule-rate-retry";
      afterSeconds: number;
      idempotencyKey: string;
    }
  | { kind: "announce"; message: string };

export type CampusMapEditEvent =
  | { type: "START_ADD"; idempotencyKey: string }
  | {
      type: "START_EDIT";
      placeId: string;
      baseRevisionId: string;
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
      idempotencyKey: string;
    }
  | { type: "CONFIRM_POSITION"; position: CampusMapPlacement }
  | { type: "START_REPOSITION" }
  | { type: "REPORT_LOCAL_ERROR"; field: string }
  | { type: "CHANGE_FACT"; fact: CampusMapPublishFactInput }
  | { type: "CHANGE_SOURCES"; sources: CampusMapPublishSourceInput[] }
  | { type: "REQUEST_CLOSE" }
  | { type: "CONTINUE_EDITING" }
  | { type: "DISCARD" }
  | { type: "REQUEST_PUBLISH" }
  | {
      type: "PUBLISH_RESULT";
      idempotencyKey: string;
      result: CampusMapPublishResult;
    }
  | { type: "ACKNOWLEDGE_WARNINGS"; idempotencyKey: string }
  | { type: "AUTH_RETURNED" }
  | { type: "RETRY_PUBLISH" }
  | { type: "RATE_LIMIT_ELAPSED"; idempotencyKey: string }
  | {
      type: "CONTINUE_FROM_CONFLICT";
      idempotencyKey: string;
      fact: CampusMapPublishFactInput;
    }
  | { type: "USE_CURRENT_FACT"; idempotencyKey: string };

export interface CampusMapEditTransition {
  accepted: boolean;
  session: CampusMapEditSession | null;
  commands: CampusMapEditCommand[];
}

const DEFAULT_FACT: CampusMapEditDraft["fact"] = {
  name: "",
  buildingId: null,
  floorId: null,
  pinType: "water",
  capabilities: [],
  gender: "unknown",
  wheelchairAccess: "unknown",
  audience: "unknown",
  credentialRequirement: "unknown",
  accessSchedule: { kind: "unknown" },
  reservationRequirement: "unknown",
  temporaryStatus: "unknown",
  location: null,
  observedAt: null,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createCampusMapEditDraft(input: {
  mode: "add" | "edit";
  idempotencyKey: string;
  fact?: CampusMapPublishFactInput;
  sources?: CampusMapPublishSourceInput[];
  placeId?: string;
  baseRevisionId?: string;
}): CampusMapEditDraft {
  const fact = input.fact ? clone(input.fact) : clone(DEFAULT_FACT);
  const sources = clone(input.sources ?? []);
  return {
    mode: input.mode,
    placeId: input.placeId ?? null,
    baseRevisionId: input.baseRevisionId ?? null,
    idempotencyKey: input.idempotencyKey,
    fact,
    sources,
    baselineFact:
      input.mode === "edit" && input.fact ? clone(input.fact) : null,
    baselineSources: input.mode === "edit" ? clone(sources) : [],
    placementMethod: null,
    warningAcknowledgements: [],
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isCampusMapEditDirty(
  session: CampusMapEditSession | null,
): boolean {
  if (!session || session.status === "published") return false;
  const { draft } = session;
  if (draft.mode === "add") {
    return (
      draft.fact.location !== null ||
      draft.fact.name.trim() !== "" ||
      draft.sources.length > 0
    );
  }
  return (
    stable(draft.fact) !== stable(draft.baselineFact) ||
    stable(draft.sources) !== stable(draft.baselineSources)
  );
}

function rejected(
  session: CampusMapEditSession | null,
): CampusMapEditTransition {
  return { accepted: false, session, commands: [] };
}

function persisted(session: CampusMapEditSession): CampusMapEditTransition {
  return { accepted: true, session, commands: [{ kind: "persist-snapshot" }] };
}

function editable(session: CampusMapEditSession): CampusMapEditSession {
  return {
    status: "editing",
    draft: {
      ...session.draft,
      warningAcknowledgements: [],
    },
  };
}

function firstLocalError(draft: CampusMapEditDraft): string | null {
  if (!draft.fact.name.trim()) return "name";
  if (!draft.fact.pinType) return "pinType";
  if (!draft.fact.location) return "location";
  if (
    draft.fact.accessSchedule.kind === "weekly" &&
    draft.fact.accessSchedule.intervals.some(
      (interval) =>
        interval.days.length === 0 ||
        !interval.opensAt ||
        !interval.closesAt ||
        interval.opensAt === interval.closesAt,
    )
  )
    return "accessSchedule";
  if (draft.sources.length === 0) return "sources";
  return null;
}

function publishTransition(
  session: CampusMapEditSession,
): CampusMapEditTransition {
  if (session.status === "published" || session.status === "publishing") {
    return rejected(session);
  }
  if (!isCampusMapEditDirty(session)) return rejected(session);
  const error = firstLocalError(session.draft);
  if (error) {
    const next = { ...editable(session), localError: error };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: error },
        { kind: "announce", message: "请先完成必填资料" },
      ],
    };
  }
  const next: CampusMapEditSession = {
    status: "publishing",
    draft: session.draft,
  };
  return {
    accepted: true,
    session: next,
    commands: [
      { kind: "persist-snapshot" },
      { kind: "publish", command: deriveCampusMapPublishCommand(next.draft) },
      { kind: "announce", message: "正在发布地点资料" },
    ],
  };
}

export function transitionCampusMapEdit(
  session: CampusMapEditSession | null,
  event: CampusMapEditEvent,
): CampusMapEditTransition {
  if (event.type === "START_ADD") {
    if (session) return rejected(session);
    const next: CampusMapEditSession = {
      status: "placing",
      draft: createCampusMapEditDraft({
        mode: "add",
        idempotencyKey: event.idempotencyKey,
      }),
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "scene", intent: "start-create" },
        { kind: "persist-snapshot" },
      ],
    };
  }

  if (event.type === "START_EDIT") {
    if (session) return rejected(session);
    const next: CampusMapEditSession = {
      status: "editing",
      draft: createCampusMapEditDraft({
        mode: "edit",
        placeId: event.placeId,
        baseRevisionId: event.baseRevisionId,
        fact: event.fact,
        sources: event.sources,
        idempotencyKey: event.idempotencyKey,
      }),
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "scene", intent: "start-edit" },
        { kind: "persist-snapshot" },
      ],
    };
  }

  if (!session) return rejected(session);
  if (session.status === "published") {
    if (event.type !== "REQUEST_CLOSE") return rejected(session);
    return {
      accepted: true,
      session: null,
      commands: [
        { kind: "clear-snapshot" },
        { kind: "scene", intent: "cancel-task" },
      ],
    };
  }
  if (session.status === "publishing" && event.type !== "PUBLISH_RESULT") {
    return rejected(session);
  }

  if (event.type === "CONFIRM_POSITION") {
    if (session.status !== "placing") return rejected(session);
    const { method, ...point } = event.position;
    const location: OutdoorPoint = { kind: "outdoor-point", ...point };
    const next: CampusMapEditSession = {
      status: "editing",
      draft: {
        ...session.draft,
        fact: {
          ...session.draft.fact,
          buildingId: null,
          floorId: null,
          location,
        },
        placementMethod: method,
        warningAcknowledgements: [],
      },
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: "name" },
        { kind: "announce", message: "位置已锁定，请填写地点资料" },
      ],
    };
  }

  if (event.type === "START_REPOSITION") {
    if (session.status === "placing" || session.status === "confirm-discard") {
      return rejected(session);
    }
    const next: CampusMapEditSession = {
      status: "placing",
      draft: {
        ...session.draft,
        warningAcknowledgements: [],
      },
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "announce", message: "移动地图或输入 WGS84 坐标以重新定位" },
      ],
    };
  }

  if (event.type === "REPORT_LOCAL_ERROR") {
    const next = { ...editable(session), localError: event.field };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: event.field },
        { kind: "announce", message: "请检查这个字段" },
      ],
    };
  }

  if (event.type === "CHANGE_FACT") {
    return persisted({
      ...editable(session),
      draft: { ...editable(session).draft, fact: clone(event.fact) },
    });
  }
  if (event.type === "CHANGE_SOURCES") {
    return persisted({
      ...editable(session),
      draft: { ...editable(session).draft, sources: clone(event.sources) },
    });
  }

  if (event.type === "REQUEST_CLOSE") {
    if (!isCampusMapEditDirty(session)) {
      return {
        accepted: true,
        session: null,
        commands: [
          { kind: "clear-snapshot" },
          { kind: "scene", intent: "cancel-task" },
        ],
      };
    }
    const next: CampusMapEditSession = {
      status: "confirm-discard",
      draft: session.draft,
      returnStatus:
        session.status === "confirm-discard"
          ? session.returnStatus
          : session.status,
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: "continue-editing" },
      ],
    };
  }
  if (event.type === "CONTINUE_EDITING") {
    if (session.status !== "confirm-discard") return rejected(session);
    const next = {
      status: session.returnStatus ?? "editing",
      draft: session.draft,
    } satisfies CampusMapEditSession;
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        {
          kind: "scene",
          intent: next.draft.mode === "add" ? "start-create" : "start-edit",
        },
      ],
    };
  }
  if (event.type === "DISCARD") {
    if (session.status !== "confirm-discard") return rejected(session);
    return {
      accepted: true,
      session: null,
      commands: [
        { kind: "clear-snapshot" },
        { kind: "scene", intent: "cancel-task" },
      ],
    };
  }

  if (event.type === "REQUEST_PUBLISH") return publishTransition(session);

  if (event.type === "PUBLISH_RESULT") {
    if (
      session.status !== "publishing" ||
      event.idempotencyKey !== session.draft.idempotencyKey
    ) {
      return rejected(session);
    }
    const result = event.result;
    if (result.status === "published") {
      const change = result.changes[0];
      if (!change) return rejected(session);
      const next: CampusMapEditSession = {
        status: "published",
        draft: session.draft,
        receipt: {
          placeId: change.placeId,
          revisionId: change.revisionId,
          changesetId: result.changesetId,
        },
      };
      return {
        accepted: true,
        session: next,
        commands: [
          { kind: "clear-snapshot" },
          { kind: "announce", message: "地点资料已发布" },
        ],
      };
    }
    if (result.status === "authentication-required") {
      return persisted({
        status: "authentication-required",
        draft: session.draft,
      });
    }
    if (result.status === "rate-limited") {
      const next: CampusMapEditSession = {
        status: "rate-limited",
        draft: session.draft,
        retryAfter: Math.max(0, result.retryAfter),
        rateScope: result.scope,
      };
      return {
        accepted: true,
        session: next,
        commands: [
          { kind: "persist-snapshot" },
          {
            kind: "schedule-rate-retry",
            afterSeconds: next.retryAfter ?? 0,
            idempotencyKey: session.draft.idempotencyKey,
          },
        ],
      };
    }
    if (result.status === "temporarily-unavailable") {
      return persisted({
        status: "temporarily-unavailable",
        draft: session.draft,
      });
    }
    if (result.status === "conflict") {
      const conflict = result.conflicts.find(
        (item) => item.currentRevisionId && item.currentSnapshot,
      );
      if (!conflict?.currentRevisionId || !conflict.currentSnapshot) {
        return persisted({ status: "conflict", draft: session.draft });
      }
      const currentFact = Object.fromEntries(
        Object.entries(conflict.currentSnapshot).filter(
          ([field]) => field !== "factSchemaVersion",
        ),
      ) as unknown as CampusMapPublishFactInput;
      return persisted({
        status: "conflict",
        draft: session.draft,
        conflict: {
          currentRevisionId: conflict.currentRevisionId,
          currentFact,
        },
      });
    }
    if (
      result.status === "validation-failed" &&
      result.errors.length === 0 &&
      result.warnings.length > 0
    ) {
      return persisted({
        status: "warning",
        draft: session.draft,
        warnings: result.warnings,
      });
    }
    const errors = result.status === "validation-failed" ? result.errors : [];
    const target = errors[0]?.anchor.field;
    const next: CampusMapEditSession = {
      status: "editing",
      draft: session.draft,
      serverErrors: errors,
      ...(target ? { localError: target } : {}),
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        ...(target ? ([{ kind: "focus", target }] as const) : []),
        { kind: "announce", message: "发布资料需要修改" },
      ],
    };
  }

  if (event.type === "ACKNOWLEDGE_WARNINGS") {
    if (session.status !== "warning" || !session.warnings?.length)
      return rejected(session);
    const draft: CampusMapEditDraft = {
      ...session.draft,
      idempotencyKey: event.idempotencyKey,
      warningAcknowledgements: session.warnings.map((warning) => ({
        changeIndex: warning.anchor.changeIndex ?? 0,
        code: warning.code,
        fingerprint: warning.fingerprint,
      })),
    };
    return publishTransition({ status: "editing", draft });
  }

  if (event.type === "AUTH_RETURNED") {
    if (session.status !== "authentication-required") return rejected(session);
    return persisted({ status: "editing", draft: session.draft });
  }

  if (event.type === "RETRY_PUBLISH") {
    if (
      session.status !== "temporarily-unavailable" &&
      session.status !== "rate-limited"
    ) {
      return rejected(session);
    }
    if (session.status === "rate-limited" && (session.retryAfter ?? 0) > 0) {
      return rejected(session);
    }
    return publishTransition({ status: "editing", draft: session.draft });
  }

  if (event.type === "RATE_LIMIT_ELAPSED") {
    if (
      session.status !== "rate-limited" ||
      event.idempotencyKey !== session.draft.idempotencyKey
    )
      return rejected(session);
    return persisted({ ...session, retryAfter: 0 });
  }

  if (event.type === "CONTINUE_FROM_CONFLICT") {
    if (session.status !== "conflict" || !session.conflict)
      return rejected(session);
    return persisted({
      status: "editing",
      draft: {
        ...session.draft,
        fact: clone(event.fact),
        baseRevisionId: session.conflict.currentRevisionId,
        baselineFact: clone(session.conflict.currentFact),
        idempotencyKey: event.idempotencyKey,
        warningAcknowledgements: [],
      },
    });
  }

  if (event.type === "USE_CURRENT_FACT") {
    if (session.status !== "conflict" || !session.conflict)
      return rejected(session);
    return persisted({
      status: "editing",
      draft: {
        ...session.draft,
        fact: clone(session.conflict.currentFact),
        baselineFact: clone(session.conflict.currentFact),
        baseRevisionId: session.conflict.currentRevisionId,
        idempotencyKey: event.idempotencyKey,
        warningAcknowledgements: [],
      },
    });
  }

  return rejected(session);
}

const FIELD_LABELS: Array<[keyof CampusMapPublishFactInput, string]> = [
  ["name", "名称"],
  ["pinType", "地点类型"],
  ["buildingId", "建筑"],
  ["floorId", "楼层"],
  ["capabilities", "服务能力"],
  ["gender", "性别属性"],
  ["wheelchairAccess", "无障碍通行"],
  ["audience", "开放对象"],
  ["credentialRequirement", "凭证要求"],
  ["accessSchedule", "开放时间"],
  ["reservationRequirement", "预约要求"],
  ["temporaryStatus", "临时状态"],
  ["location", "位置"],
  ["observedAt", "观察时间"],
];

const PIN_LABELS: Record<CampusMapPublishFactInput["pinType"], string> = {
  toilet: "洗手间",
  water: "饮水点",
  printer: "打印服务",
  "common-space": "公共空间",
  classroom: "课室",
};

const SOURCE_LABELS: Record<CampusMapPublishSourceInput["kind"], string> = {
  official: "官方资料",
  "field-observation": "现场观察",
  "open-data": "开放数据",
  "provider-candidate": "地图供应商候选",
  other: "其他资料",
};

export function deriveCampusMapPublishCommand(
  draft: CampusMapEditDraft,
): CampusMapPublishCommand {
  if (!draft.fact.location)
    throw new Error("Campus Map edit draft has no location");
  const fact = draft.fact as CampusMapPublishFactInput;
  const changedFields = FIELD_LABELS.filter(([field]) => {
    if (!draft.baselineFact) return true;
    return stable(fact[field]) !== stable(draft.baselineFact[field]);
  }).map(([, label]) => label);
  const comment =
    draft.mode === "add"
      ? `新增地点：${fact.name}（${PIN_LABELS[fact.pinType]}）`
      : `更新地点：${changedFields.join("、") || "来源"}`;
  const sourceLabels = Array.from(
    new Set(draft.sources.map((item) => SOURCE_LABELS[item.kind])),
  );
  const sourceSummary = `来源：${sourceLabels.join("、") || "未提供"}`;
  const change =
    draft.mode === "add"
      ? { operation: "create" as const, fact, sources: draft.sources }
      : {
          operation: "update" as const,
          placeId: draft.placeId!,
          baseRevisionId: draft.baseRevisionId!,
          fact,
          sources: draft.sources,
        };
  return {
    kind: "single",
    idempotencyKey: draft.idempotencyKey,
    comment,
    sourceSummary,
    reviewRequested: false,
    client: { name: "CUpedia Campus Map", version: "1" },
    warningAcknowledgements: draft.warningAcknowledgements,
    changes: [change],
  };
}

export function encodeCampusMapEditSnapshot(
  session: CampusMapEditSession,
): string {
  return JSON.stringify({ version: CAMPUS_MAP_EDIT_SNAPSHOT_VERSION, session });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function controlled(values: readonly string[], value: unknown): boolean {
  return typeof value === "string" && values.includes(value);
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validUuid(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function looksLikeFact(value: unknown, allowNullLocation: boolean): boolean {
  if (!isRecord(value)) return false;
  const fact = value;
  const location = isRecord(fact.location) ? fact.location : null;
  const validLocation =
    (allowNullLocation && fact.location === null) ||
    (location !== null &&
      ((location.kind === "building" &&
        typeof fact.buildingId === "string" &&
        fact.buildingId.length > 0 &&
        fact.floorId === null) ||
        (location.kind === "floor" &&
          typeof fact.buildingId === "string" &&
          fact.buildingId.length > 0 &&
          typeof fact.floorId === "string" &&
          fact.floorId.length > 0) ||
        (location.kind === "outdoor-point" &&
          fact.buildingId === null &&
          fact.floorId === null &&
          typeof location.longitude === "number" &&
          Number.isFinite(location.longitude) &&
          location.longitude >= -180 &&
          location.longitude <= 180 &&
          typeof location.latitude === "number" &&
          Number.isFinite(location.latitude) &&
          location.latitude >= -90 &&
          location.latitude <= 90 &&
          location.crs === "wgs84" &&
          (location.precision === "approximate" ||
            location.precision === "precise"))));
  const scheduleValid =
    isRecord(fact.accessSchedule) &&
    (fact.accessSchedule.kind === "unknown" ||
      fact.accessSchedule.kind === "always" ||
      (fact.accessSchedule.kind === "weekly" &&
        fact.accessSchedule.timezone === "Asia/Hong_Kong" &&
        Array.isArray(fact.accessSchedule.intervals) &&
        fact.accessSchedule.intervals.length > 0 &&
        fact.accessSchedule.intervals.every(
          (interval) =>
            isRecord(interval) &&
            Array.isArray(interval.days) &&
            interval.days.length > 0 &&
            interval.days.every((day) =>
              ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(
                String(day),
              ),
            ) &&
            typeof interval.opensAt === "string" &&
            typeof interval.closesAt === "string" &&
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.opensAt) &&
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.closesAt) &&
            interval.opensAt !== interval.closesAt,
        )));
  return (
    typeof fact.name === "string" &&
    (fact.buildingId === null || typeof fact.buildingId === "string") &&
    (fact.floorId === null || typeof fact.floorId === "string") &&
    controlled(CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.pinType, fact.pinType) &&
    Array.isArray(fact.capabilities) &&
    fact.capabilities.every((item) =>
      controlled(CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.capability, item),
    ) &&
    controlled(CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.gender, fact.gender) &&
    controlled(
      CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.wheelchairAccess,
      fact.wheelchairAccess,
    ) &&
    controlled(CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.audience, fact.audience) &&
    controlled(
      CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.credentialRequirement,
      fact.credentialRequirement,
    ) &&
    scheduleValid &&
    controlled(
      CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.reservationRequirement,
      fact.reservationRequirement,
    ) &&
    controlled(
      CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.temporaryStatus,
      fact.temporaryStatus,
    ) &&
    (fact.observedAt === null || validTimestamp(fact.observedAt)) &&
    validLocation
  );
}

function looksLikeSource(value: unknown): boolean {
  const coordinateValid =
    value !== null &&
    isRecord(value) &&
    (value.sourceCoordinate === null ||
      (isRecord(value.sourceCoordinate) &&
        typeof value.sourceCoordinate.x === "number" &&
        Number.isFinite(value.sourceCoordinate.x) &&
        typeof value.sourceCoordinate.y === "number" &&
        Number.isFinite(value.sourceCoordinate.y) &&
        controlled(
          CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.sourceCoordinateCrs,
          value.sourceCoordinate.crs,
        ) &&
        (value.sourceCoordinate.conversion === null ||
          (isRecord(value.sourceCoordinate.conversion) &&
            controlled(
              CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.coordinateConversionMethod,
              value.sourceCoordinate.conversion.method,
            ) &&
            typeof value.sourceCoordinate.conversion.version === "string"))));
  return (
    isRecord(value) &&
    controlled(
      CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.provenanceKind,
      value.kind,
    ) &&
    typeof value.ref === "string" &&
    (value.url === null || typeof value.url === "string") &&
    (value.owner === null || typeof value.owner === "string") &&
    (value.version === null || typeof value.version === "string") &&
    (value.snapshotHash === null || typeof value.snapshotHash === "string") &&
    typeof value.accessedOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.accessedOn) &&
    (value.observedAt === null || validTimestamp(value.observedAt)) &&
    controlled(
      CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES.rightsStatus,
      value.rightsStatus,
    ) &&
    (value.limitations === null || typeof value.limitations === "string") &&
    (value.note === null || typeof value.note === "string") &&
    coordinateValid
  );
}

function looksLikeWarning(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.fingerprint === "string" &&
    isRecord(value.anchor)
  );
}

function looksLikeSession(value: unknown): value is CampusMapEditSession {
  if (!isRecord(value) || !isRecord(value.draft)) return false;
  const draft = value.draft;
  const statuses: CampusMapEditStatus[] = [
    "placing",
    "editing",
    "confirm-discard",
    "publishing",
    "warning",
    "authentication-required",
    "rate-limited",
    "temporarily-unavailable",
    "conflict",
    "published",
  ];
  if (!statuses.includes(value.status as CampusMapEditStatus)) return false;
  const statusStateValid =
    (value.status !== "warning" ||
      (Array.isArray(value.warnings) &&
        value.warnings.length > 0 &&
        value.warnings.every(looksLikeWarning))) &&
    (value.status !== "conflict" ||
      (isRecord(value.conflict) &&
        typeof value.conflict.currentRevisionId === "string" &&
        looksLikeFact(value.conflict.currentFact, false))) &&
    (value.status !== "rate-limited" ||
      (typeof value.retryAfter === "number" &&
        Number.isFinite(value.retryAfter) &&
        (value.rateScope === "actor" || value.rateScope === "ip"))) &&
    (value.status !== "confirm-discard" ||
      [
        "placing",
        "editing",
        "publishing",
        "warning",
        "authentication-required",
        "rate-limited",
        "temporarily-unavailable",
        "conflict",
      ].includes(String(value.returnStatus)));
  const locationStateValid =
    ((value.status === "placing" ||
      (value.status === "confirm-discard" &&
        value.returnStatus === "placing")) &&
      (draft.mode === "add" ||
        (isRecord(draft.fact) && draft.fact.location !== null))) ||
    (isRecord(draft.fact) && draft.fact.location !== null);
  return (
    statusStateValid &&
    locationStateValid &&
    (draft.mode === "add" || draft.mode === "edit") &&
    validUuid(draft.idempotencyKey) &&
    looksLikeFact(draft.fact, true) &&
    Array.isArray(draft.sources) &&
    draft.sources.every(looksLikeSource) &&
    Array.isArray(draft.baselineSources) &&
    draft.baselineSources.every(looksLikeSource) &&
    Array.isArray(draft.warningAcknowledgements) &&
    draft.warningAcknowledgements.every(
      (item) =>
        isRecord(item) &&
        typeof item.changeIndex === "number" &&
        typeof item.code === "string" &&
        typeof item.fingerprint === "string",
    ) &&
    (draft.mode === "add" ||
      (validUuid(draft.placeId) &&
        validUuid(draft.baseRevisionId) &&
        looksLikeFact(draft.baselineFact, false)))
  );
}

export type CampusMapEditSnapshotDecodeResult =
  | { status: "restored"; session: CampusMapEditSession }
  | {
      status: "discarded";
      reason: "invalid-json" | "unsupported-version" | "invalid-snapshot";
    };

export function decodeCampusMapEditSnapshot(
  encoded: string,
): CampusMapEditSnapshotDecodeResult {
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return { status: "discarded", reason: "invalid-json" };
  }
  if (!isRecord(value))
    return { status: "discarded", reason: "invalid-snapshot" };
  if (value.version !== CAMPUS_MAP_EDIT_SNAPSHOT_VERSION) {
    return { status: "discarded", reason: "unsupported-version" };
  }
  if (
    !looksLikeSession(value.session) ||
    value.session.status === "published"
  ) {
    return { status: "discarded", reason: "invalid-snapshot" };
  }
  const session = clone(value.session);
  if (session.status === "publishing")
    session.status = "temporarily-unavailable";
  return { status: "restored", session };
}
