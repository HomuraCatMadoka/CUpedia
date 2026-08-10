"use client";

import dynamic from "next/dynamic";
import type { WikiEditorProps } from "@/components/wiki/wiki-editor";

const loadWikiEditor = () => import("@/components/wiki/wiki-editor");

const LazyWikiEditor = dynamic(() =>
  loadWikiEditor().then((module) => module.WikiEditor),
);

export function preloadWikiEditor() {
  void loadWikiEditor();
}

export function WikiEditorLazy(props: WikiEditorProps) {
  const identity = `${props.userId ?? ""}:${props.pageId ?? ""}:${props.draftMode ? "draft" : "page"}`;
  return <LazyWikiEditor key={identity} {...props} />;
}
