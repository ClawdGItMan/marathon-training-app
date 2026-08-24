"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Client-side carrier for the server-detected "this session is the demo
 * account" flag (src/app/(tabs)/layout.tsx). Default false ⇒ every surface
 * outside the provider (local mode, sign-in, tests) renders exactly as
 * before — DemoBadge consumers need no gating of their own.
 */
const DemoContext = createContext(false);

export function DemoProvider({ isDemo, children }: { isDemo: boolean; children: ReactNode }) {
  return <DemoContext.Provider value={isDemo}>{children}</DemoContext.Provider>;
}

export function useIsDemo(): boolean {
  return useContext(DemoContext);
}
