import type { Metadata } from "next";

import { CampusMapRuntime } from "@/components/campus-map/campus-map-runtime";
import { requireAuth } from "@/lib/auth-guard";
import { loadCampusMapBrowseProjection } from "@/lib/campus-map/browse-actions";
import { EMPTY_CAMPUS_MAP_BROWSE_PROJECTION } from "@/lib/campus-map/browse-projection";
import { getCampusMapFactSchema } from "@/lib/campus-map/fact-store";

export const metadata: Metadata = {
  title: "Campus Map",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function encodeSearchParams(
  values: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  return params;
}

export default async function CampusMapPage({ searchParams }: PageProps) {
  const params = encodeSearchParams(await searchParams);
  const callbackUrl = `/campus-map${params.size ? `?${params.toString()}` : ""}`;
  await requireAuth(callbackUrl);
  const [factSchema, browseProjection] = await Promise.all([
    getCampusMapFactSchema().catch(() => null),
    loadCampusMapBrowseProjection().catch(
      () => EMPTY_CAMPUS_MAP_BROWSE_PROJECTION,
    ),
  ]);
  return (
    <CampusMapRuntime
      initialSearch={params.toString()}
      factSchema={factSchema}
      initialBrowseProjection={browseProjection}
    />
  );
}
