'use client'
import { useEffect, useMemo, useState } from 'react'
import { SportTheme } from '../../SportTheme'
// THE SHARED PLAYER MODEL (components/player/): the verdict first, then ONE row of his numbers; BUCKETS' words in nbaAdapter.js
import BucketsSlipAdd from '../BucketsSlipAdd'
import BucketsPriceHistory from '../BucketsPriceHistory'
import VerdictBlock from '../../player/VerdictBlock'
import StatRow from '../../player/StatRow'
import ScrollHint from '../../player/ScrollHint'
import { nbaVerdict, nbaStatRow, nbaPickWord } from '../../player/nbaAdapter'
import VerdictHero from '../../VerdictHero'
import CardShell from '../../CardShell'
import BucketsOnHim from '../BucketsOnHim'
import BucketsCompare from '../BucketsCompare'
import BucketsPickStamp from '../BucketsPickStamp'
import { createPortal } from 'react-dom'
import { fmtOdds } from '../../../lib/odds'
import { nbaQuote } from '../../../lib/nba/oddsQuote'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import { LEG_LABEL, fmtLeg } from '../../../lib/nba/legs'
import HisNumbers from '../../HisNumbers'
import InTheLedger from '../../ledger/InTheLedger'
import PlayerNotes from '../../PlayerNotes'
import FollowButton from '../../FollowButton'
import ShareCardButton from '../../card/ShareCardButton'
import CardFlip from '../../player/CardFlip'
import CardsEarned from '../../player/CardsEarned'
import { shareUrl, slug, stamp } from '../../../lib/cards/saveCard'
import StarMemory from '../../watch/StarMemory'
import CallStatusBadge from '../../CallStatusBadge'
import TeamMark from '../../TeamMark'
import Tap from '../../Tap'
import SeasonToggle from '../../nfl/SeasonToggle'
import { TabBtn, Navigator } from '../../card/CardNav'
import { DefPosFor } from '../DefPosSheet'
import PosVsOpp from '../PosVsOpp'
import { posOf, POS_WORD } from '../../../lib/nba/defPos'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useCardLock, useCallMask, useMemberState, CardLockLine } from '../../MemberGate'
import { hashParams, writeHash, cardViewPush } from '../../../lib/urlState'
import { playerHref } from '../../../lib/routes'
import { DETAIL_MARK, PEEK_MARK, VIEWS_KEY } from '../../../lib/useShellRoute'
import { etToday } from '../../../lib/freshness'
import { bornLine } from '../../../lib/birthday'
import BornLine from '../../player/BirthdayChip'
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
import BucketsPropsMatrix from '../PropsMatrix'
import PlayerDdTd from '../PlayerDdTd'
import ScoredFirst from '../../player/ScoredFirst'
import { EmptyState, DelayedBanner, Loading, Kicker, BackBtn, PlayerFace, SeasonTypeChip, fmtDay, fmtTip, RimDot } from '../ui'
import PlayerInjuryChip from '../../injuries/PlayerInjuryChip'

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
  // THE READ and NUMBERS, their own pills as on MOONSHOT's card (2026-10-17): the sentences and the shape of his night; the season, model and opponent rows
  { key: 'read', label: 'The Read' },
  { key: 'splits', label: '📅 Splits' },
  { key: 'log', label: '📋 Game log' },
  { key: 'numbers', label: '🔢 Numbers' },
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

export default function Player({ id, onBack, backLabel = 'Players', onOpenTeam, onOpenGame, onStep = null, peek = false, lead = null }) {
  const ok = PLAYER_ID_RE.test(String(id || ''))
  const { data, error, loading } = useBucketsPlayer(ok ? id : null)
  if (!id) return <EmptyState title="NO PLAYER PICKED" note="Open a player from Players, a board or a box score."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!ok) return <EmptyState title="NO SUCH PLAYER" note={`“${String(id).slice(0, 20)}” isn’t an NBA player id.`}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !data) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} /><Loading what="his file" /></div>
  if (!data?.card) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} />{error && error.status !== 404 && error.status !== 400 ? <DelayedBanner error={error} what="player data" /> : <EmptyState title="NO SUCH PLAYER" note="The league has no NBA player with that id — the link may be old or cut short." />}</div>
  return <PlayerBody key={data.card.id} data={data} error={error} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} onBack={onBack} backLabel={backLabel} onStep={onStep} peek={peek} lead={lead} />
}

