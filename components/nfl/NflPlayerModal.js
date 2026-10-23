'use client'
import PlayerInjuryChip from '../injuries/PlayerInjuryChip'
import { useEffect, useMemo, useState } from 'react'

import useScrollLock from '../../lib/useScrollLock'
import CardShell from '../CardShell'
// MOONSHOT's tab row + peer arrows (with its tonight's-game grouping), in the
// sport theme CardShell provides. TUDDY keys players by gsis string.
import { TabBtn, Navigator } from '../card/CardNav'
import CardFlip from '../player/CardFlip'
import CardsEarned from '../player/CardsEarned'
const nflIdOf = (x) => String(x?.player_id ?? '')
import { C, NUM_FONT, MARKETS, MARKET_SHORT, gradeFor } from '../../lib/nfl/theme'
import { STAT_KEY } from './HitRate'
import SlipAdd from '../SlipAdd'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import PlayerNotes from '../PlayerNotes'
import HisNumbers from '../HisNumbers'
import InTheLedger from '../ledger/InTheLedger'
import { etToday } from '../../lib/freshness'
import BornLine from '../player/BirthdayChip'
import { birthdayChip } from '../../lib/birthday'
import { VerdictStamp } from './CardActions'
import NflCardMatchup from './NflCardMatchup'
import PlayerField from './PlayerField'
import NflSplitsTable, { splitRows } from './NflSplitsTable'
import VerdictHero from '../VerdictHero'
import { faceUrl } from '../PlayerFace'
import NflExplain from './NflExplain'
import { statLabel, statFmt } from '../../lib/nfl/statLabels'
import { quoteFor, fmtOdds } from '../../lib/nfl/oddsMatch'
import ShareCardButton from '../card/ShareCardButton'
import { shareUrl, slug, stamp } from '../../lib/cards/saveCard'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import StarMemory from '../watch/StarMemory'
import MultiLine from '../ledger/MultiLine'
import ScoredFirst from '../player/ScoredFirst'
import { injuryTag, injuryTitle, injuryColor } from '../../lib/nfl/injury'
import NflPlayerRead from './NflPlayerRead'
import LineMoveChip from '../LineMoveChip'
import NflGameCombo from './NflGameCombo'
import NflSplitsGroups from './NflSplitsGroups'
import { roleLabel } from '../../lib/nfl/roles'
import NflGameLog from './NflGameLog'
import SeasonToggle from './SeasonToggle'
import { seasonOptions, defaultSeason, applySeason, seasonNote } from '../../lib/nfl/seasonWindow'
// THE SHARED PLAYER MODEL (components/player/): the verdict first, then ONE row of his numbers, MOONSHOT's parts in
// TUDDY's words (nflAdapter.js). Replaces the per-game tiles, the market-score strip, the hit-rate boxes and the Why box.
import VerdictBlock from '../player/VerdictBlock'
import { useCardLock, useMemberState, CardLockLine } from '../MemberGate'
import { kickoffFor } from '../../lib/nfl/kickoff'
import StatRow from '../player/StatRow'
import ScrollHint from '../player/ScrollHint'
import { useIsPhone } from '../MobileFold'
import PropsGrid from './PropsGrid'
import StatTiles, { rankIn } from '../player/StatTiles'
import { nflVerdict, nflStatRow, useNflBot, nflRecordLine, nflLastLine } from '../player/nflAdapter'
import NflOnHim from './NflOnHim'
import NflCompareSheet from './NflCompareSheet'
import NflTable from './NflTable'
import { nflLeg } from '../../lib/slip/rowLegs'
import { twoBoard } from '../../lib/nfl/twoScore'
import { tdStatusFor } from '../../lib/nfl/tdStatus'
import { tdPool } from '../../lib/nfl/tdPool'
import { useGameCalls } from './GameCalls'
import { boardReason } from '../../lib/nfl/boardReason'
import { baselineFor } from '../../lib/nfl/tdPool'
import { nflReadBullets } from './NflPlayerRead'
import { THIN_G, hasContext } from '../../lib/nfl/gameSplits'
import { playerHref, gameHref } from '../../lib/routes'
import { gameVenue } from '../../lib/nfl/venueOf'
import DashChip, { useDashLines, DASH_OF } from './DashChip'
import RoleTag from './RoleTag'
import TagChips from './TagChips'
import { DefenderFile } from './DefenseSections'
import { useTagBook } from '../../lib/nfl/useDefense'
import { isDefPosition } from '../../lib/nfl/defStats'
// 44px tap around a club code, text in place; 9px a side so the two clubs
// either side of " vs " don't share a target (10-04).
const CLUB_LINK = { color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2, display: 'inline-block', padding: '17px 9px', margin: '-17px -9px' }
// MOONSHOT's TWO-LINE HEAD (components/PlayerModal.js, 2026-10-04): line 1 the clubs + the game, line 2 the rest. The lines are 20px apart, so
// each link's target is its line (20px tall) and ~44px wide; position: relative lifts the padded target over the plain text beside it.
const ROW_LINK = { ...CLUB_LINK, position: 'relative', lineHeight: '10px', padding: '5px 13px', margin: '-5px -13px' }
const TEAM_LINK = { ...ROW_LINK, padding: '5px 9px 5px 12px', margin: '-5px -9px -5px -12px' }
const FIRST_TEAM_LINK = { ...ROW_LINK, padding: '5px 9px 5px 17px', margin: '-5px -9px -5px -17px' }
const GAME_LINK = { ...ROW_LINK, padding: '5px 13px 5px 5px', margin: '-5px -13px -5px -5px' }
// his kickoff, in the game's own zone (ET), said once in the head
const kickWord = (ms) => { try { return `${new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` } catch { return null } }

