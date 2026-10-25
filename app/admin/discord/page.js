// /admin/discord: IS EACH CHANNEL REALLY WIRED? (2026-10-23). Asks Discord about every webhook without posting (lib/dash/discordWire.js), and gives
// each channel a "Send test" button (one short plain post, admin only). Same gate as /admin: anyone else gets a 404.
import { notFound } from 'next/navigation'
import { hasSupabaseConfig } from '../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { isAdminUser, adminDenyReason } from '../../../lib/admin'
import start from '../../start/start.module.css'
import { wiringReport, probeBot, DISCORD_ROOMS } from '../../../lib/dash/discordWire'
import { sendDiscordTest, sendBotTestAction } from './actions'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const robots = { index: false, follow: false }
  try {
    if (!hasSupabaseConfig()) return { title: 'Not found · DASH Network', robots }
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return { title: user && isAdminUser(user) ? 'Discord channels · admin · DASH Network' : 'Not found · DASH Network', robots }
  } catch { return { title: 'Not found · DASH Network', robots } }
}

const stateOf = (r) => {
  if (!r.set) return { word: 'not set', tone: 'var(--dim)' }
  if (r.hooks.every((h) => h.ok)) return { word: 'wired', tone: 'var(--accent)' }
  if (r.hooks.some((h) => h.ok)) return { word: 'partly working', tone: 'var(--ink)' }
  return { word: 'broken', tone: 'var(--ink)' }
}
const detail = (r) => (!r.set ? 'No webhook in Vercel.' : r.hooks.map((h, i) => (h.ok ? `Discord answers: webhook "${h.name || '?'}"` : `Webhook ${i + 1}: ${h.status === 404 ? 'deleted in Discord (404)' : h.error || `HTTP ${h.status}`}`)).join(' · '))

export default async function DiscordAdminPage({ searchParams }) {
  if (!hasSupabaseConfig()) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) { console.warn(`[admin/discord] 404: ${adminDenyReason(user)}`); notFound() }
  const q = (await searchParams) || {}
  const sent = DISCORD_ROOMS.find((r) => r.key === q.sent)
  const [report, bot] = await Promise.all([wiringReport(), probeBot()])
  return (
    <main className={start.page}>
      <header className={start.bar}>
        <a className={start.brand} href="/admin" aria-label="Back to admin">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK</small><strong>DISCORD CHANNELS</strong></div>
        </a>
      </header>
      <section style={{ padding: '18px 0 40px', maxWidth: 640 }}>
        <p style={{ margin: '0 0 12px', color: 'var(--dim)' }}>Asked Discord just now. Checking posts nothing; &quot;Send test&quot; posts one short line to that channel.</p>
        {q.bot ? <p role="status" style={{ margin: '0 0 12px', fontWeight: 600 }}>{q.ok === '1' ? 'Bot test sent: a test line in #members with the bot\'s reply under it.' : `Bot test stopped at: ${{ 'no-bot': 'no bot token', 'no-members': 'no #members webhook', post: 'the #members test line', reply: 'the bot\'s reply' }[q.bot] || q.bot}${q.status ? ` (HTTP ${q.status})` : ''}.`}</p> : null}
        {sent ? <p role="status" style={{ margin: '0 0 12px', fontWeight: 600 }}>{q.ok === '1' ? `Test sent to ${sent.label}.` : `Test to ${sent.label} failed${q.status ? ` (HTTP ${q.status})` : ''}.`}</p> : null}
        {report.map((r) => {
          const s = stateOf(r)
          return (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{r.label} <small style={{ fontWeight: 400, color: 'var(--dim)' }}>{r.what}</small></span>
              <strong style={{ color: s.tone, textAlign: 'right' }}>{s.word}</strong>
              <small style={{ color: 'var(--dim)', fontSize: 12, minWidth: 0, overflowWrap: 'anywhere' }}>{detail(r)} <code>{r.key}</code></small>
              {r.set ? (
                <form action={sendDiscordTest}>
                  <input type="hidden" name="key" value={r.key} />
                  <button type="submit" style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer' }}>Send test</button>
                </form>
              ) : <span />}
            </div>
          )
        })}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>DASH bot <small style={{ fontWeight: 400, color: 'var(--dim)' }}>replies under the #members picks post</small></span>
          <strong style={{ color: bot.ok && bot.seesMembers ? 'var(--accent)' : bot.set ? 'var(--ink)' : 'var(--dim)', textAlign: 'right' }}>{bot.ok && bot.seesMembers ? 'wired' : !bot.set ? 'not set' : bot.ok ? "can't see #members" : 'broken'}</strong>
          <small style={{ color: 'var(--dim)', fontSize: 12, minWidth: 0, overflowWrap: 'anywhere' }}>{!bot.set ? 'No bot token in Vercel.' : !bot.ok ? `Discord refused the token${bot.status ? ` (HTTP ${bot.status})` : bot.error ? ` (${bot.error})` : ''}.` : `Signed in as "${bot.name || '?'}". ${bot.seesMembers ? 'Sees #members.' : 'Add it to #members (channel permissions).'}`} <code>DISCORD_BOT_TOKEN</code></small>
          {bot.ok && bot.seesMembers ? (
            <form action={sendBotTestAction}>
              <button type="submit" style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer' }}>Send test reply</button>
            </form>
          ) : <span />}
        </div>
      </section>
    </main>
  )
}
