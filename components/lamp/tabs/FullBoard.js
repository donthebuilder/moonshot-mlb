'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { rankNight } from '../../../lib/nhl/goalModel'
import LampTable from '../LampTable'
import { nhlMug } from '../../../lib/nhl/format'
import { EmptyState, DelayedBanner, Loading, SourceLine, LampDot, StaleSeasonNote, fmtDay, fmtSec, shiftDay } from '../ui'
import { STATUS, NavBtn } from './Board'
import { nhlFullRows, nhlFullColumns } from '../../../lib/nhl/boardColumns'

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
const STAMP = { graded: 'GRADED', locked: 'LOCKED', setting: 'SETTING', preview: 'PREVIEW' }
const STAMP_TONE = { graded: C.cream, locked: C.teal, setting: C.ice, preview: C.amber }

// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
// THE BOARD'S GROUPS (2026-10-01, BATCH-TABLE-SKIN-V2): read by the v2 skin
// only. `status` is the board's own status column (scoreNight's word plus the
// graded result), so v2 keeps it rather than stamping a second one.
const LG = {
  call: { key: 'call', label: 'Call', order: 0 },
  signal: { key: 'signal', label: 'The signal', order: 1 },
  shooter: { key: 'shooter', label: 'The shooter', order: 2 },
}
const LAMP_GROUP_OF = { nightRank: LG.call, name: LG.call, pos: LG.call, team: LG.call, oppTxt: LG.call, status: LG.call, score: LG.signal, rank: LG.signal, sPg: LG.shooter, gPg: LG.shooter, toi: LG.shooter }
const lampBoardGroups = (cols) => cols.map((c) => ({ ...c, group: LAMP_GROUP_OF[c.key] || LG.shooter, ...(c.key === 'status' ? { statusCol: true } : {}), ...(c.key === 'score' ? { bar: 'primary' } : {}) }))

export default function FullBoard({ onOpenPlayer, onOpenTeam, date = null, setDate = () => {} }) {
  const { data, error, loading } = useLampBoard(date)
  const games = data?.games || []
  const rows = rankNight(games)
  const offN = games.reduce((n, g) => n + g.rows.filter((r) => r.status === 'off').length, 0)
  const calledN = rows.filter((r) => r.status === 'called').length
  const previewN = rows.filter((r) => r.stamp === 'preview').length
  // Faces: a mug is keyed by the game's season (Board.js's nhlMug call).
  const seasonOf = new Map(games.map((g) => [g.game?.id, g.game?.season]))
  const shown = data?.date || date
  const fbRows = nhlFullRows(rows.map((r) => ({ ...r, _key: `${r.gameId}:${r.playerId}`, _raw: r,
    oppTxt: `${r.home ? '' : '@'}${r.opp}`, sPg: r.legs ? r.legs.shotsPg : null, gPg: r.legs ? r.legs.goalsPg : null, toi: r.legs ? r.legs.toi : null })))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader eyebrow="LAMP · RANKINGS" title={shown ? fmtDay(shown) : 'Tonight'}
        note="Every skater the model scored tonight, all games together, #1 to the bottom by score. CALLED is still the top skater on his team in his own game — that is the GAME # column. A PREVIEW row is not a call; a LOCKED score was frozen at its game's lock."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'SKATERS', tone: C.text2 }, { value: calledN, label: 'CALLED', tone: C.ice }, { value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
        <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
        <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{data?.modelVersion?.toUpperCase()}</span>
      </div>
      {data?.season?.stale && <StaleSeasonNote label={data.season.label} opens={data.season.opens} what="per-game stats" />}
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
          {/* MOONSHOT'S TABLE (2026-09-29, Donovan: "make sure the nhl side is up
              to date with all the components"). Was a hand-built <table>; now
              LampTable (DenseTable): every column sorts, the name column sticks,
              faces, and the team and opponent open the club. */}
          <LampTable
            rows={fbRows}
            // groups (BATCH-TABLE-SKIN-V2 decision C; the v2 skin only): the call,
            // the signal (score + his rank in his game), the shooter's legs
            statusOf={(r) => r.status}
            // its own columns, then the full set (R6, lib/nhl/boardColumns.js)
            columns={nhlFullColumns(fbRows, lampBoardGroups([
              { key: 'nightRank', label: '#', w: 36, heat: false, mono: true, dim: true },
              { key: 'name', label: 'Player', w: 150, heat: false, bold: true, sticky: true },
              { key: 'pos', label: 'Pos', w: 34, heat: false, mono: true, dim: true },
              { key: 'team', label: 'Tm', w: 62, heat: false, mono: true, teamMark: 'nhl', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
              { key: 'oppTxt', label: 'Opp', w: 44, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
              { key: 'score', label: 'Score', w: 54, dp: 0, primary: true, title: 'The model’s 0-100 score, a percentile against every scored skater tonight' },
              { key: 'sPg', label: 'S/GP', w: 48, dp: 2, title: 'Shots per game' },
              { key: 'gPg', label: 'G/GP', w: 48, dp: 2, title: 'Goals per game' },
              { key: 'toi', label: 'TOI', w: 48, fmt: (v) => fmtSec(v), title: 'Ice time per game' },
              { key: 'rank', label: 'Game #', w: 52, heat: false, mono: true,
                fmt: (v, r) => <span style={{ color: r.status === 'called' ? C.ice : C.text3, fontWeight: r.status === 'called' ? 900 : 700 }}>{v}</span>,
                title: 'His rank in his own game. CALLED is the top-scored skater on each team (lamp-goal-v2).' },
              { key: 'status', label: 'Status', w: 74, heat: false,
                fmt: (v, r) => (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {r.graded
                      ? (r.dressed === false ? <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span> : <span style={{ color: r.hit === true ? C.lamp : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{Number.isFinite(r.goals) ? <>{r.hit === true && <LampDot />}{r.goals}</> : '\u2014'}</span>)
                      : <span style={{ color: r.status === 'called' ? C.ice : C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[r.status]}</span>}
                    <span style={{ color: STAMP_TONE[r.stamp], font: `800 7px/1 ${NUM_FONT}`, letterSpacing: '.12em', marginLeft: 5 }}>{STAMP[r.stamp]}</span>
                  </span>
                ) },
            ]))}
            onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)}
            faceOf={(r) => ({ sport: 'nhl', photo: nhlMug(seasonOf.get(r.gameId), r.team, r.playerId), name: r.name })}
            dimRow={(r) => r.graded && r.dressed === false}
            initialSort={{ key: 'nightRank', dir: 'asc' }}
            heatMode="sorted"
            maxHeight={620}
            maxRows={Math.max(rows.length, 1)}
            caption="Every scored skater tonight, #1 to the bottom. Column headers sort; each row opens that skater; the team and opponent open the club."
          />
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
