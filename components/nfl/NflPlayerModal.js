'use client'
import { useEffect, useMemo, useState } from 'react'

import useScrollLock from '../../lib/useScrollLock'
import CardShell from '../CardShell'
// MOONSHOT's tab row + peer arrows (with its tonight's-game grouping), in the
// sport theme CardShell provides. TUDDY keys players by gsis string.
import { TabBtn, Navigator } from '../card/CardNav'
const nflIdOf = (x) => String(x?.player_id ?? '')
import { C, NUM_FONT, MARKETS, MARKET_SHORT, gradeFor } from '../../lib/nfl/theme'
import StatStrip, { HitRateBoxes } from '../StatStrip'
import PropsGrid from './PropsGrid'
import { STAT_KEY } from './HitRate'
import PlayerNotes from '../PlayerNotes'
import HisNumbers from '../HisNumbers'
import InTheLedger from '../ledger/InTheLedger'
import { etToday } from '../../lib/freshness'
import { VerdictStamp, PutOnCard } from './CardActions'
import NflCardMatchup from './NflCardMatchup'
import NflSplitsTable, { splitRows } from './NflSplitsTable'
import VerdictHero from '../VerdictHero'
import { faceUrl } from '../PlayerFace'
import NflExplain from './NflExplain'
import { statLabel, statFmt } from '../../lib/nfl/statLabels'
import { quoteFor, fmtOdds } from '../../lib/nfl/oddsMatch'
import { downloadNflPickCard } from './shareCard'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import StarMemory from '../watch/StarMemory'
import MultiLine from '../ledger/MultiLine'
import { injuryTag, injuryTitle, injuryColor } from '../../lib/nfl/injury'
import NflPlayerRead from './NflPlayerRead'
import LineMoveChip from '../LineMoveChip'
import NflGameCombo from './NflGameCombo'
import NflGameLog from './NflGameLog'
import SeasonToggle from './SeasonToggle'
import { seasonOptions, defaultSeason, applySeason } from '../../lib/nfl/seasonWindow'
import WhyLines from '../WhyLines'
import { boardReason } from '../../lib/nfl/boardReason'
import { baselineFor } from '../../lib/nfl/tdPool'
import { nflReadBullets } from './NflPlayerRead'
import { THIN_G, hasContext } from '../../lib/nfl/gameSplits'
import { playerHref } from '../../lib/routes'
import { gameVenue } from '../../lib/nfl/venueOf'
import DashChip, { useDashLines, DASH_OF } from './DashChip'
// 44px tap around a club code, text in place; 9px a side so the two clubs
// either side of " vs " don't share a target (10-04).
const CLUB_LINK = { color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2, display: 'inline-block', padding: '17px 9px', margin: '-17px -9px' }

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
  return <NflSplitsTable rows={splitRows(player, statKey, data)} unit={unit} />
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
// Whole years, from the published birth_date. Client-only component, so
// there is no server/client clock split to worry about here.
function ageOf(birth) {
  if (!birth) return null
  const d = new Date(birth)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age > 0 && age < 70 ? age : null
}

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
// the games counted ("3/5 · 6/10 · 7/11"). Same log and same rule HitRate
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
      return { key: k, label, bar: Number.isFinite(bar) ? bar : null, score: player.scores[k], l5: at(all.slice(-5)), l10: at(all.slice(-10)), season: at(cur), seasonYear: season || null }
    })
    .sort((a, b) => b.score - a.score)
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
function pickFromPlayer(player, market, spec) {
  return {
    name: player.name,
    espnId: player.espn_id,
    team: player.team,
    opp: player.opp,
    position: player.position,
    market,
    marketLabel: spec?.label || market,
    bar: spec?.bar,
    questionable: player.questionable,
    low_sample: player.low_sample,
    score: player.scores?.[market],
    grade: Number.isFinite(player.scores?.[market]) ? gradeFor(player.scores[market]).label : undefined,
  }
}


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
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'matchup', label: 'Matchup' },
  { key: 'splits', label: 'Splits' },
  { key: 'gamelog', label: 'Games' },
]



