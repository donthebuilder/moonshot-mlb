'use client'
import { useEffect, useMemo, useState } from 'react'
import { SportTheme } from '../../SportTheme'
// THE SHARED PLAYER MODEL (components/player/): the verdict first, then ONE row of his numbers; BUCKETS' words in nbaAdapter.js
import VerdictBlock from '../../player/VerdictBlock'
import StatRow from '../../player/StatRow'
import ScrollHint from '../../player/ScrollHint'
import { nbaVerdict, nbaStatRow } from '../../player/nbaAdapter'
import HisNumbers from '../../HisNumbers'
import InTheLedger from '../../ledger/InTheLedger'
import PlayerNotes from '../../PlayerNotes'
import FollowButton from '../../FollowButton'
import CardButton from '../../CardButton'
import { downloadBucketsPlayerCard } from '../shareCard'
import StarMemory from '../../watch/StarMemory'
import CallStatusBadge from '../../CallStatusBadge'
import TeamMark from '../../TeamMark'
import Tap from '../../Tap'
import SeasonToggle from '../../nfl/SeasonToggle'
import { TabBtn, Navigator } from '../../card/CardNav'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { hashParams, writeHash, cardViewPush } from '../../../lib/urlState'
import { playerHref } from '../../../lib/routes'
import { DETAIL_MARK, PEEK_MARK, VIEWS_KEY } from '../../../lib/useShellRoute'
import { etToday } from '../../../lib/freshness'
import { useBucketsPlayer, useBucketsBoard, useBucketsDefense } from '../../../lib/nba/useBuckets'
import { PLAYER_ID_RE } from '../../../lib/nba/ids'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import { unpackShots } from '../../../lib/nba/shots'
import { seasonOptions, defaultSeason, applySeason, yearLabel } from '../../../lib/nba/seasonWindow'
import { buildGames, aggregate } from '../../../lib/nba/splits'
import BucketsTable from '../BucketsTable'
import PlayerSplits from '../PlayerSplits'
import ShotChart from '../ShotChart'
import PlayerBars from '../PlayerBars'
import PlayerDdTd from '../PlayerDdTd'
import { EmptyState, DelayedBanner, Loading, Kicker, BackBtn, PlayerFace, SeasonTypeChip, fmtDay, fmtTip, RimDot } from '../ui'

// 📄 ONE PLAYER -- MOONSHOT's card, as a page (NHL's components/lamp/tabs/Player.js is the closest pattern, TUDDY's
// NflPlayerModal the other): a sticky header (who, which club, the board's word and score, his key numbers) over
// pill tabs, the tab in the address (view=). Overview | Splits | Game log | VS | Shots | Board.
//   Overview   BUCKETS ON HIM (the shared verdict + one stat row), tonight's PROJECTED POINTS, the season lines, last five, the bars, In the
//              ledger, His numbers
//   Splits     home/away, win/loss, rest days, minutes, vs opponent, last 5/10 (lib/nba/splits.js), a season toggle
//   Game log   every game, newest first, "+N more"
//   VS         his games against one club, beside what that club allows
// The season toggle (THIS SEASON | LAST SEASON | LAST 2 SEASONS) mirrors TUDDY's and appears only when both seasons
// are on file (lib/nba/seasonWindow.js). Every number is ESPN's or the log's; projected points is a MEASURED projection
// of a box-score count (lib/nba/expectedPoints.js), said so where it is shown.
const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'splits', label: '📅 Splits' },
  { key: 'log', label: '📋 Game log' },
  { key: 'vs', label: '🆚 VS' },
  { key: 'shots', label: '🎯 Shots' },
  { key: 'board', label: 'The board' },
]
// the tab the address names (view=), else Overview
const initialTab = () => { try { const v = hashParams().get('view'); return VIEWS.some((x) => x.key === v) ? v : 'overview' } catch { return 'overview' } }

