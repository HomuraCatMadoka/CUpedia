import type { TEquationElement } from "platejs";
import type { SlateElementProps } from "platejs/static";

import { getEquationHtml } from "@platejs/math";
import { SlateElement } from "platejs/static";

export function EquationElementStatic(
  props: SlateElementProps<TEquationElement>,
) {
  const { element } = props;
  const html = element.texExpression
    ? getEquationHtml({
        element,
        options: { displayMode: true, throwOnError: false },
      })
    : "";

  return (
    <SlateElement {...props}>
      <div
        className="my-2 text-center"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {props.children}
    </SlateElement>
  );
}
