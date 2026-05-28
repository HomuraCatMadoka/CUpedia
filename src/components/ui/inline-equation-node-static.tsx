import type { TEquationElement } from "platejs";
import type { SlateElementProps } from "platejs/static";

import { getEquationHtml } from "@platejs/math";
import { SlateElement } from "platejs/static";

export function InlineEquationElementStatic(
  props: SlateElementProps<TEquationElement>,
) {
  const { element } = props;
  const html = element.texExpression
    ? getEquationHtml({
        element,
        options: { displayMode: false, throwOnError: false },
      })
    : "";

  return (
    <SlateElement {...props} as="span">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {props.children}
    </SlateElement>
  );
}