const lineCols = [
  { key: 'label', label: 'Season', group: 'Season', w: 72, heat: false, sticky: true, bold: true },
  { key: 'gp', label: 'GP', group: 'Per game', w: 36, heat: false, mono: true },
  { key: 'min', label: 'MIN', group: 'Per game', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'pts', label: 'PTS', group: 'Per game', w: 44, heat: false, mono: true, dp: 1, bold: true },
  { key: 'reb', label: 'REB', group: 'Per game', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'ast', label: 'AST', group: 'Per game', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'fga', label: 'FGA', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'tpm', label: '3PM', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'tpa', label: '3PA', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'tp', label: '3P%', group: 'Shooting', w: 48, heat: false, mono: true },
  { key: 'fta', label: 'FTA', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
]

export default function Player({ id, onBack, backLabel = 'Players', onOpenTeam, onOpenGame, onStep = null, peek = false }) {
  const ok = PLAYER_ID_RE.test(String(id || ''))
  const { data, error, loading } = useBucketsPlayer(ok ? id : null)
  if (!id) return <EmptyState title="NO PLAYER PICKED" note="Open a player from Players, a board or a box score."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!ok) return <EmptyState title="NO SUCH PLAYER" note={`“${String(id).slice(0, 20)}” isn’t an NBA player id.`}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !data) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} /><Loading what="his file" /></div>
  if (!data?.card) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} />{error && error.status !== 404 && error.status !== 400 ? <DelayedBanner error={error} what="player data" /> : <EmptyState title="NO SUCH PLAYER" note="The league has no NBA player with that id — the link may be old or cut short." />}</div>
  return <PlayerBody key={data.card.id} data={data} error={error} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} onBack={onBack} backLabel={backLabel} onStep={onStep} peek={peek} />
}