// Why this player scores what he scores — see components/nfl/ScoreAnatomy.js.
// Since 2026-10-01 (0e b) that is one line: the board card's WHY sentence
// and where the score puts him on the board; the stacked bar is gone.


// ── splits ────────────────────────────────────────────────────────────────────

// Which per-game number a split should show depends on what you're looking at.
// Staring at the TD board, "he averages 3.18 targets when trailing" is trivia;
// "he scores 0.36 a game when trailing vs 0.20 when leading" is the read.
const SPLIT_STAT = {
  TD:       ['td',    'TD/g'],
  REC_YDS:  ['recyd', 'yds/g'],
  REC:      ['rec',   'rec/g'],
  RUSH_YDS: ['ruyd',  'yds/g'],
  RUSH_ATT: ['car',   'car/g'],
  PASS_YDS: ['payd',  'yds/g'],
}

// ── TWO SPLITS VIEWS, AND THEY ARE TRANSPOSES, NOT COPIES (2026-09-20) ──────
//
// Flagged on 09-20 as "both surfaces define their own Splits component" and
// logged as the next duplication that would drift. That was WRONG, and the
// correction matters more than the original note: they cut the same matrix on
// different axes.
//
//   THE CARD      fixes the STAT (whichever the open market implies) and
//                 varies the SPLIT -- one stat across all six situations.
//                 "how does his receiving-yards rate move home vs away,
//                  indoors vs out, leading vs trailing"
//
//   THE PROFILE   fixes the SPLIT (a dropdown) and varies the STAT --
//                 one situation across all eight numbers.
//                 "in the red zone, what happens to everything"
//
// Deduplicating them would delete one of those questions. The piece that IS
// genuinely shared, SplitDumbbell, already is. What was actually wrong here
// was the naming: two components called Splits, doing different jobs, in a
// codebase where a future pass would reasonably assume one was a stale copy.
// Named for the axis each one fixes now, so that mistake cannot be made.
// Short names for the 2026-10-06 pairs (weekday / rest / result) so a pair's two
// sides fit the dumbbell's label column; every other key keeps the bot's label.
// Old payloads simply never ask for these.
const SPLIT_SHORT = { thu: 'Thu', sun: 'Sun', mon: 'Mon', short: 'Short wk', rested: 'Rested', win: 'Win', loss: 'Loss' }

function SplitsForMarket({ player, market, data }) {
  const sp = player?.splits
  if (!sp || !Object.keys(sp).length) return null
  const entry = SPLIT_STAT[market]
  // Kickers have no play-level split (the buckets are built off receiver / rusher / passer roles).
  if (!entry) return null
  const [statKey, unit] = entry
  // 2026-10-07: the dumbbell chart became a dense table (NflSplitsTable) -- the same pairs, one row each.
  return <ScrollHint><NflSplitsTable rows={splitRows(player, statKey, data)} unit={unit} /></ScrollHint>
}

// WHY A PLAYER HAS NO SPLITS (2026-10-07, Donovan: "says not yet available for him"). The bot
// (bots/nfl/nfl_splits.py splits_for) publishes a bucket only with >= 3 games IN it, from the
// season the slate's context comes from, and the site draws a pair only when BOTH sides exist.
// So a short season, or a player with 1-2 games this year, has none -- say which, from the log.
export function splitsWhy(player, fullLog, slateSeason) {
  const season = Number(slateSeason) || null
  const mine = season ? (fullLog || []).filter((g) => Number(g?.s) === season).length : null
  const prior = season ? (fullLog || []).filter((g) => Number(g?.s) === season - 1).length : 0
  if (mine != null && mine < 3) return `He has ${mine} game${mine === 1 ? '' : 's'} on file in ${season}. A split needs 3 games on each side of a pair, so none is available yet${prior ? ` (his ${prior} games from ${season - 1} are on the Games tab)` : ''}.`
  if (mine != null) return `He has ${mine} games in ${season}. A split shows only when each side of a pair has 3 games, and ${mine} games cannot fill both (home / away, indoors / outdoors and the rest). Pairs appear as the season fills in.`
  return 'No splits are available for him: a split needs 3 games on each side of a pair.'
}


// ── THE FILE (2026-09-21) ───────────────────────────────────────────────────
//
// Donovan: the NFL card "sucks and has no data". It was not short of sections
// -- score anatomy, per-game stats, a hit-rate grid, splits, coverage. It was
// short of the plain facts you open a player card to read, and the reason is
// specific and checkable: NINE fields ship on 100% of players in every slate
// payload, every one of them is read somewhere else on the site, and the card
// read ZERO of them.
//
//   games_since_last_td   read only by StatPortal
//   season_td             Numerology, alignments, both tweet feeds
//   jersey_number         Numerology, alignments, both tweet feeds
//   birth_date            Storylines, Numerology, alignments
//   espn_id               Boards, NflFace
//   high_confidence_td_flag  TdCompare, Games, Touchdowns, YourPlayers
//   coverage_mismatch_tag    dvpSignal
//   coverage_mismatch_detail NOBODY, anywhere
//
// TWO OF THEM ARE DELIBERATELY STILL NOT HERE, because adding them would be
// decoration rather than information:
//
//   high_confidence_td_flag is `TD score >= 78` and nothing else
//   (nfl_bot.py) -- the exact A+ cutoff gradeFor() already applies to the
//   score printed at the top of this card. A badge for it would restate the
//   grade in a second shape (#6).
//   coverage_mismatch_tag/detail is the bot's frozen version of the man-vs-
//   zone story CoverageAndExplosive already tells from the matchup payload,
//   on the Matchup tab. Two verdicts on one question is worse than one.
//   (`coverage_mismatch_detail` having no reader anywhere is logged instead.)
//
// SINCE LAST TD NEEDS ITS CAVEAT SAID OUT LOUD. The bot walks his log
// backwards and counts games until it finds one with a touchdown; if it never
// finds one, the count is simply the length of the log. So the maximum value
// does not mean "a long drought after a score" -- it means "no touchdown in
// any game we hold". The log is already in this component, so the card can
// tell those two apart instead of printing a number that reads as the first.
// (His age and birthday live in lib/birthday.js, shown by <BornLine>.)

