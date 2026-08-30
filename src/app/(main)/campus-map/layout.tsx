import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth-guard";

export default async function CampusMapLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await requireAuth();
  return children;
}
