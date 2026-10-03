'use client'
// 🏀 The handful of small pieces every BUCKETS page shares -- LAMP's ui module
// (components/lamp/ui.js) in BUCKETS' theme, each one the shared DASH piece
// underneath (components/ui Empty, StaleBanner StaleNote, CallStatusBadge,
// TeamMark). Spelled once here so a state, a chip or a mark reads the same on
// every page. Nothing here is a card.
import { STATUS_WORD } from '../../lib/callStatus'
import CallStatusBadge from '../CallStatusBadge'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { StaleNote } from '../StaleBanner'
import { Empty } from '../ui'
export { shiftDay } from '../../lib/data'
export { readParam as readHashParam, writeParam as writeHashParam } from '../../lib/useShellRoute'

export const STATUS = STATUS_WORD   // lib/callStatus.js, the one set of words

export function CalledChip({ style = null }) {
  return <CallStatusBadge variant="chip" status="called" theme={C} accent={C.purple} numFont={NUM_FONT} style={style} />
}

/** "Sat, Oct 3" for a YYYY-MM-DD, as a calendar day (no zone drift). */
export function fmtDay(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return ''
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
/** "7:00 PM" in the viewer's own zone, from the feed's tip time. */
export function fmtTip(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return 'TBD' }
}
/** The viewer's zone, short ("EDT"), for the one place a page says "times in your zone". */
export function zoneAbbrev() {
  try { return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '' } catch { return '' }
}
/** A game's own day (ET) from its tip time -- key everything on the game's date. */
export function gameDay(iso) {
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) } catch { return '' }
}
export const SEASON_TYPE = { 1: 'PRESEASON', 2: 'REGULAR SEASON', 3: 'PLAYOFFS', 5: 'PLAY-IN' }
export function SeasonTypeChip({ type }) {
  const label = SEASON_TYPE[type]
  if (!label) return null
  const pre = type === 1
  return <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: 6, border: `1px solid ${pre ? C.amber : C.border2}`, color: pre ? C.amber : C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{label}</span>
}

/** The live dot: rim orange, live games only -- never decoration. */
export function RimDot({ size = 7 }) {
  return (
    <>
      <i aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: C.rim, boxShadow: `0 0 8px ${C.rim}`, animation: 'rimPulse 1.6s ease-in-out infinite', verticalAlign: 'middle', marginRight: 6 }} />
      <style>{'@keyframes rimPulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
    </>
  )
}

/** An empty panel that says WHY it is empty. */
export function EmptyState({ title, note = null, tone = C.text3, children = null }) {
  return <Empty title={title} note={note} tone={tone} theme={C} numFont={NUM_FONT}>{children}</Empty>
}
/** LIVE DATA DELAYED -- the feed failed; the page keeps whatever it last had. */
export function DelayedBanner({ error, what = 'the league feed' }) {
  if (!error) return null
  return <StaleNote role="alert" tone={C.amber} theme={C} numFont={NUM_FONT} title="LIVE DATA DELAYED" body={<>We’re waiting on {what}. Anything below is the last copy we had.</>} />
}
/** Last season's numbers, said so: the new season's are not in yet. */
export function LastSeasonNote({ label, what = 'numbers' }) {
  if (!label) return null
  return <StaleNote tone={C.text3} theme={C} numFont={NUM_FONT} title={`${label} ${what.toUpperCase()}`} body={<>The new season has no regular-season games yet, so these are last season’s ({label}) — they switch over on their own once it starts.</>} />
}
export function Loading({ what = 'the feed' }) {
  return <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.text3, fontSize: 12 }}>Reading {what}…</div>
}
/** The mono kicker every section title on BUCKETS uses. */
export function Kicker({ children, tone = C.purple }) {
  return <div style={{ color: tone, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 8px' }}>{children}</div>
}
/** One row of pills (view switches, pagers). 44px tall: a thumb's target. */
export function Pills({ value, onChange, options, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={on} disabled={o.disabled} title={o.title} style={{
            minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: o.disabled ? 'default' : 'pointer',
            border: `1px solid ${on ? C.purple : C.border2}`, background: on ? `${C.purple}1f` : 'transparent',
            color: on ? C.purple : C.text2, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', opacity: o.disabled ? .45 : 1, whiteSpace: 'nowrap',
          }}>{o.text}</button>
        )
      })}
    </div>
  )
}
/** A small button (pagers, "open the game"). */
export function NavBtn({ children, onClick, disabled = false, strong = false, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={{
      minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${strong ? C.purple : C.border2}`, background: strong ? `${C.purple}14` : C.bg2,
      color: strong ? C.purple : C.text2, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1,
    }}>{children}</button>
  )
}
/** RETIRED 2026-10-03 (Donovan: no API names at the foot of every page) --
 *  renders nothing; the DASH footer (components/DashFooter.js) closes the page
 *  and each product's Guide says how its numbers are built. */
export function SourceLine() {
  return null
}
/** "‹ <where you came from>" -- the shell's trail names the place (lib/useShellRoute). */
export function BackBtn({ onBack, label }) {
  if (!onBack) return null   // inside the player card (PlayerPeek) the card's × is the way out
  return <div><NavBtn onClick={onBack} ariaLabel={`Back to ${label}`}>‹ {label}</NavBtn></div>
}
/** A player's face by his ESPN id (the shared PlayerFace, BUCKETS' CDN). */
export { default as PlayerFace } from '../PlayerFace'
/** ‹ Prev · Today · Next › for the shell's one day, plus whatever else sits on that row. Short words: one row at 390. */
export function DayPager({ shown, date, setDate, disabled = false, todayWord = 'Tonight', children = null }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <NavBtn onClick={() => setDate(shiftDayLocal(shown, -1))} disabled={disabled} ariaLabel="Previous day">‹ Prev</NavBtn>
      <NavBtn onClick={() => setDate(null)} disabled={disabled || !date} strong={!date}>{todayWord}</NavBtn>
      <NavBtn onClick={() => setDate(shiftDayLocal(shown, 1))} disabled={disabled} ariaLabel="Next day">Next ›</NavBtn>
      {children}
    </div>
  )
}
const shiftDayLocal = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
