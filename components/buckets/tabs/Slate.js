'use client'
import { Fragment, useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import CalledExport from '../../CalledExport'
import Tap from '../../Tap'
import GameHeadRow from '../../slate/GameHeadRow'
import TeamMark, { MatchLogos } from '../../TeamMark'
import GameSwitcher from '../../GameSwitcher'
import BoardTopBar from '../../BoardTopBar'
import { useIsPhone } from '../../MobileFold'
import { useHashFilter } from '../../../lib/filterHash'
import { panelPairs, panelSubs, gameSections } from '../../../lib/game/sections'
import { ViewPills, GameFilterRail, SlateStrip, GamePanelPills, PanelAnchor, GameFrame, PrevNextGame } from '../../slate/SlateParts'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard, useBucketsExpected, useBucketsTeamModel, useBucketsHot, useBucketsLive } from '../../../lib/nba/useBuckets'
import { nbaLiveStatus } from '../../../lib/liveStatus'
import { MARKET_OPTIONS, NBA_MARKETS } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { boardRows, boardColumns, faceOf } from '../boardTable'
import { sortGames } from '../GameList'
import BucketsProjected from '../BucketsProjected'
import BucketsWeakSpots from '../BucketsWeakSpots'
import NbaWriteupBlock from '../NbaWriteupBlock'
import NbaH2H from '../../h2h/NbaH2H'
import InjuryOut from '../../injuries/InjuryOut'
import { useOutCounts } from '../../injuries/InjuryLayer'
import { BucketsAttack } from '../../game/SportAttack'
import { nbaGameAngles } from '../../../lib/nba/gameAngles'
import { pickAngles } from '../../../lib/slate/angles'
import { playerHref } from '../../../lib/routes'
import { useLockOf } from '../../MemberGate'
import { heatTier } from '../../../lib/nhl/slateHeat'
import { EXPECTED_POINTS_WORDS } from '../../../lib/nba/teamModel'
import { basisLine } from '../BucketsTeamExpected'
import { BucketsCards } from '../BucketsCard'
import ShareCardButton from '../../card/ShareCardButton'
import GameTotalLine, { GameTotalMark, totalRowFor, useGameTotals } from '../../GameTotalLine'
import { shareUrl, slug, stamp } from '../../../lib/cards/saveCard'
import { EmptyState, DelayedBanner, Loading, Pills, NavBtn, fmtDay, fmtTip, writeHashParam } from '../ui'

// 📋 BUCKETS' SLATE ON THE SHARED FRAME (2026-10-20, Donovan: "the slate is not lining up with other pages on buckets ... buckets
// doesnt feel shared"). LAMP's slate (components/lamp/LampSlate.js), piece for piece, from components/slate/SlateParts: the title,
// the day nav, search / team / game, Table | Games, the All / Live / Upcoming / Final rail, the strip of games (SlateStrip, the shared
// SlateCard), the sticky switcher, ONE open game in GameFrame with its section pills (lib/game/sections.js 'nba' slate), prev / next.
// BUCKETS' own numbers fill it: the team model's expected points on the dial, the board of the market you pick, its calls as cards.
// The open game rides the address (#…&game=<id>), as before.

const PANELS = panelPairs('nba')
const SUBS = panelSubs('nba')
const stateOf = (x) => (x.state === 'live' ? 'live' : x.state === 'final' ? 'final' : 'upcoming')
const shiftDay = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

