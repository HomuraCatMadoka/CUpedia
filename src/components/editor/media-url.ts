import { parseVideoUrl } from "@platejs/media";
import { KEYS } from "platejs";

export function buildMediaUrlNode(nodeType: string, url: string) {
  const video = nodeType === KEYS.video ? parseVideoUrl(url) : undefined;

  if (video) {
    return {
      ...video,
      children: [{ text: "" }],
      type: KEYS.mediaEmbed,
    };
  }

  return {
    children: [{ text: "" }],
    name: nodeType === KEYS.file ? url.split("/").pop() : undefined,
    type: nodeType,
    url,
  };
}