function PlayerBody({ data, error, onOpenTeam, onOpenGame, onBack, backLabel, onStep, peek }) {
  const { card, lines } = data
  const pid = String(card.id)
  // ── the board's row on him (tonight's PTS board): the card's score, word and why ──
  const { data: board } = useBucketsBoard(null, 'pts')
  const row = useMemo(() => (board?.rows || []).find((r) => String(r.playerId) === pid) || null, [board, pid])
  const game = row ? (board?.games || []).find((g) => g.id === row.gameId) : null
  const called = row?.status === 'called'
  const oppTxt = row ? `${row.home ? 'vs' : '@'} ${row.opp}` : data.nextGame ? `${data.nextGame.home ? 'vs' : '@'} ${data.nextGame.opp}` : null
  const tip = game?.start || data.nextGame?.start || null
  const gamePos = oppTxt ? `${oppTxt}${tip ? ` · ${game?.state === 'live' ? 'LIVE' : game?.state === 'final' ? 'FINAL' : fmtTip(tip)}` : ''}` : null
  const peers = useMemo(() => (board?.rows || []).filter((r) => r.status !== 'off' && r.score != null).map((r) => ({ id: String(r.playerId), name: r.name, team: r.team, score: r.score, game_pk: r.gameId })).sort((a, b) => b.score - a.score), [board])
  const cur = peers.find((x) => x.id === pid) || { id: pid, name: card.name, team: card.team }

  // ── the tab, in the address ──
  const [view, setViewState] = useState(initialTab)
  useEffect(() => {
    const on = () => setViewState(initialTab())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const pick = (k) => {
    setViewState(k)
    try {
      const h = hashParams()
      if (k === 'overview') h.delete('view'); else h.set('view', k)
      const mark = window.history.state?.[PEEK_MARK] || h.get('pm') ? PEEK_MARK : DETAIL_MARK
      writeHash(h, { push: true, state: cardViewPush(mark, VIEWS_KEY) })
    } catch { /* the tab still switches without the address */ }
  }

  // ── seasons: both on file, each game tagged with its season ──
  const allLog = data.logs || []
  const opts = useMemo(() => seasonOptions(allLog, data.nowSeason), [allLog, data.nowSeason])
  const [season, setSeason] = useState(() => defaultSeason(opts, allLog, data.nowSeason))
  const seasonKey = opts.some((o) => o.key === season) ? season : ''
  const winLog = useMemo(() => (seasonKey ? applySeason(allLog, seasonKey, data.nowSeason) : allLog), [allLog, seasonKey, data.nowSeason])
  const games = useMemo(() => buildGames(winLog, data.clubGames || {}), [winLog, data.clubGames])
  const windowLabel = seasonKey
    ? (opts.find((o) => o.key === seasonKey)?.years || []).slice().reverse().map(yearLabel).join(' + ')
    : [...new Set(winLog.map((g) => g.s))].sort().map(yearLabel).join(' + ')

  const season1 = lines.cur || lines.prev
  const seasonWord = lines.cur ? lines.curLabel : lines.prevLabel
  const stale = !lines.cur && Boolean(lines.prev)
  const lineRows = [[lines.curLabel, lines.cur], [lines.prevLabel, lines.prev]].filter(([, l]) => l).map(([label, l]) => ({ _id: label, label, ...l, tp: l.tpaTot ? `${((100 * l.tpTot) / l.tpaTot).toFixed(1)}%` : '—' }))
  const keyNums = season1 ? [['PTS', season1.pts], ['REB', season1.reb], ['AST', season1.ast]].filter(([, v]) => v != null).map(([k, v]) => [k, Number(v).toFixed(1)]) : []
  const next = !stale && Number.isFinite(lines.cur?.ptsTot) ? lines.cur.ptsTot + 1 : null
  const dateNow = board?.date || etToday()
  const [whyOpen, setWhyOpen] = useState(false)
  const whyLine = row ? (row.status === 'off' && row.reason ? `Not on the board: ${row.reason}` : row.why || null) : null
  const bio = [card.pos, card.age ? `age ${card.age}` : null, card.height, card.weight, card.status && card.status !== 'Active' ? card.status : null].filter(Boolean).join(' · ')

  // ── tables ──
  const logRows = games.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((g) => {
    const raw = winLog.find((r) => String(r.id) === g.id) || {}
    return { ...raw, _id: `${g.s}-${g.id}`, day: g.date, oppTxt: `${g.home ? '' : '@'}${g.opp}`, res: `${raw.result || ''} ${raw.score || ''}`.trim(), fg: `${raw.fgm}-${raw.fga}`, tp: `${raw.tpm}-${raw.tpa}`, ft: `${raw.ftm}-${raw.fta}`, rest: g.rest }
  })
  const logCols = [
    { key: 'day', label: 'Date', group: 'Game', w: 84, heat: false, sticky: true, fmt: (v, r) => <>{fmtDay(v)}{r.seasonType === 3 ? <span style={{ marginLeft: 6, color: C.text3, fontSize: 10, letterSpacing: '.1em' }}>PLAYOFF</span> : null}</> },
    { key: 'oppTxt', label: 'Opp', group: 'Game', w: 56, heat: false, mono: true, link: (r) => (onOpenTeam && r.opp ? () => onOpenTeam(r.opp) : null) },
    { key: 'res', label: 'Result', group: 'Game', w: 82, heat: false, mono: true, link: (r) => (onOpenGame ? () => onOpenGame(r.id) : null) },
    { key: 'min', label: 'MIN', group: 'Line', w: 40, mono: true },
    { key: 'pts', label: 'PTS', group: 'Line', w: 40, mono: true, primary: true },
    { key: 'reb', label: 'REB', group: 'Line', w: 40, mono: true },
    { key: 'ast', label: 'AST', group: 'Line', w: 40, mono: true },
    { key: 'fg', label: 'FG', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'tp', label: '3PT', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'ft', label: 'FT', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'stl', label: 'STL', group: 'Defense', w: 40, mono: true },
    { key: 'blk', label: 'BLK', group: 'Defense', w: 40, mono: true },
    { key: 'to', label: 'TO', group: 'Defense', w: 40, mono: true },
  ]
  const logPv = usePreview(logRows, 10)
  const last5 = logRows.slice(0, 5)
  const shots = useMemo(() => unpackShots(data.shots), [data])
  const calls = (data.calls || []).map((r, i) => ({ ...r, _id: `${r.game_date}-${r.market}-${i}`, marketLabel: NBA_MARKETS[r.market]?.label || (r.market === 'first_fg' ? 'FIRST BASKET' : r.market === 'first_pts' ? 'FIRST POINTS' : r.market) }))
  const callCols = [
    { key: 'game_date', label: 'Date', group: 'Night', w: 84, heat: false, sticky: true, fmt: (v) => fmtDay(v) },
    { key: 'opp', label: 'Opp', group: 'Night', w: 52, heat: false, mono: true, link: (r) => (onOpenTeam && r.opp ? () => onOpenTeam(r.opp) : null) },
    { key: 'marketLabel', label: 'Market', group: 'Night', w: 100, heat: false, mono: true },
    { key: 'score', label: 'Score', group: 'Call', w: 50, mono: true, primary: true },
    { key: 'status', label: 'Status', group: 'Call', w: 120, heat: false, statusCol: true, fmt: (v, r) => <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CallStatusBadge status={v} accent={C.purple} />{r.role ? <b style={{ fontSize: 10, color: C.purple }}>{r.role}</b> : null}</span> },
    { key: 'actual', label: 'Result', group: 'Call', w: 60, heat: false, mono: true, fmt: (v, r) => (r.void_reason ? <span style={{ fontSize: 10, color: C.text3 }}>VOID</span> : v == null ? '—' : <span style={{ color: r.hit ? C.rim : C.text2, fontWeight: 900 }}>{r.hit ? <RimDot size={6} /> : null}{r.market === 'first_fg' || r.market === 'first_pts' ? (r.hit ? 'YES' : 'NO') : v}</span>) },
  ]
  const x = data.xpts
  const seasonAvg = season1?.pts
  const xRows = x?.xpts != null ? [{ _id: 'x', opp: `${data.nextGame?.home ? 'vs' : '@'} ${x.opp}`, min: x.minRecent, rate: x.rate, adj: x.oppKnown ? (x.oppFactor - 1) * 100 : null, xpts: x.xpts, avg: seasonAvg ?? null }] : []
  const xCols = [
    { key: 'opp', label: 'Next game', group: 'Game', w: 84, heat: false, sticky: true, mono: true, bold: true },
    { key: 'min', label: `MIN L${x?.n || 8}`, group: 'Built from', w: 62, heat: false, mono: true, dp: 1, title: `His mean minutes over his last ${x?.n || 8} games` },
    { key: 'rate', label: 'PTS/MIN', group: 'Built from', w: 66, heat: false, mono: true, dp: 2, title: 'His points a minute over those games, pulled toward his season rate' },
    { key: 'adj', label: 'OPP', group: 'Built from', w: 56, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`), title: 'The opponent’s real points allowed against the league mean, damped. A dash: no number.' },
    { key: 'xpts', label: 'xPTS', group: 'Projected', w: 58, mono: true, dp: 1, bold: true, primary: true, title: 'Projected points = minutes x points a minute x opponent. A measured projection, not a probability.' },
    { key: 'avg', label: 'SEASON PPG', group: 'Projected', w: 76, heat: false, mono: true, dp: 1, title: 'His season average, for comparison' },
  ]

  return (
    <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {onBack && <BackBtn onBack={onBack} label={backLabel} />}
        <DelayedBanner error={error} what="player data" />
        {onStep && peers.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Navigator peers={peers} cur={cur} noun="player" onNavigate={(p) => onStep(p.id)} />
          </div>
        )}
        {/* THE STICKY HEADER: who, which club, the board's word and his numbers never scroll away. */}
        <header style={{ position: 'sticky', top: peek ? 0 : 'var(--lamp-sticky, 0px)', zIndex: 20, background: C.bg2, margin: '0 -2px', padding: '8px 2px 0', borderBottom: `1px solid ${C.border2}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <PlayerFace sport="nba" id={card.id} photo={card.headshot} name={card.name} size={44} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: C.text }}>
                {card.jersey ? <span style={{ color: C.text3, fontFamily: NUM_FONT }}>#{card.jersey} </span> : null}<a href={playerHref('nba', pid)} style={{ color: 'inherit', textDecoration: 'none' }}>{card.name}</a>
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', fontSize: 12, color: C.text2, marginTop: 2 }}>
                {card.team && (
                  <Tap onClick={() => onOpenTeam?.(card.team)} title={`Open ${card.team}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, margin: '-12px 0', color: C.text }}>
                    <TeamMark sport="nba" abbr={card.team} variant="logo" px={18} /><b style={{ font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>{card.team}</b>
                  </Tap>
                )}
                <span>{[card.pos, card.status && card.status !== 'Active' ? card.status : null].filter(Boolean).join(' · ')}</span>
                <span style={{ color: C.text3 }}>NBA</span>
              </div>
            </div>
            <div style={{ flex: '0 0 auto' }}><FollowButton sport="nba" id={pid} name={card.name} team={card.team} position={card.pos} compact /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', margin: '6px 0 2px' }}>
            {board && view !== 'overview' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CallStatusBadge status={row ? row.status : 'off'} accent={C.purple} size={11} variant="stamp" />
                {row?.score != null && <b style={{ font: `900 14px/1 ${NUM_FONT}`, color: called ? C.purple : C.text }}>{Math.round(row.score)}</b>}
              </span>
            )}
            {view !== 'overview' && <button type="button" aria-expanded={whyOpen} onClick={() => setWhyOpen((v) => !v)} style={{ minHeight: 44, margin: '-10px 0', padding: '0 6px', background: 'transparent', border: 'none', color: C.purple, font: `800 12px/1 ${NUM_FONT}`, cursor: 'pointer', textDecoration: 'underline dotted' }}>Why?</button>}
            {gamePos && <span style={{ color: C.text3, fontSize: 12 }}>{gamePos}</span>}
            <span style={{ display: 'inline-flex', gap: 10, marginLeft: 'auto' }}>
              {keyNums.map(([k, v]) => <span key={k} style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text3 }}><b style={{ color: C.text, fontSize: 15, fontWeight: 900 }}>{v}</b> {k}</span>)}
            </span>
          </div>
          {whyOpen && view !== 'overview' && (
            <div role="region" aria-label="Why this word" style={{ maxHeight: '38vh', overflowY: 'auto', margin: '4px 0 6px', padding: '8px 10px', border: `1px solid ${C.border2}`, borderRadius: 10, background: C.bg, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
              {!board ? 'Loading tonight’s board…' : !row ? 'No game on the board tonight, so he is not on it.' : (
                <>
                  <div>{whyLine || 'On tonight’s board.'}</div>
                  {row.injury ? <div style={{ color: C.text3, marginTop: 4 }}>Injury report: {row.injury}</div> : null}
                </>
              )}
            </div>
          )}
          <div className="chip-row" role="tablist" aria-label="Player tabs" style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', padding: '6px 2px 8px' }}>
            {VIEWS.map((t) => <TabBtn key={t.key} tall active={view === t.key} onClick={() => pick(t.key)}>{t.label}</TabBtn>)}
          </div>
        </header>

        {view === 'overview' && (
          <>
            {/* BUCKETS ON HIM (components/player/): tonight's points-board word and score, why, his record on the locked board; no game says so in one line. */}
            <VerdictBlock sport="nba" {...nbaVerdict({ board, row, whyLine, calls })} />
            <StatRow stats={nbaStatRow({ line: season1, xpts: x, seasonWord, stale })} />
            <PlayerDdTd playerId={pid} />
            {xRows.length > 0 ? (
              <section aria-label="Projected points">
                <Kicker>PROJECTED POINTS · NEXT GAME</Kicker>
                <BucketsTable rows={xRows} columns={xCols} heatMode="none" maxHeight={9999} maxRows={1} caption={x.line} />
              </section>
            ) : x?.reason ? <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>No projected points: {x.reason}.</p> : null}
            <section aria-label="Season line">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Kicker>THE LINE · PER GAME</Kicker>
                {/* 📸 his card as a PNG (fix15): the board's word, score and night rank, PTS / REB / AST a game, projected points, his last five.
                    On the line, not in the sticky header (no room beside Watch at 360 without wrapping his name). */}
                <CardButton sport="nba" label="Download his card as an image" onDownload={() => downloadBucketsPlayerCard({
                  card, row, game, season: season1, last5, xpts: data.xpts, where: oppTxt || '', board: Boolean(board), seasonWord,
                  rankOf: (board?.rows || []).filter((r) => r.score != null && Number.isFinite(Number(r.score))).length || null, day: board?.date || '' })} />
              </div>
              {stale && <p style={{ margin: '0 0 8px', fontSize: 12, color: C.text3, lineHeight: 1.5 }}>The new season has no regular-season games yet, so this is last season’s line ({seasonWord}).</p>}
              {lineRows.length > 0
                ? <ScrollHint><BucketsTable rows={lineRows} columns={lineCols} heatMode="none" maxHeight={9999} maxRows={2} caption="Per game, this season beside last season." /></ScrollHint>
                : <EmptyState title="NO NBA LINES ON FILE" note="No regular-season games this season or last." />}
            </section>
            {last5.length > 0 && (
              <section aria-label="Last five">
                <Kicker>LAST FIVE</Kicker>
                <ScrollHint><BucketsTable rows={last5} columns={logCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="standouts" maxHeight={9999} maxRows={5} caption="His last five games, newest first. Each row opens the game." /></ScrollHint>
              </section>
            )}
            <PlayerBars log={data.log || []} logSeason={data.logSeason} nextGame={data.nextGame} onOpenTeam={onOpenTeam} />
            <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{bio}</div>
            <StarMemory sport="nba" id={pid} />
            <InTheLedger sport="nba" id={pid} name={card.name} jersey={card.jersey} birthDate={card.birthDate} next={next} date={dateNow} />
            <HisNumbers name={card.name} jersey={card.jersey} birthDate={card.birthDate} next={next} nextWord="point" date={dateNow} theme={C} accent={C.purple} numFont={NUM_FONT} />
            <PlayerNotes playerId={pid} scope="nba" accent={C.purple} />
          </>
        )}

        {view !== 'overview' && view !== 'board' && opts.length > 0 && <SeasonToggle options={opts} value={seasonKey} onChange={setSeason} theme={C} numFont={NUM_FONT} accent={C.purple} yearLabel={yearLabel} />}

        {view === 'splits' && <PlayerSplits games={games} label={windowLabel} onOpenTeam={onOpenTeam} />}

        {view === 'log' && (
          <section aria-label="Game log">
            <Kicker>GAME LOG · {logRows.length} GAMES{windowLabel ? ` · ${windowLabel}` : ''}</Kicker>
            {logRows.length
              ? <>
                  <ScrollHint><BucketsTable rows={logPv.shown} columns={logCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="standouts" maxHeight={9999} maxRows={logRows.length}
                    caption="Newest first. Each row opens the game." /></ScrollHint>
                  <ShowMoreButton open={logPv.open} restN={logPv.restN} toggle={logPv.toggle} itemWord="games" />
                  {[...new Set(logRows.map((g) => g.seasonType))].filter((t) => t && t !== 2).map((t) => <SeasonTypeChip key={t} type={t} />)}
                </>
              : <EmptyState title="NO GAMES LOGGED" note="No regular-season games for him in that span yet. Try another season above." />}
          </section>
        )}

        {view === 'vs' && <VsTab card={card} games={games} logRows={logRows} nextGame={data.nextGame} row={row} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} logCols={logCols} windowLabel={windowLabel} />}

        {view === 'shots' && (
          shots.length > 0
            ? <section>
                <Kicker>EVERY SHOT ON FILE · {shots.length} ATTEMPTS{data.shotsFrom ? ` SINCE ${fmtDay(data.shotsFrom).toUpperCase()}` : ''}</Kicker>
                <ShotChart shots={shots} filters={['result', 'type']} title={`${card.name}, every field-goal attempt on file`}
                  source="Every field-goal attempt on file for him, from ESPN play-by-play; free throws and end-of-quarter heaves left out." />
              </section>
            : <EmptyState title="NO SHOTS ON FILE" note="We record shots from the play-by-play once games are played; none are on file for him yet." />
        )}

        {view === 'board' && (
          <section>
            <Kicker>THE BOARD ON HIM</Kicker>
            {calls.length
              ? <BucketsTable rows={calls} columns={callCols} statusOf={(r) => r.status} heatMode="none" maxHeight={9999} maxRows={calls.length} caption="Every locked board row on him, newest first." />
              : <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>No locked board rows on him yet. They start with the first night his game locks.</p>}
          </section>
        )}
      </div>
    </SportTheme>
  )
}

// 🆚 HIS GAMES AGAINST ONE CLUB, beside what that club allows (the league's own opponent stats, ranked among the 30).
function VsTab({ card, games, logRows, nextGame, row, onOpenTeam, onOpenGame, logCols, windowLabel }) {
  const { data: def } = useBucketsDefense(null)
  const tonight = row?.opp || nextGame?.opp || null
  const teams = useMemo(() => {
    const m = new Map()
    for (const g of games) if (g.opp) m.set(g.opp, (m.get(g.opp) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [games])
  const [picked, setPicked] = useState('')
  const opp = picked && teams.some(([t]) => t === picked) ? picked : (tonight && teams.some(([t]) => t === tonight) ? tonight : teams[0]?.[0] || tonight || '')
  const mine = useMemo(() => games.filter((g) => g.opp === opp), [games, opp])
  const rows = useMemo(() => logRows.filter((r) => r.opp === opp), [logRows, opp])
  const sum = mine.length ? aggregate(mine) : null
  const allow = (def?.teams || []).slice().sort((a, b) => (b.oppPts ?? 0) - (a.oppPts ?? 0))
  const rank = allow.findIndex((t) => t.abbrev === opp) + 1
  const al = allow.find((t) => t.abbrev === opp)
  const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1))
  const sumRows = sum ? [{ _id: 'his', who: `${card.name.split(' ').slice(-1)[0]} vs ${opp}`, gp: sum.gp, min: sum.min, pts: sum.pts, reb: sum.reb, ast: sum.ast, tpm: sum.tpm, fgPct: sum.fgPct != null ? `${(sum.fgPct * 100).toFixed(1)}%` : '—', thin: sum.thin }] : []
  const sumCols = [
    { key: 'who', label: 'His games', group: 'Split', w: 130, heat: false, sticky: true, bold: true, numeric: false },
    { key: 'gp', label: 'GP', group: 'Sample', w: 38, heat: false, mono: true },
    { key: 'min', label: 'MIN', group: 'Per game', w: 44, heat: false, mono: true, fmt: f1 },
    { key: 'pts', label: 'PTS', group: 'Per game', w: 44, heat: false, mono: true, fmt: f1, bold: true },
    { key: 'reb', label: 'REB', group: 'Per game', w: 44, heat: false, mono: true, fmt: f1 },
    { key: 'ast', label: 'AST', group: 'Per game', w: 44, heat: false, mono: true, fmt: f1 },
    { key: 'tpm', label: '3PM', group: 'Per game', w: 44, heat: false, mono: true, fmt: f1 },
    { key: 'fgPct', label: 'FG%', group: 'Shooting', w: 52, heat: false, mono: true },
  ]
  return (
    <section aria-label="Versus a club" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
      <Kicker>{card.name.toUpperCase()} VS {opp || 'A CLUB'}{windowLabel ? ` · ${windowLabel}` : ''}</Kicker>
      {teams.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 13, color: C.text3, fontFamily: NUM_FONT, minWidth: 0 }}>
          <span>CLUB</span>
          <select aria-label="Club" value={opp} onChange={(e) => setPicked(e.target.value)} style={{ minHeight: 44, background: C.bg2, color: C.text, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '0 8px', font: `700 13px/1 ${NUM_FONT}` }}>
            {teams.map(([t, n]) => <option key={t} value={t}>{t} · {n} {n === 1 ? 'game' : 'games'}</option>)}
          </select>
          {opp && onOpenTeam && <Tap onClick={() => onOpenTeam(opp)} title={`Open ${opp}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: C.purple, fontWeight: 800 }}>{opp} page ›</Tap>}
        </label>
      )}
      {!teams.length && <EmptyState title="NO GAMES YET" note="No games for him in this window yet. Try another season above." />}
      {sum && <BucketsTable rows={sumRows} columns={sumCols} heatMode="none" maxHeight={9999} maxRows={1} caption={`${sum.gp} game${sum.gp === 1 ? '' : 's'}${sum.thin ? ': few games, read it lightly' : ''}.`} />}
      {al && <p style={{ margin: 0, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>{opp} allows <b style={{ color: C.text, fontFamily: NUM_FONT }}>{f1(al.oppPts)}</b> points a game, <b style={{ color: C.text, fontFamily: NUM_FONT }}>#{rank}</b> most of 30 (1 = gives up the most), and {f1(al.oppReb)} rebounds, {f1(al.oppAst)} assists, {f1(al.oppTpm)} threes. The league’s own opponent stats; nothing modelled.</p>}
      {rows.length > 0 && <BucketsTable rows={rows} columns={logCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="standouts" maxHeight={9999} maxRows={rows.length} caption={`His games against ${opp}, newest first. Each row opens the game.`} />}
    </section>
  )
}
