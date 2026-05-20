/**
 * Supabase Client Configuration
 * ─────────────────────────────────────────────────────────────────
 * To activate Supabase authentication, add the following environment
 * variables to your .env.local file (and to your Vercel project):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
 *
 * These values are found in your Supabase Dashboard under:
 *   Project Settings → API → Project URL & anon public key
 * ─────────────────────────────────────────────────────────────────
 */

// TODO: Install the Supabase client: `pnpm add @supabase/supabase-js`
// Then uncomment the lines below and remove the mock client:
//
// import { createClient } from '@supabase/supabase-js'
//
// const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
// const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
// export const supabase = createClient(supabaseUrl, supabaseKey)

/** ── TEMPORARY MOCK CLIENT ─────────────────────────────────────── */
export const supabase = {
  auth: {
    signInWithPassword: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      // TODO: Replace with real Supabase call once env vars are set
      console.log('[Veridict] Mock login — email:', email, '| password:', password)
      return {
        data: null,
        error: { message: 'Supabase client not yet configured.' },
      }
    },
  },
}
