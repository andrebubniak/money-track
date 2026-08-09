import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite 8 resolves tsconfig `paths` natively. Do not add
  // `vite-tsconfig-paths` — Vite warns that the plugin is redundant.
  resolve: { tsconfigPaths: true },
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
