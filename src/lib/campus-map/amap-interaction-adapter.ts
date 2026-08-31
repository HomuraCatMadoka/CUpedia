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
  cancelExpiry: (() => void) | null;
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
      cancelExpiry: null,
      cancelSettlement: null,
    };
  }

  endPointerGesture() {
    const gesture = this.activeGesture;
    if (!gesture || gesture.providerClaimed || gesture.pendingMapAction) return;
    this.cancelExpiry(gesture);
    gesture.cancelExpiry = this.scheduleSettlement(() => {
      if (this.activeGesture === gesture && !gesture.pendingMapAction) {
        this.activeGesture = null;
      }
      gesture.cancelExpiry = null;
    });
  }

  dispatchProviderTarget(action: () => void) {
    const gesture = this.activeGesture;
    if (!gesture) return false;
    if (gesture.providerClaimed) return false;
    gesture.providerClaimed = true;
    this.cancelExpiry(gesture);
    this.cancelSettlement(gesture);
    gesture.pendingMapAction = null;
    action();
    return true;
  }

  dispatchMapClick(action: () => void) {
    if (!this.activeGesture) this.beginPointerGesture();
    const gesture = this.activeGesture!;
    this.cancelExpiry(gesture);
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
    if (this.activeGesture) {
      this.cancelExpiry(this.activeGesture);
      this.cancelSettlement(this.activeGesture);
    }
    this.activeGesture = null;
  }

  private settlePendingMapAction() {
    const gesture = this.activeGesture;
    if (!gesture?.pendingMapAction || gesture.providerClaimed) {
      if (gesture) {
        this.cancelExpiry(gesture);
        this.cancelSettlement(gesture);
      }
      this.activeGesture = null;
      return;
    }
    const action = gesture.pendingMapAction;
    this.cancelExpiry(gesture);
    this.cancelSettlement(gesture);
    this.activeGesture = null;
    action();
  }

  private cancelExpiry(gesture: ActiveGesture) {
    gesture.cancelExpiry?.();
    gesture.cancelExpiry = null;
  }

  private cancelSettlement(gesture: ActiveGesture) {
    gesture.cancelSettlement?.();
    gesture.cancelSettlement = null;
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
};

export type AmapHotspotTarget =
  | { kind: "building"; buildingId: string }
  | {
      kind: "external";
      providerId: string;
      name: string;
      position: readonly [number, number];
    };

/**
 * Resolves only explicitly linked POI ids. Provider names and proximity are
 * never enough to upgrade a transient provider object to a CUpedia entity.
 */
export function resolveAmapHotspotTarget(
  hotspot: AmapHotspot,
  links: readonly AmapHotspotLink[],
): AmapHotspotTarget {
  const idMatch = hotspot.id
    ? links.find((link) => link.providerPoiIds.includes(hotspot.id!))
    : undefined;
  if (idMatch) return { kind: "building", buildingId: idMatch.buildingId };

  return {
    kind: "external",
    providerId: hotspot.id ?? `${hotspot.lnglat.lng},${hotspot.lnglat.lat}`,
    name: hotspot.name?.trim() || "高德地图地点",
    position: [hotspot.lnglat.lng, hotspot.lnglat.lat],
  };
}
