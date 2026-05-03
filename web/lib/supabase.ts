import { createClient } from "@supabase/supabase-js";

/**
 * Server-side admin client — uses the service role key, bypasses RLS.
 * Only import this in Route Handlers and server components.
 * Never expose to the browser.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Browser-safe client factory — uses the anon key, respects RLS.
 * Call this in client components that query Supabase directly.
 * Returns a new instance each call; memoize in the component if needed.
 */
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
