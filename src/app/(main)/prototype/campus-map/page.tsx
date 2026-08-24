import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AmapCampusPrototype } from "@/components/campus-map/amap-campus-prototype";
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
  if (process.env.NODE_ENV === "production") notFound();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  const factSchema = await getCampusMapFactSchema().catch(() => null);
  return (
    <AmapCampusPrototype
      initialSearch={params.toString()}
      factSchema={factSchema}
    />
  );
}
