import { common, createLowlight } from "lowlight";

export const codeBlockLowlight = createLowlight(common);

export function isCodeBlockLanguageSupported(language: string) {
  return language === "auto" || codeBlockLowlight.registered(language);
}
