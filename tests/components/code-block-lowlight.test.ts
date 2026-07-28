import { describe, expect, it } from "vitest";

import { isCodeBlockLanguageSupported } from "@/components/editor/code-block-lowlight";

describe("code block language support", () => {
  it("offers common languages and their aliases", () => {
    expect(isCodeBlockLanguageSupported("auto")).toBe(true);
    expect(isCodeBlockLanguageSupported("typescript")).toBe(true);
    expect(isCodeBlockLanguageSupported("html")).toBe(true);
  });

  it("does not offer grammars that are not bundled", () => {
    expect(isCodeBlockLanguageSupported("abap")).toBe(false);
  });
});
