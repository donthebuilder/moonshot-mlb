'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { localTime, etWallInstant } from '../lib/localTime'
import { explain } from '../lib/explain'

// ⚠️ IS THIS TONIGHT'S SLATE? (2026-08-09)
//
// Donovan: "does the site tell you when the bot didn't run? — fix that too."
// It did not, and this is the failure mode that costs the most trust for the
// least drama: nothing breaks, nothing errors, no empty state fires. The bot's
// workflow fails, the data branch keeps serving YESTERDAY's slate, and the
// site renders it under today's greeting with today's date in the header. You
// read a full board of picks for games that have already been played.
//
// Every other honesty mechanism on this site is downstream of one assumption —
// that the payload is for the slate you think you're looking at. Storylines
// date-gate, the context pack date-gates, results date-gate. None of them can
// help here, because they'd all be *correctly* gating against a stale slate
// date and quietly showing nothing, which reads as "quiet night" rather than
// "the bot is down".
//
// THE CHECK. The payload publishes its own `date` / `slate_date`. Compare it
// to the date it SHOULD be, in Eastern time — because the baseball day and the
// bot's cron both live in ET, and a user in Los Angeles at 10pm is already on
// tomorrow's date in local time while the slate is legitimately still today's.
// Using the browser's local date here would fire a false alarm every night on
// the west coast.
//
// THE GRACE WINDOW. The daily build lands around 1am ET, so between midnight
// and the run the previous slate is genuinely the current one. Before 9am ET a
// behind-by-one slate is stated calmly; after that it's a real failure and the
// banner says so plainly. Two or more days behind is always loud.

const etParts = () => {
  const d = new Date()
  const date = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const hour = Number(d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }))
  return { date, hour: Number.isFinite(hour) ? hour : 12 }
}

const addDays = (ymd, n) => {
  // Parsed at UTC NOON so a day step can't be eaten by a timezone offset.
  const t = new Date(`${ymd}T12:00:00Z`).getTime() + n * 864e5
  return new Date(t).toISOString().slice(0, 10)
}

