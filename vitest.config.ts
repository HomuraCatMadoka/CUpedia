import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    server: {
      deps: { inline: [/@platejs\/math/, /katex/, /react-tweet/] },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "katex/dist/katex.min.css": path.resolve(__dirname, "./tests/empty.css"),
    },
  },
});