function Fact({ label, term, value, sub, accent }) {
  return (
    <div style={{
      flex: '1 1 96px', minWidth: 96, padding: '8px 10px',
      border: `1px solid ${C.border}`, borderRadius: 9,
      background: 'rgba(255,255,255,.02)',
    }}>
      <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, letterSpacing: '.06em' }}>
        {term ? <NflExplain label={label} term={term} /> : label}
      </div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 20, fontWeight: 900, color: accent || C.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  )
}

function TheFile({ player, log }) {
  const games = Array.isArray(log) ? log.length : null
  const since = Number.isFinite(player?.games_since_last_td) ? player.games_since_last_td : null
  const seasonTd = Number.isFinite(player?.season_td) ? player.season_td : null
  // The max-value case: he has no touchdown anywhere in the logged window.
  const never = since != null && games != null && since >= games
  if (since == null && seasonTd == null && !games) return null

  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}>THE FILE</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Fact
          label="SINCE LAST TD" term="since last td"
          value={since == null ? '—' : never ? 'NONE' : since}
          accent={since === 0 ? C.green : undefined}
          sub={since == null ? 'no games on file'
            : never ? `no TD in ${games} logged game${games === 1 ? '' : 's'}`
            : since === 0 ? 'scored last time out'
            : `game${since === 1 ? '' : 's'} without one`}
        />
        <Fact label="SEASON TD" term="season td"
          value={seasonTd == null ? '—' : seasonTd}
          sub={seasonTd == null ? 'not available' : 'this season'} />
        <Fact label="LOGGED GAMES" term="logged games"
          value={games || '—'}
          sub={games ? 'every rate here is over these' : 'no games on file'} />
      </div>
    </>
  )
}

// ── RATES AT THE CARD'S BAR (2026-09-27, TUDDY depth step 2) ────────────
// Every market he has a score in, best score first: how often he reached
// the card's own bar over his last 5 games, last 10, and this season, with
// the games counted ("3/5 · 6/10 · 7/11"). THE LAST 5 / LAST 10 ARE INSIDE THE NEWEST SEASON ON THE LOG (2026-10-10): early in a season the
// last 10 games used to reach back into last season's and print one number from two seasons; now it is the last N of this season's games, and
// N is printed. Same log and same rule HitRate
// grades on (stat >= bar, i.e. over bar - 0.5); a market he has no stat line
// for shows dashes rather than a zero.
export function ratesFor(player, markets, log) {
  const all = Array.isArray(log) ? log : []
  const season = all.reduce((m, g) => Math.max(m, Number(g?.s) || 0), 0)
  const cur = all.filter((g) => Number(g?.s) === season)
  return MARKETS
    .filter(([k]) => Number.isFinite(player?.scores?.[k]))
    .map(([k, label]) => {
      const bar = Number((markets || []).find((m) => m.key === k)?.bar)
      const key = STAT_KEY[k]
      const at = (arr) => {
        const games = arr.filter((g) => Number.isFinite(Number(g?.[key])))
        return [games.filter((g) => Number(g[key]) >= bar).length, games.length]
      }
      return { key: k, label, bar: Number.isFinite(bar) ? bar : null, score: player.scores[k], l5: at(cur.slice(-5)), l10: at(cur.slice(-10)), season: at(cur), seasonYear: season || null }
    })
    .sort((a, b) => b.score - a.score)
}


// ── AT THE BAR, MARKET BY MARKET (2026-10-17, the Numbers pill) ─────────────────────────────────────────
// ratesFor() above, drawn: every market he has a score in, best score first -- the bar, the score, and how often he reached the bar over his
// last 5, last 10 and this season, with the games counted. Same log, same rule HitRate grades on. A market he has no stat line for shows dashes.
function RatesTable({ rows }) {
  if (!rows?.length) return <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>No market has a score for him this week.</div>
  const of = (pr) => (pr && pr[1] > 0 ? `${pr[0]}/${pr[1]}` : '—')
  const data = rows.map((r) => ({ _id: r.key, market: r.label, bar: r.bar != null ? `${r.bar}+` : '—', score: Math.round(r.score), l5: of(r.l5), l10: of(r.l10), season: of(r.season) }))
  const columns = [
    { key: 'market', label: 'Market', group: 'Market', sticky: true, w: 96, heat: false },
    { key: 'bar', label: 'Bar', group: 'Market', w: 44, heat: false },
    { key: 'score', label: 'Score', group: 'Market', w: 50, numeric: true },
    { key: 'l5', label: 'L5', group: 'Reached the bar', w: 46, heat: false, title: 'Games he reached the bar in, of his last 5 this season' },
    { key: 'l10', label: 'L10', group: 'Reached the bar', w: 50, heat: false, title: 'Games he reached the bar in, of his last 10 this season' },
    { key: 'season', label: rows[0]?.seasonYear ? String(rows[0].seasonYear) : 'Season', group: 'Reached the bar', w: 58, heat: false, title: 'Games he reached the bar in, this season' },
  ]
  return <ScrollHint><NflTable rows={data} columns={columns} heatMode="none" maxRows={data.length} maxHeight={9999} caption="How often he reached each market's bar, over the games counted." /></ScrollHint>
}

