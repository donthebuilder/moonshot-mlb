'use client'
import { useEffect, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampScores } from '../../../lib/nhl/useLamp'
import ScoreTable from '../ScoreTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, GameTypeChip, fmtDay, shiftDay, zoneAbbrev, readHashParam, writeHashParam } from '../ui'

// 🏒 SCORES — every game on one NHL day. The plain page: score, period,
// clock, shots, who scored. Nothing ranked, nothing modelled. Tap a row for
// the game. The day is the league's Eastern calendar day; the times print in
// the viewer's own zone and the header says which.
//
// Data: /api/lamp/scores?date= → lib/nhl/reduce.js reduceScoreDay. Polls
// every 30 s only while a game is live (lib/nhl/useLamp.js scoresPollMs).
export default function Scores({ onOpenGame }) {
  const [date, setDate] = useState(() => {
    const d = readHashParam('date')
    return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null
  })
  useEffect(() => { writeHashParam('date', date) }, [date])
  const { data, error, loading } = useLampScores(date)
  const day = data
  const games = day?.games || []
  const shown = day?.date || date
  const types = day?.gameTypes || []

  const go = (d) => setDate(d)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="LAMP · SCORES"
        title={shown ? fmtDay(shown) : 'Tonight'}
        note={`Every game that day — score, period and clock, shots on goal, and who scored. Times are in your zone (${zoneAbbrev()}); the day is the league’s Eastern calendar day.`}
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={day ? [
          { value: day.live, label: 'LIVE', tone: day.live ? C.lamp : C.text3 },
          { value: day.final, label: 'FINAL', tone: C.text2 },
          { value: games.length, label: 'GAMES', tone: C.text2 },
        ] : null}
      />
      {/* Paging lives under the header, not in it: on a phone the header's
          right side hides (MobileCSS .page-header-stats), and a control that
          disappears on the device most people read scores on is no control. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <NavBtn onClick={() => go(day?.prev || shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
        <NavBtn onClick={() => go(null)} disabled={loading || !date} strong>Today</NavBtn>
        <NavBtn onClick={() => go(day?.next || shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
        {types.map((t) => <GameTypeChip key={t} label={t === 1 ? 'PRESEASON' : t === 2 ? 'REGULAR SEASON' : t === 3 ? 'PLAYOFFS' : null} />)}
        {day?.season && <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{String(day.season).slice(0, 4)}-{String(day.season).slice(6, 8)} SEASON</span>}
      </div>

      <DelayedBanner error={error} what="the league’s score feed" />
      {loading && !day ? <Loading what="tonight’s scores" /> : null}
      {!loading && !error && day && games.length === 0 && (
        <EmptyState title="NO GAMES TODAY" note={`The league has nothing scheduled for ${fmtDay(shown)}. ${day.next ? `The next game day is ${fmtDay(day.next)}.` : ''}`} />
      )}
      {games.length > 0 && <ScoreTable games={games} onOpen={onOpenGame} />}
      {!day && error && <EmptyState title="LIVE DATA DELAYED" note="We’re waiting on the league’s score feed. Try again in a moment." tone={C.amber} />}

      <SourceLine>
        Source: NHL (api-web.nhle.com) score/{'{date}'}, read server-side by /api/lamp/scores, refreshed every 15 s at the edge and every 30 s on this page while a game is live.
        {data?.fetchedAt ? ` Last read ${new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` : ''}
      </SourceLine>
    </div>
  )
}

function NavBtn({ children, onClick, disabled, strong = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      height: 28, padding: '0 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${strong ? C.ice : C.border2}`, background: strong ? `${C.ice}14` : C.bg2,
      color: strong ? C.ice : C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1,
    }}>{children}</button>
  )
}
