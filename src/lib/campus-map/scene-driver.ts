import type { CameraReason } from "./camera-policy";
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
  type CampusMapSession,
} from "./scene-kernel";
import { resolveCampusMapSessionSemantics } from "./scene-semantics";
import type {
  CampusMapCameraCommand,
  CampusMapOverlayCommand,
  CampusMapSessionTransition,
} from "./map-session";

export type CampusMapDriverIntent =
  | CampusMapEvent
  | { type: "NAVIGATE_BACK" }
  | { type: "DISMISS"; source: "close" | "escape" | "map" }
  | { type: "REFRAME"; reason: CameraReason };

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
    command: CampusMapCameraCommand,
    context: CampusMapDriverEffectContext,
  ): void;
  focus(
    command: CampusMapFocusCommand,
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

type HistoryCommand = CampusMapSessionTransition["history"] | null;

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
  private started = false;
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
    initialReturnTo: CampusMapSession | null = null,
  ) {
    const decoded = decodeCampusMapUrl(initialSearch, catalog);
    this.snapshot = {
      session: decoded.session,
      returnTo: initialReturnTo,
      transitionToken: 0,
    };
    this.returnTargetsByDepth.set(0, initialReturnTo);
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
      return this.accept(
        target,
        null,
        "replace",
        { kind: "cancel" },
        { kind: "map" },
        { kind: "close-external" },
        true,
      );
    }
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
    return this.accept(
      result.session,
      returnTo,
      null,
      result.commands.camera,
      result.commands.focus,
      result.commands.overlay,
      true,
    );
  }

  interruptCamera() {
    this.bumpToken();
    const context = this.effectContext();
    this.ports.camera({ kind: "cancel" }, context);
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
    return this.accept(
      result.session,
      nextReturnTo === undefined ? this.snapshot.returnTo : nextReturnTo,
      result.commands.history,
      result.commands.camera,
      result.commands.focus,
      result.commands.overlay,
      result.session !== this.snapshot.session,
    );
  }

  private navigateBack() {
    this.bumpToken();
    if (this.currentDepth > 0) {
      this.ports.camera({ kind: "cancel" }, this.effectContext());
      this.ports.history.back();
      return { status: "travelled" as const };
    }

    const fallback = this.fallbackFor(this.snapshot.session);
    return this.accept(
      fallback,
      null,
      "back-or-push",
      { kind: "cancel" },
      fallback.mode === "browse" && fallback.scene.kind === "building"
        ? { kind: "heading" }
        : { kind: "map" },
      { kind: "close-external" },
      true,
      false,
    );
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

  private accept(
    session: CampusMapSession,
    returnTo: CampusMapSession | null,
    history: HistoryCommand,
    camera: CampusMapCameraCommand | null,
    focus: CampusMapFocusCommand | null,
    overlay: CampusMapOverlayCommand | null,
    syncSheet: boolean,
    bumpToken = true,
  ) {
    if (bumpToken) this.bumpToken();
    if (history === "back-or-push" && this.currentDepth > 0) {
      this.ports.camera({ kind: "cancel" }, this.effectContext());
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