function Head({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
      margin: '18px 0 8px',
    }}>{children}</div>
  )
}

// 📸 SHARE (2026-08-24) — the pregame half of the NFL share-card pair. Builds
// the compact `pick` shape components/nfl/shareCard.js draws from out of
// whatever the modal already has in scope: no re-fetch, no season lookup,
// nothing this screen isn't already showing. `hit`/`actual`/`void` are left
// unset here on purpose — this modal only ever carries a pregame score, never
// a graded line, so the card it downloads always reads as a case, never a
// result. The Accountability tab's own row (which DOES carry a graded line)
// wires the same shareCard.js function with those fields filled in instead.


// ── THE CARD'S OWN CHROME (2026-09-20) ──────────────────────────────────────
//
// The clone audit covered navigation, headers and page frames and stopped at
// the door of this card. Inside, MOONSHOT's PlayerModal has seven tabs, a peer
// navigator, a width that follows its content and an inline mode; this file
// had none of them and rendered nine sections as one scroll. The ANALYSIS was
// cloned honestly -- PropsGrid, the Field, the DvP read, ScoreAnatomy are real
// football instruments, not faked baseball ones -- but the chrome around it
// never was, and none of the chrome is sport-specific.
//
// THREE TABS, NOT SEVEN. MLB's seven are mostly baseball instruments (EV Log,
// Pitch, Spray, Pitcher, Sim) with no football equivalent; inventing five tabs
// to match the count would be #28. What football actually has is three
// questions, and every existing section already answers one of them:
//
//   OVERVIEW  what did the model say, and what did it do    verdict, your
//             card, score anatomy, props grid, notes
//   MATCHUP   who is he playing, and where are they soft    matchup map, DvP,
//             coverage and explosive
//   SPLITS    how does he change by situation              the dumbbells
//
// Nothing moved between sections and nothing was rewritten -- the same
// components render in the same order, grouped behind the question they
// answer, which is the whole of what a tab is.
// 2026-10-17 (player-portal mirror pass): MOONSHOT's pills in MOONSHOT's order and words -- Overview, The Read, Splits, Game log, Numbers --
// with TUDDY's own Matchup (the defence he faces) beside them. Each is in the address (view=).
// THE MOONSHOT CARD, TUDDY'S WAY (2026-10-23, Donovan: the MLB card "once it gets clear, we can just share that across all four
// sports" -- TUDDY first). The page is MOONSHOT's v3 card: the header holds his numbers and the adds, the call and flags sit over his
// numbers, his splits fill the right half (TUDDY on him one chip over, my note under it), and the front is the field | his game log |
// the props grid with its bars. The deeper views are pills. On a phone the front's panels are the first pills, one at a time.
// 'overview' and 'gamelog' (old links) open the front.
const FRONT_TABS = [{ key: 'front', label: '🏈 Front' }]
const PAGE_TABS = [
  { key: 'field', label: '🏟 Field' },
  { key: 'log', label: '📋 Game log' },
  { key: 'props', label: '📊 Props' },
  { key: 'splitsp', label: '📅 Splits' },
]
const DEEP_TABS = [
  { key: 'read', label: 'The Read' },
  { key: 'matchup', label: 'Matchup' },
  { key: 'splits', label: 'All splits' },
  { key: 'numbers', label: 'Numbers' },
]
const TABS = [...FRONT_TABS, ...PAGE_TABS, ...DEEP_TABS]
const VIEW_ALIAS = { overview: 'front', gamelog: 'front' }
const TABBED_BELOW = 1080