// KEY STAT (MOONSHOT's SlashLine, football's numbers): the four per-game numbers
// that describe his job, big enough to read at arm's length. Position decides which.
const KEY_BY_POS = {
  QB: [['PAYD', 'PASS YD'], ['ATT', 'ATT'], ['RUYD', 'RUSH YD'], ['TD', 'TD']],
  RB: [['RUYD', 'RUSH YD'], ['CAR', 'CARRIES'], ['RECYD', 'REC YD'], ['TD', 'TD']],
  WR: [['RECYD', 'REC YD'], ['REC', 'CATCHES'], ['TGT', 'TARGETS'], ['TD', 'TD']],
  TE: [['RECYD', 'REC YD'], ['REC', 'CATCHES'], ['TGT', 'TARGETS'], ['TD', 'TD']],
  K: [['FGM', 'FG'], ['PAT', 'XP']],
}
function KeyLine({ player, style }) {
  const st = player?.stats || {}
  const picks = (KEY_BY_POS[player?.position] || []).filter(([k]) => Number.isFinite(Number(st[k])))
  if (!picks.length) return null
  return (
    <div style={style}>
      <div style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: C.text3, marginBottom: 3 }}>PER GAME</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${picks.length}, minmax(0, 1fr))`, gap: 6 }}>
        {picks.map(([k, label], i) => (
          <div key={k} title={statLabel(k)} style={{ textAlign: 'center', padding: '6px 2px 7px', borderRadius: 9, border: `1px solid ${i === 0 ? `${C.green}55` : C.border}`, background: i === 0 ? `${C.green}12` : 'rgba(255,255,255,.03)' }}>
            <div style={{ fontFamily: NUM_FONT, fontSize: 20, fontWeight: 900, lineHeight: 1.1, color: i === 0 ? C.green : C.text }}>{statFmt(k, st[k])}</div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 11, letterSpacing: '.04em', color: C.text3, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function NflPlayerModal({ player, market, markets, splitMeta, logs, matchup, slate, picks, results, onClose, onFullProfile, peers = [], onNavigate = null, initialTab = '', onViewChange = null, odds = null, inline = false }) {
  const dash = useDashLines()   // our line beside the book's (TEST)
  // inline (2026-09-30): the Players page shows this card in its right pane,
  // the way MOONSHOT's PlayerBoard shows PlayerModal inline -- no backdrop,
  // no scroll lock, no close.
  useScrollLock(Boolean(player) && !inline)
  const watchlist = useNflWatchlist(slate)
  const [tab, setTab] = useState('overview')
  const [season, setSeason] = useState('')
  const [allStats, setAllStats] = useState(false)
  // A new player opens on Overview unless the caller asked for a view --
  // MOONSHOT's initialTab, same contract, so a deep link can land on the
  // tab that matters instead of the top of the card every time.
  useEffect(() => {
    setTab(TABS.some((t) => t.key === initialTab) ? initialTab : 'overview')
  }, [player?.player_id, initialTab])
  useEffect(() => { setSeason('') }, [player?.player_id])
  // THIS SEASON | LAST SEASON | LAST 2: only what the log holds (lib/nfl/seasonWindow.js).
  const fullLog = logs?.logs?.[player?.player_id]?.log
  const seasonOpts = useMemo(() => seasonOptions(fullLog, slate?.season), [fullLog, slate?.season])
  const seasonKey = seasonOpts.some((o) => o.key === season) ? season : defaultSeason(seasonOpts)
  const slog = useMemo(() => (seasonOpts.length ? applySeason(fullLog, seasonKey, slate?.season) : fullLog), [fullLog, seasonKey, seasonOpts, slate?.season])
  // Escape lives in lib/useDialog.js now (2026-09-24), with focus and Tab.

  if (!player) return null
  const spec = (markets || []).find((m) => m.key === market)
  const weights = spec?.weights || {}
  const s0 = player.scores?.[market]
  const g0 = gradeFor(s0)
  const tag = injuryTag(player)
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
  const showSeason = ['splits', 'gamelog'].includes(tab) && seasonOpts.length > 0

  return (
    // MOONSHOT's shell (components/CardShell.js, 2026-09-29): same backdrop,
    // focus trap and the .modal-* phone sheet as the MLB card. Width follows the
    // content, as MOONSHOT's does (580 overview / 900 the rest).
    <CardShell inline={inline} theme={C} accent={C.green} width={tab === 'overview' ? 580 : 900} onClose={onClose} label={`${player?.name || 'Player'} card`}>
      {/* THE TOOLBAR, ON ITS OWN LINE -- MOONSHOT's order: share, then the ‹ › / search
          walk through the list he came from, then the hero. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => watchlist.toggle(player)}
          aria-label={watchlist.isPinned(player.player_id) ? `Remove ${player.name} from watchlist` : `Save ${player.name} to watchlist`}
          title={watchlist.isPinned(player.player_id) ? 'Saved to your watchlist' : 'Save to your watchlist'}
          style={{
            background: watchlist.isPinned(player.player_id) ? `${C.yellow}26` : 'transparent',
            border: `1px solid ${watchlist.isPinned(player.player_id) ? C.yellow + '66' : C.border2}`,
            color: watchlist.isPinned(player.player_id) ? C.yellow : C.text2,
            borderRadius: 7, minHeight: 44, minWidth: 44, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>{watchlist.isPinned(player.player_id) ? '★' : '☆'}</button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => downloadNflPickCard(pickFromPlayer(player, market, spec))}
            title="Download his pick card as a picture, ready to post"
            aria-label="Download pick card as image"
            style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 7, fontSize: 13, lineHeight: 1, cursor: 'pointer', minHeight: 44, minWidth: 44 }}>📸</button>
          {onNavigate && <Navigator peers={peers} cur={player} onNavigate={onNavigate} idOf={nflIdOf} noun="player" />}
        </div>
      </div>

      {/* graded state comes first once there is one (MOONSHOT's PickVerdictStamp) */}
      <VerdictStamp player={player} results={results} bars={Object.fromEntries((markets || []).map((m) => [m.key, Number(m.bar)]))} />

      {/* THE HERO: face, name, club, position, status -- and the model's grade for the
          market on screen. The close sits in it, as on MOONSHOT's card. */}
      <VerdictHero lead="face" theme={C} numFont={NUM_FONT} style={{ marginBottom: 12 }}
        photo={faceUrl({ sport: 'nfl', espnId: player.espn_id, size: 96 })}
        col={g0.color} score={Number.isFinite(s0) ? s0 : null}
        // the name is the player's own link (a shared link to his page; check-clickable)
        title={<a href={playerHref('nfl', player.player_id)} style={{ color: 'inherit', textDecoration: 'none' }}>{player.name}</a>} badge={Number.isFinite(s0) ? g0.label : 'UNSCORED'} badgeQuiet={!Number.isFinite(s0)}
        market={spec?.label || market}
        meta={<>
          {player.jersey_number ? `#${player.jersey_number} · ` : ''}
          {/* the clubs open their team pages (route audit B6; team page since 10-03) */}
          {player.position} · {player.team ? <a href={`#sport=nfl&tab=team&team=${player.team}`} style={CLUB_LINK} title={`${player.team} team page`}>{player.team}</a> : null}
          {player.opp ? <>{' vs '}<a href={`#sport=nfl&tab=team&team=${player.opp}`} style={CLUB_LINK} title={`${player.opp} team page`}>{player.opp}</a></> : null}
          {ageOf(player.birth_date) ? ` · age ${ageOf(player.birth_date)}` : ''}
          {tag && <span title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), fontWeight: 900 }}>{' · '}{tag}</span>}
          {player.low_sample && <span style={{ color: C.text3 }}> · low sample</span>}
        </>}
        right={!inline ? (
          <button type="button" onClick={onClose} aria-label="Close" style={{
            flexShrink: 0, width: 44, height: 44, display: 'grid', placeItems: 'center', margin: '-6px -6px 0 0',
            background: 'transparent', border: 'none', color: C.text2, cursor: 'pointer', fontSize: 20, lineHeight: 1,
          }}>✕</button>
        ) : null}
      />

      <StarMemory sport="nfl" id={player?.player_id} />
      {/* MOONSHOT's multi-HR line, TUDDY's words */}
      <MultiLine sport="nfl" playerId={player?.player_id} words={{ TD: 'multi-TD', PASS_TD: '2+ passing-TD' }} color={C.green} textColor={C.text2} />

      {/* STAT-FIRST HEADER (MOONSHOT's order): the key numbers, every market's score
          in its grade's colour, then how often he reached the card's bar. */}
      <KeyLine player={player} style={{ margin: '10px 0 10px' }} />
      <StatStrip style={{ margin: '0 0 6px' }} stats={[...MARKETS]
        .sort(([a], [b]) => (b === market) - (a === market))
        .filter(([k]) => Number.isFinite(player.scores?.[k]))
        .map(([k, label]) => {
          const sc = player.scores[k]
          return { id: k, label: MARKET_SHORT[k] || label, text: String(Math.round(sc)), color: gradeFor(sc).color, title: `${label}: ${Math.round(sc)} (score, a ranking — not a percentage)` }
        })} />
      {(() => {
        const r = ratesFor(player, markets, fullLog).find((x) => x.key === market)
        if (!r || r.bar == null) return null
        const boxes = [['l5', 'L5', r.l5], ['l10', 'L10', r.l10], ['szn', String(r.seasonYear || 'Season'), r.season]]
          .filter(([, , pr]) => pr[1] > 0)
          .map(([id, label, [num, den]]) => ({ id, label, num, den, unit: 'G' }))
        return <HitRateBoxes boxes={boxes} style={{ margin: '0 0 8px' }}
          text={(b) => `${b.num}/${b.den}`}
          sub={() => (r.key === 'TD' ? 'G with a TD' : `G at ${r.bar}+`)}
          tip={(b) => `${r.label}: reached ${r.bar}+ in ${b.num} of his last ${b.den} games${b.id === 'szn' ? ' this season' : ''}.`} />
      })()}
      {/* THE PRICE: the line for the market on screen, the best book, the break-even. */}
      {(() => {
        const q = quoteFor(odds, player, market)
        if (!q) return null
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', margin: '4px 0 6px', fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
            <b style={{ color: C.text3, fontSize: 11, letterSpacing: '.08em' }}>PRICE</b>
            <span>o{q.line} <b style={{ color: C.text }}>{fmtOdds(q.over)}</b></span>
            {q.best_over != null && q.best_over !== q.over && <span>best <b style={{ color: C.green }}>{fmtOdds(q.best_over)}</b>{q.best_book ? ` ${q.best_book}` : ''}</span>}
            {q.implied != null && <span>needs {q.implied}%</span>}
            {q.books ? <span style={{ color: C.text3 }}>{q.books} book{q.books === 1 ? '' : 's'}</span> : null}
            {q.matches !== false && <LineMoveChip quote={q} theme={C} numFont={NUM_FONT} />}
            {!q.matches && <span style={{ color: C.yellow }}>a different line from the bar</span>}
          </div>
        )
      })()}
      {/* WHY? -- one tap opens every reason in full */}
      <WhyLines theme={C} numFont={NUM_FONT} accent={C.green} why={whyLines} watch={against?.text || null}
        explain={{ label: `Why ${player.name}?`, text: whyExplain }} />

      {/* TAB BAR (MOONSHOT's: pills, a rule under them). Phone: sideways chip row. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 10, flexWrap: 'wrap' }}>
        <div className="chip-row" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <TabBtn key={t.key} active={tab === t.key} onClick={() => pick(t.key)}>{t.label}</TabBtn>
          ))}
        </div>
      </div>

      {tab !== 'overview' && showSeason && <SeasonToggle options={seasonOpts} value={seasonKey} onChange={setSeason} />}

      {/* OVERVIEW: the read, then the props grid (MOONSHOT's order), then his own notes */}
      {tab === 'overview' && <>
        <NflPlayerRead player={player} market={market} rows={fullLog || []} matchup={matchup} />
        <div style={{ marginTop: 16 }}><SeasonToggle options={seasonOpts} value={seasonKey} onChange={setSeason} /></div>
        {slog && (() => {
          // HIS BEST MARKET LEADS: the chart opens on the market he scores highest in.
          const best = ratesFor(player, markets, slog)[0]
          const lead = best?.key || market
          // The market's published bar -- the week's, else the log file's own. Never a made-up 1.
          const leadBar = Number((markets || []).find((m) => m.key === lead)?.bar ?? logs?.bars?.[lead]?.[1])
          if (!Number.isFinite(leadBar) || !slog.length) return null
          return <PropsGrid key={`${player.player_id}-${lead}-${seasonKey}`} log={slog} market={lead} defaultBar={leadBar} scores={player.scores} />
        })()}
        <PutOnCard player={player} market={market} picks={picks} slate={slate} />
        <PlayerNotes playerId={player.player_id} accent={C.green} />
        {player.position !== 'DEF' && <InTheLedger sport="nfl" id={player.player_id} name={player.name} jersey={player.jersey_number} birthDate={player.birth_date} next={Number.isFinite(player?.season_td) ? player.season_td + 1 : null} date={etToday()} />}
        {player.position !== 'DEF' && <HisNumbers name={player.name} jersey={player.jersey_number} birthDate={player.birth_date} next={Number.isFinite(player?.season_td) ? player.season_td + 1 : null} nextWord="TD" date={etToday()} theme={C} accent={C.green} numFont={NUM_FONT} />}
        {player.carryover && (
          <div style={{ marginTop: 14, fontSize: 12, color: C.text2, lineHeight: 1.6, background: `${C.text2}20`, border: `1px solid ${C.text2}4d`, borderRadius: 9, padding: '8px 10px' }}>
            <b style={{ color: C.text2 }}>Carryover</b> — last season&apos;s per-game baseline.
          </div>
        )}
      </>}

      {/* MATCHUP: the defense he faces, and how it covers */}
      {tab === 'matchup' && <NflCardMatchup player={player} matchup={matchup} slate={slate} />}

      {/* SPLITS: the pairs, then the combine filters and this stadium */}
      {tab === 'splits' && <>
        <SplitsForMarket player={player} market={market} data={splitMeta} />
        {player?.splits && Object.keys(player.splits).length > 0 && SPLIT_STAT[market] && seasonOpts.length > 0 && (
          <div style={{ fontSize: 12, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>The table above is his season splits. The season buttons set the filters below.</div>
        )}
        <NflGameCombo log={slog} venue={gameVenue(slate?.games, player.team, player.opp)} />
        {!(player?.splits && Object.keys(player.splits).length) && !hasContext(slog) && <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{splitsWhy(player, fullLog, slate?.season)}</div>}
        {player?.splits && Object.keys(player.splits).length > 0 && SPLIT_STAT[market] && splitRows(player, SPLIT_STAT[market][0], splitMeta).length === 0 && <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{splitsWhy(player, fullLog, slate?.season)} Only one side of each pair is published for him.</div>}
      </>}

      {/* GAME LOG: the facts, then every game */}
      {tab === 'gamelog' && <>
        <TheFile player={player} log={slog} />
        <Head>GAME BY GAME</Head>
        <NflGameLog log={slog} />
        {Object.keys(player.stats || {}).length > 0 && (
          <>
            <Head>SEASON PER GAME</Head>
            <div className="nfl-card-stats" style={{ display: 'grid', gap: 5, gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))' }}>
              {Object.entries(player.stats).slice(0, allStats ? 99 : 6).map(([k, v]) => (
                <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px' }}>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 800 }}>
                    <NflExplain label={statLabel(k)} term={k} />
                  </div>
                  <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 800, color: C.text }}>{typeof v === 'number' ? statFmt(k, v) : v}</div>
                </div>
              ))}
            </div>
            {Object.keys(player.stats).length > 6 && (
              <button type="button" onClick={() => setAllStats((v) => !v)} style={{ display: 'block', width: '100%', marginTop: 6, minHeight: 44, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text2, cursor: 'pointer', fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800 }}>
                {allStats ? 'Show fewer' : `+${Object.keys(player.stats).length - 6} more`}
              </button>
            )}
          </>
        )}
      </>}

      {onFullProfile && (
        <button type="button" onClick={() => onFullProfile(player)} style={{ display: 'block', width: '100%', marginTop: 18, background: `${C.green}20`, border: `1px solid ${C.green}70`, color: C.green, borderRadius: 10, minHeight: 44, cursor: 'pointer', fontSize: 12, fontWeight: 900, letterSpacing: '.06em' }}>OPEN HIS FULL FILE →</button>
      )}

      <style>{`
        @media (max-width: 560px) {
          .nfl-card-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </CardShell>
  )
}
