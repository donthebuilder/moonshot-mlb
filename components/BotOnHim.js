'use client'
// THE BOT ON HIM (BATCH-FACT-ENGINE, 2026-10-02): on MOONSHOT's player card,
// each role the bot has given him on the clean pregame record -- games, the
// games he homered in (and the home runs), the games he got a hit, how often
// he did that role's job, and the same split by pitcher hand and home / away.
// n on every number. Research, not a call. Badges (PERFECT WHEN PICKED,
// DOUBLED THE BAR) appear only while they are true. Source: /api/mlb/boton.
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { PICK_JOBS } from '../lib/pickJob'
import DenseTable from './DenseTable'
import ScrollHint from './player/ScrollHint'
import HelpTip from './HelpTip'

const ROLE_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT', 'WATCH', 'NONE']
const ROLE_LABEL = { WATCH: 'Watch (not a call)', NONE: 'No role' }
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const split = (c) => (c?.g ? `${c.hrG}/${c.g}` : '—')

// `data` (2026-10-08, the player model): the card fetches /api/mlb/boton once for its verdict lines and hands it
// down; undefined -> this fetches for itself, as before.
// `view` (2026-10-17, the NHL card): another sport hands in the SAME frame with its own words and rows
// ({ brand, C, NUM_FONT, headline, help, badges, rows, columns, hint, caption }, built in that sport's adapter, e.g.
// components/player/nhlAdapter.js nhlBotView); MOONSHOT passes none and draws exactly what it always did.
export default function BotOnHim({ pid, data, view = null }) {
  const [own, setD] = useState(null)
  const d = data !== undefined ? data : own
  useEffect(() => {
    if (view || !pid || data !== undefined) return undefined
    let live = true
    fetch(`/api/mlb/boton?pid=${encodeURIComponent(pid)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setD(j) }).catch(() => {})
    return () => { live = false }
  }, [pid, data, view])
  const v = view || (d?.available && d.player ? mlbView(d) : null)
  if (!v) return null
  const T = v.C || C
  const NF = v.NUM_FONT || NUM_FONT
  return (
    <section style={{ marginTop: 14 }} aria-label={`${v.brand} on him`}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: T.text2, fontFamily: NF }}>{v.brand} ON HIM</span>
        <span style={{ fontSize: 12, color: T.text3 }}>{v.headline}<HelpTip label={v.helpLabel} text={v.help} /></span>
      </div>
      {v.badges.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {v.badges.map((b) => (
            <span key={b.key} title={`${b.label}: ${b.text} (bar: ${b.job})`} style={{ fontFamily: NF, fontSize: 11, fontWeight: 800, color: b.kind === 'perfect' ? T.green : T.orange, border: `1px solid ${b.kind === 'perfect' ? T.green : T.orange}66`, borderRadius: 6, padding: '3px 8px' }}>
              {b.label} · {b.text}
            </span>
          ))}
        </div>
      ) : null}
      <ScrollHint hint={v.hint}>
        <DenseTable rows={v.rows} columns={v.columns} heatMode="none" maxRows={v.rows.length} maxHeight={9999} caption={v.caption} />
      </ScrollHint>
    </section>
  )
}

// MOONSHOT's own view of the role table (unchanged from before the frame was shared).
function mlbView(d) {
  const roles = Object.entries(d.player.roles).sort((a, b) => ROLE_ORDER.indexOf(a[0]) - ROLE_ORDER.indexOf(b[0]))
  const rows = roles.map(([role, R]) => ({
    _id: role,
    role: ROLE_LABEL[role] || PICK_JOBS[role]?.label || role,
    job: PICK_JOBS[role]?.job || '',
    g: R.all.g,
    hr: R.all.hrG ? `${R.all.hrG} (${R.all.hr} HR)` : '0',
    hit: R.all.hitG,
    did: PICK_JOBS[role] ? `${R.all.did}/${R.all.g}` : '—',
    vsL: split(R.vsL), vsR: split(R.vsR), home: split(R.home), away: split(R.away),
  }))
  const columns = [
    { key: 'role', label: 'Role', group: 'Role', sticky: true, heat: false, w: 96, fmt: (v, r) => <span style={{ display: 'grid', lineHeight: 1.2 }}><b>{v}</b>{r.job ? <span style={{ fontSize: 10, color: C.text3 }}>job: {r.job}</span> : null}</span> },
    { key: 'g', label: 'G', group: 'All games', w: 34, heat: false, numeric: true, title: 'Games in that role, voids and 0-PA games out' },
    { key: 'hr', label: 'HR games', group: 'All games', w: 74, heat: false, title: 'Games he homered in (home runs in brackets)' },
    { key: 'hit', label: 'Hit games', group: 'All games', w: 52, heat: false, numeric: true },
    { key: 'did', label: 'Did the job', group: 'All games', w: 60, heat: false, title: "Cleared that role's bar" },
    { key: 'vsL', label: 'vs LHP', group: 'HR games by split', w: 52, heat: false, title: 'HR games / games against a left-handed starter' },
    { key: 'vsR', label: 'vs RHP', group: 'HR games by split', w: 52, heat: false },
    { key: 'home', label: 'Home', group: 'HR games by split', w: 48, heat: false },
    { key: 'away', label: 'Away', group: 'HR games by split', w: 48, heat: false },
  ]
  return {
    brand: 'MOONSHOT', helpLabel: 'Role record', help: 'Each role MOONSHOT has given him, judged on that role\'s job. Small samples: a lead, not a fact.',
    headline: `${d.player.games} games on the clean pregame record, ${day(d.since)}–${day(d.through)}`,
    badges: d.badges, rows, columns, hint: 'Swipe for vs LHP / vs RHP, Home, Away',
    caption: "Each role MOONSHOT has given him, judged on that role's job. Small samples: a lead, not a fact.",
  }
}
