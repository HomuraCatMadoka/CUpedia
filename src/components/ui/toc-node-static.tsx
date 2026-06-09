import type { SlateElementProps } from "platejs/static";

import { ListTreeIcon } from "lucide-react";
import { SlateElement } from "platejs/static";

import { cn } from "@/lib/utils";

type HeadingNode = {
  type?: string;
  id?: string;
  text?: string;
  children?: HeadingNode[];
};

function nodeText(node: HeadingNode): string {
  if (typeof node.text === "string") return node.text;
  if (!node.children) return "";
  return node.children.map(nodeText).join("");
}

// Anchor targets in the static read view are the backfilled node ids that
// HeadingElementStatic renders as `<span id={element.id} />` — slugs only exist
// in the editable view. Collecting from the same editor instance keeps these
// hrefs in sync with the rendered headings within a render (#148).
export function TocElementStatic(props: SlateElementProps) {
  const headings = (props.editor.children as HeadingNode[])
    .filter((n) => n.type === "h2" || n.type === "h3")
    .map((n) => ({ id: n.id, text: nodeText(n).trim(), level: n.type }))
    .filter((h): h is { id: string; text: string; level: string } =>
      Boolean(h.id && h.text),
    );

  return (
    <SlateElement {...props}>
      {headings.length > 0 && (
        <div className="my-4 rounded-lg border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <ListTreeIcon className="size-4" />
            目录
          </div>
          <ul className="space-y-0.5">
            {headings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  className={cn(
                    "block rounded px-2 py-0.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground",
                    h.level === "h3" && "pl-6",
                  )}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {props.children}
    </SlateElement>
  );
}