const daysBetween = (a, b) => Math.round(
  (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 864e5,
)

export default function StaleBanner({ slateDate = '', mode = 'today', loading = false, truncated = false, games = 0, compact = false, schedule = null }) {
  // Re-check on a slow timer so a tab left open overnight notices the rollover
  // rather than sitting on the assumption it made when it was opened.
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(etParts())
    const id = setInterval(() => setNow(etParts()), 10 * 60_000)
    return () => clearInterval(id)
  }, [])

  // Rendered only once we know the ET clock — computing it during render would
  // make the server and the client disagree.
  if (!now || loading) return null

  // A TRUNCATED PAYLOAD IS ITS OWN ALARM (2026-08-09 incident).
  //
  // The publish replaced current/today_slim.json with a bare six-row array
  // from one July 26 game. It had no `date` field at all — so the check below,
  // which reads only the date, returned null and said nothing. The one outage
  // this component exists for walked straight past it.
  //
  // Payload shape is now checked before payload date, because a slate that is
  // the wrong SIZE is broken whatever day it claims to be.
  if (truncated) {
    return (
      <div style={{
        background: `linear-gradient(155deg, ${C.red}24, ${C.red}0d)`,
        border: `1px solid ${C.red}8c`, borderRadius: 12,
        padding: '10px 14px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: C.red }}>Tonight’s slate is incomplete</span>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {games} game{games === 1 ? '' : 's'}{slateDate ? ` · dated ${slateDate}` : ' · no date published'}
          </span>
        </div>
        {!compact && <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 5, maxWidth: 720 }}>
          Tonight&apos;s slate came through too small to be a real night of baseball, so most hitters are
          missing from every board. <b>A &quot;not rated&quot; label here means he is missing from the slate,
          not that he was passed over.</b> It fixes itself on the next update.
        </div>}
      </div>
    )
  }

  if (!slateDate) return null

  const expected = mode === 'tomorrow' ? addDays(now.date, 1) : now.date
  const behind = daysBetween(expected, slateDate)
  if (behind <= 0) return null   // current, or ahead — nothing to say

  // ── THE BASEBALL DAY DOES NOT END AT MIDNIGHT (2026-09-06) ──────────────
  // Donovan, 9:16pm in Phoenix on Sep 5, with West-coast games still on:
  // "Tonight's slate hasn't published yet · 1 day behind". It was 00:16 ET,
  // so the ET date had rolled to Sep 6 and the Sep 5 slate -- the correct,
  // current one -- was being called stale. A slate dated yesterday is the
  // right slate to be showing until the morning build replaces it; the old
  // 9am cutoff only softened the wording, it still put a banner on the page.
  // Now: one day behind before 10am ET says nothing at all. After 10am ET
  // the build is genuinely late and the banner is right to say so.
  if (behind === 1 && now.hour < 10) return null
  // NO GAMES SINCE (2026-10-02): every day after the slate's own date, up to the
  // one being asked for, had no MLB games on the schedule -- the slate shown IS
  // the last night played, and the bot has nothing newer to publish.
  if (schedule?.byDate) {
    const between = []
    for (let d = addDays(slateDate, 1); d <= expected; d = addDays(d, 1)) between.push(d)
    if (between.length && between.every((d) => !schedule.byDate[d])) {
      const nx = schedule.next ? new Date(`${schedule.next}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
      return <StaleNote compact={compact} tone={C.blue} icon="📅" title={`No MLB games ${mode === 'tomorrow' ? 'tomorrow' : 'today'}`}
        meta={`showing ${slateDate}, the last night played${nx ? ` · next games ${nx}` : ''}`} />
    }
  }
  const early = false
  const col = C.red

  return (
    <StaleNote tone={col} icon={early ? '🕐' : '⚠️'} compact={compact}
      title={early
        ? 'Tonight’s slate hasn’t published yet'
        : `This is not ${mode === 'tomorrow' ? 'tomorrow’s' : 'tonight’s'} slate`}
      meta={`showing ${slateDate} · ${behind} day${behind === 1 ? '' : 's'} behind`}
      body={early ? (
        <>
          The daily build normally lands around <b>{localTime(etWallInstant(1)) || '1am ET'}</b> and it hasn’t yet, so everything below is
          still <b style={{ color: col }}>{slateDate}</b>. Nothing here is wrong — it’s just the previous
          night. It’ll swap over on its own once tonight’s slate is up.
        </>
      ) : (
        <>
          A newer slate isn’t up yet, so every board, pick and score below belongs to{' '}
          <b style={{ color: col }}>{slateDate}</b> — games that have already been played.{' '}
          <b>Don’t read these as tonight’s picks.</b>
        </>
      )} />
  )
}

// THE BANNER ITSELF (R7, 2026-10-02): MOONSHOT's stale-slate banner as a piece
// every product draws its own warning with -- TUDDY's stale / preseason board,
// LAMP's delayed feed -- in its own theme and tone, instead of three looks.
// The markup is exactly what StaleBanner drew; MOONSHOT's banner is unchanged.
/** LIVE DATA DELAYED -- one banner for every product's feed outage (R7, 2026-10-04;
 *  was a copy each in lamp/ui.js and buckets/ui.js). Renders nothing without an error. */
export function DelayedBanner({ error, what = 'the league feed', theme = C, numFont = NUM_FONT }) {
  if (!error) return null
  return <StaleNote role="alert" tone={theme.amber || theme.orange} theme={theme} numFont={numFont} title="LIVE DATA DELAYED"
    body={<>We’re waiting on {what}. Anything below is the last copy we had.</>} />
}

// `why` (2026-10-07 text sweep): a caveat that carries meaning but shouldn't be a paragraph on every visit. The note
// stays one line (icon, title, meta) and a 44px (?) says the rest on tap, through the shared explain panel.
export function StaleNote({ tone, icon = '⚠️', title, meta = null, body = null, why = null, compact = false, theme = C, numFont = NUM_FONT, role = 'status' }) {
  return (
    <div role={role} style={{
      background: `linear-gradient(155deg, ${tone}14, ${tone}05)`,
      border: `1px solid ${tone}55`, borderRadius: 12,
      padding: '10px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: tone }}>{title}</span>
        {meta ? <span style={{ fontSize: 9.5, color: theme.text3, fontFamily: numFont }}>{meta}</span> : null}
        {why ? <button type="button" onClick={() => explain(title, why)} aria-label={`What does “${title}” mean?`}
          style={{ marginLeft: 'auto', alignSelf: 'center', minWidth: 44, minHeight: 44, margin: '-12px -8px -12px auto', background: 'none', border: 0, color: theme.text2, font: `800 12px/1 ${numFont}`, cursor: 'pointer' }}>(?)</button> : null}
      </div>
      {!compact && !why && body ? <div style={{ fontSize: 10.5, color: theme.text2, lineHeight: 1.6, marginTop: 5, maxWidth: 720 }}>{body}</div> : null}
    </div>
  )
}
