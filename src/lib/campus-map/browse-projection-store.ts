import type {
  CampusMapBrowsePlace,
  CampusMapBrowseProjection,
} from "./browse-projection";
import {
  createCampusMapSceneCatalog,
  RefreshableCampusMapSceneCatalog,
} from "./browse-scene-catalog";
import type { CampusMapSceneCatalog } from "./scene-kernel";

export interface CampusMapBrowseProjectionSnapshot {
  status: "ready" | "refreshing" | "error";
  projection: CampusMapBrowseProjection;
}

export type CampusMapBrowseRefreshResult =
  | {
      status: "applied";
      selectionTarget: CampusMapBrowsePlace["selectionTarget"] | null;
    }
  | { status: "superseded" }
  | { status: "failed" };

export class CampusMapBrowseProjectionStore {
  private requestVersion = 0;
  private snapshot: CampusMapBrowseProjectionSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly sceneCatalog: RefreshableCampusMapSceneCatalog;

  constructor(
    initialProjection: CampusMapBrowseProjection,
    private readonly loadProjection: () => Promise<CampusMapBrowseProjection>,
    categories: readonly string[] = [],
  ) {
    this.snapshot = { status: "ready", projection: initialProjection };
    this.sceneCatalog = new RefreshableCampusMapSceneCatalog(
      createCampusMapSceneCatalog(initialProjection, categories),
    );
  }

  getSnapshot = () => this.snapshot;

  getSceneCatalog = (): CampusMapSceneCatalog => this.sceneCatalog;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async refresh(receipt?: {
    placeId: string;
  }): Promise<CampusMapBrowseRefreshResult> {
    const requestVersion = ++this.requestVersion;
    this.update({ status: "refreshing", projection: this.snapshot.projection });
    try {
      const projection = await this.loadProjection();
      if (requestVersion !== this.requestVersion) {
        return { status: "superseded" };
      }
      this.sceneCatalog.replace(
        createCampusMapSceneCatalog(projection, this.sceneCatalog.categories),
      );
      this.update({ status: "ready", projection });
      const selectionTarget = receipt
        ? (projection.places.find((place) => place.placeId === receipt.placeId)
            ?.selectionTarget ?? null)
        : null;
      return { status: "applied", selectionTarget };
    } catch {
      if (requestVersion !== this.requestVersion) {
        return { status: "superseded" };
      }
      this.update({ status: "error", projection: this.snapshot.projection });
      return { status: "failed" };
    }
  }

  private update(snapshot: CampusMapBrowseProjectionSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
