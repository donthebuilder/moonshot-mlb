'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampStandings, useLampBoard } from '../../../lib/nhl/useLamp'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import ScoreTable, { sortGames } from '../ScoreTable'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, fmtDay } from '../ui'
import { NHL_NAV } from '../../../lib/nhl/routes'

// 🏒 TONIGHT — LAMP's front page. Three things and no more (spec §6: the
// home page is not a data wall): tonight's games, where the league stands,
// and what this desk is. The board, the players and the goalies join this
// page when they exist; until then the page says what is coming rather than
// leaving a panel that says "no data".
//
// Long lists preview a few rows (site-wide rule, components/ListPreview.js).
export default function Home({ today, date = null, onOpenGame, setTab }) {
  // `today` is the shell's own read of today's scores (LampDashboard), so
  // the front page and the header lamp share one poll rather than two.
  const scores = today
  const standings = useLampStandings()
  // `today` is the shell's scores for the day the header shows (Today /
  // Tmrw / a paged day, 2026-09-26); the board follows the same day.
  const board = useLampBoard(date)
  const boardGames = board.data?.games || []
  const day = scores.data
  const games = sortGames(day?.games || [])
  const prev = usePreview(games, 6)
  const rows = standings.data?.rows || []
  const leaders = ['Atlantic', 'Metropolitan', 'Central', 'Pacific']
    .map((d) => rows.find((r) => r.divName === d && r.divRank === 1)).filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        eyebrow="LAMP · NHL INTELLIGENCE"
        title={day?.date ? fmtDay(day.date) : 'Tonight'}
        note="Tonight’s games, tonight’s board, the standings — read straight off the league’s feed, the board locked before puck drop and graded in public."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={day ? [
          { value: day.live, label: 'LIVE', tone: day.live ? C.lamp : C.text3 },
          { value: day.final, label: 'FINAL', tone: C.text2 },
          { value: games.length, label: 'GAMES', tone: C.text2 },
        ] : null}
      />

      {/* THE PEOPLE, ONE TAP IN (2026-09-26, stranger test: "where are the
          players?" was the one question still slow -- they sat behind More).
          One line, the pages' own names from the registry. */}
      <nav aria-label="Players, goalies and teams" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: -6 }}>
        {['players', 'goalies', 'teams'].map((k) => (
          <button key={k} type="button" onClick={() => setTab?.(k)} style={link}>{NHL_NAV[k].icon} {NHL_NAV[k].label} ›</button>
        ))}
      </nav>

      <section aria-label="Tonight's games">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Kicker>{date ? 'GAMES' : 'TONIGHT’S GAMES'}</Kicker>
            {(day?.gameTypes || []).map((t) => <span key={t} style={{ marginBottom: 6 }}><GameTypeChip label={t === 1 ? 'PRESEASON' : t === 2 ? 'REGULAR SEASON' : 'PLAYOFFS'} /></span>)}
          </div>
          <button type="button" onClick={() => setTab?.('scores')} style={link}>All scores ›</button>
        </div>
        <DelayedBanner error={scores.error} what="the league’s score feed" />
        {scores.loading && !day ? <Loading what="tonight’s games" /> : null}
        {day && games.length === 0 && !scores.error && (
          <EmptyState title="NO GAMES TODAY" note={day.next ? `The next game day is ${fmtDay(day.next)}. The schedule has the whole week.` : 'Nothing on the league schedule today.'} />
        )}
        {games.length > 0 && (
          <>
            <ScoreTable games={prev.shown} onOpen={onOpenGame} compact />
            <ShowMoreButton open={prev.open} restN={prev.restN} toggle={prev.toggle} itemWord="games" />
          </>
        )}
      </section>

      <section aria-label="Tonight's board">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Kicker>THE BOARD · THREE CALLED PER GAME</Kicker>
          <button type="button" onClick={() => setTab?.('board')} style={link}>Full board ›</button>
        </div>
        {board.loading && !board.data ? <Loading what="the board" /> : null}
        {board.data && boardGames.length === 0 && <EmptyState title="NO BOARD TONIGHT" note="No games, so nothing to call." />}
        {boardGames.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}><th style={th}>GAME</th><th style={th}>CALLED</th><th style={{ ...th, textAlign: 'right' }}>STATE</th></tr></thead>
            <tbody>
              {boardGames.map((g) => {
                const called = g.rows.filter((r) => r.status === 'called')
                const stamp = g.graded ? 'GRADED' : g.locked ? 'LOCKED' : 'PREVIEW'
                return (
                  <tr key={g.game.id} onClick={() => setTab?.('board')} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: NUM_FONT, fontWeight: 800, fontSize: 11 }}>{g.game.away.abbrev}@{g.game.home.abbrev}</td>
                    <td style={{ ...td, fontSize: 11.5, lineHeight: 1.4 }}>{called.map((r, i) => <span key={r.playerId}>{i ? ' · ' : ''}<span style={{ color: r.hit ? C.lamp : C.text }}>{r.name}</span> <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{r.score}</span></span>)}</td>
                    <td style={{ ...td, textAlign: 'right', color: g.graded ? C.cream : g.locked ? C.teal : C.amber, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.12em' }}>{stamp}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Division leaders">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Kicker>DIVISION LEADERS{standings.data?.seasonLabel ? ` · ${standings.data.seasonLabel}${standings.data.stale ? ' FINAL' : ''}` : ''}</Kicker>
          <button type="button" onClick={() => setTab?.('standings')} style={link}>Full standings ›</button>
        </div>
        {standings.data?.stale && (
          <div style={{ color: C.text3, fontSize: 11, margin: '0 0 8px', lineHeight: 1.5 }}>
            Last season’s final table — the new one opens {standings.data.current?.standingsStart ? fmtDay(standings.data.current.standingsStart) : 'with the first regular-season game'}.
          </div>
        )}
        {standings.loading && !standings.data ? <Loading what="the standings" /> : null}
        {leaders.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}><th style={th}>DIVISION</th><th style={th}>TEAM</th><th style={{ ...th, textAlign: 'right' }}>REC</th><th style={{ ...th, textAlign: 'right' }}>PTS</th></tr></thead>
            <tbody>
              {leaders.map((r) => (
                <tr key={r.abbrev} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, color: C.text3, fontSize: 11 }}>{r.divName}</td>
                  <td style={td}><TeamMark abbrev={r.abbrev} name={r.nickname} /></td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }}>{r.w}-{r.l}-{r.otl}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 900 }}>{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="What this is">
        <Kicker tone={C.cream}>THIS DESK</Kicker>
        <p style={{ margin: 0, color: C.text2, fontSize: 12.5, lineHeight: 1.6, maxWidth: 640 }}>
          LAMP is the NHL side of DASH Network: the game itself — scores, schedule, standings, every goal, every player and club, the leaders — and one signal, the goal board: three skaters called per game, locked before puck drop, graded after, the record public. Nothing is priced.{' '}
          <button type="button" onClick={() => setTab?.('guide')} style={{ ...link, display: 'inline', padding: 0 }}>How this works ›</button>
        </p>
      </section>
      <SourceLine>Scores: NHL score/{'{date}'} via /api/lamp/scores. Standings: NHL standings/now via /api/lamp/standings.</SourceLine>
    </div>
  )
}

const link = { background: 'transparent', border: 'none', cursor: 'pointer', color: C.ice, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', padding: 0 }
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '8px 8px', verticalAlign: 'middle' }
