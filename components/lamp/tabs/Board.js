'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT, rampAt } from '../../../lib/nhl/theme'
import LampTable from '../LampTable'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, LampDot, StaleSeasonNote, fmtDay, fmtPuckDrop, fmtSec, zoneAbbrev, shiftDay } from '../ui'

// 🏒 THE LAMP GOAL BOARD (lamp-goal-v1) — the product's first signal page.
// Per game: every scored skater ranked, the top three CALLED, the rest ON
// THE BOARD, the unscored roster men NOT ON THE BOARD with the reason
// printed. Three words, same meaning as MOONSHOT and TUDDY.
//
// LOCKED vs PREVIEW is printed on every game in capitals: a PREVIEW is the
// same arithmetic run now, before the lock window, and is not a call; a
// LOCKED board is what the record holds (the last write before puck drop,
// app/api/lamp/tick). After the final the GOALS column fills and a hit
// lights the lamp. Every number is a field or a percentile of a field.
export const STATUS = { called: 'CALLED', board: 'ON THE BOARD', off: 'NOT ON THE BOARD' }

// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
export default function Board({ onOpenPlayer, onOpenGame, onOpenTeam, date = null, setDate = () => {} }) {
  const { data, error, loading } = useLampBoard(date)
  const games = data?.games || []
  const lockedN = games.filter((g) => g.locked).length
  const calledN = games.reduce((n, g) => n + g.rows.filter((r) => r.status === 'called').length, 0)
  const shown = data?.date || date
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader eyebrow="LAMP · GOAL BOARD" title={shown ? fmtDay(shown) : 'Tonight'}
        note="Three called per game, locked before puck drop, graded after. Score = mean of three percentile ranks tonight: shots, goals, ice time per game over his last 82 NHL games."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: `${lockedN}/${games.length}`, label: 'LOCKED', tone: lockedN === games.length && games.length ? C.teal : C.text2 }, { value: calledN, label: 'CALLED', tone: C.ice }] : null} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
        <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
        <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{data?.modelVersion?.toUpperCase()}</span>
      </div>
      {data?.season?.stale && <StaleSeasonNote label={data.season.label} opens={data.season.opens} what="legs" />}
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="tonight’s board" /> : null}
      {data && !data.dbReady && <div style={{ color: C.amber, fontSize: 11 }}>The record is not connected on this deployment — boards will preview but nothing locks. (Supabase env missing.)</div>}
      {data && games.length === 0 && <EmptyState title="NO GAMES TODAY" note="Nothing to call. The schedule has the week." />}
      {games.map((g) => <GameBoard key={g.game.id} g={g} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />)}
      <SourceLine>Legs: NHL club-stats/{'{team}'}/{'{season}'}/2 (this season and last); population: roster/{'{team}'}/current, narrowed to the posted lineup when the league has one; grade: gamecenter/{'{id}'}/boxscore. Locked rows live in lamp_goal_log and are never rewritten.</SourceLine>
    </div>
  )
}

// THE BOARD, MADE TO POP (lamp research step 1, 2026-09-26). Same structure
// Donovan likes -- grouped by game, three called on top -- drawn the way
// MOONSHOT's Picks reads: the table is LampTable (DenseTable), SCORE and the
// three legs heat-shaded on LAMP's ice ramp, a called row carries a stripe
// and a filled CALLED chip, and "shots 95th · goals 96th · ice time 69th"
// is three small bars (the same three percentiles, r.pct). Nothing new is
// computed here; every cell is a field the board already had.
const PREVIEW_ROWS = 8

// The filled CALLED chip -- pregame in STATUS, graded beside the goals -- and
// the rank itself filled on a called row, the two marks MOONSHOT's pick rows
// carry. (Beside the name it was clipped by the name cell at 390px.)
function CalledChip() {
  return <span style={{ marginRight: 7, background: C.ice, color: C.bg, font: `900 7.5px/1 ${NUM_FONT}`, letterSpacing: '.12em', borderRadius: 4, padding: '2px 5px', verticalAlign: '1px' }}>{STATUS.called}</span>
}

