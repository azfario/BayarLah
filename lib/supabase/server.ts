import { createClient } from "@supabase/supabase-js";

// Uses service role key — bypasses RLS. For storage/realtime use only.
// All DB queries go through Prisma (lib/db.ts).
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.");
  }

  if (!serviceRoleKey || serviceRoleKey.split(".").length !== 3) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be the full service_role JWT from Supabase."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}
