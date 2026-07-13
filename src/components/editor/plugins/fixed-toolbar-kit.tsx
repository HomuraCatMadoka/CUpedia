"use client";

import { createPlatePlugin } from "platejs/react";

import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { FixedToolbarButtons } from "@/components/ui/fixed-toolbar-buttons";

// Mirror of the Plate playground template: the always-on toolbar is a plugin
// that renders `beforeEditable`, so it sits above the editable surface and
// stays visible regardless of selection. It composes with FloatingToolbarKit
// (which renders `afterEditable` on selection) rather than replacing it.
export const FixedToolbarKit = [
  createPlatePlugin({
    key: "fixed-toolbar",
    render: {
      beforeEditable: () => (
        <FixedToolbar>
          <FixedToolbarButtons />
        </FixedToolbar>
      ),
    },
  }),
];
