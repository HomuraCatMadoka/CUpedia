export type CampusBusNearbyPlaceSnapshot = {
  distanceMeters: number;
  placeId: string;
};

export type CampusBusBoardingPlaceSession = {
  nearbyPlaces: CampusBusNearbyPlaceSnapshot[] | null;
  selectedPlaceId: string | null;
};

const EMPTY_SESSION: CampusBusBoardingPlaceSession = {
  nearbyPlaces: null,
  selectedPlaceId: null,
};

let session = EMPTY_SESSION;
const listeners = new Set<() => void>();

export function subscribeToCampusBusBoardingPlaceSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCampusBusBoardingPlaceSession() {
  return session;
}

export function getServerCampusBusBoardingPlaceSession() {
  return EMPTY_SESSION;
}

function updateSession(nextSession: CampusBusBoardingPlaceSession) {
  session = nextSession;
  listeners.forEach((listener) => listener());
}

export function rememberCampusBusNearbyPlaces(
  nearbyPlaces: CampusBusNearbyPlaceSnapshot[] | null,
) {
  updateSession({ ...session, nearbyPlaces });
}

export function rememberCampusBusSelectedPlace(selectedPlaceId: string | null) {
  updateSession({ ...session, selectedPlaceId });
}

export function resetCampusBusBoardingPlaceSession() {
  updateSession(EMPTY_SESSION);
}
