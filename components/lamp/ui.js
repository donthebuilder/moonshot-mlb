'use client'
import { useState } from 'react'
import { STATUS_WORD } from '../../lib/callStatus'
import CallStatusBadge from '../CallStatusBadge'
import Tap from '../Tap'
import { C, NUM_FONT, TYPE } from '../../lib/nhl/theme'
import { nhlLogo } from '../../lib/nhl/teams'
// Formats live in lib/nhl/format.js (no 'use client') so the crawlable
// server pages print numbers the same way; re-exported here for the tabs.
import { fmtDay } from '../../lib/nhl/format'
import { hashParams, writeHash } from '../../lib/urlState'
import { StaleNote, DelayedBanner as SharedDelayedBanner } from '../StaleBanner'
import { Empty } from '../ui'
import { localTime } from '../../lib/localTime'
export { fmtDay, fmtPct3, fmt2, fmtSec, plusMinus } from '../../lib/nhl/format'

// The handful of small pieces every LAMP page shares. Kept in one file so a
// state, a chip or a mark is spelled once. Nothing here is a card.

// CALLED / ON THE BOARD / NOT ON THE BOARD: the words, letter for letter,
// wherever LAMP prints a lock's label (the board, the goal lists).
export const STATUS = STATUS_WORD   // lib/callStatus.js, the one set of words (R2)

export function CalledChip({ style = null }) {
  return <CallStatusBadge variant="chip" status="called" theme={C} accent={C.ice} numFont={NUM_FONT} style={style} />
}

/** A goal's label from lamp_goal_feed (the scores route puts it on the goal):
 *  the CALLED chip, or ON THE BOARD in small caps. NOT ON THE BOARD and an
 *  unlocked game print nothing -- a goal list is not the place to say who
 *  the board missed. */
export function GoalLabel({ label }) {
  if (label === 'called') return <CalledChip style={{ marginRight: 0, marginLeft: 6 }} />
  if (label === 'board') return <span style={{ marginLeft: 6, color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{STATUS.board}</span>
  return null
}

/** "7:00 PM" in the viewer's own zone. The feed's startTimeUTC is the input. */
export function fmtPuckDrop(utc) {
  try {
    return localTime(utc, { zone: false }) || 'TBD'
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
export { shiftDay } from '../../lib/data'   // one copy, lib/data.js (R3)

/** Logo + abbreviation. The league's own SVG; the abbreviation is the text. */
// onClick (2026-09-27, CLICK-EVERYTHING-PLAN): a team opens the team -- the mark
// becomes a Tap (text unchanged, 44px on touch). None -> the plain mark.
// LOGO, THEN THE NAME (Donovan 10-02, logos site-wide): the club code is the
// logo's alt / title, and prints only if the logo fails to load.
export function TeamMark({ abbrev, name = null, size = 18, bold = false, onClick = null }) {
  const ab = String(abbrev || '').toUpperCase()
  const [broken, setBroken] = useState(false)
  // a logo-only tap (the name hides on a phone) keeps a thumb-wide target
  if (onClick) return <Tap onClick={onClick} title={ab} style={{ minWidth: 44, display: 'inline-flex', alignItems: 'center' }}><TeamMark abbrev={abbrev} name={name} size={size} bold={bold} /></Tap>
  return (
    <span title={ab} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {ab && !broken && <img src={nhlLogo(ab)} alt={ab} width={size} height={size} loading="lazy" onError={() => setBroken(true)}
        style={{ width: size, height: size, flex: 'none', objectFit: 'contain' }} />}
      {(broken || !ab) && <span style={{ font: `${bold ? 900 : 800} 11.5px/1 ${NUM_FONT}`, color: C.text, letterSpacing: '.03em' }}>{ab}</span>}
      {name && <span className="sm-hide" style={{ color: bold ? C.text : C.text3, fontSize: 11, fontWeight: bold ? 800 : 400 }}>{name}</span>}
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
// MOONSHOT's Empty (components/ui.js, R8) in LAMP's theme; LAMP's words.
export function EmptyState({ title, note = null, tone = C.text3, children = null }) {
  return <Empty title={title} note={note} tone={tone} theme={C} numFont={NUM_FONT}>{children}</Empty>
}

/** LIVE DATA DELAYED — the feed failed; the page keeps whatever it last had. */
// the shared banner (components/StaleBanner.js), in LAMP's theme -- one wording everywhere (R7)
export const DelayedBanner = (props) => <SharedDelayedBanner theme={C} numFont={NUM_FONT} {...props} />

/** A quiet loading line. */
export function Loading({ what = 'it' }) {
  return (
    <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.text3, fontSize: 12 }}>
      Reading {what}…
    </div>
  )
}

/** The mono kicker every section title on LAMP uses. */
export function Kicker({ children, tone = C.ice }) {
  return <div style={{ color: tone, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.14em', marginBottom: 6 }}>{children}</div>
}

/** One row of pills (view switches, date pagers). */
export function Pills({ value, onChange, options, ariaLabel, tall = false }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={on} disabled={o.disabled}
            title={o.title} style={{
              height: tall ? 44 : 26, padding: tall ? '0 10px' : '0 10px', borderRadius: 999, cursor: o.disabled ? 'default' : 'pointer',
              border: `1px solid ${on ? C.ice : C.border2}`, background: on ? `${C.ice}1a` : 'transparent',
              color: on ? C.ice : C.text2, font: `800 ${tall ? 11 : 9.5}px/1 ${NUM_FONT}`, letterSpacing: '.06em',
              opacity: o.disabled ? .45 : 1,
            }}>{o.text}</button>
        )
      })}
    </div>
  )
}

/** RETIRED 2026-10-03 (Donovan: no API names at the foot of every page) --
 *  renders nothing; the DASH footer (components/DashFooter.js) closes the page
 *  and each product's Guide says how its numbers are built. */
export function SourceLine() {
  return null
}

// ── hash helpers ────────────────────────────────────────────────────────────
// LAMP's pages carry their one parameter (a date, a game id) in the same
// hash the rest of /app routes on, so a link to a night or a game is a real
// address. replaceState, never pushState: the back button leaves the site.
// Both on lib/urlState.js now (R7, 2026-10-02): one address reader / writer for
// every shell. These two names stay for LAMP's 15 call sites.
export function readHashParam(key) {
  return hashParams().get(key)
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
    const h = hashParams()
    if (value == null || value === '') h.delete(key); else h.set(key, String(value))
    // Keeps the entry's OWN marker (a detail page's entry is marked by
    // LampDashboard openDetail so the in-page Back can step the browser's
    // history) -- but not the whole history.state: its __NA flag made Next's
    // patched replaceState skip syncing its router, which is why Next could
    // later write a stale URL back (2026-09-27, audit 00A; lib/urlState.js).
    writeHash(h, { state: window.history.state?.lampDetail ? { lampDetail: true } : null })
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
      {' · '}The new season’s tables have not started yet{opens ? ` — they open ${fmtDay(opens)}` : ''}. Until then these are last season’s.
    </div>
  )
}