function PctBars({ r }) {
  if (!r.pct) return null
  const legs = [['S', r.pct.shotsPg, 'shots'], ['G', r.pct.goalsPg, 'goals'], ['T', r.pct.toi, 'ice time']]
  return (
    <span title={r.why} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {legs.map(([k, v, word]) => (
        <span key={k} aria-label={`${word} ${Math.round(v)}th percentile`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ color: C.text3, font: `800 7.5px/1 ${NUM_FONT}` }}>{k}</span>
          <span style={{ width: 22, height: 6, borderRadius: 3, background: C.border, overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(4, Math.min(100, v))}%`, background: rampAt(v / 100) }} />
          </span>
        </span>
      ))}
    </span>
  )
}

function columnsFor(g, onOpenTeam) {
  const graded = g.graded
  return [
    { key: 'rank', label: '#', heat: false, mono: true, w: 28,
      fmt: (v, r) => (r.status === 'called'
        ? <span title="CALLED" style={{ display: 'inline-block', minWidth: 16, textAlign: 'center', background: C.ice, color: C.bg, font: `900 10px/16px ${NUM_FONT}`, borderRadius: 4 }}>{v}</span>
        : v) },
    { key: 'name', label: 'PLAYER', heat: false, sticky: true, bold: true, w: 170,
      fmt: (v, r) => <>{v}<span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></> },
    { key: 'team', label: 'TM', heat: false, mono: true, w: 40,
      fmt: (v) => <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTeam?.(v) }} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{v}</button> },
    { key: 'score', label: 'SCORE', primary: true, scale: 'seq', domain: [0, 100], w: 50 },
    { key: 'spg', label: 'S/GP', primary: true, dp: 2, w: 44 },
    { key: 'gpg', label: 'G/GP', primary: true, dp: 2, w: 44 },
    { key: 'toi', label: 'TOI', primary: true, w: 48, fmt: (v) => (Number.isFinite(v) ? fmtSec(v) : '—') },
    { key: 'pctl', label: 'LEGS', heat: false, w: 118, fmt: (v, r) => (r.status === 'called' ? <PctBars r={r._row} /> : null) },
    { key: 'result', label: graded ? 'GOALS' : 'STATUS', heat: false, w: 96, fmt: (v, r) => {
      const row = r._row
      if (graded) {
        if (row.dressed === false) return <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span>
        return <>{row.status === 'called' ? <CalledChip /> : null}<span style={{ color: row.hit ? C.lamp : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{row.hit && <LampDot />}{row.goals ?? 0}</span></>
      }
      return row.status === 'called' ? <CalledChip /> : <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[row.status]}</span>
    } },
  ]
}

function GameBoard({ g, onOpenPlayer, onOpenGame, onOpenTeam }) {
  const game = g.game
  const scored = g.rows.filter((r) => r.status !== 'off')
  const off = g.rows.filter((r) => r.status === 'off')
  const [showOff, setShowOff] = useState(false)
  const live = game.state === 'live'; const done = game.state === 'final'
  const ctx = g.rows[0]?.context || {}
  const stamp = g.graded ? 'GRADED' : g.locked ? 'LOCKED' : 'PREVIEW · NOT A CALL'
  const stampTone = g.graded ? C.cream : g.locked ? C.teal : C.amber
  // Rank order as the board gives it -- no initial sort, so no "sorted by"
  // line above the table (a phone row the old table didn't spend).
  const rows = [...scored].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map((r) => ({
    id: r.playerId, rank: r.rank, name: r.name, pos: r.pos, team: r.team, score: r.score,
    spg: r.legs ? r.legs.shotsPg : null, gpg: r.legs ? r.legs.goalsPg : null, toi: r.legs ? r.legs.toi : null,
    pctl: r.status === 'called' ? 1 : 0, result: r.status, status: r.status, _row: r,
  }))
  return (
    <section aria-label={`${game.away.abbrev} at ${game.home.abbrev}`} style={{ border: `1px solid ${C.border2}`, borderRadius: 12, background: C.bg2, padding: '8px 10px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <button type="button" onClick={() => onOpenGame?.(game.id)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <TeamMark abbrev={game.away.abbrev} size={22} bold /><span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}` }}>@</span><TeamMark abbrev={game.home.abbrev} size={22} bold />
        </button>
        {done || live
          ? <span style={{ color: live ? C.lamp : C.text, font: `900 17px/1 ${NUM_FONT}` }}>{live && <LampDot />}{game.away.score}–{game.home.score}</span>
          : null}
        <span style={{ color: live ? C.lamp : done ? C.text2 : C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{game.statusLine || `${fmtPuckDrop(game.startUtc)} ${zoneAbbrev()}`}</span>
        <GameTypeChip label={game.gameTypeLabel} />
      </div>
      <div style={{ color: C.text3, fontSize: 10.5, lineHeight: 1.5, marginBottom: 8, fontFamily: NUM_FONT }}>
        {/* The stamp leads this line rather than wrapping the header onto a
            second one at 390px. */}
        <span style={{ color: C.bg, background: stampTone, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', borderRadius: 5, padding: '3px 6px', marginRight: 7, verticalAlign: '1px' }}>{stamp}</span>
        {g.locked ? `Locked ${new Date(g.lockedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${g.snapshots} snapshot${g.snapshots === 1 ? '' : 's'}` : `Locks from ${new Date(g.locksAtUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, last write before puck drop`}
        {' · '}{g.lineupKnown ? 'lineup posted — dressed skaters only' : 'lineup not posted — full roster'}
        {ctx.oppGaPg != null ? ` · opp allows ${ctx.oppGaPg.toFixed(2)} GA/GP` : ''}{ctx.b2b ? ' · 2nd of back-to-back' : ''}
        {/* The net. Pregame the feed names no starter, so nothing is printed (rule 16); once graded, who started and his line. */}
        {g.net ? ` · in net: ${g.net}` : ''}
      </div>
      {scored.length === 0 ? <EmptyState title="NOBODY SCORED YET" note="No skater on either roster has ten NHL games on file." /> : (
        <LampTable rows={rows} columns={columnsFor(g, onOpenTeam)} heatMode="primary" ramp={rampAt}
          rowEdge={(r) => (r.status === 'called' ? C.ice : null)}
          dimRow={(r) => g.graded && r._row.dressed === false}
          maxRows={PREVIEW_ROWS} maxHeight={9999}
          onRowClick={(r) => onOpenPlayer?.(r.id)} />
      )}
      {off.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowOff((v) => !v)} aria-expanded={showOff} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>
            NOT ON THE BOARD · {off.length} {showOff ? '▴' : '▾'}
          </button>
          {showOff && (
            <div style={{ marginTop: 6, color: C.text3, fontSize: 11, lineHeight: 1.6 }}>
              {off.map((r) => <div key={r.playerId}><b style={{ color: C.text2 }}>{r.name}</b> {r.team} · {r.reason}{g.graded && r.hit ? <span style={{ color: C.lamp, fontFamily: NUM_FONT, marginLeft: 6 }}>scored {r.goals}</span> : null}</div>)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function NavBtn({ children, onClick, disabled, strong = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${strong ? C.ice : C.border2}`, background: strong ? `${C.ice}14` : C.bg2, color: strong ? C.ice : C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1 }}>{children}</button>
}