export default function NflPlayerModal({ player, market, markets, splitMeta, logs, matchup, slate, picks, results, onClose, onFullProfile, peers = [], onNavigate = null, initialTab = '', onViewChange = null, odds = null, inline = false }) {
  const dash = useDashLines()   // our line beside the book's (TEST)
  // inline (2026-09-30): the Players page shows this card in its right pane,
  // the way MOONSHOT's PlayerBoard shows PlayerModal inline -- no backdrop,
  // no scroll lock, no close.
  useScrollLock(Boolean(player) && !inline)
  const watchlist = useNflWatchlist(slate)
  // the TD market's status word (lib/callStatus tdCallStatus, through lib/nfl/tdStatus): the same one the TD board wears
  const gameCalls = useGameCalls()
  const twoRow = useMemo(() => twoBoard(slate, matchup).rows.find((r) => String(r.player_id) === String(player?.player_id)) || null, [slate, matchup, player?.player_id])
  const tdStatus = useMemo(() => tdStatusFor({ picksCard: picks?.card, gameCalls, games: slate?.games, board: tdPool(slate).rows }), [picks, gameCalls, slate])
  // MEMBERS (2026-10-16): the card's lock, same key as the TD board's (String(player_id)); the TD market is the only called one
  const cardLockKey = String(player?.player_id)
  const cardLock = { key: cardLockKey, time: player ? kickoffFor(slate?.games, player) : null }
  const nonMember = useMemberState() === 'free'
  const cardLocked = useCardLock({ status: market === 'TD' && player ? tdStatus.statusOf(player) : null, key: cardLockKey, time: cardLock.time }).locked
  // TAGS (lib/nfl/tags.js): his own ball-security tags and the tags of the defence he faces. Labels with their numbers; no score reads them.
  const tagBookOf = useTagBook(matchup, slate?.season)
  const tabbed = useIsPhone(TABBED_BELOW - 1)
  const [tab, setTab] = useState('front')
  const [rightView, setRightView] = useState('splits')
  const [season, setSeason] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  useEffect(() => { setCompareOpen(false) }, [player?.player_id])
  // TUDDY ON HIM: his graded calls from the list /called and the Record read (one fetch: the record line, last week and the role table)
  const bot = useNflBot(player?.player_id != null ? String(player.player_id) : null)
  // A new player opens on Overview unless the caller asked for a view --
  // MOONSHOT's initialTab, same contract, so a deep link can land on the
  // tab that matters instead of the top of the card every time.
  useEffect(() => {
    const want = VIEW_ALIAS[initialTab] || initialTab
    setTab(TABS.some((t) => t.key === want) ? want : 'front')
  }, [player?.player_id, initialTab])
  useEffect(() => { setSeason('') }, [player?.player_id])
  // THIS SEASON | LAST SEASON | LAST 2: only what the log holds (lib/nfl/seasonWindow.js).
  const fullLog = logs?.logs?.[player?.player_id]?.log
  const seasonOpts = useMemo(() => seasonOptions(fullLog, slate?.season), [fullLog, slate?.season])
  const seasonKey = seasonOpts.some((o) => o.key === season) ? season : defaultSeason(seasonOpts)
  const slog = useMemo(() => (seasonOpts.length ? applySeason(fullLog, seasonKey, slate?.season) : fullLog), [fullLog, seasonKey, seasonOpts, slate?.season])
  // Escape lives in lib/useDialog.js now (2026-09-24), with focus and Tab.

  if (!player) return null
  // A DEFENDER (DL / LB / CB / S): no TD score, so his page is the defense file, not the offence verdict
  const defender = isDefPosition(player.position)
  const rowTags = defender ? [] : tagBookOf.row(player).all
  const spec =(markets || []).find((m) => m.key === market)
  const weights = spec?.weights || {}
  const s0 = player.scores?.[market]
  const g0 = gradeFor(s0)
  const tag = injuryTag(player)
  const game = (slate?.games || []).find((g) => g.home === player.team || g.away === player.team) || null
  const kickMs = kickoffFor(slate?.games, player)
  const saved = watchlist.isPinned(player.player_id)
  // ⚖ the pool the compare picks from: the list he came from, else the week's TD-scored players
  const comparePool = defender || !Number.isFinite(player.scores?.TD) ? [] : (peers.length > 1 ? peers : (slate?.players || []).filter((x) => !x.on_bye && Number.isFinite(x?.scores?.TD)))
  // + a slip leg for each market the book prices at the card's own bar (lib/slip/rowLegs.js nflLeg: a real price or no leg, never a made-up one)
  const legs = defender ? [] : MARKETS.map(([k]) => nflLeg(odds, player, k, MARKET_SHORT[k] || k)).filter(Boolean)
  // TUDDY's pick, in his words: only the TD market is called. A not-yet-kicked CALLED pick a free viewer may not read reads as the board's other men do
  // (the same lock the card's word uses, useCardLock above), so this line never says what the word does not.
  const pickWord = tdStatus.statusOf(player) === 'called' && !cardLocked ? 'Anytime TD' : 'no call this week'
  const pick = (k) => { setTab(k); onViewChange?.(k) }
  // SIGNAL -> EVIDENCE: the one-line reason and the number against him, in MOONSHOT's
  // Why box; a tap opens every reason in full (components/WhyLines.js).
  const eligible = (slate?.players || []).filter((x) => Number.isFinite(x?.scores?.[market]))
  const why = Number.isFinite(s0) ? boardReason(player, weights, baselineFor(eligible, market), market, eligible) : null
  const rank = Number.isFinite(s0) && eligible.length ? 1 + eligible.filter((x) => x.scores[market] > s0).length : null
  const bullets = nflReadBullets(player, market, fullLog || [], matchup)
  const against = bullets.find((b) => b.tone === 'against')
  const whyLines = [why?.text, rank != null ? `#${rank} of ${eligible.length} on the ${(spec?.label || market)} board, score ${Math.round(s0)}` : null].filter(Boolean)
  const whyExplain = [...whyLines, ...bullets.map((b) => b.text)].join('  ')
  // a phone shows the front's panels one at a time (its pills); a wide screen shows the whole front
  // (and a wide screen opened on a phone pill -- a shared link -- shows the whole front)
  const frontTab = tab === 'front' && tabbed ? 'field' : (!tabbed && PAGE_TABS.some((t) => t.key === tab) ? 'front' : tab)
  const showPanel = (k) => (tabbed ? frontTab === k : frontTab === 'front')
  // the season toggle sits over the views it changes (his game log and his splits), not over the field or the props grid
  const showSeason = ['splits', 'front', 'log', 'splitsp'].includes(frontTab) && seasonOpts.length > 0
  const visibleTabs = tabbed ? [...PAGE_TABS, ...DEEP_TABS] : [...FRONT_TABS, ...DEEP_TABS]

  // THE WATCH ROW, MOONSHOT's (2026-10-22, the even row): Watch and a + for every market the book actually prices for him (no price,
  // no button) as equal cells in one row; TUDDY's pick is a ★ on its cell, and the sentence shows only when no cell carries it.
  const watchRow = (
    <SlipAdd sport="nfl" legs={legs} C={C} NUM_FONT={NUM_FONT} accent={C.green} style={{ margin: 0 }} even
      pickCode={pickWord === 'Anytime TD' ? 'TD' : null}
      pickLine={!defender && Number.isFinite(s0) ? <>TUDDY&apos;s pick: <b style={{ color: C.text2 }}>{pickWord}</b></> : null}
      lead={(
        <button type="button" onClick={() => watchlist.toggle(player)} aria-pressed={saved}
          aria-label={saved ? `Remove ${player.name} from watchlist` : `Save ${player.name} to watchlist`}
          title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
          className={FLAT_CHIP_CLASS} style={{ ...flatChip(saved, C.green, C, NUM_FONT), justifyContent: 'center', minWidth: 0 }}
        >{saved ? '★ Watching' : '☆ Watch'}</button>
      )} />
  )

  // HIS NUMBERS, THE CHECKLIST'S SLOT (components/player/StatTiles.js, shared with LAMP): his season per game, each with his rank at his
  // position on this week's slate and an arrow on a hot / cold last 3
  const statTiles = (limit) => {
    if (!Object.keys(player.stats || {}).length) return null
    const pool = (slate?.players || []).filter((x) => x.position === player.position && x.stats)
    const logField = (k) => { const f = `g_${String(k).toLowerCase()}`; return (slog || []).some((g) => g?.[f] != null) ? f : null }
    const arrowOf = (k) => {
      const f = logField(k); if (!f || (slog || []).length < 5) return null
      const vals = slog.map((g) => Number(g[f]) || 0); const szn = vals.reduce((a, b) => a + b, 0) / vals.length
      const l3 = vals.slice(-3).reduce((a, b) => a + b, 0) / 3
      if (!(szn > 0)) return null
      return l3 >= szn * 1.15 ? 'up' : l3 <= szn * 0.85 ? 'down' : null
    }
    const tiles = Object.entries(player.stats).slice(0, limit).map(([k, v]) => {
      const rank = rankIn(pool.map((x) => x.stats?.[k]), v)
      const arrow = arrowOf(k)
      return {
        id: k, label: <NflExplain label={statLabel(k)} term={k} />, value: typeof v === 'number' ? statFmt(k, v) : v,
        arrow, arrowTitle: arrow === 'up' ? 'His last 3 games run 15%+ above his season' : 'His last 3 games run 15%+ below his season',
        rank, rankWord: player.position, rankTitle: rank ? `${rank.r} of ${rank.n} ${player.position}s on this week's slate` : '',
      }
    })
    return <StatTiles tiles={tiles} className="nfl-card-stats" />
  }
  // THE PRICE: the line for the market on screen, the best book, the break-even (one line, under his numbers)
  const priceLine = (() => {
    const q = cardLocked ? null : quoteFor(odds, player, market)
    if (!q) return null
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', margin: '8px 0 0', fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
        <b style={{ color: C.text3, fontSize: 11, letterSpacing: '.08em' }}>PRICE</b>
        <span>o{q.line} <b style={{ color: C.text }}>{fmtOdds(q.over)}</b></span>
        {q.best_over != null && q.best_over !== q.over && <span>best <b style={{ color: C.green }}>{fmtOdds(q.best_over)}</b>{q.best_book ? ` ${q.best_book}` : ''}</span>}
        {q.implied != null && <span>needs {q.implied}%</span>}
        {q.matches !== false && <LineMoveChip quote={q} theme={C} numFont={NUM_FONT} />}
        {!q.matches && <span style={{ color: C.yellow }}>a different line from the bar</span>}
      </div>
    )
  })()
  // THE RIGHT HALF: his splits, TUDDY on him one chip over; your note, your star and his multi-TD / first-TD lines under it
  const splitsPanel = (
    <>
      <div className="chip-row" style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
        {[['splits', 'Splits'], ['onhim', 'TUDDY on him']].map(([k, l]) => (
          <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={rightView === k} onClick={() => setRightView(k)} style={flatChip(rightView === k, C.green, C, NUM_FONT)}>{l}</button>
        ))}
      </div>
      {rightView === 'onhim'
        ? <NflOnHim bot={bot} />
        : <NflSplitsGroups log={slog} market={market} dvp={matchup?.dvp?.season || null} role={roleLabel(player) || null} />}
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        <PlayerNotes playerId={player.player_id} accent={C.green} />
        <StarMemory sport="nfl" id={player?.player_id} />
        <MultiLine sport="nfl" playerId={player?.player_id} words={{ TD: 'multi-TD', PASS_TD: '2+ passing-TD' }} color={C.green} textColor={C.text2} />
        {/* the first-pitch split's twin: the games he scored the first touchdown */}
        <ScoredFirst sport="nfl" playerId={player?.player_id} word="Scored the first TD" color={C.green} textColor={C.text2} />
        {player.position !== 'DEF' && <InTheLedger sport="nfl" id={player.player_id} name={player.name} jersey={player.jersey_number} birthDate={player.birth_date} next={Number.isFinite(player?.season_td) ? player.season_td + 1 : null} date={etToday()} />}
      </div>
    </>
  )

  return (
    // MOONSHOT's shell (components/CardShell.js), MOONSHOT's width now: the whole screen on a desktop, the same as the MLB card
    <>
    <CardShell inline={inline} theme={C} accent={C.green} width={1760} fill onClose={onClose} label={`${player?.name || 'Player'} card`}>
      {/* THE TOOLBAR, MOONSHOT's one even row (app/globals.css .card-toolbar): Card, Save, Compare, then the ‹ › / Lineup / Find walk */}
      <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 8 }}>
      <div className="card-toolbar" style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flex: '0 0 auto' }}>
        {Number.isFinite(s0) && player?.player_id != null && <CardFlip sport="nfl" id={String(player.player_id)} name={player.name} />}
        {/* 📸 his pick card as a picture, ready to post: beside the flip Card button */}
        <ShareCardButton sport="nfl" what="his pick card" url={shareUrl({ kind: 'pick', sport: 'nfl', id: player.player_id, market })} filename={`pick-${slug(market, 'pick')}-${slug(player.name, 'pick')}_${stamp('')}.png`} />
        {/* ⚖ COMPARE (components/nfl/NflCompareSheet.js): him against another player on this week's slate, on the TD signals */}
        {comparePool.length > 1 && (
          <button type="button" onClick={() => setCompareOpen(true)} title="Compare this player against another on this week's slate" aria-label="Compare"
            style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 7, padding: '3px 9px', fontSize: 12, lineHeight: 1, cursor: 'pointer', minHeight: 44, minWidth: 44 }}>⚖<span className="tb-word">Compare</span></button>
        )}
        {onNavigate && <Navigator peers={peers} cur={player} onNavigate={onNavigate} idOf={nflIdOf} noun="player" />}
      </div>
      </div>

      {/* graded state comes first once there is one (MOONSHOT's PickVerdictStamp) */}
      <VerdictStamp player={player} results={results} bars={Object.fromEntries((markets || []).map((m) => [m.key, Number(m.bar)]))} />

      <div className="portal-top">
      <div className="portal-who">
      {/* THE HEADER CARD, MOONSHOT's v3: face in the ring, #number and name, the clubs and the game, his role / kickoff / status, the
          close INSIDE it -- and his numbers and the watch / slip row in its footer. */}
      <VerdictHero lead="face" theme={C} numFont={NUM_FONT} style={{ marginBottom: 10 }}
        photo={faceUrl({ sport: 'nfl', espnId: player.espn_id, size: 96 })}
        col={g0.color} score={Number.isFinite(s0) && !cardLocked ? s0 : null}
        // the name is the player's own link (a shared link to his page; check-clickable)
        title={<>{player.jersey_number ? <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT }}>#{player.jersey_number} </span> : null}<a href={playerHref('nfl', player.player_id)} style={{ color: 'inherit', textDecoration: 'none' }}>{player.name}</a>{!tag && <PlayerInjuryChip who={{ player_id: player.player_id, name: player.name, team: player.team }} C={C} font={NUM_FONT} />}</>} badge={Number.isFinite(s0) ? g0.label : defender ? 'DEFENDER' : 'UNSCORED'} badgeQuiet={!Number.isFinite(s0)}
        market={defender ? 'Defense' : (spec?.label || market)}
        meta={<>
          {/* the clubs open their team pages, the game opens his game (route audit B6; team page since 10-03) */}
          {player.team ? <a href={`#sport=nfl&tab=team&team=${player.team}`} style={FIRST_TEAM_LINK} title={`${player.team} team page`}>{player.team}</a> : null}
          {player.opp ? <>{' vs '}<a href={`#sport=nfl&tab=team&team=${player.opp}`} style={TEAM_LINK} title={`${player.opp} team page`}>{player.opp}</a></> : null}
          {game?.game_id ? <>{' · '}<a href={gameHref('nfl', game.game_id)} style={GAME_LINK} title="Open his game on the Slate">Game ›</a></> : null}
        </>}
        meta2={<>
          <RoleTag player={player} season={matchup?.slate_season || matchup?.season} />
          {kickMs != null && kickWord(kickMs) ? ` · ${kickWord(kickMs)}` : ''}
          {tag && <span title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), fontWeight: 900 }}>{' · '}{tag}</span>}
          {player.low_sample && <span style={{ color: C.text3 }}> · low sample</span>}
        </>}
        footer={defender ? watchRow : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <StatRow noun={`${player.position || 'player'}s`} poolLabel="this week's slate"
            stats={nflStatRow({ player, slate, rate: ratesFor(player, markets, fullLog).find((x) => x.key === market) })} />
          {watchRow}
        </div>}
        right={!inline ? (
          <button type="button" onClick={onClose} aria-label="Close" style={{
            flexShrink: 0, width: 44, height: 44, display: 'grid', placeItems: 'center', margin: '-6px -6px 0 0',
            background: 'transparent', border: 'none', color: C.text2, cursor: 'pointer', fontSize: 20, lineHeight: 1,
          }}>✕</button>
        ) : null}
      />
      {/* HIS BIRTHDAY (published birth_date): only on the day, the chip is the point */}
      {birthdayChip(player.birth_date, etToday()) && <BornLine birth={player.birth_date} on={etToday()} accent={C.green} C={C} font={NUM_FONT} style={{ marginTop: -4 }} />}

      {/* TAGS: his ball-security tags and the tags of the defence he faces, each with its number on a tap (lib/nfl/tags.js) */}
      {rowTags.length > 0 && <div style={{ margin: '0 0 8px' }}><TagChips tags={rowTags} onPlayerRow /></div>}

      {defender && <DefenderFile player={player} matchup={matchup} slateSeason={slate?.season} />}
      {!defender && <>
        {/* THE CALL, ONE ROW (MOONSHOT's VerdictBlock compact): the word (TD market only), the score, his other markets as chips */}
        <VerdictBlock sport="nfl" compact lock={cardLock}
          {...nflVerdict({ player, market, spec, score: s0, statusWord: tdStatus.statusOf(player), whyLines, watch: against?.text || null, whyExplain, two: twoRow })}
          recordLine={bot === undefined ? null : nflRecordLine(bot)}
          lastLine={bot === undefined ? null : nflLastLine(bot)} />
        {/* HIS NUMBERS where MOONSHOT's checklist sits: season per game, ranked at his position */}
        {statTiles(6)}
        {player.position !== 'DEF' && <div style={{ marginTop: 8 }}><HisNumbers look="strip" name={player.name} jersey={player.jersey_number} birthDate={player.birth_date} next={Number.isFinite(player?.season_td) ? player.season_td + 1 : null} nextWord="TD" date={etToday()} theme={C} accent={C.green} numFont={NUM_FONT} /></div>}
        {priceLine}
        {player.carryover && <div style={{ marginTop: 8, fontSize: 12, color: C.text2 }}><b>Carryover</b> — last season&apos;s per-game baseline.</div>}
      </>}
      </div>
      {!defender && !tabbed && <div className="portal-read"><section aria-label="Splits">{splitsPanel}</section></div>}
      </div>

      {!defender && <>
      {/* THE PILLS: Front and the deeper views (desktop), or every panel one at a time (phone); sticky so the next view is one tap */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '8px 0', margin: '6px 0 12px', position: 'sticky', top: 0, zIndex: 5, background: C.bg2 }}>
        <div className="chip-row" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {visibleTabs.map((t) => (
            <TabBtn key={t.key} active={frontTab === t.key} onClick={() => pick(t.key)}>{t.label}</TabBtn>
          ))}
        </div>
      </div>

      {seasonNote(fullLog, slate?.season) && <div style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.yellow, margin: '0 0 8px', lineHeight: 1.4 }}>{seasonNote(fullLog, slate?.season)}</div>}
      {showSeason && <SeasonToggle options={seasonOpts} value={seasonKey} onChange={setSeason} />}

      {/* THE FRONT, MOONSHOT's portal-main: the field | GAME LOG (every game, one row each) | the props grid and its bars */}
      {(frontTab === 'front' || PAGE_TABS.some((t) => t.key === frontTab)) && (
        <div className="portal-main">
          {showPanel('field') && <section className="portal-spray" aria-label="The field" style={{ minWidth: 0 }}><PlayerField key={player.player_id} player={player} matchup={matchup} /></section>}
          {showPanel('log') && <section className="portal-ev" aria-label="Game log" style={{ minWidth: 0 }}><Head>GAME BY GAME</Head><ScrollHint><NflGameLog log={slog} /></ScrollHint></section>}
          {showPanel('props') && <section className="portal-props" aria-label="Props" style={{ minWidth: 0 }}>
            {fullLog?.length ? <PropsGrid log={fullLog} market={market} defaultBar={Number(spec?.bar) || undefined} scores={player.scores} /> : <div style={{ fontSize: 12, color: C.text3 }}>No game log for him yet.</div>}
          </section>}
          {tabbed && showPanel('splitsp') && <section className="portal-splits" aria-label="Splits" style={{ minWidth: 0 }}>{splitsPanel}</section>}
        </div>
      )}

      {/* THE READ (MOONSHOT's pill): the sentences, and the case against him */}
      {tab === 'read' && <>
        {cardLocked ? null : <NflPlayerRead player={player} market={market} rows={fullLog || []} matchup={matchup} slateSeason={slate?.season} />}
        {nonMember && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ margin: '4px 0 8px' }} />}
      </>}

      {/* MATCHUP: the defense he faces, and how it covers */}
      {tab === 'matchup' && <NflCardMatchup player={player} matchup={matchup} slate={slate} />}

      {/* ALL SPLITS: the bot's game-state splits, the combine filters and this stadium (the pairs are the front's right half) */}
      {tab === 'splits' && <>
        <SplitsForMarket player={player} market={market} data={splitMeta} />
        <NflGameCombo log={slog} venue={gameVenue(slate?.games, player.team, player.opp)} />
        {!(player?.splits && Object.keys(player.splits).length) && !hasContext(slog) && <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{splitsWhy(player, fullLog, slate?.season)}</div>}
        {player?.splits && Object.keys(player.splits).length > 0 && SPLIT_STAT[market] && splitRows(player, SPLIT_STAT[market][0], splitMeta).length === 0 && <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{splitsWhy(player, fullLog, slate?.season)} Only one side of each pair is published for him.</div>}
      </>}

      {/* NUMBERS (MOONSHOT's pill): the file, how often he reached each market's bar, every per-game number */}
      {tab === 'numbers' && <>
        <TheFile player={player} log={slog} />
        <Head>AT THE BAR, MARKET BY MARKET</Head>
        <RatesTable rows={ratesFor(player, markets, slog)} />
        {Object.keys(player.stats || {}).length > 0 && <><Head>SEASON PER GAME</Head>{statTiles(99)}</>}
      </>}
      </>}

      {/* the cards he has earned (his real multi-TD and 100-yard games, a long shot that cashed): at the END of the card, no section when he has none */}
      {!defender && player?.player_id != null && <CardsEarned sport="nfl" id={String(player.player_id)} name={player.name} />}

      {onFullProfile && !defender && (
        <button type="button" onClick={() => onFullProfile(player)} style={{ display: 'block', width: '100%', marginTop: 18, background: `${C.green}20`, border: `1px solid ${C.green}70`, color: C.green, borderRadius: 10, minHeight: 44, cursor: 'pointer', fontSize: 12, fontWeight: 900, letterSpacing: '.06em' }}>OPEN HIS FULL FILE →</button>
      )}

    </CardShell>
    {compareOpen && <NflCompareSheet anchor={player} peers={comparePool} matchup={matchup} odds={odds} onClose={() => setCompareOpen(false)} />}
    </>
  )
}
