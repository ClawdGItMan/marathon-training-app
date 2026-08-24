"use server";

import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Presence-only integration status for the Settings CONNECTIONS row
 * (supabase mode) — a Server Action so client components (ConnectionsSection
 * / ConnectionRow) can call it directly without a dedicated API route,
 * per CLAUDE.md's "Server Actions over API routes when possible".
 *
 * Deliberately queries only the `provider` column (never
 * ciphertext/iv/tag) so no token contents — encrypted or otherwise — ever
 * leave the server, matching the brief's "token presence only... never
 * token contents" requirement. `integration_tokens` is deny-all under RLS
 * (see src/lib/supabase/admin.ts), so the admin client is the only way to
 * read it at all; the query is still explicitly scoped by the session's
 * `user_id`.
 */

export type IntegrationStatus = { whoop: boolean; strava: boolean };

const rowSchema = z.object({ provider: z.enum(["whoop", "strava"]) });

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { whoop: false, strava: false };

  const { data, error } = await getAdminClient()
    .from("integration_tokens")
    .select("provider")
    .eq("user_id", user.id);

  if (error) throw error;

  const providers = new Set((data ?? []).map((row) => rowSchema.parse(row).provider));
  return { whoop: providers.has("whoop"), strava: providers.has("strava") };
}
