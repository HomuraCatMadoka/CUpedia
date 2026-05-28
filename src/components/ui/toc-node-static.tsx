import type { SlateElementProps } from "platejs/static";

import { SlateElement } from "platejs/static";

export function TocElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props}>
      <div className="my-4 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        [目录]
      </div>
      {props.children}
    </SlateElement>
  );
}
