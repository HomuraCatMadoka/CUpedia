type ScheduleSettlement = (callback: () => void) => () => void;

function scheduleAfterProviderEvents(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    const frame = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frame);
  }
  const timeout = setTimeout(callback, 0);
  return () => clearTimeout(timeout);
}

type ActiveGesture = {
  providerClaimed: boolean;
  pendingMapAction: (() => void) | null;
  cancelSettlement: (() => void) | null;
};

/**
 * Owns product-command arbitration for one AMap pointer cycle. Provider targets
 * execute immediately; a background map click settles after sibling provider
 * events have had a chance to claim the cycle. Callers never execute a product
 * command unless this module accepts it.
 */
export class AmapInteractionAdapter {
  private activeGesture: ActiveGesture | null = null;

  constructor(
    private readonly scheduleSettlement: ScheduleSettlement = scheduleAfterProviderEvents,
  ) {}

  beginPointerGesture() {
    this.settlePendingMapAction();
    this.activeGesture = {
      providerClaimed: false,
      pendingMapAction: null,
      cancelSettlement: null,
    };
  }

  dispatchProviderTarget(action: () => void) {
    if (!this.activeGesture) this.beginPointerGesture();
    const gesture = this.activeGesture!;
    if (gesture.providerClaimed) return false;
    gesture.providerClaimed = true;
    gesture.cancelSettlement?.();
    gesture.cancelSettlement = null;
    gesture.pendingMapAction = null;
    action();
    return true;
  }

  dispatchMapClick(action: () => void) {
    if (!this.activeGesture) this.beginPointerGesture();
    const gesture = this.activeGesture!;
    if (gesture.providerClaimed) {
      this.activeGesture = null;
      return false;
    }
    if (gesture.pendingMapAction) return false;
    gesture.pendingMapAction = action;
    gesture.cancelSettlement = this.scheduleSettlement(() => {
      if (this.activeGesture !== gesture || gesture.providerClaimed) return;
      gesture.pendingMapAction = null;
      gesture.cancelSettlement = null;
      this.activeGesture = null;
      action();
    });
    return true;
  }

  reset() {
    this.activeGesture?.cancelSettlement?.();
    this.activeGesture = null;
  }

  private settlePendingMapAction() {
    const gesture = this.activeGesture;
    if (!gesture?.pendingMapAction || gesture.providerClaimed) {
      gesture?.cancelSettlement?.();
      this.activeGesture = null;
      return;
    }
    const action = gesture.pendingMapAction;
    gesture.cancelSettlement?.();
    this.activeGesture = null;
    action();
  }
}

type AmapHotspot = {
  id?: string;
  name?: string;
  lnglat: { lng: number; lat: number };
};

type AmapHotspotLink = {
  buildingId: string;
  providerPoiIds: readonly string[];
  providerNames: readonly string[];
};

export type AmapHotspotTarget =
  | { kind: "building"; buildingId: string }
  | {
      kind: "external";
      providerId: string;
      name: string;
      position: readonly [number, number];
    };

function normalizedProviderName(value = "") {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Resolves only authoritative POI ids or exact normalized aliases. Nearby or
 * partial provider labels remain external instead of being silently upgraded
 * to a CUpedia building.
 */
export function resolveAmapHotspotTarget(
  hotspot: AmapHotspot,
  links: readonly AmapHotspotLink[],
): AmapHotspotTarget {
  const idMatch = hotspot.id
    ? links.find((link) => link.providerPoiIds.includes(hotspot.id!))
    : undefined;
  if (idMatch) return { kind: "building", buildingId: idMatch.buildingId };

  const exactName = normalizedProviderName(hotspot.name);
  const nameMatch = exactName
    ? links.find((link) =>
        link.providerNames.some(
          (candidate) => normalizedProviderName(candidate) === exactName,
        ),
      )
    : undefined;
  if (nameMatch) return { kind: "building", buildingId: nameMatch.buildingId };

  return {
    kind: "external",
    providerId: hotspot.id ?? `${hotspot.lnglat.lng},${hotspot.lnglat.lat}`,
    name: hotspot.name?.trim() || "高德地图地点",
    position: [hotspot.lnglat.lng, hotspot.lnglat.lat],
  };
}
