'use client'
import { useEffect, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, LampDot, StaleSeasonNote, PlayerMark, fmtDay, fmtPuckDrop, fmtSec, zoneAbbrev, readHashParam, writeHashParam, shiftDay } from '../ui'

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
const STATUS = { called: 'CALLED', board: 'ON THE BOARD', off: 'NOT ON THE BOARD' }

export default function Board({ onOpenPlayer, onOpenGame, onOpenTeam }) {
  const [date, setDate] = useState(() => { const d = readHashParam('date'); return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null })
  useEffect(() => { writeHashParam('date', date) }, [date])
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

function GameBoard({ g, onOpenPlayer, onOpenGame, onOpenTeam }) {
  const game = g.game
  const scored = g.rows.filter((r) => r.status !== 'off')
  const off = g.rows.filter((r) => r.status === 'off')
  const prev = usePreview(scored, 8)
  const [showOff, setShowOff] = useState(false)
  const live = game.state === 'live'; const done = game.state === 'final'
  const ctx = g.rows[0]?.context || {}
  const stamp = g.graded ? 'GRADED' : g.locked ? 'LOCKED' : 'PREVIEW · NOT A CALL'
  const stampTone = g.graded ? C.cream : g.locked ? C.teal : C.amber
  return (
    <section aria-label={`${game.away.abbrev} at ${game.home.abbrev}`} style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <button type="button" onClick={() => onOpenGame?.(game.id)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <TeamMark abbrev={game.away.abbrev} size={18} bold /><span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>@</span><TeamMark abbrev={game.home.abbrev} size={18} bold />
        </button>
        <span style={{ color: live ? C.lamp : done ? C.text2 : C.text3, font: `800 10px/1 ${NUM_FONT}` }}>{live && <LampDot />}{game.statusLine || `${fmtPuckDrop(game.startUtc)} ${zoneAbbrev()}`}{done || live ? ` · ${game.away.score}–${game.home.score}` : ''}</span>
        <GameTypeChip label={game.gameTypeLabel} />
        <span style={{ color: stampTone, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', border: `1px solid ${stampTone}`, borderRadius: 6, padding: '3px 7px' }}>{stamp}</span>
      </div>
      <div style={{ color: C.text3, fontSize: 10.5, lineHeight: 1.5, marginBottom: 8, fontFamily: NUM_FONT }}>
        {g.locked ? `Locked ${new Date(g.lockedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${g.snapshots} snapshot${g.snapshots === 1 ? '' : 's'}` : `Locks from ${new Date(g.locksAtUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, last write before puck drop`}
        {' · '}{g.lineupKnown ? 'lineup posted — dressed skaters only' : 'lineup not posted — full roster'}
        {ctx.oppGaPg != null ? ` · opp allows ${ctx.oppGaPg.toFixed(2)} GA/GP` : ''}{ctx.b2b ? ' · 2nd of back-to-back' : ''}
        {/* The net. Pregame the feed names no starter, so nothing is printed (rule 16); once graded, who started and his line. */}
        {g.net ? ` · in net: ${g.net}` : ''}
      </div>
      {scored.length === 0 ? <EmptyState title="NOBODY SCORED YET" note="No skater on either roster has ten NHL games on file." /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}>
              <th style={th}>#</th><th style={th}>PLAYER</th><th style={th}>TM</th><th style={{ ...th, textAlign: 'right' }}>SCORE</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>S/GP</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>G/GP</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>TOI</th><th style={{ ...th, textAlign: 'right' }}>{g.graded ? 'GOALS' : 'STATUS'}</th>
            </tr></thead>
            <tbody>
              {prev.shown.map((r) => {
                const called = r.status === 'called'
                const hit = r.hit === true
                return (
                  <FragmentRow key={r.playerId}>
                    <tr style={{ borderTop: `1px solid ${C.border}`, background: hit ? `linear-gradient(90deg, ${C.lamp}14, transparent 50%)` : called ? `${C.ice}0a` : 'transparent', opacity: g.graded && r.dressed === false ? .45 : 1 }}>
                      <td style={{ ...td, fontFamily: NUM_FONT, color: called ? C.ice : C.text3, fontWeight: called ? 900 : 700, fontSize: 11 }}>{r.rank}</td>
                      <td style={td}><PlayerMark name={r.name} onClick={() => onOpenPlayer?.(r.playerId)} /><span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></td>
                      <td style={td}><button type="button" onClick={() => onOpenTeam?.(r.team)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{r.team}</button></td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 14, color: called ? C.text : C.text2 }}>{r.score}</td>
                      <td className="sm-hide" style={num}>{r.legs ? r.legs.shotsPg.toFixed(2) : '—'}</td>
                      <td className="sm-hide" style={num}>{r.legs ? r.legs.goalsPg.toFixed(2) : '—'}</td>
                      <td className="sm-hide" style={num}>{r.legs ? fmtSec(r.legs.toi) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {g.graded
                          ? (r.dressed === false ? <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span> : <span style={{ color: hit ? C.lamp : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{hit && <LampDot />}{r.goals ?? 0}</span>)
                          : <span style={{ color: called ? C.ice : C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[r.status]}</span>}
                      </td>
                    </tr>
                    {called && (
                      <tr><td colSpan={8} style={{ padding: '0 8px 7px 34px', color: C.text3, fontSize: 10.5, fontFamily: NUM_FONT }}>{r.why}</td></tr>
                    )}
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
          <ShowMoreButton open={prev.open} restN={prev.restN} toggle={prev.toggle} itemWord="on the board" />
        </div>
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

function FragmentRow({ children }) { return <>{children}</> }
function NavBtn({ children, onClick, disabled, strong = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${strong ? C.ice : C.border2}`, background: strong ? `${C.ice}14` : C.bg2, color: strong ? C.ice : C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1 }}>{children}</button>
}
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }
