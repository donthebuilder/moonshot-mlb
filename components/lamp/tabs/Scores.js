'use client'
import { FLAT_CHIP_CLASS, flatChip } from '../../../lib/chips'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampScores } from '../../../lib/nhl/useLamp'
import { useState } from 'react'
import { sortGames, GoalLines } from '../ScoreTable'
import GameRow from '../../GameRow'
import TeamMark from '../../TeamMark'
import { EmptyState, DelayedBanner, Loading, GameTypeChip, LampDot, fmtDay, shiftDay, zoneAbbrev, fmtPuckDrop } from '../ui'
import { localTime } from '../../../lib/localTime'
import NflNote from '../../nfl/NflNote'
import { LAMP_SUBS } from '../tabExplainerTexts'
import PageViews from '../../PageViews'
import Schedule from './Schedule'

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
// 2026-10-17 (simplify audit 14): the schedule is this page's second view, "Week". #tab=schedule is an alias that lands
// here with lens=week (lib/routes.js ALIAS_PARAMS); the day picker and the week picker both move the shell's one date.
// Only the chosen view is mounted: the Week view reads /api/lamp/schedule once and never touches the live scores feed.
export default function Scores({ onOpenGame, date = null, setDate = () => {} }) {
  return <PageViews views={[
    { key: 'day', label: 'Day', node: <Day onOpenGame={onOpenGame} date={date} setDate={setDate} /> },
    { key: 'week', label: 'Week', node: <Schedule onOpenGame={onOpenGame} date={date} setDate={setDate} /> },
  ]} />
}

function Day({ onOpenGame, date = null, setDate = () => {} }) {
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
        note={<NflNote tab="scores" subs={LAMP_SUBS} sub={`Every game that day, in your time zone (${zoneAbbrev()}).`} color={C.text2} />}
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

    </div>
  )
}

function NavBtn({ children, onClick, disabled, strong = false }) {
  return (
    // a pager is the site's one chip (lib/chips.js flatChip, 10-22); 44px to the thumb through .tap-box
    <button type="button" className={FLAT_CHIP_CLASS} onClick={onClick} disabled={disabled} style={flatChip(strong, C.ice, C, NUM_FONT, { disabled })}>{children}</button>
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
