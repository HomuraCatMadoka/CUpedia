import { BaseEquationPlugin, BaseInlineEquationPlugin } from "@platejs/math";

import { EquationElementStatic } from "@/components/ui/equation-node-static";
import { InlineEquationElementStatic } from "@/components/ui/inline-equation-node-static";

export const MathBaseKit = [
  BaseEquationPlugin.withComponent(EquationElementStatic),
  BaseInlineEquationPlugin.withComponent(InlineEquationElementStatic),
];
