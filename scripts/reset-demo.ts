/**
 * Provision-or-reset the demo account against whichever Supabase project the
 * env points at (run: `npm run demo:reset`; cloud usage loads .env.local via
 * tsx --env-file, see the npm script). One command serves both jobs:
 * first run bootstraps the demo auth user + dataset, later runs restore the
 * dataset after visitor drift. Never run in tests/CI — stack tests use
 * scripts/lib/demo-reset.ts directly.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ensureDemoUser, resetDemoData } from "./lib/demo-reset";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  DEMO_USER_EMAIL: z.string().email("DEMO_USER_EMAIL must be an email"),
  DEMO_USER_PASSWORD: z.string().min(16, "DEMO_USER_PASSWORD must be at least 16 chars"),
});

async function main(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("demo:reset — missing/invalid env:");
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  const env = parsed.data;

  if (
    process.env.ALLOWED_EMAIL &&
    env.DEMO_USER_EMAIL.trim().toLowerCase() === process.env.ALLOWED_EMAIL.trim().toLowerCase()
  ) {
    console.error(
      "demo:reset refused: DEMO_USER_EMAIL equals ALLOWED_EMAIL — this would wipe and reseed the OWNER's data.",
    );
    process.exit(1);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = await ensureDemoUser(admin, env.DEMO_USER_EMAIL, env.DEMO_USER_PASSWORD);
  await resetDemoData(admin, userId, env.DEMO_USER_EMAIL.trim().toLowerCase());
  console.log(`demo:reset — demo account ${env.DEMO_USER_EMAIL} (${userId}) reset to clean seed data.`);
}

main().catch((err) => {
  console.error(`demo:reset failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
