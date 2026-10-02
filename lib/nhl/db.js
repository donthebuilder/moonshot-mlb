// Supabase for LAMP's record — server only (service role), never imported
// by a client component. Same three secrets the other crons accept
// (CRON_SECRET is what Vercel sends; CALLEDIT_SECRET is the manual-fire key).
// Moved to lib/supabase/admin.js (R3, 2026-10-02); this re-export lives one batch.
export { cronAuthorized, adminClient } from '../supabase/admin'
