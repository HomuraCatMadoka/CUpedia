import type {
  CampusMapSession,
  CampusMapSessionTransition,
} from "./map-session";

export interface CampusMapHistoryPort {
  readonly state: unknown;
  back(): void;
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

interface CampusMapHistorySnapshot {
  campusMap: true;
  version: 1;
  depth: number;
  session: CampusMapSession;
}

type CampusMapHistoryEffect = CampusMapSessionTransition["history"];

function snapshot(value: unknown): CampusMapHistorySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CampusMapHistorySnapshot>;
  return candidate.campusMap === true &&
    candidate.version === 1 &&
    Number.isInteger(candidate.depth) &&
    candidate.session
    ? (candidate as CampusMapHistorySnapshot)
    : null;
}

/**
 * The only module allowed to decide whether a session transition writes or
 * travels browser history. A semantic Back action travels when an in-app
 * predecessor exists and commits a reversible fallback for direct deep links.
 */
export class CampusMapBrowserHistory {
  private currentDepth = 0;

  constructor(
    private readonly port: CampusMapHistoryPort,
    private readonly urlFor: (session: CampusMapSession) => string,
  ) {}

  get depth() {
    return this.currentDepth;
  }

  initialize(fallback: CampusMapSession) {
    const restored = this.read(fallback);
    this.replace(restored);
    return restored;
  }

  restore(fallback: CampusMapSession) {
    return this.read(fallback);
  }

  commit(session: CampusMapSession, effect: CampusMapHistoryEffect) {
    if (effect === "none") return "committed" as const;
    if (effect === "back-or-push" && this.currentDepth > 0) {
      this.port.back();
      return "travelled" as const;
    }

    const write = effect === "back-or-push" ? "push" : effect;
    if (write === "push") this.currentDepth += 1;
    const value = this.value(session);
    if (write === "push") {
      this.port.pushState(value, "", this.urlFor(session));
    } else {
      this.port.replaceState(value, "", this.urlFor(session));
    }
    return "committed" as const;
  }

  private read(fallback: CampusMapSession) {
    const saved = snapshot(this.port.state);
    this.currentDepth = saved?.depth ?? 0;
    return saved?.session ?? fallback;
  }

  private replace(session: CampusMapSession) {
    this.port.replaceState(this.value(session), "", this.urlFor(session));
  }

  private value(session: CampusMapSession): CampusMapHistorySnapshot {
    return {
      campusMap: true,
      version: 1,
      depth: this.currentDepth,
      session,
    };
  }
}
