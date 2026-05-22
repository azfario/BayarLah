import { createClient } from "@supabase/supabase-js";

// Uses service role key — bypasses RLS. For storage/realtime use only.
// All DB queries go through Prisma (lib/db.ts).
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
