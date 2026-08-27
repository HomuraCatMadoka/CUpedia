import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CampusMapPrototypePage({
  searchParams,
}: PageProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  redirect(`/campus-map${params.size ? `?${params.toString()}` : ""}`);
}
