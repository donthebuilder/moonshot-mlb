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
import { C, NUM_FONT, TYPE } from '../../../lib/nhl/theme'
import LampYourPlayers from '../LampYourPlayers'
import { useLampStandings, useLampBoard, useLampLeaders, useLampRecord, useLampHotSticks, useLampSpecialTeams, useLampLedger, useLampSeasonStats } from '../../../lib/nhl/useLamp'
import { buildLampHeadlines } from '../../../lib/nhl/headlines'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import Fold from '../../Fold'
import TonightsCalls from '../../phone/TonightsCalls'
import ScoreTable, { sortGames } from '../ScoreTable'
import LampTable from '../LampTable'
import Tap from '../../Tap'
import { TeamMark, EmptyState, DelayedBanner, Loading, Kicker, GameTypeChip, fmtDay, fmtPuckDrop, zoneAbbrev } from '../ui'
import { NHL_NAV } from '../../../lib/nhl/routes'
import HotNumbers from '../../numerology/HotNumbers'
import { MatchLogos } from '../../TeamMark'
import NhlTonight from '../../tonight/NhlTonight'
import { CardLockLine } from '../../MemberGate'
import { overallRanks } from '../../../lib/positions'
import { useLampCallGate, lampLocked, lampAngles } from './Board'
import TopTenList from '../../home/TopTenList'
import RankList from '../../home/RankList'
import CallStatusBadge from '../../CallStatusBadge'
import ChampionshipFold from '../../ChampionshipFold'
import AwardRaces from '../../AwardRaces'

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
  const boardPrev = usePreview(boardGames, 6)
  // MEMBERS GATE (2026-10-17): "who is called in each game" names only the calls a free viewer may read (the free four, over every game on the board); the rest are not
  // listed and not counted. null gateOf (members, unknown membership): the list is exactly as it was.
  const flatBoard = boardGames.filter((g) => !g.noMarketLock).flatMap((g) => g.rows.map((r) => ({ r, g })))
  const callGate = useLampCallGate(flatBoard, overallRanks(flatBoard, ({ r, g }) => `${g.game.id}|${r.playerId}`, ({ r }) => r.score ?? 0))
  const readableCalls = (g) => g.rows.filter((x) => x.status === 'called' && !lampLocked(callGate, { _row: x, _g: g }))
  const someHidden = Boolean(callGate) && boardGames.some((g) => g.rows.some((x) => x.status === 'called' && lampLocked(callGate, { _row: x, _g: g })))
  // TUDDY'S HOME, SHARED (Donovan 10-18: "share everything NFL got"): Angles and the two Top 10s, from the
  // same board reads, the members gate applied (a locked call is held back and counted, never shown).
  const flatSog = (sogBoard.data?.games || []).filter((g) => !g.noMarketLock).flatMap((g) => g.rows.map((r) => ({ r, g })))
  const sogGate = useLampCallGate(flatSog, overallRanks(flatSog, ({ r, g }) => `${g.game.id}|${r.playerId}`, ({ r }) => r.score ?? 0))
  const topOf = (flat, gate) => {
    const ranked = flat.filter(({ r }) => Number.isFinite(r.score)).sort((a, b) => b.r.score - a.r.score).slice(0, 10)
    const open = ranked.filter(({ r, g }) => !lampLocked(gate, { _row: r, _g: g }))
    return { held: ranked.length - open.length, rows: open.map(({ r, g }) => ({ key: `${g.game.id}|${r.playerId}`, id: r.playerId, name: r.name, team: r.team, pos: r.pos, score: r.score })) }
  }
  const topGoal = topOf(flatBoard, callGate)
  // THE LAMP TWINS (Donovan 10-19 "yes"): TUDDY's power rankings, TD ledger and Look-Out, in hockey, from feeds LAMP already reads.
  //   Offense, ranked  every club by goals a game this season (standings gf / gp), PP% beside it (special teams)
  //   Goal ledger      last night's scorers, goals each, CALLED where LAMP called him (the shared record's status)
  //   Leaky nets       tonight's clubs by goals allowed a game, their starting goalie's save % ("expected" until
  //                    ESPN confirms him) and their PK%; who faces them is the quiet code
  const special = useLampSpecialTeams()
  const lastNight = useLampLedger({ days: 1 })
  const seasonStats = useLampSeasonStats()
  const perGame = (n, gp) => (Number(gp) > 0 && Number.isFinite(Number(n)) ? Number(n) / Number(gp) : null)
  const stRow = new Map((special.data?.teams || []).map((t) => [t.abbrev, t]))
  const pctTxt = (v) => (Number.isFinite(v) ? `${(v * (v <= 1 ? 100 : 1)).toFixed(1)}%` : '—')
  const offenseRows = (standings.data?.rows || []).map((t) => ({ t, gfg: perGame(t.gf, t.gp) })).filter((x) => x.gfg != null)
    .sort((a, b) => b.gfg - a.gfg)
    .map(({ t, gfg }) => ({ key: t.abbrev, team: t.abbrev, name: t.nickname || t.name || t.abbrev, line: `PP ${pctTxt(stRow.get(t.abbrev)?.ppPct)} · ${t.gp} GP`, value: `${gfg.toFixed(2)} G/GP`, onOpen: onOpenTeam ? () => onOpenTeam(t.abbrev) : null }))
  const ledgerRows = (lastNight.data?.season?.hitters || []).filter((h) => Number(h.value) > 0)
    .sort((a, b) => b.value - a.value || (b.score ?? 0) - (a.score ?? 0))
    .map((h) => ({ key: String(h.id), team: h.team, name: h.name, value: <>{h.status === 'called' ? <CallStatusBadge status="called" accent={C.ice} short size={8} theme={C} numFont={NUM_FONT} /> : null}{h.value} G</>, onOpen: onOpenPlayer ? () => onOpenPlayer(Number(h.id)) : null }))
  const goalieByName = new Map((seasonStats.data?.goalies || []).map((x) => [String(x.name).toLowerCase(), x]))
  const leakRows = boardGames.flatMap((g) => ['away', 'home'].map((side) => {
    const team = g.game[side].abbrev, opp = g.game[side === 'away' ? 'home' : 'away'].abbrev
    const st = (standings.data?.rows || []).find((t) => t.abbrev === team)
    const gag = perGame(st?.ga, st?.gp)
    if (gag == null) return null
    const gk = g.starters?.[side]
    const gs = gk?.name ? goalieByName.get(String(gk.name).toLowerCase()) : null
    const sv = gs && Number.isFinite(gs.svPct) ? `.${String(Math.round(gs.svPct * 1000)).padStart(3, '0')}` : null
    const pk = g.spots?.[side]?.pkPct
    const line = [gk?.name ? `${gk.name.split(' ').slice(-1)[0]}${sv ? ` ${sv}` : ''}${gk.confirmed ? '' : ' (exp.)'}` : null, Number.isFinite(pk) ? `PK ${Math.round(pk * (pk <= 1 ? 100 : 1))}%` : null].filter(Boolean).join(' · ')
    return { key: `${g.game.id}|${team}`, team, name: <>{st?.nickname || team} <span data-opp="" style={{ fontWeight: 600, fontSize: 11, color: C.text3 }}>vs {opp}</span></>, line, value: `${gag.toFixed(2)} GA/GP`, gag, onOpen: onOpenTeam ? () => onOpenTeam(team) : null }
  })).filter(Boolean).sort((a, b) => b.gag - a.gag)
  const topSog = topOf(flatSog, sogGate)
  const angleRows = lampAngles(flatBoard, 'GOAL').map((d) => {
    const hits = flatBoard.filter((x) => Number.isFinite(x.r.score) && d.test(x)).sort((a, b) => b.r.score - a.r.score)
    const best = hits.find(({ r, g }) => !lampLocked(callGate, { _row: r, _g: g }))
    return best ? { key: d.key, tag: d.label, n: hits.length, r: best.r } : null   // `tag`, not `label`: an angle, not a table column
  }).filter(Boolean)
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
  // ONE RECORD READ IN SEASON (2026-10-10, Wave 3 data diet). The preseason-inclusive record only differs from the regular-season one
  // by the preseason nights, which are all older than the first regular-season night -- so once the regular-season record has graded
  // calls, its newest night IS the preseason-inclusive record's newest night and its total is the number the hero prints, and the
  // second read answered nothing new. It is asked for only while the regular-season record has none (preseason, a failed read),
  // exactly when the page needs the preseason figures.
  const regHasCalls = Boolean(regT?.calledN) && Boolean(reg.data?.nights?.length)
  const preRead = useLampRecord(60, { pre: true, enabled: !regHasCalls && !reg.loading })
  const pre = regHasCalls ? reg : preRead
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
  const ready = Boolean(day || scores.error) && Boolean(board.data || board.error)
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
          <div className="hero-stats-touch" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <HeroStat theme={C} numFont={NUM_FONT} label="GAMES" value={games.length} title="Games on the day." />
            {firstDrop && <HeroStat theme={C} numFont={NUM_FONT} label="FIRST PUCK DROP" value={fmtPuckDrop(firstDrop)} sub={zoneAbbrev()} title="The first puck drop of the day." />}
            {boardGames.length > 0 && <HeroStat theme={C} numFont={NUM_FONT} label="LOCKED" value={`${lockedN}/${boardGames.length}`} col={allLocked ? C.teal : C.text} title="Games whose board has locked before puck drop." />}
            {graded && <HeroStat theme={C} numFont={NUM_FONT} label="GRADED" value={graded.value} sub={graded.sub} col={C.text} title="Called skaters who dressed and scored, over those who dressed." />}
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

      {/* LAYOUT SHIFT (2026-10-06, CLS 0.3-0.9 on slow 4G): everything under the hero is
          built from the day's scores and the board. Until both have answered it is one
          screen of empty height, so the sections never paint small and then get pushed
          down as each arrives. A failed feed still opens the page (the sections say so). */}
      {!ready ? <div aria-busy="true" style={{ minHeight: '100vh' }}><span style={{ position: 'absolute', left: -9999 }}>Loading…</span></div> : <>
      {/* TONIGHT (2026-10-04): who went, who lines up, who's still to go (components/tonight/NhlTonight.js) */}
      <NhlTonight today={day} board={board.data} date={date} onOpenPlayer={onOpenPlayer} setTab={setTab} />

      {/* TONIGHT'S CALLS AS CARDS (2026-10-18, PHONE-PARITY 9a): MOONSHOT's swipe deck, shut by default. Tonight's list only: a paged day has no deck of its own */}
      {!date && <Fold id="lamp-calls" title="🃏 Tonight's calls" meta="swipe the real cards"><TonightsCalls sport="nhl" /></Fold>}

      {/* THE PEOPLE, ONE TAP IN (2026-09-26, stranger test: "where are the
          players?" was the one question still slow -- they sat behind More).
          One line, the pages' own names from the registry. */}
      <nav aria-label="Players and standings" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: -6 }}>
        {['players', 'standings'].map((k) => (
          <button key={k} type="button" className="tap-box" onClick={() => setTab?.(k)} style={link}>{NHL_NAV[k].icon} {NHL_NAV[k].label} ›</button>
        ))}
      </nav>

      <section aria-label="Tonight's board">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Kicker>THE BOARD · ONE CALLED PER TEAM</Kicker>
          <button type="button" className="tap-box" onClick={() => setTab?.('fullboard')} style={link}>Full board ›</button>
        </div>
        {board.loading && !board.data ? <Loading what="the board" /> : null}
        {board.data && boardGames.length === 0 && <EmptyState title="NO BOARD TONIGHT" note="No games, so nothing to call." />}
        {boardGames.length > 0 && (
          // THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): each game's
          // called skaters (names open the player), its state; the game opens it.
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={40} caption="Tonight's board: who is called in each game"
            rows={boardPrev.shown.map((g) => ({ _key: g.game.id, g, game: `${g.game.away.abbrev}@${g.game.home.abbrev}`, stamp: g.graded ? 'GRADED' : g.locked ? 'LOCKED' : g.setting ? 'SETTING' : 'PREVIEW' }))}
            columns={[
              { key: 'game', label: 'Game', heat: false, sticky: true, w: 90, link: (r) => (onOpenGame ? () => onOpenGame(r.g.game.id) : null), fmt: (_, r) => <MatchLogos sport="nhl" away={r.g.game.away.abbrev} home={r.g.game.home.abbrev} px={16} gap={3} /> },
              { key: 'called',
                // A PREVIEW game's names aren't calls yet (scenario test F10:
                // "CALLED" beside "not a call yet"). Locked/graded -> Called.
                label: boardGames.every((g) => g.locked || g.graded) ? 'Called' : boardGames.some((g) => g.locked || g.graded) ? 'Called · preview = projected' : 'Projected',
                heat: false, numeric: false, w: 260, fmt: (_, r) => (
                <span style={{ fontSize: 11.5, lineHeight: 1.4, whiteSpace: 'normal' }}>
                  {readableCalls(r.g).map((x, i) => (
                    <span key={x.playerId}>{i ? ' · ' : ''}{onOpenPlayer ? <Tap onClick={() => onOpenPlayer(x.playerId)}><span style={{ color: x.hit ? C.ice : C.text }}>{x.name}</span></Tap> : <span style={{ color: x.hit ? C.ice : C.text }}>{x.name}</span>} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{x.score}</span></span>
                  ))}
                </span>) },
              { key: 'stamp', label: 'State', heat: false, w: 70, fmt: (v, r) => <span style={{ color: r.g.graded ? C.cream : r.g.locked ? C.teal : C.amber, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.12em' }}>{v}</span> },
            ]} />
        )}
        {someHidden && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 6 }} />}
        <ShowMoreButton open={boardPrev.open} restN={boardPrev.restN} toggle={boardPrev.toggle} total={boardPrev.total} itemWord="games" />
      </section>


      {/* TONIGHT'S CALLS (BATCH-HEADLINE-PICKS step 3): GOAL and SHOTS, each
          model's called skaters -- MOONSHOT's The Four layout -- then
          Around the League below, the same order MOONSHOT uses. */}
      <LampHeadline theme={C} numFont={NUM_FONT} goalBoard={board.data} sogBoard={sogBoard.data} record={regT ? { ...regT, sog: reg.data?.sog } : null} onOpenPlayer={onOpenPlayer} />
      <section aria-label="Tonight's games">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Kicker>{date ? 'GAMES' : 'TONIGHT’S GAMES'}</Kicker>
            {(day?.gameTypes || []).map((t) => <span key={t} style={{ marginBottom: 6 }}><GameTypeChip label={t === 1 ? 'PRESEASON' : t === 2 ? 'REGULAR SEASON' : 'PLAYOFFS'} /></span>)}
          </div>
          <button type="button" className="tap-box" onClick={() => setTab?.('scores')} style={link}>All scores ›</button>
        </div>
        <DelayedBanner error={scores.error} what="the scores" />
        {scores.loading && !day ? <Loading what="tonight’s games" /> : null}
        {day && games.length === 0 && !scores.error && (
          <EmptyState title="NO GAMES TODAY" note={day.next ? `The next game day is ${fmtDay(day.next)}. The schedule has the whole week.` : 'Nothing on the league schedule today.'} />
        )}
        {games.length > 0 && (
          <>
            <ScoreTable games={prev.shown} onOpen={onOpenGame} compact />
            <ShowMoreButton open={prev.open} restN={prev.restN} toggle={prev.toggle} total={prev.total} itemWord="games" />
          </>
        )}
      </section>

      {/* WAVE 2 (2026-10-11, Donovan: "everything moving toward simplicity with the ability to dive deep into stats").
          The first screen is the hero, tonight's board (one called per team, as a table), the calls and the games. The rest of
          the page -- headlines, your players, storylines, longshots, hot numbers, division leaders -- is one fold, nothing
          deleted. The first table row was y 1,994 on a phone; it was the games list under all of these.
          10-18: open again (the TUDDY Home rule), each piece already a short strip or preview. */}
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* FACES ON THE CARDS (2026-09-29, queue batch 5): MOONSHOT's and TUDDY's
          strips pass faceOf; LAMP's didn't. The shared PlayerFace, table
          variant -- LAMP's circle, and it hides itself if a mug 404s. */}
      <HeadlineStrip sport="nhl" cards={cards} onOpen={openCard} theme={C} numFont={NUM_FONT} accent={C.ice}
        faceOf={(c) => { const url = c.playerId && c.team ? nhlMug(board.data?.season?.current || board.data?.season?.id, c.team, c.playerId) : null; return url ? <PlayerFace sport="nhl" photo={url} variant="table" size={22} theme={C} /> : null }} />
      {/* 2026-09-27 (BATCH-STORYLINES-PAGE step 4): the story engine's rarest
          five (History Watch's claims lead as the rarest), then the Storylines tab. */}
      {/* ⭐ YOUR PLAYERS (2026-10-03): MOONSHOT's section, fed by the scores and board read above. */}
      <LampYourPlayers games={games} board={board.data} onOpenPlayer={onOpenPlayer} />
      <StorylinesStrip sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} max={3} onOpenTeam={onOpenTeam} onSeeAll={() => setTab?.('storylines')} onOpenPlayer={(id) => onOpenPlayer?.(Number(id))} />
      <RankList title="Offense, ranked" sub={standings.data?.seasonLabel || null} rows={offenseRows} sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} onAll={() => setTab?.('standings')} allLabel="Standings" />
      <RankList title="Goal ledger" sub={lastNight.data?.season?.to ? `last night · ${fmtDay(lastNight.data.season.to)}` : 'last night'} rows={ledgerRows} ranked={false} sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} onAll={() => setTab?.('ledger')} allLabel="Ledger" />
      <RankList title="Leaky nets" sub="tonight" rows={leakRows} sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} />
      {/* ANGLES TONIGHT on the shared list (10-19: the old row clipped names at 375): the angle and how many fit it ride the
          line under the name, the score on the right */}
      <RankList title="Angles tonight" ranked={false} sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice}
        rows={angleRows.map((a) => ({ key: a.key, team: a.r.team, name: a.r.name, line: `${a.tag} · ${a.n} fit tonight`, value: a.r.score, onOpen: onOpenPlayer ? () => onOpenPlayer(a.r.playerId) : null }))} />
      <TopTenList title="Top 10 · Goals" rows={topGoal.rows} held={topGoal.held} sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} onOpen={(r) => onOpenPlayer?.(r.id)} onAll={() => setTab?.('fullboard')} />
      <TopTenList title="Top 10 · Shots 3+" rows={topSog.rows} held={topSog.held} sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} onOpen={(r) => onOpenPlayer?.(r.id)} onAll={() => setTab?.('shots')} />
      <LongshotsPreview plain sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} onSeeAll={() => setTab?.('longshots')} onOpenPlayer={(id) => onOpenPlayer?.(id)} />

      {/* TONIGHT'S NUMBERS (numerology v2 step 6b): one line under the board, taps to Numerology. */}
      <HotNumbers compact sport="nhl" date={day?.date || date} theme={C} numFont={NUM_FONT} accent={C.ice} onOpen={() => setTab?.('numerology')} />

      <section aria-label="Division leaders">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Kicker>DIVISION LEADERS{standings.data?.seasonLabel ? ` · ${standings.data.seasonLabel}${standings.data.stale ? ' FINAL' : ''}` : ''}</Kicker>
          <button type="button" className="tap-box" onClick={() => setTab?.('standings')} style={link}>Full standings ›</button>
        </div>
        {standings.data?.stale && (
          <div style={{ color: C.text3, fontSize: 11, margin: '0 0 8px', lineHeight: 1.5 }}>
            Last season’s final table — the new one opens {standings.data.current?.standingsStart ? fmtDay(standings.data.current.standingsStart) : 'with the first regular-season game'}.
          </div>
        )}
        {standings.loading && !standings.data ? <Loading what="the standings" /> : null}
        {leaders.length > 0 && (
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={8} caption="Each division's leader"
            rows={leaders.map((r) => ({ ...r, _key: r.abbrev, rec: `${r.w}-${r.l}-${r.otl}` }))}
            columns={[
              { key: 'nickname', label: 'Team', heat: false, sticky: true, w: 150, fmt: (_, r) => <TeamMark abbrev={r.abbrev} name={r.nickname} onClick={onOpenTeam ? () => onOpenTeam(r.abbrev) : null} /> },
              { key: 'divName', label: 'Division', heat: false, w: 100 },
              { key: 'rec', label: 'Rec', heat: false, mono: true, w: 64 },
              { key: 'pts', label: 'Pts', w: 44, dp: 0, tone: () => ({ color: C.text, weight: 900 }) },
            ]} />
        )}
      </section>

        </div>
      </>
      {/* STANLEY CUP ODDS (2026-10-13): MOONSHOT's October fold for the NHL (components/PennantRace.js). Not drawn until the bot has published the file. */}
      <ChampionshipFold sport="nhl" />
      {/* AWARD RACES (2026-10-20, lib/awards.js + lib/nhl/awards.js): Hart, Vezina, Norris and Calder, a model of past votes. */}
      <AwardRaces sport="nhl" onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} />
      </>}
    </div>
  )
}

const link = { background: 'transparent', border: 'none', cursor: 'pointer', color: C.ice, font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.04em', padding: 0 }
