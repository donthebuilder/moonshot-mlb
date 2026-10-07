'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampScores } from '../../../lib/nhl/useLamp'
import { useState } from 'react'
import { sortGames, GoalLines } from '../ScoreTable'
import GameRow from '../../GameRow'
import TeamMark from '../../TeamMark'
import { EmptyState, DelayedBanner, Loading, SourceLine, GameTypeChip, LampDot, fmtDay, shiftDay, zoneAbbrev, fmtPuckDrop } from '../ui'
import { localTime } from '../../../lib/localTime'
import Hint from '../Hint'

// 🏒 SCORES — every game on one NHL day. The plain page: score, period,
// clock, shots, who scored. Nothing ranked, nothing modelled. Tap a row for
// the game. The day is the league's Eastern calendar day; the times print in
// the viewer's own zone and the header says which.
//
// Data: /api/lamp/scores?date= → lib/nhl/reduce.js reduceScoreDay. Polls
// every 30 s only while a game is live (lib/nhl/useLamp.js scoresPollMs).
// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
export default function Scores({ onOpenGame, date = null, setDate = () => {} }) {
  const { data, error, loading } = useLampScores(date)
  const day = data
  const games = day?.games || []
  const shown = day?.date || date
  const types = day?.gameTypes || []

  const go = (d) => setDate(d)
  const [open, setOpen] = useState(() => new Set())
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="LAMP · SCORES"
        title={shown ? fmtDay(shown) : 'Tonight'}
        note={<>Every game that day, in your time zone ({zoneAbbrev()}). <Hint label="The day" text="Each day is the league’s Eastern calendar day, so a late West Coast game counts on the day it was scheduled, and times are shown in your own zone." /></>}
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

      <DelayedBanner error={error} what="the scores" />
      {loading && !day ? <Loading what="tonight’s scores" /> : null}
      {!loading && !error && day && games.length === 0 && (
        <EmptyState title="NO GAMES TODAY" note={`The league has nothing scheduled for ${fmtDay(shown)}. ${day.next ? `The next game day is ${fmtDay(day.next)}.` : ''}`} />
      )}
      {/* MOONSHOT'S GAME ROW (2026-09-29, parity): one row a game, tap for its
          goals and shots, the game page one tap further -- the row MOONSHOT's
          Boxes and TUDDY's Scores use (components/GameRow.js). */}
      {games.length > 0 && <div>{sortGames(games).map((g) => <LampGameRow key={g.id} g={g} open={open.has(g.id)} onToggle={toggle} onOpenGame={onOpenGame} />)}</div>}
      {!day && error && <EmptyState title="LIVE DATA DELAYED" note="We’re waiting on the scores. Try again in a moment." tone={C.amber} />}

      <SourceLine>
        Source: NHL (api-web.nhle.com) score/{'{date}'}, read server-side by /api/lamp/scores, refreshed every 15 s at the edge and every 30 s on this page while a game is live.
        {data?.fetchedAt ? ` Last read ${localTime(data.fetchedAt, { zone: false })}.` : ''}
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

function LampGameRow({ g, open, onToggle, onOpenGame }) {
  const live = g.state === 'live'
  const done = g.state === 'final'
  const scored = live || done
  const winner = done && g.away.score !== g.home.score ? (g.away.score > g.home.score ? 'away' : 'home') : null
  const status = g.statusLine || fmtPuckDrop(g.startUtc)
  return (
    <GameRow id={g.id} open={open} onToggle={onToggle} theme={C} numFont={NUM_FONT} accent={C.ice}
      openBg={`color-mix(in srgb, ${C.ice} 3%, transparent)`} winner={winner}
      status={{ text: <>{live && <LampDot />}{status}</>, tone: live ? C.lamp : done ? C.text2 : C.text3 }}
      sub={scored && g.away.sog != null ? <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginTop: 2 }}>SOG {g.away.sog}–{g.home.sog ?? '–'}</div> : null}
      sides={[['away', g.away], ['home', g.home]].map(([key, t]) => ({
        key, label: t.name || t.abbrev, score: scored ? (t.score ?? 0) : null,
        mark: <TeamMark sport="nhl" abbr={t.abbrev} variant="logo" px={28} dim={Boolean(winner) && winner !== key} />,
      }))}>
      <div style={{ paddingTop: 6 }}>
        {g.goals?.length ? <GoalLines goals={g.goals} /> : <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>{scored ? 'No goals yet.' : 'Hasn’t dropped the puck yet.'}</div>}
        <button type="button" onClick={() => onOpenGame?.(g.id)} style={{
          marginTop: 4, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${C.border2}`,
          background: 'transparent', color: C.ice, font: `800 10px/1 ${NUM_FONT}`,
        }}>Open game →</button>
      </div>
    </GameRow>
  )
}
