import * as React from "react";
import { Tweet } from "react-tweet";

import type {
  TCaptionElement,
  TMediaEmbedElement,
  TResizableProps,
} from "platejs";
import type { SlateElementProps } from "platejs/static";

import { parseTwitterUrl, parseVideoUrl } from "@platejs/media";
import { NodeApi } from "platejs";
import { SlateElement } from "platejs/static";

import { cn } from "@/lib/utils";

export function MediaEmbedElementStatic(
  props: SlateElementProps<
    TMediaEmbedElement & TCaptionElement & TResizableProps
  >,
) {
  const { align = "center", caption, url, width } = props.element;
  const tweet = url ? parseTwitterUrl(url) : undefined;
  const video = !tweet && url ? parseVideoUrl(url) : undefined;
  const provider = video?.provider;

  return (
    <SlateElement className="py-2.5" {...props}>
      <div style={{ textAlign: align }}>
        <figure
          className="group relative m-0 inline-block w-full cursor-default"
          style={{ width: tweet?.id ? undefined : width }}
        >
          {video?.url && (
            <div
              className={cn(
                "relative h-0",
                provider === "vimeo" && "pb-[75%]",
                provider === "youku" && "pb-[56.25%]",
                provider === "dailymotion" && "pb-[56.0417%]",
                provider === "coub" && "pb-[51.25%]",
                (!provider || provider === "youtube") && "pb-[56.25%]",
              )}
            >
              <iframe
                className="absolute inset-0 size-full rounded-sm border-0"
                title="embed"
                src={video.url}
                allowFullScreen
              />
            </div>
          )}

          {tweet?.id && (
            <div className="[&_.react-tweet-theme]:my-0">
              <Tweet id={tweet.id} />
            </div>
          )}

          {caption && <figcaption>{NodeApi.string(caption[0])}</figcaption>}
        </figure>
      </div>
      {props.children}
    </SlateElement>
  );
}
