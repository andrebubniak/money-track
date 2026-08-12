import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite 8 resolves tsconfig `paths` natively. Do not add
  // `vite-tsconfig-paths` — Vite warns that the plugin is redundant.
  resolve: { tsconfigPaths: true },
  // next-intl's middleware entrypoint is plain ESM importing bare
  // `next/server`. Next 16's package.json has no `exports` map, so Node's
  // native ESM resolver (which Vitest otherwise defers to for node_modules
  // code) refuses it without a file extension. Routing next-intl through
  // Vite's own resolver — which still does extension probing — sidesteps
  // that gap; it's the module needing this, not our code.
  ssr: { noExternal: ["next-intl"] },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Only co-located specs under src. e2e/ belongs to Playwright, and if
    // Vitest picks those files up it will fail on Playwright's imports.
    include: ["src/**/*.spec.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "src/generated/**"],
  },
});
