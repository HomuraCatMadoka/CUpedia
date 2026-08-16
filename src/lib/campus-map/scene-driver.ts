import type { CameraReason, ScreenRect } from "./camera-policy";
import {
  decodeCampusMapHistoryMetadata,
  decodeCampusMapUrl,
  encodeCampusMapHistoryMetadata,
  encodeCampusMapUrl,
} from "./scene-codec";
import {
  EMPTY_CAMPUS_MAP_SCENE_SESSION,
  transitionCampusMapSession,
  type CampusMapEvent,
  type CampusMapFocusCommand,
  type CampusMapSceneCatalog,
  type CampusMapSceneCommands,
  type CampusMapSession,
} from "./scene-kernel";
import { resolveCampusMapSessionSemantics } from "./scene-semantics";
import type {
  CampusMapCameraCommand,
  CampusMapOverlayCommand,
} from "./map-session";

export type CampusMapDriverIntent =
  | CampusMapEvent
  | { type: "NAVIGATE_BACK" }
  | { type: "DISMISS" }
  | {
      type: "FIT_CLUSTER";
      positions: ReadonlyArray<readonly [longitude: number, latitude: number]>;
    }
  | { type: "REFRAME"; reason: CameraReason };

export type CampusMapDriverCameraCommand =
  | CampusMapCameraCommand
  | {
      kind: "fit";
      positions: ReadonlyArray<readonly [longitude: number, latitude: number]>;
    };

export type CampusMapDriverFocusCommand =
  | CampusMapFocusCommand
  | { kind: "result"; resultId: string };

export type CampusMapSheetCommand =
  | { kind: "hide" }
  | { kind: "show"; snap: "peek" | "full" };

export interface CampusMapDriverSnapshot {
  session: CampusMapSession;
  returnTo: CampusMapSession | null;
  transitionToken: number;
}

export interface CampusMapDriverEffectContext {
  token: number;
  isCurrent(): boolean;
}

export interface CampusMapSceneDriverPorts {
  history: {
    readonly state: unknown;
    back(): void;
    pushState(data: unknown, unused: string, url?: string | URL | null): void;
    replaceState(
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void;
  };
  location: {
    pathname(): string;
    search(): string;
  };
  camera(
    command: CampusMapDriverCameraCommand,
    context: CampusMapDriverEffectContext,
  ): void;
  focus(
    command: CampusMapDriverFocusCommand,
    context: CampusMapDriverEffectContext,
  ): void;
  overlay(
    command: CampusMapOverlayCommand,
    context: CampusMapDriverEffectContext,
  ): void;
  sheet(
    command: CampusMapSheetCommand,
    context: CampusMapDriverEffectContext,
  ): void;
}

interface CampusMapDriverCommit {
  session: CampusMapSession;
  returnTo: CampusMapSession | null;
  commands: Omit<CampusMapSceneCommands, "camera" | "focus"> & {
    camera: CampusMapDriverCameraCommand | null;
    focus: CampusMapDriverFocusCommand | null;
  };
  syncSheet: boolean;
  bumpToken?: boolean;
}

function sheetCommand(session: CampusMapSession): CampusMapSheetCommand {
  if (session.mode === "task") return { kind: "hide" };
  const scene = session.scene;
  return "snap" in scene
    ? { kind: "show", snap: scene.snap }
    : { kind: "hide" };
}

function returnTargetFor(
  session: CampusMapSession,
  event: CampusMapEvent,
): CampusMapSession | null | undefined {
  if (
    event.type === "SET_SNAP" ||
    event.type === "SET_BUILDING_FLOOR" ||
    event.type === "RESTORE"
  ) {
    return undefined;
  }
  if (
    event.type === "OPEN_BUILDING" ||
    event.type === "OPEN_FACILITY" ||
    event.type === "OPEN_CONTENT"
  ) {
    if (
      session.mode === "browse" &&
      session.scene.kind !== "map" &&
      session.scene.kind !== "provider-poi"
    ) {
      return session;
    }
  }
  return null;
}

export class CampusMapSceneDriver {
  private currentDepth = 0;
  private lastSheetRect: ScreenRect | null = null;
  private started = false;
  private suppressNextSheetReframe = false;
  private snapshot: CampusMapDriverSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly returnTargetsByDepth = new Map<
    number,
    CampusMapSession | null
  >();