export default function Slate({ date, setDate, market = 'pts', onOpenPlayer, onOpenTeam, onOpenGame }) {
  const [m, setM] = useState(market)
  const [view, setView] = useState('games')
  const [gfilter, setGfilter] = useState('all')
  const [panel, setPanel] = useState('read')
  const [hashGame, setHashGame] = useHashFilter('game')
  const [query, setQuery] = useState('')
  const [fteam, setFteam] = useHashFilter('fteam')
  const [fgame, setFgame] = useHashFilter('fgame')
  const isPhone = useIsPhone()
  const { data, error, loading } = useBucketsBoard(date, m)
  // the table view reads the points board whatever market the games view is on (its legs are points legs)
  const pts = useBucketsBoard(date, 'pts')
  // the shared live Status: tonight's box lines, asked for only once a game has started
  const live = useBucketsLive(data?.date || date, Boolean(data?.rows?.some((r) => r.gameState && r.gameState !== 'pre'))).data
  const xp = useBucketsExpected(date)
  // THE TEAM MODEL (lib/nba/teamModel.js): expected points a game, the Slate dial (NHL's expected goals, NFL's expected touchdowns)
  const tm = useBucketsTeamModel(date)
  const hot = useBucketsHot(date)   // BEST ANGLES' form row: points over the last 5 games (lib/nba/hot.js)
  const lockOf = useLockOf()   // the member gate for the angle rows: a CALLED, not-started pick a non-member may not read is skipped
  const gameTotals = useGameTotals('nba')
  const outCounts = useOutCounts('nba')
  const tmBy = useMemo(() => new Map((tm.data?.games || []).map((x) => [String(x.id), x])), [tm.data])
  const xptsBy = useMemo(() => new Map((xp.data?.rows || []).map((r) => [String(r.playerId), r])), [xp.data])
  const shown = data?.date || date
  const needle = query.trim().toLowerCase()

  const allGames = sortGames(data?.games || [])
  const all = allGames.filter((x) => (!fgame || String(x.id) === fgame) && (!fteam || x.away.abbrev === fteam || x.home.abbrev === fteam))
  const counts = useMemo(() => {
    const c = { all: all.length, live: 0, upcoming: 0, final: 0 }
    for (const x of all) c[stateOf(x)] += 1
    return c
  }, [all])
  const games = all.filter((x) => gfilter === 'all' || stateOf(x) === gfilter)
  const lead = games.find((x) => stateOf(x) === 'live') || games.find((x) => stateOf(x) === 'upcoming') || games[0] || null
  const activeId = games.some((x) => String(x.id) === hashGame) ? hashGame : (lead ? String(lead.id) : null)
  const select = (id) => {
    setHashGame(String(id))
    if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('buckets-slate-game')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  // the table view, searched: the points board's rows by the search and the team filter
  const ptsRows = (pts.data?.rows || []).filter((r) => (!fteam || r.team === fteam) && (!fgame || String(r.gameId) === fgame) && (!needle || `${r.name} ${r.team}`.toLowerCase().includes(needle)))

  const cards = games.map((x) => {
    const xs = (data?.rows || []).filter((r) => r.gameId === x.id && Number.isFinite(Number(r.score)))
    const best = xs.length ? Math.max(...xs.map((r) => Number(r.score))) : null
    const locked = xs.length > 0 && xs.every((r) => r.locked !== false)
    const st = stateOf(x)
    const m1 = tmBy.get(String(x.id)) || null
    const heat = m1?.heat ?? 0.5
    const tier = heatTier(heat)
    const way = m1?.basis === 'this season' ? '' : ` (${m1?.basis})`
    const ang = nbaGameAngles({ game: x, rows: data?.rows || [], hot: hot.data?.rows || null, hrefOf: (id) => playerHref('nba', id) })
    const angles = pickAngles({ matchup: ang.matchup, form: ang.form, hiddenOf: (c) => lockOf({ status: c.row?.status, key: `${x.id}|${c.key}`, time: x.start, graded: st === 'final' }).locked })
      .map((a) => ({ ...a, onClick: () => onOpenPlayer?.(a.pid) }))
    return {
      large: true, weak: ang.weak, angles,
      id: String(x.id), title: <MatchLogos sport="nba" away={x.away.abbrev} home={x.home.abbrev} px={30} gap={5} />, past: st === 'final',
      heat, tooltip: `${x.away.abbrev} @ ${x.home.abbrev}`,
      dial: { value: m1 ? m1.total : null, dp: 0, pct: m1 ? 100 * heat : null, col: tier === 'hot' ? C.purple : tier === 'cold' ? C.text3 : C.text2,
        title: m1 ? `${m1.total.toFixed(1)} ${EXPECTED_POINTS_WORDS} in this game${way}: ${x.away.abbrev} ${m1.away.pts.toFixed(1)}, ${x.home.abbrev} ${m1.home.pts.toFixed(1)}, from each club's points a game against the other's allowed. The ring fills against every pairing of the league's clubs.${best != null ? ` Best ${NBA_MARKETS[m].label} score here: ${Math.round(best)}.` : ''}` : `No ${EXPECTED_POINTS_WORDS} number for this game yet.` },
      lead: <span title={locked ? 'The board locked before tip' : 'Locks at tip'}>{locked ? '🔒' : '◻'}</span>,
      status: st === 'live' ? { kind: 'live', text: x.detail || 'LIVE' } : st === 'final' ? { kind: 'final', text: `${x.away.score}-${x.home.score} F` } : { kind: 'time', text: fmtTip(x.start) },
      extra: (() => {
        const oc = outCounts([x.away.abbrev, x.home.abbrev])
        const base = <span>{EXPECTED_POINTS_WORDS}{m1 ? ` · ${x.away.abbrev} ${Math.round(m1.away.pts)}, ${x.home.abbrev} ${Math.round(m1.home.pts)}${way}` : ' · —'}{oc?.out ? ` · ${oc.out} out` : ''}</span>
        const tr = totalRowFor(gameTotals, x.id)
        return tr ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{base}<GameTotalMark row={tr} /></span> : base
      })(),
    }
  })

  const g = games.find((x) => String(x.id) === activeId) || null
  const teamLink = (t) => <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={t}><span style={{ display: 'inline-flex', alignItems: 'center' }}><TeamMark sport="nba" abbr={t} variant="logo" px={40} /></span></Tap>
  const switcherGames = games.map((x) => ({ game_pk: String(x.id), away: x.away.abbrev, home: x.home.abbrev, game_time: x.start }))
  const switcherLive = Object.fromEntries(games.filter((x) => stateOf(x) !== 'upcoming').map((x) => [String(x.id), { away_score: x.away.score, home_score: x.home.score }]))

  return (
    <div className="slate-tight phone-slate">
      <PageHeader eyebrow="BUCKETS · SLATE" title="Slate" theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Tonight’s games, tip-off first." right={<CalledExport sport="nba" date={shown || null} C={C} NUM_FONT={NUM_FONT} accent={C.purple} />} />
      {/* desktop: day nav + search + team + game + Table|Games on ONE row (app/globals.css .slate-tight); phone: a plain block */}
      <div className="slate-bar">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading || !shown} ariaLabel="Previous day">{isPhone ? '‹' : '‹ Previous day'}</NavBtn>
          <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
          <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading || !shown} ariaLabel="Next day">{isPhone ? '›' : 'Next day ›'}</NavBtn>
          {shown ? <span className="slate-date" style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 11 }}>{fmtDay(shown)}</span> : null}
        </div>
        {allGames.length > 0 && (
          <>
            <BoardTopBar query={query} setQuery={setQuery} placeholder="Search player or team…"
              team={fteam} setTeam={setFteam} teams={[...new Set([...allGames.flatMap((x) => [x.away.abbrev, x.home.abbrev]), ...(fteam && data ? [fteam] : [])])].sort()} teamLabel="🏀 All teams"
              game={fgame} setGame={setFgame} games={[...(fgame && data && !allGames.some((x) => String(x.id) === fgame) ? [{ key: fgame, label: 'Game not on this slate' }] : []), ...allGames.map((x) => ({ key: String(x.id), label: `${x.away.abbrev} @ ${x.home.abbrev}` }))]} gameLabel="All games" />
            <div style={{ height: 10 }} />
            <ViewPills views={[['table', '📊 Table'], ['games', '🏟 Games']]} view={view} setView={setView} accent={C.purple} />
          </>
        )}
      </div>
      {view === 'table' && all.length > 0 && (
        <>
          <BucketsProjected rows={ptsRows} games={all} onOpenTeam={onOpenTeam} onOpenGame={(id) => { setHashGame(String(id)); setView('games') }} />
          <BucketsWeakSpots rows={ptsRows} games={all} onOpenPlayer={onOpenPlayer} />
        </>
      )}
      <DelayedBanner error={error} what="the slate" />
      {loading && !data ? <Loading what="the slate" /> : null}
      {data && !allGames.length && <EmptyState title="NO GAMES" note={`No NBA games on ${fmtDay(shown)}. Try the next day.`} />}
      {allGames.length > 0 && !all.length && <EmptyState title="NO GAMES CLEAR THIS FILTER" note="Clear the team or game above." />}

      {view === 'games' && all.length > 0 && (
        <>
          <GameFilterRail value={gfilter} onChange={setGfilter} counts={counts} />
          <SlateStrip sport="nba" isPhone={isPhone} rememberKey="buckets_games_fold_v1" accent={C.purple} theme={C}
            open={g ? { away: g.away.abbrev, home: g.home.abbrev } : null} cards={cards} activeId={activeId} onSelect={select}
            legend={<>Ring = {EXPECTED_POINTS_WORDS} (team model). Best angles: the best matchup and the hottest hand. 🔒 locked, ◻ locks at tip.{(() => { const b = basisLine(games.map((x) => tmBy.get(String(x.id))), games.some((x) => x.seasonType === 1)); return b ? ` ${b}` : '' })()}</>} />
          <GameSwitcher sport="nba" games={switcherGames} activeGame={activeId} onSelect={select} live={switcherLive} accent={C.purple} stickyTop="0px" />
        </>
      )}

      {view === 'games' && g && (() => {
        const st = stateOf(g)
        const away = g.away.abbrev; const home = g.home.abbrev
        const rows = boardRows(data, { gameId: g.id, xpts: xptsBy })
        const calls = rows.filter((r) => r.status === 'called').sort((a, b) => b.score - a.score)
        const m1 = tmBy.get(String(g.id)) || null
        const SECTIONS = {
          read: () => (
            <PanelAnchor id="read" gamePk={g.id}>
              <NbaWriteupBlock gameId={g.id} date={shown} onOpenPlayer={onOpenPlayer} />
              {/* one line, not three big tiles (2026-10-20, Donovan: "make that shorter, especially for the phone") */}
              <div style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT, margin: '0 0 6px' }}>
                {m1 ? <><b style={{ color: C.text }}>{away} {m1.away.pts.toFixed(1)}</b>{' · '}<b style={{ color: C.text }}>{home} {m1.home.pts.toFixed(1)}</b> expected points · </> : null}
                {rows.length && rows.every((r) => r.locked !== false) ? 'board locked' : 'board not locked, can still change'}
              </div>
              <div style={{ marginTop: 12 }}><BucketsAttack date={shown} away={away} home={home} onOpenPlayer={onOpenPlayer} /></div>
            </PanelAnchor>
          ),
          board: () => (
            <PanelAnchor id="board" gamePk={g.id} style={{ marginTop: 14 }}>
              {/* the eight markets swipe on a phone (.chip-row) instead of wrapping 4 + 3 + FIRST BASKET alone (layout sweep 10-22) */}
              <div style={{ marginBottom: 8 }}><Pills ariaLabel="Market" className="chip-row" value={m} onChange={(k) => { setM(k); writeHashParam('m', k === 'pts' ? null : k) }} options={MARKET_OPTIONS} /></div>
              {rows.length > 0
                ? <BucketsTable rows={rows} columns={boardColumns(m, { onOpenTeam, onOpenGame, withGame: false, withXpts: true, liveOf: (r) => nbaLiveStatus(m, r, live, NBA_MARKETS[m]?.bar) })} statusOf={(r) => r.status}
                  liveOf={(r) => nbaLiveStatus(m, r, live, NBA_MARKETS[m]?.bar)}
                    onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} nameCell="player" faceOf={faceOf} dimRow={(r) => r.status === 'off'}
                    initialSort={{ key: 'nightRank', dir: 'asc' }} heatMode="sorted" maxHeight={560} maxRows={Math.max(rows.length, 1)}
                    caption={`This game’s board for ${NBA_MARKETS[m].label}. Each row opens that player.`} />
                : <EmptyState title={NBA_MARKETS[m].startersOnly ? 'NO STARTERS LISTED YET' : 'NOBODY RATED IN THIS GAME'} note={NBA_MARKETS[m].startersOnly ? 'First basket waits for the pre-tip box score.' : 'No player in this game has ten NBA games on file.'} />}
            </PanelAnchor>
          ),
          calls: () => (
            <PanelAnchor id="calls" gamePk={g.id} style={{ marginTop: 14 }}>
              {calls.length > 0
                ? <BucketsCards market={m} day={shown || ''} onOpen={onOpenPlayer} rows={calls} />
                : <p style={{ margin: 0, fontSize: 13, color: C.text3 }}>No {NBA_MARKETS[m].label} call in this game.</p>}
            </PanelAnchor>
          ),
          out: () => (
            <PanelAnchor id="out" gamePk={g.id}>
              <InjuryOut sport="nba" clubs={[away, home]} theme={{ C, NUM_FONT, accent: C.purple }} title="Out tonight" openSignal={panel === 'out'}
                openPlayer={(e) => (e.espnId && onOpenPlayer ? () => onOpenPlayer(e.espnId) : null)} onOpenTeam={onOpenTeam} />
            </PanelAnchor>
          ),
          clubs: () => (
            <PanelAnchor id="clubs" gamePk={g.id} style={{ marginTop: 14 }}>
              <NbaH2H a={away} b={home} onOpenTeam={onOpenTeam} />
            </PanelAnchor>
          ),
        }
        return (
          <div id="buckets-slate-game" style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 8px)', marginBottom: 20 }}>
            <GameFrame accent={C.purple} past={st === 'final'}>
              {/* ONE ROW (2026-10-21, Donovan: "space is large for no reason"): components/slate/GameHeadRow.js, shared */}
              <GameHeadRow sport="nba" away={away} home={home} state={st} score={[g.away.score, g.home.score]} onOpenTeam={onOpenTeam}
                status={st === 'live' ? (g.detail || 'LIVE') : st === 'final' ? 'FINAL' : fmtTip(g.start)}
                link={onOpenGame ? <Tap onClick={() => onOpenGame(g.id)}><span style={{ color: C.purple }}>{st === 'upcoming' ? 'Game ›' : 'Box score ›'}</span></Tap> : null}
                dial={{ value: m1 ? m1.total : null, dp: 0, pct: m1 ? 100 * (m1.heat ?? 0.5) : null, col: heatTier(m1?.heat ?? 0.5) === 'hot' ? C.purple : heatTier(m1?.heat ?? 0.5) === 'cold' ? C.text3 : C.text2,
                  title: m1 ? `${m1.total.toFixed(1)} ${EXPECTED_POINTS_WORDS} in this game: ${away} ${m1.away.pts.toFixed(1)}, ${home} ${m1.home.pts.toFixed(1)}` : `No ${EXPECTED_POINTS_WORDS} number for this game yet.`, label: 'pts' }}
                share={<ShareCardButton sport="nba" what="this game" icon url={shareUrl({ kind: 'game', sport: 'nba', game: g.id, market: m, date: shown || null })} filename={`game-${slug(away)}-${slug(home)}_${stamp(shown)}.png`} />} />
              <div style={{ padding: '0 12px' }}>
                <GameTotalLine sport="nba" row={gameTotals?.[String(g.id)]} style={{ marginTop: 2, paddingBottom: 6 }} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                <GamePanelPills panels={PANELS} subs={SUBS} panel={panel} setPanel={setPanel} gamePk={g.id} isPhone={isPhone} accent={C.purple} stickyTop="var(--gsw-h, 0px)"
                  badges={{ calls: calls.length ? String(calls.length) : '', out: (() => { const oc = outCounts([away, home]); return oc?.out ? String(oc.out) : '' })() }} />
                {gameSections('nba', 'slate').map((sec) => <Fragment key={sec.id}>{SECTIONS[sec.id]?.()}</Fragment>)}
              </div>
            </GameFrame>
          </div>
        )
      })()}
      {view === 'games' && <PrevNextGame sport="nba" games={games.map((x) => ({ id: String(x.id), away: x.away.abbrev, home: x.home.abbrev }))} activeId={activeId} idOf={(x) => x.id} onGo={select} accent={C.purple} />}
    </div>
  )
}
