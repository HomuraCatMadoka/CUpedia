"use client";

import * as React from "react";

import type { TResizableProps, TVideoElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useDraggable } from "@platejs/dnd";
import { useMediaState } from "@platejs/media/react";
import { ResizableProvider, useResizableValue } from "@platejs/resizable";
import { PlateElement, useEditorMounted, withHOC } from "platejs/react";

import { cn } from "@/lib/utils";

import { Caption, CaptionTextarea } from "./caption";
import {
  mediaResizeHandleVariants,
  Resizable,
  ResizeHandle,
} from "./resize-handle";

export const VideoElement = withHOC(
  ResizableProvider,
  function VideoElement(
    props: PlateElementProps<TVideoElement & TResizableProps>,
  ) {
    const { align = "center", readOnly, unsafeUrl } = useMediaState();
    const width = useResizableValue("width");
    const isEditorMounted = useEditorMounted();
    const { isDragging, handleRef } = useDraggable({
      element: props.element,
    });

    return (
      <PlateElement className="py-2.5" {...props}>
        <figure className="relative m-0 cursor-default" contentEditable={false}>
          <Resizable
            className={cn(isDragging && "opacity-50")}
            align={align}
            options={{
              align,
              maxWidth: "100%",
              minWidth: 100,
              readOnly,
            }}
          >
            <div className="group/media">
              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: "left" })}
                options={{ direction: "left" }}
              />

              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: "right" })}
                options={{ direction: "right" }}
              />

              {isEditorMounted && (
                <div ref={handleRef}>
                  <video
                    className="w-full max-w-full rounded-sm object-cover px-0"
                    src={unsafeUrl}
                    controls
                  />
                </div>
              )}
            </div>
          </Resizable>

          <Caption style={{ width }} align={align}>
            <CaptionTextarea
              readOnly={readOnly}
              placeholder="Write a caption..."
            />
          </Caption>
        </figure>
        {props.children}
      </PlateElement>
    );
  },
);
