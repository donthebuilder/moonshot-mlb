'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { rankNight } from '../../../lib/nhl/goalModel'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { EmptyState, DelayedBanner, Loading, SourceLine, LampDot, StaleSeasonNote, PlayerMark, fmtDay, fmtSec, shiftDay } from '../ui'
import { STATUS, NavBtn } from './Board'

// 📋 THE BOARD, NIGHT-WIDE (2026-09-25). Donovan: "is there no boards like
// mlb ranking all the players". MOONSHOT has #tab=fullboard (every hitter,
// #1 to the bottom) and TUDDY has Research; LAMP only had the per-game
// board, and `fullboard` was quietly aliased to it.
//
// Same rows as the Board tab -- one /api/lamp/board read, ordered across
// games by rankNight() (lib/nhl/goalModel.js), which uses the same
// comparator as the in-game rank. Fair because a skater's score is already
// a percentile against the whole night's scored skaters. CALLED still means
// top three IN HIS GAME, so the in-game rank is its own column.
//
// Every row carries its game's stamp. A PREVIEW is not a call; a LOCKED
// score was frozen at that game's lock, so one night can mix snapshots.
const STAMP = { graded: 'GRADED', locked: 'LOCKED', preview: 'PREVIEW' }
const STAMP_TONE = { graded: C.cream, locked: C.teal, preview: C.amber }

// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
export default function FullBoard({ onOpenPlayer, onOpenTeam, date = null, setDate = () => {} }) {
  const { data, error, loading } = useLampBoard(date)
  const games = data?.games || []
  const rows = rankNight(games)
  const offN = games.reduce((n, g) => n + g.rows.filter((r) => r.status === 'off').length, 0)
  const calledN = rows.filter((r) => r.status === 'called').length
  const previewN = rows.filter((r) => r.stamp === 'preview').length
  const prev = usePreview(rows, 10)
  const shown = data?.date || date
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader eyebrow="LAMP · THE BOARD" title={shown ? fmtDay(shown) : 'Tonight'}
        note="Every skater the model scored tonight, all games together, #1 to the bottom by score. CALLED is still the top three in his own game — that is the GAME # column. A PREVIEW row is not a call; a LOCKED score was frozen at its game's lock."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'SKATERS', tone: C.text2 }, { value: calledN, label: 'CALLED', tone: C.ice }, { value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
        <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
        <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{data?.modelVersion?.toUpperCase()}</span>
      </div>
      {data?.season?.stale && <StaleSeasonNote label={data.season.label} opens={data.season.opens} what="legs" />}
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="tonight’s board" /> : null}
      {data && games.length === 0 && <EmptyState title="NO GAMES TODAY" note="Nothing to rank. The schedule has the week." />}
      {data && games.length > 0 && rows.length === 0 && <EmptyState title="NOBODY SCORED YET" note="No skater tonight has ten NHL games on file." />}
      {rows.length > 0 && (
        <div>
          {previewN > 0 && (
            <div style={{ color: C.amber, font: `800 9px/1.5 ${NUM_FONT}`, letterSpacing: '.08em', marginBottom: 8 }}>
              {previewN === rows.length ? 'EVERY GAME IS STILL PREVIEW — NOT A CALL YET' : `${previewN} OF ${rows.length} ROWS ARE PREVIEW — NOT A CALL YET`}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}>
                <th style={th}>#</th><th style={th}>PLAYER</th><th style={th}>TM</th><th style={th}>OPP</th>
                <th style={{ ...th, textAlign: 'right' }}>SCORE</th>
                <th className="sm-hide" style={{ ...th, textAlign: 'right' }}>S/GP</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>G/GP</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>TOI</th>
                <th style={{ ...th, textAlign: 'right' }}>GAME #</th><th style={{ ...th, textAlign: 'right' }}>STATUS</th>
              </tr></thead>
              <tbody>
                {prev.shown.map((r) => {
                  const called = r.status === 'called'
                  const hit = r.hit === true
                  return (
                    <tr key={`${r.gameId}:${r.playerId}`} style={{ borderTop: `1px solid ${C.border}`, background: hit ? `linear-gradient(90deg, ${C.lamp}14, transparent 50%)` : called ? `${C.ice}0a` : 'transparent', opacity: r.graded && r.dressed === false ? .45 : 1 }}>
                      <td style={{ ...td, fontFamily: NUM_FONT, color: C.text3, fontWeight: 700, fontSize: 11 }}>{r.nightRank}</td>
                      <td style={td}><PlayerMark name={r.name} onClick={() => onOpenPlayer?.(r.playerId)} /><span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></td>
                      <td style={td}><button type="button" onClick={() => onOpenTeam?.(r.team)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{r.team}</button></td>
                      <td style={{ ...td, color: C.text3, font: `800 10.5px/1 ${NUM_FONT}`, whiteSpace: 'nowrap' }}>{r.home ? '' : '@'}{r.opp}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 14, color: called ? C.text : C.text2 }}>{r.score}</td>
                      <td className="sm-hide" style={num}>{r.legs ? r.legs.shotsPg.toFixed(2) : '—'}</td>
                      <td className="sm-hide" style={num}>{r.legs ? r.legs.goalsPg.toFixed(2) : '—'}</td>
                      <td className="sm-hide" style={num}>{r.legs ? fmtSec(r.legs.toi) : '—'}</td>
                      <td style={{ ...num, color: called ? C.ice : C.text3, fontWeight: called ? 900 : 700 }}>{r.rank}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.graded
                          ? (r.dressed === false ? <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span> : <span style={{ color: hit ? C.lamp : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{hit && <LampDot />}{r.goals ?? 0}</span>)
                          : <span style={{ color: called ? C.ice : C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[r.status]}</span>}
                        <div style={{ color: STAMP_TONE[r.stamp], font: `800 7px/1 ${NUM_FONT}`, letterSpacing: '.12em', marginTop: 3 }}>{STAMP[r.stamp]}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ShowMoreButton open={prev.open} restN={prev.restN} toggle={prev.toggle} itemWord="on the board" />
          {offN > 0 && (
            <div style={{ marginTop: 8, color: C.text3, font: `800 9px/1.5 ${NUM_FONT}`, letterSpacing: '.08em' }}>
              {offN} NOT ON THE BOARD — UNSCORED, USUALLY FEWER THAN TEN NHL GAMES. EACH GAME ON THE BOARD PAGE PRINTS THE REASON.
            </div>
          )}
        </div>
      )}
      <SourceLine>Same rows as the Board page (lamp_goal_log once a game locks, a live preview before). Ordered by score, then shots/GP, then name — the in-game rank's own order, across every game.</SourceLine>
    </div>
  )
}

const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }
