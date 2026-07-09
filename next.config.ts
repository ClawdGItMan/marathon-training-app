import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode indicator portal intercepts pointer events in Playwright,
  // causing flaky clicks on elements it overlaps (see tests/e2e/nav.spec.ts).
  ...(process.env.PLAYWRIGHT_TEST === "1" ? { devIndicators: false } : {}),
};

export default nextConfig;