function PlayerBody({ data, error, onOpenTeam, onOpenGame, onBack, backLabel, onStep, peek, lead }) {
  const { card, lines } = data
  const pid = String(card.id)
  // ── the board's row on him (tonight's PTS board): the card's score, word and why ──
  const { data: board } = useBucketsBoard(null, 'pts')
  const row = useMemo(() => (board?.rows || []).find((r) => String(r.playerId) === pid) || null, [board, pid])
  const game = row ? (board?.games || []).find((g) => g.id === row.gameId) : null
  const oppTxt = row ? `${row.home ? 'vs' : '@'} ${row.opp}` : data.nextGame ? `${data.nextGame.home ? 'vs' : '@'} ${data.nextGame.opp}` : null
  const tip = game?.start || data.nextGame?.start || null
  // a game that is not tonight's carries its day ("Tue 5:30 PM"), so the header never reads "NO GAME · 5:30 PM" (10-19)
  const tipWord = tip ? (game ? fmtTip(tip) : `${new Date(tip).toLocaleDateString('en-US', { weekday: 'short' })} ${fmtTip(tip)}`) : null
  const gamePos = oppTxt ? `${oppTxt}${tip ? ` · ${game?.state === 'live' ? 'LIVE' : game?.state === 'final' ? 'FINAL' : tipWord}` : ''}` : null
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
  const next = !stale && Number.isFinite(lines.cur?.ptsTot) ? lines.cur.ptsTot + 1 : null
  const dateNow = board?.date || etToday()
  const [compareOpen, setCompareOpen] = useState(false)
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nba')
  // MEMBERS (2026-10-17, as LAMP's and TUDDY's cards): a free viewer sees tonight's NOT-STARTED called pick as plain ON THE BOARD, no score, no why. Same key as the
  // slate's (`${game id}|${playerId}`), the game's own tip, its final flag. Graded results are public; an unknown viewer is a member (fail open); the free four
  // are the boards' (this sport's board publishes none yet, so a free viewer's card locks every called pick).
  const lockIn = row ? { key: `${row.gameId}|${row.playerId}`, time: game?.start || null, graded: game?.state === 'final' } : null
  const nonMember = useMemberState() === 'free'
  const cl = useCardLock({ status: row?.status || null, key: lockIn?.key, time: lockIn?.time, graded: lockIn?.graded })
  const locked = Boolean(lockIn) && cl.locked
  const shownRow = locked ? { ...row, status: 'board', score: null, rank: null, nightRank: null, nightOf: null, pct: null, legs: null, why: null, reason: null, hit: null, actual: null } : row
  const whyLine = shownRow ? (shownRow.status === 'off' && shownRow.reason ? `Not on the board: ${shownRow.reason}` : shownRow.why || null) : null
  // ⚖ the compare sheet's rows: the call fields of every locked man taken off for a non-member
  const { mask } = useCallMask({ statusOf: (r) => r.status, keyOf: (r) => `${r.gameId}|${r.playerId}`, timeOf: (r) => (board?.games || []).find((g) => g.id === r.gameId)?.start || null, gradedOf: (r) => (board?.games || []).find((g) => g.id === r.gameId)?.state === 'final', strip: ['status', 'score', 'rank', 'nightRank', 'pct', 'legs', 'why', 'reason'] })
  const compareRows = useMemo(() => mask(board?.rows || []), [board, mask])
  const meta2 = [card.pos, card.height, card.weight, row?.starter === true ? 'Starter' : null, card.status && card.status !== 'Active' ? card.status : null].filter(Boolean).join(' · ')
  // the price, subtle, at the end of the matchup line: only when the book quotes the same bar the call has to clear (lib/nba/oddsQuote.js)
  const ptsQuote = nbaQuote(odds, pid, 'pts')
  const heroPrice = ptsQuote && Number.isFinite(Number(ptsQuote.best_over ?? ptsQuote.over)) ? fmtOdds(Number(ptsQuote.best_over ?? ptsQuote.over)) : null
  const homeOf = useMemo(() => Object.fromEntries(allLog.map((g) => [String(g.id), g.atVs === 'vs'])), [allLog])
  const ptsMarket = NBA_MARKETS.pts

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
  const shots = useMemo(() => unpackShots(data.shots, data.shotGames), [data])
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
        {/* THE ONE TOOLBAR ROW, as MOONSHOT's card: Back at the left; at the right his flip Card and Save (a PREVIEW sport, shown only to a visitor
            BUCKETS' gate lets in, and only for a player on tonight's board), the compare scale, previous / n of m / next, the group and the search, and
            in a peek Full page. The card's close is in the header below (the `lead` mechanism LAMP's card uses, components/PlayerPeek.js). */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: onBack ? 'space-between' : 'flex-end', gap: 8 }}>
          {onBack ? <BackBtn onBack={onBack} label={backLabel} /> : null}
          <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
            {row && !locked && <CardFlip sport="nba" id={String(card.id)} name={card.name} />}
            {!locked && <ShareCardButton sport="nba" what="his card" url={shareUrl({ kind: 'pick', sport: 'nba', id: card.id, market: 'pts', date: board?.date || null })} filename={`${slug(card.name, 'player')}_${stamp(board?.date)}.png`} />}
            {peers.length > 1 && (
              <button type="button" onClick={() => setCompareOpen(true)} title="Compare this player against another on tonight’s board" aria-label="Compare two players"
                style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 7, fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>⚖</button>
            )}
            {onStep && peers.length > 1 && <Navigator peers={peers} cur={cur} noun="player" onNavigate={(p) => onStep(p.id)} />}
            {lead?.full}
          </span>
        </div>
        <DelayedBanner error={error} what="player data" />

        {/* THE OUTCOME LEADS once his called row is graded (MOONSHOT's PickVerdictStamp) */}
        <BucketsPickStamp row={row} />

        {/* THE HEADER CARD (MOONSHOT's VerdictHero): his face inside the score ring, #number + name + injury chip, the market's badge, the club vs the
            opponent and Game ›, his position line, the book's price at the end, and the card's close at the right. */}
        <VerdictHero
          style={{ marginBottom: 0 }} theme={C} numFont={NUM_FONT}
          photo={card.headshot || null}
          col={shownRow?.score != null ? C.purple : C.text3}
          score={shownRow?.score ?? null}
          title={<>
            {card.jersey ? <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT }}>#{card.jersey} </span> : null}
            <a href={playerHref('nba', pid)} style={{ color: 'inherit', textDecoration: 'none' }}>{card.name}</a>
            <PlayerInjuryChip who={{ player_id: card.id, name: card.name, team: card.team }} />
          </>}
          badge={row ? ptsMarket.label : data.nextGame ? 'NOT TONIGHT' : 'NO GAME'} badgeQuiet={!shownRow || shownRow.status !== 'called'}
          meta={<>
            {card.team ? <Tap onClick={onOpenTeam ? () => onOpenTeam(card.team) : null} title={`Open ${card.team}`}><TeamMark sport="nba" abbr={card.team} variant="logo" px={14} /></Tap> : null}
            {oppTxt ? <>{' '}{row?.home ?? data.nextGame?.home ? 'vs' : '@'}{' '}<Tap onClick={onOpenTeam ? () => onOpenTeam(row?.opp || data.nextGame?.opp) : null} title={`Open ${row?.opp || data.nextGame?.opp}`}>{row?.opp || data.nextGame?.opp}</Tap></> : null}
            {row?.gameId && onOpenGame ? <>{' · '}<Tap onClick={() => onOpenGame(row.gameId)} title="Open his game">Game ›</Tap></> : null}
          </>}
          meta2={[meta2, tip ? (game?.state === 'live' ? 'LIVE' : game?.state === 'final' ? 'FINAL' : tipWord) : null].filter(Boolean).join(' · ') || null}
          metaRight={heroPrice}
          market={row ? `${ptsMarket.bar}+ points` : 'not on tonight’s board'}
          right={lead?.close || null}
        />
        {/* HIS BIRTHDAY (the real date from the league's athlete file; nothing when unknown) */}
        {card.birthDate
          ? <BornLine birth={card.birthDate} on={dateNow} accent={C.purple} C={C} font={NUM_FONT} style={{ marginTop: -6, marginBottom: 0 }} />
          : card.age ? <div style={{ color: C.text3, fontSize: 12, lineHeight: '17px', marginTop: -6 }}>age {card.age}</div> : null}

        {/* BUCKETS ON HIM (components/player/): the word, the score, the why, the flags, his record on the locked board and last week; no game says so in one line. */}
        <VerdictBlock sport="nba" lock={lockIn} style={{ margin: 0 }} {...nbaVerdict({ board, row, whyLine, calls: data.calls, today: dateNow })} />
        <StatRow stats={nbaStatRow({ line: season1, xpts: x, seasonWord, stale })} noun="players" style={{ marginBottom: 0 }} />

        {/* THE WATCH ROW (MOONSHOT's): Watch, ADD TO SLIP with a + for each market the books quote at the card's bar, and the pick. No price, no button. */}
        <div data-pm="watch-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <FollowButton sport="nba" id={pid} name={card.name} team={card.team} position={card.pos} />
          <BucketsSlipAdd id={pid} name={card.name} team={card.team} opp={row?.opp || data.nextGame?.opp || null} style={{ margin: 0 }} />
          <span style={{ fontSize: 12, color: C.text3 }}>
            BUCKETS&apos; pick: <b style={{ color: C.text2 }}>{nbaPickWord(shownRow, ptsMarket.label)}</b>
          </span>
        </div>

        {/* PILL TABS, the tab in the address (view=) */}
        <div className="chip-row" role="tablist" aria-label="Player tabs" style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', padding: '2px 2px 8px', borderBottom: `1px solid ${C.border}` }}>
          {VIEWS.map((t) => <TabBtn key={t.key} tall active={view === t.key} onClick={() => pick(t.key)}>{t.label}</TabBtn>)}
        </div>

        {view === 'overview' && (
          <>
            {/* BUCKETS ON HIM (each market's locked record on him, MOONSHOT's BotOnHim), My note, his last five, the ledger, his numbers, then the PRICE
                LAST (10-19, the rule Donovan set for TUDDY's page (k): the price timeline never leads) */}
            <BucketsOnHim calls={data.calls} homeOf={homeOf} style={{ marginTop: 0 }} />
            <PlayerNotes playerId={pid} scope="nba" accent={C.purple} />
            {last5.length > 0 && (
              <section aria-label="Last five">
                <Kicker>LAST FIVE</Kicker>
                <ScrollHint><BucketsTable rows={last5} columns={logCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="standouts" maxHeight={9999} maxRows={5} caption="His last five games, newest first. Each row opens the game." /></ScrollHint>
              </section>
            )}
            <InTheLedger sport="nba" id={pid} name={card.name} jersey={card.jersey} birthDate={card.birthDate} next={next} date={dateNow} />
            <HisNumbers name={card.name} jersey={card.jersey} birthDate={card.birthDate} next={next} nextWord="point" date={dateNow} theme={C} accent={C.purple} numFont={NUM_FONT} />
            <BucketsPriceHistory id={pid} />
          </>
        )}

        {/* THE READ: tonight's sentence, the projected points and the bars he faces */}
        {view === 'read' && (
          <>
            <section aria-label="The read">
              <Kicker>THE READ</Kicker>
              <p style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.5, color: C.text2 }}>{whyLine || (board ? (row ? 'On tonight’s board.' : 'No game on tonight’s board, so there is no read for tonight.') : 'Reading tonight’s board…')}</p>
              {row?.injury ? <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>Injury report: {row.injury}</p> : null}
              {nonMember && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ margin: '4px 0 8px' }} />}
            </section>
            {xRows.length > 0 ? (
              <section aria-label="Projected points">
                <Kicker>PROJECTED POINTS · NEXT GAME</Kicker>
                <BucketsTable rows={xRows} columns={xCols} heatMode="none" maxHeight={9999} maxRows={1} caption={x.line} />
              </section>
            ) : x?.reason ? <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>No projected points: {x.reason}.</p> : null}
            <PlayerBars log={data.log || []} logSeason={data.logSeason} nextGame={data.nextGame} onOpenTeam={onOpenTeam} />
          </>
        )}

        {/* NUMBERS: the evidence behind the read -- the season line, the legs the board scored him on, the club he faces */}
        {view === 'numbers' && (
          <NumbersTab row={shownRow} locked={locked} stale={stale} seasonWord={seasonWord} lineRows={lineRows} oppAbbrev={row?.opp || data.nextGame?.opp || null} />
        )}

        {['splits', 'log', 'vs', 'shots'].includes(view) && opts.length > 0 && <SeasonToggle options={opts} value={seasonKey} onChange={setSeason} theme={C} numFont={NUM_FONT} accent={C.purple} yearLabel={yearLabel} />}

        {view === 'splits' && <PlayerSplits games={games} label={windowLabel} onOpenTeam={onOpenTeam} />}

        {view === 'log' && (
          <section aria-label="Game log">
            <Kicker>GAME LOG · {logRows.length} GAMES{windowLabel ? ` · ${windowLabel}` : ''}</Kicker>
            {logRows.length
              ? <>
                  <ScrollHint><BucketsTable rows={logPv.shown} columns={logCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="standouts" maxHeight={9999} maxRows={logRows.length}
                    caption="Newest first. Each row opens the game." /></ScrollHint>
                  <ShowMoreButton open={logPv.open} restN={logPv.restN} toggle={logPv.toggle} total={logPv.total} itemWord="games" />
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
                <ShotChart urlKey="shots" shots={shots} filters={["result", "type"]} threeD title={`${card.name}, every field-goal attempt on file`}
                  defense={row?.opp || data.nextGame?.opp || null} defenseNote={row?.opp ? 'tonight' : data.nextGame?.opp ? 'next game' : null}
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

        {/* NO MORE FOLD (Donovan 10-20: "they all don't need more section"): its blocks sit on the page -- your star and its memory,
            his props grid and his double-double / triple-double lines. */}
        <div style={{ margin: '4px 0 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, minWidth: 0 }}>
          <StarMemory sport="nba" id={pid} />
          <BucketsPropsMatrix log={data.log || []} logSeason={data.logSeason} />
          <PlayerDdTd playerId={pid} />
          <ScoredFirst sport="nba" playerId={pid} word="Scored the first basket" color={C.purple} textColor={C.text2} />
        </div>

        {/* CARDS EARNED, at the END of the card (the first useful row never moves): his 30-point / 40-point / double-double / triple-double / 10-threes cards from his GRADED regular-season rows; no section until he has one */}
        <CardsEarned sport="nba" id={pid} name={card.name} />
      </div>
      {/* ⚖ COMPARE (MOONSHOT's PlayerCompare): a sheet over the card, on the board's own rows. Portalled to the body: the card is itself a blurred, scrolling layer. */}
      {compareOpen && typeof document !== 'undefined' && createPortal(
        <CardShell onClose={() => setCompareOpen(false)} width={620} label="Compare two players" theme={C} accent={C.purple}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button type="button" onClick={() => setCompareOpen(false)} aria-label="Close compare" style={{ minHeight: 44, minWidth: 44, borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg, color: C.text2, fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
          <BucketsCompare rows={compareRows} onOpenPlayer={(id) => { setCompareOpen(false); onStep?.(id) }} />
        </CardShell>,
        document.body,
      )}
    </SportTheme>
  )
}

// 🔢 THE NUMBERS TAB (MOONSHOT's Numbers pill): the evidence behind the read. The season line (this season beside last), the legs the points board
// scored him on with the board's own percentile among tonight's players, and what the club he faces allows (the league's own opponent stats,
// ranked among the 30). Every value is ESPN's or the board's; nothing is modelled here.
function NumbersTab({ row, locked = false, stale, seasonWord, lineRows, oppAbbrev }) {
  const { data: def } = useBucketsDefense(null)
  const legKeys = NBA_MARKETS.pts.legs
  const legRows = row?.legs ? legKeys.filter((k) => row.legs[k] != null).map((k) => ({ _id: k, leg: LEG_LABEL[k] || k, val: Number(row.legs[k]), _k: k, pct: row.pct?.[k] ?? null })) : []
  const legCols = [
    { key: 'leg', label: 'Leg', group: 'Points board', w: 84, heat: false, sticky: true, bold: true, numeric: false },
    { key: 'val', label: 'Value', group: 'Points board', w: 64, mono: true, numeric: true, fmt: (v, r) => fmtLeg(r._k, v) },
    { key: 'pct', label: 'Tonight %ile', group: 'Points board', w: 84, mono: true, title: 'Where the leg ranks among tonight’s players (100 = highest)' },
  ]
  const allow = (def?.teams || []).slice().sort((a, b) => (b.oppPts ?? 0) - (a.oppPts ?? 0))
  const al = oppAbbrev ? allow.find((t) => t.abbrev === oppAbbrev) : null
  const rank = al ? allow.findIndex((t) => t.abbrev === oppAbbrev) + 1 : 0
  const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, minWidth: 0 }}>
      <section aria-label="Season line">
        <Kicker>THE LINE · PER GAME</Kicker>
        {stale && <p style={{ margin: '0 0 8px', fontSize: 12, color: C.text3, lineHeight: 1.5 }}>The new season has no regular-season games yet, so this is last season’s line ({seasonWord}).</p>}
        {lineRows.length > 0
          ? <ScrollHint><BucketsTable rows={lineRows} columns={lineCols} heatMode="none" maxHeight={9999} maxRows={2} caption="Per game, this season beside last season." /></ScrollHint>
          : <EmptyState title="NO NBA LINES ON FILE" note="No regular-season games this season or last." />}
      </section>
      <section aria-label="Model legs">
        <Kicker>WHAT THE POINTS BOARD SCORED HIM ON</Kicker>
        {legRows.length > 0
          ? <BucketsTable rows={legRows} columns={legCols} heatMode="standouts" maxHeight={9999} maxRows={legRows.length} caption="The legs behind tonight’s PTS score, each with its rank among tonight’s players." />
          : <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>{locked ? 'Members see tonight’s called picks and why.' : row ? 'The board holds no legs for him.' : 'Not on tonight’s board, so there are no legs to show.'}</p>}
      </section>
      {al && (
        <p style={{ margin: 0, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>Opp defence: {oppAbbrev} allows <b style={{ color: C.text, fontFamily: NUM_FONT }}>{f1(al.oppPts)}</b> points a game, <b style={{ color: C.text, fontFamily: NUM_FONT }}>#{rank}</b> most of 30 (1 = gives up the most), and {f1(al.oppReb)} rebounds, {f1(al.oppAst)} assists, {f1(al.oppTpm)} threes. The league’s own opponent stats; nothing modelled.</p>
      )}
    </div>
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
    // the phone shortens the cell to the club's code, so it opens the club (check-clickable)
    { key: 'who', label: 'His games', group: 'Split', w: 130, heat: false, sticky: true, bold: true, numeric: false, link: () => (onOpenTeam && opp ? () => onOpenTeam(opp) : null) },
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
      {opp && posOf(card.pos) && (
        <>
          <Kicker>{opp} D VS {POS_WORD[posOf(card.pos)].toUpperCase()}</Kicker>
          <DefPosFor opp={opp} espnPos={card.pos} onOpenTeam={onOpenTeam} />
          <PosVsOpp opp={opp} espnPos={card.pos} onOpenGame={onOpenGame} />
        </>
      )}
    </section>
  )
}

// PlayerPeek: this page carries the card's Full page button in its one toolbar row and the close in its header (as MOONSHOT's card, and LAMP's)
Player.peekToolbar = true
