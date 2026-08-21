import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OpenEditUiPrototype } from "@/components/campus-map/open-edit-ui-prototype";

export const metadata: Metadata = {
  title: "PROTOTYPE — Campus Map 开放编辑",
  robots: { index: false, follow: false },
};

export default function CampusMapOpenEditPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OpenEditUiPrototype />;
}
