import type {
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishResult,
  CampusMapPublishSourceInput,
  CampusMapPublishValidationIssue,
  CampusMapPublishWarning,
} from "@/lib/campus-map/publish-contract";
import type { CampusMapPublishReceiptOutcome } from "@/lib/campus-map/publish-receipt-consumer";
import { CAMPUS_MAP_PUBLISH_CONTROLLED_VALUES } from "@/lib/campus-map/publish-contract";
import { isCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  CAMPUS_MAP_EDIT_SCHEMA,
  firstInvalidCampusMapEditField,
  type CampusMapEditFieldKey,
} from "@/lib/campus-map/edit-schema";

export const CAMPUS_MAP_EDIT_SNAPSHOT_VERSION = 4 as const;

export type CampusMapPublishFeedbackReason = Extract<
  CampusMapPublishReceiptOutcome,
  { status: "recoverable" }
>["reason"];

type OutdoorPoint = Extract<
  CampusMapPublishFactInput["location"],
  { kind: "outdoor-point" }
>;

export interface CampusMapPlacement extends Omit<OutdoorPoint, "kind"> {
  method: "pointer" | "keyboard";
}

/** Canonical #717 labels used only to display an indoor fact without exposing IDs. */
export interface CampusMapIndoorLocationDisplay {
  buildingId: string;
  buildingName: string;
  floorId: string | null;
  floorLabel: string | null;
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
  placementCandidate: CampusMapPlacement | null;
  placementMethod: CampusMapPlacement["method"] | null;
  locationDisplay?: CampusMapIndoorLocationDisplay | null;
  warningAcknowledgements: CampusMapPublishCommand["warningAcknowledgements"];
}

export type CampusMapEditStatus =
  | "placing"
  | "editing"
  | "confirm-discard"
  | "publishing"
  | "warning"
  | "authentication-required"
  | "forbidden"
  | "rate-limited"
  | "temporarily-unavailable"
  | "publish-unknown"
  | "publish-identity"
  | "publish-recovery-unavailable"
  | "conflict"
  | "published";

const PUBLISH_OUTCOME_PENDING_STATUSES = [
  "publishing",
  "publish-unknown",
  "publish-identity",
  "publish-recovery-unavailable",
] satisfies ReadonlyArray<CampusMapEditStatus>;

export function isCampusMapPublishOutcomePending(status: CampusMapEditStatus) {
  return PUBLISH_OUTCOME_PENDING_STATUSES.some(
    (candidate) => candidate === status,
  );
}

export interface CampusMapEditReceipt {
  placeId: string;
  revisionId: string;
  changesetId: string;
}

export type CampusMapEditConflict =
  | {
      kind: "current";
      currentRevisionId: string;
      currentFact: CampusMapPublishFactInput;
      currentLocationDisplay?: CampusMapIndoorLocationDisplay | null;
    }
  | {
      kind: "unavailable";
      reason?: "latest-snapshot" | "location-labels";
    };

export interface CampusMapEditSession {
  status: CampusMapEditStatus;
  draft: CampusMapEditDraft;
  returnStatus?: Exclude<CampusMapEditStatus, "confirm-discard" | "published">;
  localError?: string;
  serverErrors?: CampusMapPublishValidationIssue[];
  warnings?: CampusMapPublishWarning[];
  retryAfter?: number;
  rateScope?: "actor" | "ip";
  forbiddenCode?: Extract<
    CampusMapPublishResult,
    { status: "forbidden" }
  >["code"];
  publishFeedbackReason?: CampusMapPublishFeedbackReason;
  conflict?: CampusMapEditConflict;
  receipt?: CampusMapEditReceipt;
}

