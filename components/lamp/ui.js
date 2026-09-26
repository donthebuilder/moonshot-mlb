'use client'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { nhlLogo } from '../../lib/nhl/teams'
// Formats live in lib/nhl/format.js (no 'use client') so the crawlable
// server pages print numbers the same way; re-exported here for the tabs.
import { fmtDay } from '../../lib/nhl/format'
export { fmtDay, fmtPct3, fmt2, fmtSec, plusMinus } from '../../lib/nhl/format'

// The handful of small pieces every LAMP page shares. Kept in one file so a
// state, a chip or a mark is spelled once. Nothing here is a card.

/** "7:00 PM" in the viewer's own zone. The feed's startTimeUTC is the input. */
export function fmtPuckDrop(utc) {
  try {
    return new Date(utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch { return 'TBD' }
}


/** The viewer's zone, short ("MST"), for the one place a page says "times in your zone". */
export function zoneAbbrev() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date())
    return (parts.find((p) => p.type === 'timeZoneName') || {}).value || ''
  } catch { return '' }
}

/** Shift a YYYY-MM-DD by n days, as a calendar day (no zone drift). */
export function shiftDay(ymd, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return ymd
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n, 12))
  return d.toISOString().slice(0, 10)
}

/** Logo + abbreviation. The league's own SVG; the abbreviation is the text. */
export function TeamMark({ abbrev, name = null, size = 18, bold = false }) {
  const ab = String(abbrev || '').toUpperCase()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {ab && <img src={nhlLogo(ab)} alt="" width={size} height={size} loading="lazy"
        style={{ width: size, height: size, flex: 'none', objectFit: 'contain' }} />}
      <span style={{ font: `${bold ? 900 : 800} 11.5px/1 ${NUM_FONT}`, color: C.text, letterSpacing: '.03em' }}>{ab}</span>
      {name && <span className="sm-hide" style={{ color: C.text3, fontSize: 11 }}>{name}</span>}
    </span>
  )
}

/** PRESEASON / REGULAR SEASON / PLAYOFFS, from the feed's gameType. */
export function GameTypeChip({ label }) {
  if (!label) return null
  const pre = label === 'PRESEASON'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 7px', borderRadius: 6,
      border: `1px solid ${pre ? C.amber : C.border2}`, color: pre ? C.amber : C.text3,
      font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em',
    }}>{label}</span>
  )
}