  constructor(
    private readonly catalog: CampusMapSceneCatalog,
    private readonly ports: CampusMapSceneDriverPorts,
    initialSearch = ports.location.search(),
  ) {
    const decoded = decodeCampusMapUrl(initialSearch, catalog);
    this.snapshot = {
      session: decoded.session,
      returnTo: null,
      transitionToken: 0,
    };
    this.returnTargetsByDepth.set(0, null);
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.started) return this.snapshot;
    this.started = true;
    const metadata = decodeCampusMapHistoryMetadata(this.ports.history.state);
    this.currentDepth = metadata.depth;
    this.returnTargetsByDepth.set(this.currentDepth, this.snapshot.returnTo);
    this.ports.history.replaceState(
      encodeCampusMapHistoryMetadata(this.currentDepth),
      "",
      this.urlFor(this.snapshot.session),
    );
    return this.snapshot;
  }

  dispatch(intent: CampusMapDriverIntent) {
    if (intent.type === "NAVIGATE_BACK") return this.navigateBack();
    if (intent.type === "DISMISS") {
      const target = this.snapshot.returnTo ?? EMPTY_CAMPUS_MAP_SCENE_SESSION;
      return this.commitTransition({
        session: target,
        returnTo: null,
        commands: {
          history: "replace",
          camera: { kind: "cancel" },
          focus: this.dismissFocus(target),
          overlay: { kind: "close-external" },
        },
        syncSheet: true,
      });
    }
    if (intent.type === "FIT_CLUSTER") return this.fitCluster(intent.positions);
    if (intent.type === "REFRAME") return this.reframe(intent.reason);
    return this.applyKernelEvent(
      intent,
      returnTargetFor(this.snapshot.session, intent),
    );
  }

  restore(search: string, historyState: unknown) {
    const metadata = decodeCampusMapHistoryMetadata(historyState);
    this.currentDepth = metadata.depth;
    const decoded = decodeCampusMapUrl(search, this.catalog);
    const result = transitionCampusMapSession(
      this.snapshot.session,
      { type: "RESTORE", session: decoded.session },
      this.catalog,
    );
    const returnTo = this.returnTargetsByDepth.get(this.currentDepth) ?? null;
    return this.commitTransition({
      session: result.session,
      returnTo,
      commands: result.commands,
      syncSheet: true,
    });
  }

  interruptCamera() {
    this.bumpToken();
    const context = this.effectContext();
    this.ports.camera({ kind: "cancel" }, context);
  }

  updateSheetGeometry(nextRect: ScreenRect | null) {
    const previousRect = this.lastSheetRect;
    this.lastSheetRect = nextRect;
    if (this.suppressNextSheetReframe) {
      this.suppressNextSheetReframe = false;
      return this.snapshot;
    }
    if (
      !previousRect ||
      !nextRect ||
      (previousRect.top === nextRect.top &&
        previousRect.right === nextRect.right &&
        previousRect.bottom === nextRect.bottom &&
        previousRect.left === nextRect.left)
    ) {
      return this.snapshot;
    }
    return this.reframe("sheet-layout");
  }

  private applyKernelEvent(
    event: CampusMapEvent,
    nextReturnTo: CampusMapSession | null | undefined,
  ) {
    const result = transitionCampusMapSession(
      this.snapshot.session,
      event,
      this.catalog,
    );
    if (result.status === "rejected") return result;
    if (
      result.commands.history === null &&
      result.commands.camera === null &&
      result.commands.focus === null &&
      result.commands.overlay === null
    ) {
      return result;
    }
    return this.commitTransition({
      session: result.session,
      returnTo:
        nextReturnTo === undefined ? this.snapshot.returnTo : nextReturnTo,
      commands: result.commands,
      syncSheet: result.session !== this.snapshot.session,
    });
  }

  private navigateBack() {
    this.bumpToken();
    if (this.currentDepth > 0) {
      this.ports.history.back();
      return { status: "travelled" as const };
    }

    const fallback = this.fallbackFor(this.snapshot.session);
    return this.commitTransition({
      session: fallback,
      returnTo: null,
      commands: {
        history: "back-or-push",
        camera: { kind: "cancel" },
        focus:
          fallback.mode === "browse" && fallback.scene.kind === "building"
            ? { kind: "heading" }
            : { kind: "map" },
        overlay: { kind: "close-external" },
      },
      syncSheet: true,
      bumpToken: false,
    });
  }