export type CampusMapEditCommand =
  | { kind: "scene"; intent: "start-create" | "start-edit" | "cancel-task" }
  | {
      kind: "camera";
      intent: "recenter-placement";
      position: readonly [longitude: number, latitude: number];
    }
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
      type: "START_ADD_AT_POSITION";
      idempotencyKey: string;
      position: CampusMapPlacement;
    }
  | {
      type: "START_EDIT";
      placeId: string;
      baseRevisionId: string;
      fact: CampusMapPublishFactInput;
      sources: CampusMapPublishSourceInput[];
      idempotencyKey: string;
      locationDisplay?: CampusMapIndoorLocationDisplay | null;
    }
  | { type: "CONFIRM_POSITION"; position: CampusMapPlacement }
  | { type: "UPDATE_PLACEMENT_CANDIDATE"; position: CampusMapPlacement }
  | { type: "START_REPOSITION"; idempotencyKey?: string }
  | { type: "REPORT_LOCAL_ERROR"; field: string }
  | {
      type: "CHANGE_FACT";
      fact: CampusMapEditDraft["fact"];
      idempotencyKey?: string;
      locationDisplay?: CampusMapIndoorLocationDisplay | null;
    }
  | {
      type: "CHANGE_PIN_TYPE";
      pinType: CampusMapPublishFactInput["pinType"];
      idempotencyKey?: string;
    }
  | {
      type: "CHANGE_SOURCES";
      sources: CampusMapPublishSourceInput[];
      idempotencyKey?: string;
    }
  | { type: "REQUEST_CLOSE" }
  | { type: "CONTINUE_EDITING" }
  | { type: "DISCARD" }
  | {
      type: "REQUEST_PUBLISH";
      requiredFields?: readonly CampusMapEditFieldKey[];
      accessedOn?: string;
    }
  | {
      type: "PUBLISH_RESULT";
      idempotencyKey: string;
      result: CampusMapPublishResult;
      conflictLocationDisplay?: CampusMapIndoorLocationDisplay | null;
    }
  | {
      type: "PUBLISH_RECOVERY_RESULT";
      idempotencyKey: string;
      reason: CampusMapPublishFeedbackReason;
    }
  | { type: "PUBLISH_HANDOFF_COMPLETED"; idempotencyKey: string }
  | { type: "ACKNOWLEDGE_WARNINGS"; idempotencyKey: string }
  | { type: "AUTH_RETURNED" }
  | { type: "CONTRIBUTOR_SETUP_COMPLETED" }
  | { type: "RETRY_PUBLISH" }
  | { type: "CHECK_PUBLISH_RESULT" }
  | { type: "RETURN_LATER" }
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

const DEFAULT_PRESET = CAMPUS_MAP_EDIT_SCHEMA.presets[0];
const MAP_SUBMISSION_SOURCE_PREFIX = "CUpedia Campus Map submission ";