/** The lit lamp: a red dot that pulses. Live games only — never decoration. */
export function LampDot({ size = 7 }) {
  return (
    <>
      <i aria-hidden="true" style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        background: C.lamp, boxShadow: `0 0 8px ${C.lamp}`, animation: 'lampPulse 1.6s ease-in-out infinite',
        verticalAlign: 'middle', marginRight: 6,
      }} />
      <style>{`@keyframes lampPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </>
  )
}

/**
 * An empty panel that says WHY it is empty (project rule 24). `title` is the
 * short capitals line; `note` the sentence under it.
 */
export function EmptyState({ title, note = null, tone = C.text3, children = null }) {
  return (
    <div role="status" style={{
      border: `1px dashed ${C.border2}`, borderRadius: 12, padding: '22px 18px',
      textAlign: 'center', background: C.bg2,
    }}>
      <div style={{ color: tone, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.16em' }}>{title}</div>
      {note && <div style={{ marginTop: 8, color: C.text3, fontSize: 12, lineHeight: 1.5, maxWidth: 520, margin: '8px auto 0' }}>{note}</div>}
      {children}
    </div>
  )
}

/** LIVE DATA DELAYED — the feed failed; the page keeps whatever it last had. */
export function DelayedBanner({ error, what = 'the league feed' }) {
  if (!error) return null
  return (
    <div role="alert" style={{
      margin: '0 0 12px', padding: '10px 14px', borderRadius: 10,
      border: `1px solid ${C.amber}`, background: 'rgba(251,191,36,.08)', color: C.text2, fontSize: 12, lineHeight: 1.5,
    }}>
      <b style={{ color: C.amber, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>LIVE DATA DELAYED</b>
      {' · '}We’re waiting on {what}. Anything below is the last copy we had.
    </div>
  )
}

/** A quiet loading line. */
export function Loading({ what = 'the feed' }) {
  return (
    <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.text3, fontSize: 12 }}>
      Reading {what}…
    </div>
  )
}

/** The mono kicker every section title on LAMP uses. */
export function Kicker({ children, tone = C.ice }) {
  return <div style={{ color: tone, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', marginBottom: 6 }}>{children}</div>
}

/** One row of pills (view switches, date pagers). */
export function Pills({ value, onChange, options, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={on} disabled={o.disabled}
            title={o.title} style={{
              height: 26, padding: '0 10px', borderRadius: 999, cursor: o.disabled ? 'default' : 'pointer',
              border: `1px solid ${on ? C.ice : C.border2}`, background: on ? `${C.ice}1a` : 'transparent',
              color: on ? C.ice : C.text2, font: `800 9.5px/1 ${NUM_FONT}`, letterSpacing: '.06em',
              opacity: o.disabled ? .45 : 1,
            }}>{o.text}</button>
        )
      })}
    </div>
  )
}

/** The one-line data-origin note every page carries at its foot. */
export function SourceLine({ children }) {
  return <div style={{ marginTop: 12, color: C.text3, fontSize: 10, lineHeight: 1.5, fontFamily: NUM_FONT }}>{children}</div>
}

// ── hash helpers ────────────────────────────────────────────────────────────
// LAMP's pages carry their one parameter (a date, a game id) in the same
// hash the rest of /app routes on, so a link to a night or a game is a real
// address. replaceState, never pushState: the back button leaves the site.
export function readHashParam(key) {
  try { return new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get(key) } catch { return null }
}
/** `date=` off the hash, only when it is a REAL calendar day; else null (today).
 *  `2026-13-45` matched the old \d{4}-\d{2}-\d{2} test, the route answered
 *  400 BAD REQUEST, and the page printed "Sun, Feb 14" (JS rolled the date)
 *  under a LIVE DATA DELAYED banner that blamed the league feed. Measured
 *  live, 2026-09-25. A bad address is not a delay. */
export function readHashDay() {
  const d = readHashParam('date')
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '')
  if (!m) return null
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3] ? d : null
}
export function writeHashParam(key, value) {
  try {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    if (value == null || value === '') h.delete(key); else h.set(key, String(value))
    window.history.replaceState(null, '', `#${h.toString()}`)
  } catch { /* the page still works without the address */ }
}

// ── batch 2 formatters ──────────────────────────────────────────────────────
/** Age today from a YYYY-MM-DD birth date, or null. */
export function ageFrom(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return null
  const now = new Date(); let age = now.getFullYear() - +m[1]
  if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) age -= 1
  return age
}
/** 72 → 6'0". */
export const fmtHeight = (inches) => (inches == null ? null : `${Math.floor(inches / 12)}'${inches % 12}"`)
/** 0.156863 → "15.7". */
export const fmtPct1 = (v) => (v == null ? '—' : (Number(v) * 100).toFixed(1))
export const dash = (v) => (v == null ? '—' : v)

/** Mug + name; the one way a player is printed on LAMP. */
export function PlayerMark({ headshot, name, number = null, size = 22, onClick = null }) {
  const inner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      {headshot && <img src={headshot} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size, borderRadius: '50%', background: C.bg3, objectFit: 'cover', flex: 'none' }} />}
      <span style={{ color: C.text, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {number != null && <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>#{number}</span>}
    </span>
  )
  if (!onClick) return inner
  return <button type="button" onClick={onClick} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left', maxWidth: '100%' }}>{inner}</button>
}

/** "This is last season's line" — the amber sentence, one place. */
export function StaleSeasonNote({ label, opens, what = 'numbers' }) {
  return (
    <div role="status" style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.amber}`, background: 'rgba(251,191,36,.08)', color: C.text2, fontSize: 11.5, lineHeight: 1.5 }}>
      <b style={{ color: C.amber, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>{label} {what.toUpperCase()}</b>
      {' · '}The league has not started the new season’s tables yet{opens ? ` — they open ${fmtDay(opens)}` : ''}. Until then these are last season’s.
    </div>
  )
}
