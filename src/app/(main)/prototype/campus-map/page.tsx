import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AmapCampusPrototype } from "@/components/campus-map/amap-campus-prototype";
import { requireAuth } from "@/lib/auth-guard";
import { loadCampusMapBrowseProjection } from "@/lib/campus-map/browse-actions";
import { EMPTY_CAMPUS_MAP_BROWSE_PROJECTION } from "@/lib/campus-map/browse-projection";
import { getCampusMapFactSchema } from "@/lib/campus-map/fact-store";

export const metadata: Metadata = {
  title: "Campus Map 高德交互原型",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CampusMapPrototypePage({
  searchParams,
}: PageProps) {
  if (process.env.NODE_ENV === "production" && process.env.E2E_TEST !== "1") {
    notFound();
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  const callbackUrl = `/prototype/campus-map${params.size ? `?${params.toString()}` : ""}`;
  await requireAuth(callbackUrl);
  const [factSchema, browseProjection] = await Promise.all([
    getCampusMapFactSchema().catch(() => null),
    loadCampusMapBrowseProjection().catch(
      () => EMPTY_CAMPUS_MAP_BROWSE_PROJECTION,
    ),
  ]);
  return (
    <AmapCampusPrototype
      initialSearch={params.toString()}
      factSchema={factSchema}
      initialBrowseProjection={browseProjection}
    />
  );
}