const DEFAULT_FACT: CampusMapEditDraft["fact"] = {
  name: DEFAULT_PRESET.defaultName,
  buildingId: null,
  floorId: null,
  pinType: DEFAULT_PRESET.pinType,
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
  locationDisplay?: CampusMapIndoorLocationDisplay | null;
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
    placementCandidate: null,
    placementMethod: null,
    locationDisplay: matchingLocationDisplay(
      fact,
      input.locationDisplay ?? null,
    ),
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

function samePlacement(
  left: CampusMapEditDraft["fact"],
  right: CampusMapEditDraft["fact"],
): boolean {
  return (
    left.buildingId === right.buildingId &&
    left.floorId === right.floorId &&
    stable(left.location) === stable(right.location)
  );
}

function matchingLocationDisplay(
  fact: CampusMapEditDraft["fact"],
  display: CampusMapIndoorLocationDisplay | null | undefined,
): CampusMapIndoorLocationDisplay | null {
  if (!display || !fact.location || fact.location.kind === "outdoor-point") {
    return null;
  }
  if (
    !display.buildingName.trim() ||
    display.buildingId !== fact.buildingId ||
    display.floorId !== fact.floorId
  ) {
    return null;
  }
  if (
    fact.location.kind === "building" &&
    (display.floorId !== null || display.floorLabel !== null)
  ) {
    return null;
  }
  if (
    fact.location.kind === "floor" &&
    (!display.floorId || !display.floorLabel?.trim())
  ) {
    return null;
  }
  return clone(display);
}

function placementIsReadable(
  fact: CampusMapEditDraft["fact"],
  display: CampusMapIndoorLocationDisplay | null | undefined,
): boolean {
  if (fact.location?.kind === "outdoor-point") return true;
  return matchingLocationDisplay(fact, display) !== null;
}

function hasUnreadablePlacementConflict(
  draft: CampusMapEditDraft,
  currentFact: CampusMapPublishFactInput,
  currentDisplay: CampusMapIndoorLocationDisplay | null | undefined,
): boolean {
  return (
    !samePlacement(draft.fact, currentFact) &&
    (!placementIsReadable(draft.fact, draft.locationDisplay) ||
      !placementIsReadable(currentFact, currentDisplay))
  );
}

export function isCampusMapEditDirty(
  session: CampusMapEditSession | null,
): boolean {
  if (!session || session.status === "published") return false;
  const { draft } = session;
  if (draft.mode === "add") {
    return (
      stable(draft.fact) !== stable(DEFAULT_FACT) || draft.sources.length > 0
    );
  }
  return stable(draft.fact) !== stable(draft.baselineFact);
}

function rejected(
  session: CampusMapEditSession | null,
): CampusMapEditTransition {
  return { accepted: false, session, commands: [] };
}

function persisted(session: CampusMapEditSession): CampusMapEditTransition {
  return { accepted: true, session, commands: [{ kind: "persist-snapshot" }] };
}

function presentedPublishState(
  session: CampusMapEditSession,
  message: string,
): CampusMapEditTransition {
  return {
    accepted: true,
    session,
    commands: [
      { kind: "persist-snapshot" },
      { kind: "focus", target: "publish-feedback" },
      { kind: "announce", message },
    ],
  };
}

function editable(session: CampusMapEditSession): CampusMapEditSession {
  return {
    status: session.status === "placing" ? "placing" : "editing",
    draft: {
      ...session.draft,
      warningAcknowledgements: [],
    },
  };
}

function draftForPayloadChange(
  session: CampusMapEditSession,
  idempotencyKey: string | undefined,
): CampusMapEditDraft | null {
  if (session.status !== "temporarily-unavailable") return session.draft;
  if (!idempotencyKey || idempotencyKey === session.draft.idempotencyKey) {
    return null;
  }
  return { ...session.draft, idempotencyKey };
}

function transitionFactChange(
  session: CampusMapEditSession,
  fact: CampusMapEditDraft["fact"],
  idempotencyKey: string | undefined,
  locationDisplay?: CampusMapIndoorLocationDisplay | null,
): CampusMapEditTransition {
  const attemptDraft = draftForPayloadChange(session, idempotencyKey);
  if (!attemptDraft) return rejected(session);
  const next = editable({ ...session, draft: attemptDraft });
  return persisted({
    ...next,
    draft: {
      ...next.draft,
      fact: clone(fact),
      locationDisplay: samePlacement(next.draft.fact, fact)
        ? next.draft.locationDisplay
        : matchingLocationDisplay(fact, locationDisplay),
    },
  });
}

function normalizeServerErrorTarget(field: string | undefined): string {
  if (!field) return "form-heading";
  const path = field.split(/[^A-Za-z]+/).filter(Boolean);
  if (
    path.includes("location") ||
    path.includes("buildingId") ||
    path.includes("floorId")
  ) {
    return "location";
  }
  if (path.includes("pinType")) return "pinType";
  if (path.includes("name")) return "name";
  if (path.includes("audience")) return "audience";
  if (path.includes("credentialRequirement")) {
    return "credentialRequirement";
  }
  if (path.includes("accessSchedule")) return "accessSchedule";
  if (path.includes("reservationRequirement")) {
    return "reservationRequirement";
  }
  if (path.includes("temporaryStatus")) return "temporaryStatus";
  return "form-heading";
}

function publishTransition(
  session: CampusMapEditSession,
  requiredFields: readonly CampusMapEditFieldKey[] = [],
  accessedOn?: string,
): CampusMapEditTransition {
  if (session.status === "published" || session.status === "publishing") {
    return rejected(session);
  }
  if (!isCampusMapEditDirty(session)) return rejected(session);
  const draft =
    session.draft.sources.length === 0 && isDateOnly(accessedOn)
      ? {
          ...session.draft,
          sources: [mapSubmissionSource(accessedOn)],
        }
      : session.draft;
  const error = firstInvalidCampusMapEditField(draft, requiredFields);
  if (error) {
    const next = { ...editable(session), draft, localError: error };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: normalizeServerErrorTarget(error) },
        { kind: "announce", message: "请先完成必填资料" },
      ],
    };
  }
  const next: CampusMapEditSession = {
    status: "publishing",
    draft,
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

function isDateOnly(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function mapSubmissionSource(accessedOn: string): CampusMapPublishSourceInput {
  return {
    kind: "other",
    ref: `${MAP_SUBMISSION_SOURCE_PREFIX}${accessedOn}`,
    url: null,
    owner: null,
    version: null,
    snapshotHash: null,
    accessedOn,
    observedAt: null,
    rightsStatus: "unknown",
    limitations:
      "用户通过 Campus Map 提交名称、位置、设施类型与结构化访问条件；未提供独立资料来源。",
    note: null,
    sourceCoordinate: null,
  };
}

export function transitionCampusMapEdit(
  session: CampusMapEditSession | null,
  event: CampusMapEditEvent,
): CampusMapEditTransition {
  if (event.type === "START_ADD" || event.type === "START_ADD_AT_POSITION") {
    if (session) return rejected(session);
    const placementCandidate =
      event.type === "START_ADD_AT_POSITION" ? clone(event.position) : null;
    const next: CampusMapEditSession = {
      status: "placing",
      draft: {
        ...createCampusMapEditDraft({
          mode: "add",
          idempotencyKey: event.idempotencyKey,
        }),
        placementCandidate,
      },
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "scene", intent: "start-create" },
        { kind: "persist-snapshot" },
        ...(placementCandidate
          ? [
              {
                kind: "camera" as const,
                intent: "recenter-placement" as const,
                position: [
                  placementCandidate.longitude,
                  placementCandidate.latitude,
                ] as const,
              },
            ]
          : []),
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
        locationDisplay: event.locationDisplay,
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
  if (
    session.status === "publishing" &&
    event.type !== "PUBLISH_RESULT" &&
    event.type !== "PUBLISH_RECOVERY_RESULT" &&
    event.type !== "PUBLISH_HANDOFF_COMPLETED"
  ) {
    return rejected(session);
  }
  if (
    session.status === "conflict" &&
    event.type !== "REQUEST_CLOSE" &&
    event.type !== "CONTINUE_FROM_CONFLICT" &&
    event.type !== "USE_CURRENT_FACT"
  ) {
    return rejected(session);
  }

  if (event.type === "UPDATE_PLACEMENT_CANDIDATE") {
    if (session.status !== "placing") return rejected(session);
    return persisted({
      ...session,
      draft: {
        ...session.draft,
        placementCandidate: clone(event.position),
      },
    });
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
        placementCandidate: null,
        placementMethod: method,
        locationDisplay: null,
        warningAcknowledgements: [],
      },
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: "form-heading" },
        { kind: "announce", message: "位置已锁定，请填写地点资料" },
      ],
    };
  }

  if (event.type === "START_REPOSITION") {
    if (session.status === "placing" || session.status === "confirm-discard") {
      return rejected(session);
    }
    const attemptDraft = draftForPayloadChange(session, event.idempotencyKey);
    if (!attemptDraft) return rejected(session);
    const placementCandidate =
      attemptDraft.fact.location?.kind === "outdoor-point"
        ? {
            longitude: attemptDraft.fact.location.longitude,
            latitude: attemptDraft.fact.location.latitude,
            crs: "wgs84" as const,
            precision: attemptDraft.fact.location.precision,
            method: attemptDraft.placementMethod ?? ("pointer" as const),
          }
        : null;
    const next: CampusMapEditSession = {
      status: "placing",
      draft: {
        ...attemptDraft,
        placementCandidate,
        warningAcknowledgements: [],
      },
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        ...(placementCandidate
          ? [
              {
                kind: "camera" as const,
                intent: "recenter-placement" as const,
                position: [
                  placementCandidate.longitude,
                  placementCandidate.latitude,
                ] as const,
              },
            ]
          : []),
        { kind: "announce", message: "移动地图或输入 WGS84 坐标以重新定位" },
      ],
    };
  }

  if (event.type === "REPORT_LOCAL_ERROR") {
    const next = {
      ...(session.status === "temporarily-unavailable"
        ? session
        : editable(session)),
      localError: event.field,
    };
    return {
      accepted: true,
      session: next,
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: normalizeServerErrorTarget(event.field) },
        { kind: "announce", message: "请检查这个字段" },
      ],
    };
  }

  if (event.type === "CHANGE_FACT") {
    return transitionFactChange(
      session,
      event.fact,
      event.idempotencyKey,
      event.locationDisplay,
    );
  }
  if (event.type === "CHANGE_PIN_TYPE") {
    const currentPreset = CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (preset) => preset.pinType === session.draft.fact.pinType,
    );
    const nextPreset = CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (preset) => preset.pinType === event.pinType,
    );
    if (!nextPreset) return rejected(session);

    const currentName = session.draft.fact.name;
    const shouldApplyDefault =
      !currentName.trim() ||
      (session.draft.mode === "add" &&
        currentPreset !== undefined &&
        currentName.trim() === currentPreset.defaultName);
    const fact: CampusMapEditDraft["fact"] = {
      ...session.draft.fact,
      name: shouldApplyDefault ? nextPreset.defaultName : currentName,
      pinType: event.pinType,
    };
    return transitionFactChange(session, fact, event.idempotencyKey);
  }
  if (event.type === "CHANGE_SOURCES") {
    const attemptDraft = draftForPayloadChange(session, event.idempotencyKey);
    if (!attemptDraft) return rejected(session);
    const next = editable({ ...session, draft: attemptDraft });
    return persisted({
      ...next,
      draft: { ...next.draft, sources: clone(event.sources) },
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
      ...session,
      status: "confirm-discard",
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
    if (
      session.status === "publish-recovery-unavailable" ||
      (session.status === "forbidden" &&
        session.forbiddenCode !== "profile-incomplete")
    ) {
      const next: CampusMapEditSession = {
        status: "editing",
        draft: session.draft,
      };
      return {
        accepted: true,
        session: next,
        commands: [
          { kind: "persist-snapshot" },
          {
            kind: "scene",
            intent: next.draft.mode === "add" ? "start-create" : "start-edit",
          },
          { kind: "focus", target: "form-heading" },
        ],
      };
    }
    if (session.status !== "confirm-discard") return rejected(session);
    const returnStatus = session.returnStatus ?? "editing";
    const next: CampusMapEditSession = {
      ...session,
      status: returnStatus,
      draft:
        returnStatus === "placing"
          ? { ...session.draft, placementCandidate: null }
          : session.draft,
    };
    delete next.returnStatus;
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

  if (event.type === "REQUEST_PUBLISH") {
    if (session.status !== "editing") return rejected(session);
    return publishTransition(session, event.requiredFields, event.accessedOn);
  }

  if (event.type === "PUBLISH_RESULT") {
    if (
      !isCampusMapPublishOutcomePending(session.status) ||
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
      return presentedPublishState(
        { status: "authentication-required", draft: session.draft },
        "需要登录，草稿已保留",
      );
    }
    if (result.status === "forbidden") {
      return presentedPublishState(
        {
          status: "forbidden",
          draft: session.draft,
          forbiddenCode: result.code,
        },
        "当前账号无法发布，草稿已保留",
      );
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
          { kind: "focus", target: "publish-feedback" },
          { kind: "announce", message: "发布太频繁，草稿已保留" },
          {
            kind: "schedule-rate-retry",
            afterSeconds: next.retryAfter ?? 0,
            idempotencyKey: session.draft.idempotencyKey,
          },
        ],
      };
    }
    if (result.status === "temporarily-unavailable") {
      return presentedPublishState(
        { status: "temporarily-unavailable", draft: session.draft },
        "暂时无法发布，你的修改已保存在这个浏览器中",
      );
    }
    if (result.status === "conflict") {
      const conflict = result.conflicts.find(
        (item) => item.currentRevisionId && item.currentSnapshot,
      );
      if (!conflict?.currentRevisionId || !conflict.currentSnapshot) {
        return {
          accepted: true,
          session: {
            status: "conflict",
            draft: session.draft,
            conflict: { kind: "unavailable", reason: "latest-snapshot" },
          },
          commands: [
            { kind: "persist-snapshot" },
            {
              kind: "announce",
              message: "地点的最新版本不可用，草稿仍已保留",
            },
          ],
        };
      }
      const currentFact = Object.fromEntries(
        Object.entries(conflict.currentSnapshot).filter(
          ([field]) => field !== "factSchemaVersion",
        ),
      ) as unknown as CampusMapPublishFactInput;
      const currentLocationDisplay =
        matchingLocationDisplay(currentFact, event.conflictLocationDisplay) ??
        (samePlacement(session.draft.fact, currentFact)
          ? matchingLocationDisplay(currentFact, session.draft.locationDisplay)
          : null);
      if (
        hasUnreadablePlacementConflict(
          session.draft,
          currentFact,
          currentLocationDisplay,
        )
      ) {
        return {
          accepted: true,
          session: {
            status: "conflict",
            draft: session.draft,
            conflict: { kind: "unavailable", reason: "location-labels" },
          },
          commands: [
            { kind: "persist-snapshot" },
            {
              kind: "announce",
              message: "无法安全比较最新位置，草稿仍已保留",
            },
          ],
        };
      }
      return persisted({
        status: "conflict",
        draft: session.draft,
        conflict: {
          kind: "current",
          currentRevisionId: conflict.currentRevisionId,
          currentFact,
          currentLocationDisplay,
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
    const target = errors[0]
      ? normalizeServerErrorTarget(errors[0].anchor.field)
      : null;
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

  if (event.type === "PUBLISH_RECOVERY_RESULT") {
    if (
      !isCampusMapPublishOutcomePending(session.status) ||
      event.idempotencyKey !== session.draft.idempotencyKey ||
      event.reason === "superseded" ||
      event.reason === "projection-superseded"
    ) {
      return rejected(session);
    }
    const focusAndAnnounce = (message: string): CampusMapEditCommand[] => [
      { kind: "focus", target: "publish-feedback" },
      { kind: "announce", message },
    ];
    if (
      event.reason === "identity-mismatch" ||
      event.reason === "identity-unavailable"
    ) {
      const next: CampusMapEditSession = {
        status: "publish-identity",
        draft: session.draft,
        publishFeedbackReason: event.reason,
      };
      return {
        accepted: true,
        session: next,
        commands: [
          event.reason === "identity-mismatch"
            ? { kind: "clear-snapshot" }
            : { kind: "persist-snapshot" },
          ...focusAndAnnounce(
            event.reason === "identity-mismatch"
              ? "当前账号与原发布账号不同，未显示原草稿"
              : "暂时无法确认当前登录状态，未显示草稿",
          ),
        ],
      };
    }
    if (event.reason === "receipt-lock-unavailable") {
      return {
        accepted: true,
        session: {
          status: "publish-recovery-unavailable",
          draft: session.draft,
          publishFeedbackReason: event.reason,
        },
        commands: [
          { kind: "persist-snapshot" },
          ...focusAndAnnounce(
            "当前浏览器无法安全恢复这次发布，你的修改已经保留",
          ),
        ],
      };
    }
    return {
      accepted: true,
      session: {
        status: "publish-unknown",
        draft: session.draft,
        publishFeedbackReason: event.reason,
      },
      commands: [
        { kind: "persist-snapshot" },
        ...focusAndAnnounce("正在确认发布结果，你的修改已经保留"),
      ],
    };
  }

  if (event.type === "PUBLISH_HANDOFF_COMPLETED") {
    if (
      !isCampusMapPublishOutcomePending(session.status) ||
      event.idempotencyKey !== session.draft.idempotencyKey
    ) {
      return rejected(session);
    }
    return {
      accepted: true,
      session: null,
      commands: [{ kind: "clear-snapshot" }],
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

  if (event.type === "CONTRIBUTOR_SETUP_COMPLETED") {
    if (
      session.status !== "forbidden" ||
      session.forbiddenCode !== "profile-incomplete"
    ) {
      return rejected(session);
    }
    return publishTransition({ status: "editing", draft: session.draft });
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

  if (event.type === "CHECK_PUBLISH_RESULT") {
    if (
      session.status !== "publish-unknown" &&
      !(
        session.status === "publish-identity" &&
        session.publishFeedbackReason === "identity-unavailable"
      )
    ) {
      return rejected(session);
    }
    return publishTransition({ status: "editing", draft: session.draft });
  }

  if (event.type === "RETURN_LATER") {
    if (
      !(
        session.status === "publish-identity" &&
        session.publishFeedbackReason === "identity-mismatch"
      )
    ) {
      return rejected(session);
    }
    return {
      accepted: true,
      session: null,
      commands: [{ kind: "scene", intent: "cancel-task" }],
    };
  }

  if (event.type === "RATE_LIMIT_ELAPSED") {
    if (
      (session.status !== "rate-limited" &&
        !(
          session.status === "confirm-discard" &&
          session.returnStatus === "rate-limited"
        )) ||
      event.idempotencyKey !== session.draft.idempotencyKey
    )
      return rejected(session);
    return persisted({ ...session, retryAfter: 0 });
  }

  if (event.type === "CONTINUE_FROM_CONFLICT") {
    if (session.status !== "conflict" || session.conflict?.kind !== "current")
      return rejected(session);
    const locationDisplay = samePlacement(
      event.fact,
      session.conflict.currentFact,
    )
      ? session.conflict.currentLocationDisplay
      : samePlacement(event.fact, session.draft.fact)
        ? session.draft.locationDisplay
        : null;
    return persisted({
      status: "editing",
      draft: {
        ...session.draft,
        fact: clone(event.fact),
        locationDisplay: matchingLocationDisplay(event.fact, locationDisplay),
        baseRevisionId: session.conflict.currentRevisionId,
        baselineFact: clone(session.conflict.currentFact),
        idempotencyKey: event.idempotencyKey,
        warningAcknowledgements: [],
      },
    });
  }

  if (event.type === "USE_CURRENT_FACT") {
    if (session.status !== "conflict" || session.conflict?.kind !== "current")
      return rejected(session);
    return persisted({
      status: "editing",
      draft: {
        ...session.draft,
        fact: clone(session.conflict.currentFact),
        locationDisplay: matchingLocationDisplay(
          session.conflict.currentFact,
          session.conflict.currentLocationDisplay,
        ),
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
    new Set(
      draft.sources.map((item) =>
        item.kind === "other" &&
        item.ref.startsWith(MAP_SUBMISSION_SOURCE_PREFIX)
          ? "地图提交"
          : SOURCE_LABELS[item.kind],
      ),
    ),
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
  return isCampusMapUuid(value);
}

function looksLikeFact(
  value: unknown,
  allowIncompleteDraftFields: boolean,
): boolean {
  if (!isRecord(value)) return false;
  const fact = value;
  const location = isRecord(fact.location) ? fact.location : null;
  const validLocation =
    (allowIncompleteDraftFields && fact.location === null) ||
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
        (allowIncompleteDraftFields ||
          fact.accessSchedule.intervals.length > 0) &&
        fact.accessSchedule.intervals.every(
          (interval) =>
            isRecord(interval) &&
            Array.isArray(interval.days) &&
            (allowIncompleteDraftFields || interval.days.length > 0) &&
            interval.days.every((day) =>
              ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(
                String(day),
              ),
            ) &&
            typeof interval.opensAt === "string" &&
            typeof interval.closesAt === "string" &&
            (allowIncompleteDraftFields
              ? interval.opensAt === "" ||
                /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.opensAt)
              : /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.opensAt)) &&
            (allowIncompleteDraftFields
              ? interval.closesAt === "" ||
                /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.closesAt)
              : /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.closesAt)) &&
            (allowIncompleteDraftFields
              ? interval.opensAt === "" ||
                interval.closesAt === "" ||
                interval.opensAt !== interval.closesAt
              : interval.opensAt !== interval.closesAt),
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

function looksLikeLocationDisplay(value: unknown, fact: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || !isRecord(fact) || !isRecord(fact.location)) {
    return false;
  }
  const indoor =
    fact.location.kind === "building" || fact.location.kind === "floor";
  if (!indoor) return false;
  const floorMatches =
    fact.location.kind === "building"
      ? value.floorId === null && value.floorLabel === null
      : typeof value.floorId === "string" &&
        value.floorId.length > 0 &&
        value.floorId === fact.floorId &&
        typeof value.floorLabel === "string" &&
        value.floorLabel.trim().length > 0;
  return (
    typeof value.buildingId === "string" &&
    value.buildingId.length > 0 &&
    value.buildingId === fact.buildingId &&
    typeof value.buildingName === "string" &&
    value.buildingName.trim().length > 0 &&
    floorMatches
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

function looksLikeIssueAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.changeIndex === undefined ||
      (typeof value.changeIndex === "number" &&
        Number.isInteger(value.changeIndex) &&
        value.changeIndex >= 0)) &&
    (value.placeId === undefined || typeof value.placeId === "string") &&
    (value.field === undefined || typeof value.field === "string")
  );
}

function looksLikeValidationIssue(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    looksLikeIssueAnchor(value.anchor)
  );
}

function looksLikeWarning(value: unknown): boolean {
  return (
    isRecord(value) &&
    looksLikeValidationIssue(value) &&
    typeof value.fingerprint === "string"
  );
}

function looksLikeConflict(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "unavailable") {
    return (
      value.reason === undefined ||
      value.reason === "latest-snapshot" ||
      value.reason === "location-labels"
    );
  }
  return (
    value.kind === "current" &&
    validUuid(value.currentRevisionId) &&
    looksLikeFact(value.currentFact, false) &&
    (value.currentLocationDisplay === undefined ||
      looksLikeLocationDisplay(value.currentLocationDisplay, value.currentFact))
  );
}

function looksLikePlacement(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.crs === "wgs84" &&
    (value.precision === "approximate" || value.precision === "precise") &&
    (value.method === "pointer" || value.method === "keyboard")
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
    "forbidden",
    "rate-limited",
    "temporarily-unavailable",
    "publish-unknown",
    "publish-identity",
    "publish-recovery-unavailable",
    "conflict",
    "published",
  ];
  if (!statuses.includes(value.status as CampusMapEditStatus)) return false;
  const returnStatuses = [
    "placing",
    "editing",
    "warning",
    "authentication-required",
    "forbidden",
    "rate-limited",
    "temporarily-unavailable",
    "publish-unknown",
    "publish-identity",
    "publish-recovery-unavailable",
    "conflict",
  ] as const;
  const returnStatusValid =
    value.status === "confirm-discard"
      ? returnStatuses.includes(
          value.returnStatus as (typeof returnStatuses)[number],
        )
      : value.returnStatus === undefined;
  const effectiveStatus =
    value.status === "confirm-discard" ? value.returnStatus : value.status;
  const warningsValid =
    value.warnings === undefined ||
    (Array.isArray(value.warnings) && value.warnings.every(looksLikeWarning));
  const conflictValid =
    value.conflict === undefined || looksLikeConflict(value.conflict);
  const forbiddenCodes = [
    "actor-not-eligible",
    "actor-banned",
    "contributor-blocked",
    "profile-incomplete",
    "role-not-eligible",
    "admin-required",
  ];
  const forbiddenCodeValid =
    value.forbiddenCode === undefined ||
    forbiddenCodes.includes(String(value.forbiddenCode));
  const rateStateValid =
    (value.retryAfter === undefined ||
      (typeof value.retryAfter === "number" &&
        Number.isFinite(value.retryAfter) &&
        value.retryAfter >= 0)) &&
    (value.rateScope === undefined ||
      value.rateScope === "actor" ||
      value.rateScope === "ip");
  const publishFeedbackReason =
    value.publishFeedbackReason as CampusMapPublishFeedbackReason;
  const unknownFeedbackReasons: CampusMapPublishFeedbackReason[] = [
    "reconciliation-unavailable",
    "projection-failed",
    "missing-target",
    "handoff-failed",
    "receipt-state-unavailable",
  ];
  const publishFeedbackValid =
    effectiveStatus === "publish-unknown"
      ? unknownFeedbackReasons.includes(publishFeedbackReason)
      : effectiveStatus === "publish-identity"
        ? ["identity-mismatch", "identity-unavailable"].includes(
            publishFeedbackReason,
          )
        : effectiveStatus === "publish-recovery-unavailable"
          ? publishFeedbackReason === "receipt-lock-unavailable"
          : value.publishFeedbackReason === undefined;
  const statusStateValid =
    returnStatusValid &&
    warningsValid &&
    conflictValid &&
    forbiddenCodeValid &&
    rateStateValid &&
    publishFeedbackValid &&
    (value.localError === undefined || typeof value.localError === "string") &&
    (value.serverErrors === undefined ||
      (Array.isArray(value.serverErrors) &&
        value.serverErrors.every(looksLikeValidationIssue))) &&
    (effectiveStatus !== "warning" ||
      (Array.isArray(value.warnings) &&
        value.warnings.length > 0 &&
        value.warnings.every(looksLikeWarning))) &&
    (effectiveStatus !== "conflict" || looksLikeConflict(value.conflict)) &&
    (effectiveStatus !== "forbidden" ||
      forbiddenCodes.includes(String(value.forbiddenCode))) &&
    (effectiveStatus !== "rate-limited" ||
      (typeof value.retryAfter === "number" &&
        Number.isFinite(value.retryAfter) &&
        value.retryAfter >= 0 &&
        (value.rateScope === "actor" || value.rateScope === "ip"))) &&
    (effectiveStatus !== "published" ||
      (isRecord(value.receipt) &&
        validUuid(value.receipt.placeId) &&
        validUuid(value.receipt.revisionId) &&
        validUuid(value.receipt.changesetId)));
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
    (draft.locationDisplay === undefined ||
      looksLikeLocationDisplay(draft.locationDisplay, draft.fact)) &&
    (draft.placementMethod === null ||
      draft.placementMethod === "pointer" ||
      draft.placementMethod === "keyboard") &&
    (draft.placementCandidate === null ||
      looksLikePlacement(draft.placementCandidate)) &&
    Array.isArray(draft.sources) &&
    draft.sources.every(looksLikeSource) &&
    Array.isArray(draft.baselineSources) &&
    draft.baselineSources.every(looksLikeSource) &&
    Array.isArray(draft.warningAcknowledgements) &&
    draft.warningAcknowledgements.every(
      (item) =>
        isRecord(item) &&
        typeof item.changeIndex === "number" &&
        Number.isInteger(item.changeIndex) &&
        item.changeIndex >= 0 &&
        typeof item.code === "string" &&
        typeof item.fingerprint === "string",
    ) &&
    (draft.mode === "add"
      ? draft.placeId === null &&
        draft.baseRevisionId === null &&
        draft.baselineFact === null
      : validUuid(draft.placeId) &&
        validUuid(draft.baseRevisionId) &&
        looksLikeFact(draft.baselineFact, false))
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
  let sessionValue = value.session;
  if (
    (value.version === 1 || value.version === 2) &&
    isRecord(sessionValue) &&
    isRecord(sessionValue.draft)
  ) {
    const conflict = isRecord(sessionValue.conflict)
      ? sessionValue.conflict
      : null;
    sessionValue = {
      ...sessionValue,
      draft: {
        ...sessionValue.draft,
        ...(value.version === 1 ? { placementCandidate: null } : {}),
        locationDisplay: null,
      },
      ...(conflict?.kind === "current"
        ? {
            conflict: {
              ...conflict,
              currentLocationDisplay: null,
            },
          }
        : {}),
    };
  } else if (
    value.version !== 3 &&
    value.version !== CAMPUS_MAP_EDIT_SNAPSHOT_VERSION
  ) {
    return { status: "discarded", reason: "unsupported-version" };
  }
  if (!looksLikeSession(sessionValue) || sessionValue.status === "published") {
    return { status: "discarded", reason: "invalid-snapshot" };
  }
  const session = clone(sessionValue);
  if (
    session.conflict?.kind === "current" &&
    hasUnreadablePlacementConflict(
      session.draft,
      session.conflict.currentFact,
      session.conflict.currentLocationDisplay,
    )
  ) {
    session.conflict = { kind: "unavailable", reason: "location-labels" };
  }
  return { status: "restored", session };
}
