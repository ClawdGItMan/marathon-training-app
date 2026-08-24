import { localRepo } from "@/lib/data/local-repo";
import { runRepoParitySuite } from "../parity/repo-parity";

/**
 * Runs the shared behavioral suite against localRepo. This must pass
 * immediately (Task 3, Step 1) — it proves the port from
 * tests/unit/repo.test.ts into tests/parity/repo-parity.ts is faithful,
 * before any Supabase-side work begins.
 */
runRepoParitySuite(
  async () => localRepo,
  async () => {
    localStorage.clear();
  }
);
