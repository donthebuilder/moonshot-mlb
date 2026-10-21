'use client'
import Tap from '../Tap'
import TeamMark from '../TeamMark'
import { Dial } from '../VerdictHero'
import { useSportTheme } from '../SportTheme'

// THE OPEN GAME'S HEADER, ONE ROW, EVERY PRODUCT (2026-10-21, Donovan: "the top area with the two teams, space is large for
// no reason" -> "do that shared"). Was three stacked rows on LAMP / BUCKETS (40px logos, a 64px ring with its words under it,
// then the time + save row) and TUDDY's two (44px logos + ring, then the time line). Now: the clubs, the score or the start,
// the ring (44px, a short label under it) and the save button side by side; `sub` (TUDDY's venue / air / out line, the
// live drive) is one small line under it.
//
//   sport, away, home       club codes (logos, each opens its club)
//   state                   'upcoming' | 'live' | 'final'
//   score                   [away, home] once started
//   status                  the start time, the live clock, or FINAL
//   link                    optional node under the status (Box score ›)
//   dial                    { value, dp, pct, col, title, label }
//   share                   the save button (ShareCardButton with `icon`)
//   sub                     optional node: one quiet line under the row
export default function GameHeadRow({ sport, away, home, state = 'upcoming', score = null, status, link = null, dial = null, share = null, sub = null, onOpenTeam = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const Team = ({ t }) => (
    <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={`Open ${t}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
      <TeamMark sport={sport} abbr={t} variant="logo" px={32} />
    </Tap>
  )
  const live = state === 'live'
  return (
    <div style={{ padding: '10px 12px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Team t={away} />
        {state === 'upcoming' || !score
          ? <span style={{ fontSize: 15, color: C.text3, fontWeight: 600 }}>@</span>
          : <span style={{ fontFamily: NUM_FONT, fontSize: 22, fontWeight: 900, color: live ? accent : C.text, whiteSpace: 'nowrap' }}>{score[0] ?? 0}–{score[1] ?? 0}</span>}
        <Team t={home} />
        <span style={{ fontSize: 12, fontFamily: NUM_FONT, color: live ? accent : C.text2, fontWeight: 800, minWidth: 0, lineHeight: 1.3 }}>
          {status}
          {link ? <><br />{link}</> : null}
        </span>
        {dial ? (
          <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={dial.title}>
            <Dial value={dial.value} dp={dial.dp ?? 1} pct={dial.pct} col={dial.col} size={44} title={dial.title} />
            {dial.label ? <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.2 }}>{dial.label}</span> : null}
          </span>
        ) : <span style={{ marginLeft: 'auto' }} />}
        {share}
      </div>
      {sub ? <div style={{ fontSize: 12, color: C.text2, marginTop: 2, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  )
}
