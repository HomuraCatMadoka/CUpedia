import type { ReactNode } from "react";
import { headers } from "next/headers";

import { requireAuth } from "@/lib/auth-guard";
import {
  CAMPUS_MAP_RETURN_PATH_HEADER,
  isPublicCampusMapPlaceDetailPath,
} from "@/lib/campus-map/auth-return-path";

export default async function CampusMapLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const callbackUrl = (await headers()).get(CAMPUS_MAP_RETURN_PATH_HEADER);
  if (!isPublicCampusMapPlaceDetailPath(callbackUrl)) {
    await requireAuth(callbackUrl ?? "/campus-map");
  }
  return children;
}
