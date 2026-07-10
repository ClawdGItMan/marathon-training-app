import { localRepo } from "@/lib/data/local-repo";
import { supabaseRepo } from "@/lib/data/supabase-repo";
import type { Repo } from "@/lib/data/repo";

/**
 * Single data-access seam every screen imports. Env-selected so Phase-1
 * localStorage behavior and the Phase-2 Supabase-backed behavior are
 * interchangeable behind the same `Repo` interface (see
 * tests/parity/repo-parity.ts, which runs the same behavioral suite against
 * both).
 */
export const repo: Repo = process.env.NEXT_PUBLIC_REPO_MODE === "supabase" ? supabaseRepo : localRepo;
