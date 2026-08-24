import { localRepo } from "@/lib/data/local-repo";
import { supabaseRepo } from "@/lib/data/supabase-repo";
import { withOfflineCache } from "@/lib/data/offline-cache";
import type { Repo } from "@/lib/data/repo";

/**
 * Single data-access seam every screen imports. Env-selected so Phase-1
 * localStorage behavior and the Phase-2 Supabase-backed behavior are
 * interchangeable behind the same `Repo` interface (see
 * tests/parity/repo-parity.ts, which runs the same behavioral suite against
 * both). Only the supabase branch is wrapped in the offline read cache
 * (Task 5) — `localRepo` already persists to localStorage on its own terms
 * and has no network to fall back from.
 */
export const repo: Repo =
  process.env.NEXT_PUBLIC_REPO_MODE === "supabase" ? withOfflineCache(supabaseRepo) : localRepo;
