'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { easternDate } from '../lib/data'
import { WINDOWS, windowRows, contactStats, discipline } from '../lib/contact'
import { whiffProfile } from '../lib/player'

// 🧱 CONTACT (2026-09-27, BATCH-BLAST-COLUMNS-PLAN "the player card first").
// Replaces the card's "Batted Ball" and "Recent Distance" blocks with Blast
// Report's windows and filters, counted client-side from the batted balls the
// detail file already carries (lib/contact.js). Every rate sits beside its
// count and the header names the window and its sample: "33 BBE · last 15
// days (Sep 12-26)". Under 10 BBE the tiles grey out and say "small sample"
// -- never hidden. Bat speed is the bot's own last-25-PA figure and says so.

const fmtDay = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '')
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const SMALL = 10

function Chip({ on, onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      style={{ flexShrink: 0, minHeight: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 999, whiteSpace: 'nowrap',
        border: `1px solid ${on ? C.orange : C.border}`, background: on ? alpha(C.orange, 0.14) : 'transparent', color: on ? C.orange : C.text2,
        font: `700 10.5px/1 ${NUM_FONT}` }}>{children}</span>
    </button>
  )
}

function Tile({ label, count, rate, value, dim, title }) {
  return (
    <div title={title} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', background: C.bg2, minWidth: 0, opacity: dim ? 0.55 : 1 }}>
      <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 800, color: C.text, marginTop: 2, whiteSpace: 'nowrap' }}>
        {value != null ? value : <>{count}<span style={{ color: C.text3, fontWeight: 600 }}> · </span>{pct(rate)}</>}
      </div>
    </div>
  )
}

