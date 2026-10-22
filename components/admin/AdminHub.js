// THE ADMIN HUB (2026-10-12, Donovan: "i need a better way to get to the admin side of things"). The top of /admin: every admin tool as a big
// tap card, today's safe read-only status, how to put it on a phone, and a one-tap sign out. Rendered only by app/admin/page.js AFTER the admin gate
// has passed; it takes `status` (lib/adminHubStatus.js readHubStatus: words and numbers only) and draws it. No client JS: links and one form.
// Phone first: cards are full-width 64px rows below 420px and a two-column grid above; every target is 44px or more; colours are the page's tokens.
import { ADMIN_TOOLS } from '../../lib/adminHub.js'
import { BRAND } from '../../lib/routes'
import EarlyAccess from './EarlyAccess'
import { dashSignOut } from '../../app/(front)/actions'

// from the sport registry (lib/routes.js BRAND), so a new Card sport (BUCKETS, 2026-10-20) reads 'NBA · BUCKETS', not 'nba'
const SPORT_WORD = Object.fromEntries(Object.entries(BRAND).map(([k, b]) => [k, `${b.league} · ${b.name}`]))
const etTime = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : 'none yet'
}

const card = { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minHeight: 64, padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel)', color: 'inherit', textDecoration: 'none' }
const row = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2px 12px', alignItems: 'baseline', padding: '10px 0', borderTop: '1px solid var(--line)' }
const small = { color: 'var(--dim)', fontSize: 12 }

function Row({ k, v, note }) {
  return (
    <div style={row}>
      <span style={{ fontSize: 15 }}>{k}</span>
      <strong style={{ fontSize: 15, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</strong>
      {note ? <small style={{ ...small, gridColumn: '1 / -1' }}>{note}</small> : null}
    </div>
  )
}

function cardWords(c) {
  if (!c.card_date) return { v: 'no Card yet', note: null }
  const parts = [c.locked ? 'locked' : 'not locked', c.posted ? 'posted' : 'not posted']
  if (c.locked) parts.push(c.reveal)
  const don = c.donovan === 'none' ? 'his entry: none' : c.donovan === 'LATE' ? 'his entry: LATE' : `his entry: verified${c.donovan_posted ? ', posted' : ''}`
  return { v: parts.join(' · '), note: `${c.card_date} · ${don}` }
}

export default function AdminHub({ status }) {
  const s = status || {}
  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>Tools</h2>
      <nav aria-label="Admin tools" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
        {ADMIN_TOOLS.map((t) => (
          <a key={t.id} href={t.href} style={card} data-admin-tool={t.id}>
            <strong style={{ fontSize: 16 }}>{t.title} <span aria-hidden="true">→</span></strong>
            <span style={{ ...small, lineHeight: 1.35 }}>{t.hint}</span>
          </a>
        ))}
      </nav>

      <EarlyAccess />

      <h2 style={{ margin: '22px 0 0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>Today{s.day ? ` · ${s.day}` : ''}</h2>
      {s.cards
        ? s.cards.map((c) => { const w = cardWords(c); return <Row key={c.sport} k={`Card · ${SPORT_WORD[c.sport] || c.sport}`} v={w.v} note={w.note} /> })
        : <Row k="Card" v="unavailable" note="could not be read right now" />}
      <Row k="X posts today" v={s.x ? `${s.x.used} of ${s.x.cap}` : 'unavailable'} note="counted the way the daily cap counts them" />
      <Row k="Last X post claimed" v={etTime(s.activity?.x_post)} />
      <Row k="Last push sent" v={etTime(s.activity?.push)} />
      <Row k="Last Card lock" v={etTime(s.activity?.card_lock)} />
      <Row k="Deployed build" v={s.build || 'unknown'} note="the first 7 characters of the commit" />

      {/* BUCKETS (NBA): where it stands, in counts. Read-only; no names, no emails. The holders and the invite links are the Early access card above. */}
      <h2 style={{ margin: '22px 0 0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>BUCKETS (NBA)</h2>
      {s.buckets ? (
        <>
          <Row k="Public switch" v={s.buckets.state} note={s.buckets.state === 'hidden' ? 'hidden: only admins and early-access holders see it; nothing is posted or pushed' : 'public: BUCKETS_PUBLIC is on'} />
          <Row k="Graded nights" v={s.buckets.nights == null ? 'unavailable' : `${s.buckets.nights} of ${s.buckets.floor}`} note={s.buckets.floorWords} />
          <Row k="NBA odds capture" v={s.buckets.capture ? 'on' : 'off'} note={s.buckets.capture ? `NBA_ODDS_CAPTURE is on: ${s.buckets.oddsGames == null ? 'games on the odds map unavailable' : `${s.buckets.oddsGames} NBA games on the odds map`}` : 'off by default: turn NBA_ODDS_CAPTURE on about a week before the public date so lines and price history exist on day one'} />
          <Row k="Lane nights recorded" v={s.buckets.lanes == null ? 'unavailable' : String(s.buckets.lanes)} note="written only once BUCKETS is public (needs the numerology SQL)" />
          <Row k="Card preview" v="admin and early access" note="/api/buckets/card shows what the Card would pick; nothing is locked or posted" />
        </>
      ) : <Row k="BUCKETS" v="unavailable" note="could not be read right now" />}

      <h2 style={{ margin: '22px 0 8px', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>Get here fast</h2>
      <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 14, lineHeight: 1.5 }}>
        <li><strong>Phone:</strong> sign in, open this page, then Share → Add to Home Screen. The icon opens straight here. Or bookmark <code>/login?next=/admin</code>: it signs you in and lands here.</li>
        <li><strong>In the app:</strong> the More drawer and the name menu carry an Admin row for you only.</li>
        <li><strong>Laptop:</strong> press Ctrl/⌘ K, type <code>admin</code> or <code>two-man</code>.</li>
      </ul>

      <form action={dashSignOut} style={{ marginTop: 18 }}>
        <input type="hidden" name="next" value="/" />
        <button type="submit" style={{ ...card, width: '100%', font: 'inherit', fontWeight: 800, fontSize: 15, cursor: 'pointer', minHeight: 48, textAlign: 'center', alignItems: 'center' }}>Sign out</button>
      </form>
    </div>
  )
}
