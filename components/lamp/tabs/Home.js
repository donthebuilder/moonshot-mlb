'use client'
import { dayLine } from '../../../lib/dayLine'
import { useEffect, useState } from 'react'
import HeadlineStrip from '../../HeadlineStrip'
import PlayerFace from '../../PlayerFace'
import { nhlMug } from '../../../lib/nhl/format'
import LampHeadline from '../LampHeadline'
import { C, NUM_FONT, TYPE } from '../../../lib/nhl/theme'
import LampYourPlayers from '../LampYourPlayers'
import { useLampBoard, useLampLeaders, useLampRecord, useLampHotSticks } from '../../../lib/nhl/useLamp'
import { buildLampHeadlines } from '../../../lib/nhl/headlines'
import Fold from '../../Fold'
import TonightsCalls from '../../phone/TonightsCalls'
import { sortGames } from '../ScoreTable'
import { DelayedBanner, Loading, fmtDay } from '../ui'
import { NHL_NAV } from '../../../lib/nhl/routes'
import HotNumbers from '../../numerology/HotNumbers'
import HomeGreeting from '../../home/HomeGreeting'
import SlateRow from '../../home/SlateRow'
import HomeLinks from '../../home/HomeLinks'
import CalledList from '../../CalledList'
import LampTable from '../LampTable'
import RaceTracker from '../../RaceTracker'
import NetworkRow from '../../NetworkRow'
import { useGameTotals } from '../../GameTotalLine'
import { useStoryCards, interleave } from '../../../lib/useStoryCards'
import NhlTonight from '../../tonight/NhlTonight'
import { overallRanks } from '../../../lib/positions'
import { useLampCallGate, lampLocked } from './Board'

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
  // `today` is the shell's scores for the day the header shows (Today /
  // Tmrw / a paged day, 2026-09-26); the board follows the same day.
  const board = useLampBoard(date)
  const sogBoard = useLampBoard(date, 'SOG')
  const boardGames = board.data?.games || []
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
  const day = scores.data
  const games = sortGames(day?.games || [])

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

  // THE HOME, TUDDY'S LAYOUT (2026-10-22, Donovan: "build the same Home for LAMP, BUCKETS and MOONSHOT"): numbers, the greeting
  // (the day, the next puck drop, three tiles, the headlines + stories strip), The Hat Trick, Tonight, your players, the calls, the
  // races, the slate, the link tiles, across the network. Tonight's board, the games table, the ranked lists, Longshots and the
  // division leaders are one tap away; Cup odds and the award races live on Leaders.
  const stories = useStoryCards('nhl', { color: C.ice })
  const totals = useGameTotals('nhl')
  const heroPre = heroGames.filter((g) => g.state === 'pre' && Number.isFinite(g.start)).sort((a, b) => a.start - b.start)
  const nextG = heroPre[0] ? games.find((g) => Date.parse(g.startUtc || '') === heroPre[0].start && g.away?.abbrev === heroPre[0].away) : null
  const kick = nextG ? { away: nextG.away?.name || nextG.away?.abbrev, home: nextG.home?.name || nextG.home?.abbrev, start: Date.parse(nextG.startUtc) } : null
  const sameNight = nextG ? heroPre.length - 1 : 0
  const topG = topGoal.rows[0] || null
  const tiles = [
    { label: 'RECORD · CALLED', value: graded?.value || '—', sub: graded?.sub || 'nothing graded yet', dim: !graded, onClick: () => setTab?.('results') },
    { label: 'TOP GOAL SCORE', value: topG ? Math.round(topG.score) : '—', sub: topG?.name || 'waiting for the board', dim: !topG, onClick: topG && onOpenPlayer ? () => onOpenPlayer(topG.id) : null },
    { label: date ? 'GAMES' : 'TONIGHT', value: games.length, sub: games.length === 1 ? 'game' : 'games' },
  ]
  const slateGames = games.map((g) => ({ id: g.id, away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.startUtc || ''), state: g.state, awayScore: g.away?.score, homeScore: g.home?.score }))
  const LINKS = [
    { tab: 'fullboard', sub: 'every skater, ranked' }, { tab: 'scores', sub: 'every game' }, { tab: 'leaders', sub: 'Cup odds, awards' },
    { tab: 'standings', sub: 'the divisions' }, { tab: 'ledger', sub: 'who scored' }, { tab: 'shots', sub: 'shots 3+ board' },
    { tab: 'results', sub: 'every call graded' }, { tab: 'players', sub: 'find anyone' }, { tab: 'storylines', sub: 'every story' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <HotNumbers compact sport="nhl" date={day?.date || date} theme={C} numFont={NUM_FONT} accent={C.ice} onOpen={() => setTab?.('numerology')} />

      <HomeGreeting sport="nhl" theme={C} numFont={NUM_FONT} icon="🏒" eyebrow={hero.eyebrow} live={Boolean(day?.live)} kick={kick} verb="puck drops" more={sameNight}
        lead={!day ? 'Tonight on LAMP.' : hero.lead} accentText={!day ? '' : games.length ? (allLocked ? 'Grading as they land.' : 'One called per team.') : hero.accent} tiles={tiles}>
        <HeadlineStrip sport="nhl" cards={interleave(cards, stories)} onOpen={openCard} theme={C} numFont={NUM_FONT} accent={C.ice} title="HEADLINES + STORIES" countWord="in the strip"
          faceOf={(c) => { const url = c.playerId && c.team ? nhlMug(board.data?.season?.current || board.data?.season?.id, c.team, c.playerId) : null; return url ? <PlayerFace sport="nhl" photo={url} variant="table" size={22} theme={C} /> : null }} />
      </HomeGreeting>

      {!ready ? <div aria-busy="true" style={{ minHeight: '100vh' }}><span style={{ position: 'absolute', left: -9999 }}>Loading…</span></div> : <>
      {/* THE CALLED LIST (2026-10-25): the locked Card as a table, three rows and a link to the full list; silent until a card is locked */}
      <CalledList sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} Table={LampTable} preview={3} onOpenList={() => setTab?.('calledlist')} onOpenPlayer={(e) => onOpenPlayer?.(e.playerId)} />

      <LampHeadline theme={C} numFont={NUM_FONT} goalBoard={board.data} sogBoard={sogBoard.data} record={regT ? { ...regT, sog: reg.data?.sog } : null} onOpenPlayer={onOpenPlayer} />
      <NhlTonight today={day} board={board.data} date={date} onOpenPlayer={onOpenPlayer} setTab={setTab} />
      <LampYourPlayers games={games} board={board.data} onOpenPlayer={onOpenPlayer} />
      {!date && <Fold id="lamp-calls" title="🃏 Tonight's calls" meta="swipe the real cards"><TonightsCalls sport="nhl" /></Fold>}
      <RaceTracker sport="nhl" theme={C} numFont={NUM_FONT} onOpen={() => setTab?.('leaders')} />
      <DelayedBanner error={scores.error} what="the scores" />
      <SlateRow sport="nhl" theme={C} numFont={NUM_FONT} games={slateGames} totals={totals} onOpenGame={onOpenGame} title={date ? 'THE GAMES' : 'TONIGHT'} />
      <HomeLinks sport="nhl" theme={C} nav={NHL_NAV} links={LINKS} setTab={setTab} label="More on LAMP" />
      <NetworkRow sport="nhl" theme={C} numFont={NUM_FONT} />
      </>}
    </div>
  )
}

const link = { background: 'transparent', border: 'none', cursor: 'pointer', color: C.ice, font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.04em', padding: 0 }
