'use client'
import { dayLine } from '../../../lib/dayLine'
import DayHero from '../../DayHero'
import { useEffect, useState } from 'react'
import HeadlineStrip from '../../HeadlineStrip'
import PlayerFace from '../../PlayerFace'
import { nhlMug } from '../../../lib/nhl/format'
import StorylinesStrip from '../../StorylinesStrip'
import LampHeadline from '../LampHeadline'
import LongshotsPreview from '../../LongshotsPreview'
import HeroStat from '../../HeroStat'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampStandings, useLampBoard, useLampLeaders, useLampRecord, useLampHotSticks } from '../../../lib/nhl/useLamp'
import { buildLampHeadlines } from '../../../lib/nhl/headlines'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import ScoreTable, { sortGames } from '../ScoreTable'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, fmtDay, fmtPuckDrop, zoneAbbrev } from '../ui'
import { NHL_NAV } from '../../../lib/nhl/routes'
import HotNumbers from '../../numerology/HotNumbers'

// 🏒 TONIGHT — LAMP's front page. Three things and no more (spec §6: the
// home page is not a data wall): tonight's games, where the league stands,
// and what this desk is. The board, the players and the goalies join this
// page when they exist; until then the page says what is coming rather than
// leaving a panel that says "no data".
//
// Long lists preview a few rows (site-wide rule, components/ListPreview.js).
export default function Home({ onOpenTeam = null, today, date = null, onOpenGame, onOpenPlayer, setTab }) {
  // `today` is the shell's own read of today's scores (LampDashboard), so
  // the front page and the header lamp share one poll rather than two.
  const scores = today
  const standings = useLampStandings()
  // `today` is the shell's scores for the day the header shows (Today /
  // Tmrw / a paged day, 2026-09-26); the board follows the same day.
  const board = useLampBoard(date)
  const sogBoard = useLampBoard(date, 'SOG')
  const boardGames = board.data?.games || []
  const day = scores.data
  const games = sortGames(day?.games || [])
  const prev = usePreview(games, 6)
  const rows = standings.data?.rows || []
  const leaders = ['Atlantic', 'Metropolitan', 'Central', 'Pacific']
    .map((d) => rows.find((r) => r.divName === d && r.divRank === 1)).filter(Boolean)

  // ── THE HERO, MOONSHOT'S SHAPE (2026-09-26, shell-parity step 2) ─────────
  // Every number below is a field: games and first puck drop off the day's
  // scores, LOCKED off the board, GRADED and the crawl off the record.
  // Regular season leads; before the first regular-season night the record
  // falls back to preseason and says so.
  const leagueLeaders = useLampLeaders()
  const reg = useLampRecord(60)
  const regT = reg.data?.total
  const pre = useLampRecord(60, { pre: true })
  const lockedN = boardGames.filter((g) => g.locked).length
  const allLocked = boardGames.length > 0 && lockedN === boardGames.length
  const firstDrop = games.map((g) => g.startUtc).filter(Boolean).sort()[0] || null
  const preT = pre.data?.total
  const graded = regT?.calledN
    ? { value: `${regT.calledHits}/${regT.calledN}`, sub: 'called scored' }
    : preT?.calledN ? { value: `${preT.calledHits}/${preT.calledN}`, sub: 'called scored · preseason' } : null
  // The latest graded night, preseason included; it IS preseason when the
  // regular-season record doesn't carry that date.
  const last = pre.data?.nights?.[0] || null
  const lastIsPre = Boolean(last && !(reg.data?.nights || []).some((n) => n.date === last.date))
  // 📜 HISTORY WATCH (milestones plan step 3): the rarest goal claim one
  // goal away leads the strip; empty until the regular season has games.
  const [hist, setHist] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/history/watch?sport=nhl').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHist(j?.items?.[0] || null) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const hotSticks = useLampHotSticks()
  const baseCards = buildLampHeadlines({ board: board.data, leaders: leagueLeaders.data, record: pre.data, hot: hotSticks.data, C })
  const cards = hist ? [{ k: `hist-${hist.player_id}`, tag: 'HISTORY WATCH', icon: '📜', name: hist.name, why: `One more: ${hist.claim}.`, stat: `${hist.hr} G`, col: C.amber, playerId: Number(hist.player_id) }, ...baseCards] : baseCards
  const openCard = (c) => (c.playerId ? onOpenPlayer?.(c.playerId) : c.gameId ? onOpenGame?.(c.gameId) : null)
  const dayWord = date ? `on ${fmtDay(date)}` : 'tonight'
  const heroGames = games.map((g) => ({ away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.startUtc || ''), state: g.state === 'live' ? 'live' : g.state === 'final' ? 'final' : 'pre' }))
  const typeWord = (day?.gameTypes || []).map((t) => (t === 1 ? 'PRESEASON' : t === 2 ? 'REGULAR SEASON' : 'PLAYOFFS')).join(' / ')
  const hero = dayLine(heroGames, { sport: 'nhl', date: day?.date || date || undefined, label: typeWord, next: day?.next ? { date: day.next } : null })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* THE DAY, MOONSHOT'S HERO (2026-09-28, DAY-AWARE-OPENERS-PLAN): the same
          components/DayHero.js MOONSHOT and TUDDY open with, fed by lib/dayLine.js
          from this day's scores -- the day, what's on, its state, the next night
          when there is none. The chips and the crawl are LAMP's own, below it. */}
      <DayHero
        icon="🏒" eyebrow={hero.eyebrow} live={Boolean(day?.live)}
        lead={!day ? 'Tonight on LAMP.' : hero.lead}
        accentText={!day ? '' : games.length ? (allLocked ? 'Grading as they land.' : 'One called per team.') : hero.accent}
        // The chip row only carries a fact on a game night; an off night has
        // nothing to add there, and the opener may not grow on a phone.
        chip={games.length ? '🏒 GAME NIGHT' : null}
        sub={games.length ? (boardGames.length ? `${lockedN} of ${boardGames.length} boards locked before puck drop` : 'boards lock before puck drop') : null}
        accent={C.ice} grad={[C.ice, C.teal]} headingLevel="h2" theme={C}
      >
        {games.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <HeroStat theme={C} numFont={NUM_FONT} label="GAMES" value={games.length} title="Games on the day (/api/lamp/scores)." />
            {firstDrop && <HeroStat theme={C} numFont={NUM_FONT} label="FIRST PUCK DROP" value={fmtPuckDrop(firstDrop)} sub={zoneAbbrev()} title="Earliest startUtc on the day (/api/lamp/scores)." />}
            {boardGames.length > 0 && <HeroStat theme={C} numFont={NUM_FONT} label="LOCKED" value={`${lockedN}/${boardGames.length}`} col={allLocked ? C.teal : C.text} title="Games whose board has locked before puck drop (/api/lamp/board games[].locked)." />}
            {graded && <HeroStat theme={C} numFont={NUM_FONT} label="GRADED" value={graded.value} sub={graded.sub} col={C.lamp} title="Called skaters who dressed and scored, over those who dressed (/api/lamp/record total calledHits/calledN)." />}
          </div>
        )}
        {/* THE CRAWL: the latest graded night in one sentence, its real
            numbers. calledN counts called skaters who DRESSED -- a called man
            who was scratched is void, not a miss -- so the line says so. */}
        {last ? (
          <p style={{ margin: '10px 0 0', color: C.text2, fontSize: 12, lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>{fmtDay(last.date)}{lastIsPre ? ' (preseason)' : ''}:</b>{' '}
            {last.calledHits} of {last.calledN} called skaters who dressed scored · {last.scorersCalled} of {last.scorers} goal scorers were called, {last.scorersOnBoard} more on the board.
          </p>
        ) : null}
      </DayHero>

      {/* THE PEOPLE, ONE TAP IN (2026-09-26, stranger test: "where are the
          players?" was the one question still slow -- they sat behind More).
          One line, the pages' own names from the registry. */}
      <nav aria-label="Players, goalies and teams" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: -6 }}>
        {['players', 'goalies', 'teams'].map((k) => (
          <button key={k} type="button" onClick={() => setTab?.(k)} style={link}>{NHL_NAV[k].icon} {NHL_NAV[k].label} ›</button>
        ))}
      </nav>

      {/* TONIGHT'S CALLS (BATCH-HEADLINE-PICKS step 3): GOAL and SHOTS, each
          model's top three called skaters -- MOONSHOT's The Four layout -- then
          Around the League below, the same order MOONSHOT uses. */}
      <LampHeadline theme={C} numFont={NUM_FONT} goalBoard={board.data} sogBoard={sogBoard.data} record={regT} onOpenPlayer={onOpenPlayer} />
      {/* FACES ON THE CARDS (2026-09-29, queue batch 5): MOONSHOT's and TUDDY's
          strips pass faceOf; LAMP's didn't. The shared PlayerFace, table
          variant -- LAMP's circle, and it hides itself if a mug 404s. */}
      <HeadlineStrip cards={cards} onOpen={openCard} theme={C} numFont={NUM_FONT} accent={C.ice}
        faceOf={(c) => { const url = c.playerId && c.team ? nhlMug(board.data?.season?.current || board.data?.season?.id, c.team, c.playerId) : null; return url ? <PlayerFace sport="nhl" photo={url} variant="table" size={22} theme={C} /> : null }} />
      {/* 2026-09-27 (BATCH-STORYLINES-PAGE step 4): the story engine's rarest
          five (History Watch's claims lead as the rarest), then the Storylines tab. */}
      <StorylinesStrip sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} max={5} onOpenTeam={onOpenTeam} onSeeAll={() => setTab?.('storylines')} onOpenPlayer={(id) => onOpenPlayer?.(Number(id))} />
      <LongshotsPreview sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} onSeeAll={() => setTab?.('longshots')} onOpenPlayer={(id) => onOpenPlayer?.(id)} />

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

      {/* TONIGHT'S NUMBERS (numerology v2 step 6b): one line under the board, taps to Numerology. */}
      <HotNumbers compact sport="nhl" date={day?.date || date} theme={C} numFont={NUM_FONT} accent={C.ice} onOpen={() => setTab?.('numerology')} />

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
                  <td style={td}><TeamMark abbrev={r.abbrev} name={r.nickname} onClick={onOpenTeam ? () => onOpenTeam(r.abbrev) : null} /></td>
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