  private fallbackFor(session: CampusMapSession): CampusMapSession {
    const resolved = resolveCampusMapSessionSemantics(session, this.catalog);
    if (
      resolved.status === "valid" &&
      session.mode === "browse" &&
      (session.scene.kind === "facility" || session.scene.kind === "content") &&
      resolved.context
    ) {
      return {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: resolved.context.buildingId,
          floorId: resolved.context.floorId,
          snap: "peek",
        },
      };
    }
    return EMPTY_CAMPUS_MAP_SCENE_SESSION;
  }

  private reframe(reason: CameraReason) {
    const resolved = resolveCampusMapSessionSemantics(
      this.snapshot.session,
      this.catalog,
    );
    this.bumpToken();
    if (resolved.status === "valid" && resolved.buildingId) {
      this.ports.camera(
        { kind: "focus", buildingId: resolved.buildingId, reason },
        this.effectContext(),
      );
    }
    return this.snapshot;
  }

  private fitCluster(
    positions: ReadonlyArray<readonly [longitude: number, latitude: number]>,
  ) {
    if (positions.length === 0) return this.snapshot;
    this.bumpToken();
    this.ports.camera({ kind: "fit", positions }, this.effectContext());
    return this.snapshot;
  }

  private dismissFocus(target: CampusMapSession): CampusMapDriverFocusCommand {
    const current = this.snapshot.session;
    if (current.mode === "browse" && target.mode === "browse") {
      const resultId =
        current.scene.kind === "building"
          ? current.scene.buildingId
          : current.scene.kind === "facility"
            ? current.scene.facilityId
            : current.scene.kind === "content"
              ? current.scene.contentId
              : null;
      if (
        resultId &&
        (target.scene.kind === "search-results" ||
          target.scene.kind === "category-results" ||
          target.scene.kind === "building")
      ) {
        return { kind: "result", resultId };
      }
    }
    const resolved = resolveCampusMapSessionSemantics(target, this.catalog);
    return resolved.status === "valid" ? resolved.focus : { kind: "map" };
  }

  private commitTransition({
    session,
    returnTo,
    commands: { history, camera, focus, overlay },
    syncSheet,
    bumpToken = true,
  }: CampusMapDriverCommit) {
    if (bumpToken) this.bumpToken();
    if (history === "back-or-push" && this.currentDepth > 0) {
      this.ports.history.back();
      return { status: "travelled" as const };
    }

    const nextDepth =
      history === "push" || history === "back-or-push"
        ? this.currentDepth + 1
        : this.currentDepth;
    this.currentDepth = nextDepth;
    this.snapshot = {
      session,
      returnTo,
      transitionToken: this.snapshot.transitionToken,
    };
    this.returnTargetsByDepth.set(nextDepth, returnTo);

    if (history === "push" || history === "back-or-push") {
      this.ports.history.pushState(
        encodeCampusMapHistoryMetadata(nextDepth),
        "",
        this.urlFor(session),
      );
    } else if (history === "replace") {
      this.ports.history.replaceState(
        encodeCampusMapHistoryMetadata(nextDepth),
        "",
        this.urlFor(session),
      );
    }

    for (const listener of this.listeners) listener();
    const context = this.effectContext();
    if (syncSheet && camera?.kind === "focus") {
      this.suppressNextSheetReframe = true;
    }
    if (camera) this.ports.camera(camera, context);
    if (focus) this.ports.focus(focus, context);
    if (overlay) this.ports.overlay(overlay, context);
    if (syncSheet) this.ports.sheet(sheetCommand(session), context);
    return { status: "committed" as const, snapshot: this.snapshot };
  }

  private bumpToken() {
    this.snapshot = {
      ...this.snapshot,
      transitionToken: this.snapshot.transitionToken + 1,
    };
  }

  private effectContext(): CampusMapDriverEffectContext {
    const token = this.snapshot.transitionToken;
    return {
      token,
      isCurrent: () => this.snapshot.transitionToken === token,
    };
  }

  private urlFor(session: CampusMapSession) {
    const search = encodeCampusMapUrl(session, this.catalog).toString();
    return `${this.ports.location.pathname()}?${search}`;
  }
}
