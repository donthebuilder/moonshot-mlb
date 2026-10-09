// ONE ROW PER DISCORD HOOK ATTEMPT (2026-10-09, Discord audit). Answers "which
// channel got what, which key is dead, who is rate-limited" without Vercel logs.
//
// Stores the env KEY NAME, the hook's position in the list, the post kind, the
// sport and the HTTP result. NEVER a URL, an id from a URL, or a token.
//
// Best-effort by design: never throws, gives up after 1.5 s, and after the
// table turns out to be missing (migration 202610091210 not run) stops trying
// on this instance. No polling, no cron; one insert per attempt.
import { adminClient } from '../supabase/admin'

const splitHooks = (raw) => String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

/** The env KEY NAME that holds this hook URL (first match), or null. Never the URL. */
export function channelKeyOf(hook) {
  for (const k of Object.keys(process.env)) {
    if (!/^DISCORD_.*WEBHOOK/.test(k)) continue
    if (splitHooks(process.env[k]).includes(hook)) return k
  }
  return null
}

let _off = false
const TIMEOUT_MS = 1500

/** Inserts one discord_sends row. Resolves to true/false; never rejects. */
export async function logDiscordSend({ kind = null, sport = null, channelKey = null, hookIndex = null, ok, status = null, error = null }) {
  if (_off) return false
  try {
    const db = adminClient()
    if (!db) return false
    const row = {
      kind: kind == null ? null : String(kind).slice(0, 80),
      sport: sport == null ? null : String(sport).slice(0, 16),
      channel_key: channelKey == null ? null : String(channelKey).slice(0, 80),
      hook_index: Number.isInteger(hookIndex) ? hookIndex : null,
      ok: Boolean(ok),
      http_status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
      // short reason only; any URL that slipped into a message is cut out
      error: error ? String(error).replace(/https?:\/\/\S+/gi, '[url]').slice(0, 200) : null,
    }
    const res = await Promise.race([
      db.from('discord_sends').insert([row]),
      new Promise((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), TIMEOUT_MS)),
    ])
    if (res?.error) {
      const m = String(res.error.message || '')
      // table missing: stop for this instance, say nothing
      if (res.error.code === '42P01' || res.error.code === 'PGRST205' || /discord_sends/.test(m) && /not exist|schema cache|find the table/i.test(m)) _off = true
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Test hook: forget that the table was missing. */
export const _resetDiscordSends = () => { _off = false }
