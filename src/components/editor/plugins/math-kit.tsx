"use client";

import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react";
import { MathRules } from "@platejs/math";

import { EquationElement } from "@/components/ui/equation-node";
import { InlineEquationElement } from "@/components/ui/inline-equation-node";

export const MathKit = [
  EquationPlugin.configure({
    node: { component: EquationElement },
    inputRules: [MathRules.markdown({ variant: "$$", on: "match" })],
  }),
  InlineEquationPlugin.configure({
    node: { component: InlineEquationElement },
    inputRules: [MathRules.markdown({ variant: "$" })],
  }),
];
