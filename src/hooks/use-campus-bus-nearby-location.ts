"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LngLat } from "@/lib/campus-transport/campus-bus";

export type CampusBusNearbyLocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { location: LngLat; status: "ready" }
  | { status: "denied" }
  | { status: "timeout" }
  | { status: "unavailable" }
  | { status: "unsupported" };

const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60_000,
  timeout: 8_000,
};

export function useCampusBusNearbyLocation() {
  const [state, setState] = useState<CampusBusNearbyLocationState>({
    status: "idle",
  });
  const [permissionHint, setPermissionHint] = useState<PermissionState | null>(
    null,
  );
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let permissionStatus: PermissionStatus | null = null;
    function updatePermissionHint() {
      if (permissionStatus) setPermissionHint(permissionStatus.state);
    }
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (!mountedRef.current) return;
          permissionStatus = status;
          updatePermissionHint();
          status.addEventListener("change", updatePermissionHint);
        })
        .catch(() => {
          // Permissions is only a hint; Geolocation callbacks remain authoritative.
        });
    }

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      permissionStatus?.removeEventListener("change", updatePermissionHint);
    };
  }, []);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "unsupported" });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setState({
          location: [position.coords.longitude, position.coords.latitude],
          status: "ready",
        });
      },
      (error) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        if (error.code === error.PERMISSION_DENIED) {
          setState({ status: "denied" });
        } else if (error.code === error.TIMEOUT) {
          setState({ status: "timeout" });
        } else {
          setState({ status: "unavailable" });
        }
      },
      LOCATION_OPTIONS,
    );
  }, []);

  const cancelRequest = useCallback(() => {
    requestIdRef.current += 1;
    setState((current) =>
      current.status === "requesting" ? { status: "idle" } : current,
    );
  }, []);

  return { cancelRequest, permissionHint, requestLocation, state };
}
