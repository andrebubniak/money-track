import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
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
