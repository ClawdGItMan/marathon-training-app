import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Separate config for the Supabase-stack-backed tests (npm run test:supabase).
 * Kept apart from vitest.config.ts so the default `vitest run` never needs
 * the local stack: that config's `test.exclude` drops `*.supabase.test.ts`
 * entirely, and this one is the only place those files are included.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.supabase.test.{ts,tsx}"],
  },
});