export default function ContactSection({ p }) {
  const spray = p?.spray_chart
  const [win, setWin] = useState('d15')
  const [arm, setArm] = useState('all')
  const [pitch, setPitch] = useState('all')
  const [air, setAir] = useState(false)
  const [pullAir, setPullAir] = useState(false)
  // Tonight's game date (the game's own date); a hitter with no game tonight
  // is counted up to his last batted ball.
  const anchor = useMemo(() => { const t = Date.parse(p?.game_time || ''); return Number.isFinite(t) ? easternDate(t) : null }, [p?.game_time])
  const w = useMemo(() => windowRows(spray, win, anchor), [spray, win, anchor])
  const types = useMemo(() => {
    const m = new Map(); for (const r of w.rows) { const k = r.pitch_type || r.pitch_name; if (k) m.set(k, (m.get(k) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [w.rows])
  const rows = w.rows.filter((r) => (arm === 'all' || r.arm === arm) && (pitch === 'all' || (r.pitch_type || r.pitch_name) === pitch)
    && (!air || ['fly_ball', 'line_drive', 'popup'].includes(r.bb_type)) && (!pullAir || r.is_pull_air === true))
  const s = contactStats(rows)
  // Zone and chase weighted by pitches seen; whiff and SwStr from
  // whiffProfile (lib/player.js), which rebuilds them exactly from the
  // published per-type counts rather than averaging per-swing rates by pitch.
  const d = useMemo(() => {
    const base = discipline(p?.pitch_type_summary)
    const wp = whiffProfile(p)
    return base ? { ...base, whiff: wp ? wp.whiff : null, swstr: wp ? wp.swstr : base.swstr } : null
  }, [p])
  if (!Array.isArray(spray) || !spray.length) return null
  const dim = s.bbe < SMALL
  const wLabel = (WINDOWS.find((x) => x.key === win) || {}).label
  const range = w.from ? `${fmtDay(w.from)}–${fmtDay(w.to)}` : ''
  const filtered = arm !== 'all' || pitch !== 'all' || air || pullAir
  const bat = Number(p?.l25pa_avg_bat_speed)
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 0 2px' }}>Contact</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text2 }}>
        <b style={{ color: C.text }}>{s.bbe} BBE</b> · {win === 'all' ? `in the file (${range})` : `${wLabel.toLowerCase()} (${range})`}
        {w.cut && <span style={{ color: C.text3 }} title="The card holds his most recent 120 or so batted balls, so this window starts where the file does."> · file starts {fmtDay(w.fileFrom)}</span>}
        {filtered && <span style={{ color: C.orange }}> · filtered</span>}
        {dim && <span style={{ color: C.text3 }} title="Fewer than 10 batted balls: every rate here swings on one swing."> · small sample</span>}
      </div>
      <div className="contact-chips" style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap' }}>
        {WINDOWS.map((x) => <Chip key={x.key} on={win === x.key} onClick={() => setWin(x.key)}>{x.label}</Chip>)}
      </div>
      <div className="contact-chips" style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', marginTop: -6 }}>
        <Chip on={arm === 'R'} onClick={() => setArm(arm === 'R' ? 'all' : 'R')}>vs RHP</Chip>
        <Chip on={arm === 'L'} onClick={() => setArm(arm === 'L' ? 'all' : 'L')}>vs LHP</Chip>
        <Chip on={air} onClick={() => setAir(!air)} title="Fly balls, line drives and pop-ups">Air balls</Chip>
        <Chip on={pullAir} onClick={() => setPullAir(!pullAir)} title="Balls in the air to his pull side">Pulled air</Chip>
        {types.map((t) => <Chip key={t} on={pitch === t} onClick={() => setPitch(pitch === t ? 'all' : t)} title={`Only batted balls off ${t}`}>{t}</Chip>)}
      </div>
      <div className="contact-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 6, marginTop: 2 }}>
        <Tile label="Barrels" count={s.barrels} rate={s.rate('barrels')} dim={dim} title="Statcast's barrel zone, counted from exit velocity and launch angle: 98+ mph at 26-30 degrees, widening with speed to 8-50 degrees at 116 mph." />
        <Tile label="Hard-hit" count={s.hardHit} rate={s.rate('hardHit')} dim={dim} title="95+ mph off the bat" />
        <Tile label="100+ mph" count={s.ev100} rate={s.rate('ev100')} dim={dim} />
        <Tile label="350+ ft" count={s.d350} rate={s.rate('d350')} dim={dim} />
        <Tile label="HR" count={s.hr} rate={s.rate('hr')} dim={dim} title="Home runs, per batted ball" />
        <Tile label="XBH" count={s.xbh} rate={s.rate('xbh')} dim={dim} title="Extra-base hits, per batted ball" />
        <Tile label="Air" count={s.air} rate={s.rate('air')} dim={dim} title="Fly balls, line drives and pop-ups" />
        <Tile label="Pull-air" count={s.pullAir} rate={s.rate('pullAir')} dim={dim} title="In the air to his pull side" />
        <Tile label="Avg / max EV" value={s.avgEv == null ? '—' : `${s.avgEv.toFixed(1)} / ${s.maxEv.toFixed(1)}`} dim={dim} title="Exit velocity, mph" />
        <Tile label="Launch angle" value={s.avgLa == null ? '—' : `${s.avgLa.toFixed(1)}°`} dim={dim} />
        <Tile label="Bat speed · L25 PA" value={Number.isFinite(bat) ? `${bat.toFixed(1)} mph` : '—'} title="The bot's average bat speed over his last 25 plate appearances -- its own window, not the one picked above." />
      </div>
      {d && (
        <div style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text2, marginTop: 7, lineHeight: 1.5 }}
          title="From the bot's per-pitch-type summary, each pitch type weighted by the pitches he saw of it. Zone and chase are per pitch; whiff is per swing, SwStr per pitch.">
          <b style={{ color: C.text3, fontSize: 9, letterSpacing: '.05em' }}>PLATE DISCIPLINE · {d.pitches} PITCHES IN THE BOT'S PITCH SUMMARY</b><br />
          Zone {pct(d.zone)} · Chase {pct(d.chase)} · Whiff {pct(d.whiff)} · SwStr {pct(d.swstr)}
        </div>
      )}
      <style>{`.contact-chips::-webkit-scrollbar{display:none}@media (max-width:560px){.contact-tiles{grid-template-columns:1fr 1fr!important}}`}</style>
    </div>
  )
}
