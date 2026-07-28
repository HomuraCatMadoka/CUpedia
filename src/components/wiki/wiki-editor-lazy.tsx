"use client";

import dynamic from "next/dynamic";
import type { WikiEditorProps } from "@/components/wiki/wiki-editor";

const LazyWikiEditor = dynamic(() =>
  import("@/components/wiki/wiki-editor").then((module) => module.WikiEditor),
);

export function WikiEditorLazy(props: WikiEditorProps) {
  return <LazyWikiEditor {...props} />;
}
