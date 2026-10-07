'use client'
import NflTable from './NflTable'
import { useEffect, useState } from 'react'

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
import { etToday } from '../../lib/freshness'
import { VerdictStamp, PutOnCard } from './CardActions'
import TheField from './TheField'
import VerdictHero from '../VerdictHero'
import { faceUrl } from '../PlayerFace'
import SourceSeason from './SourceSeason'
import NflExplain from './NflExplain'
import { statLabel, statFmt } from '../../lib/nfl/statLabels'
import { quoteFor, fmtOdds } from '../../lib/nfl/oddsMatch'
import DvpRead from './DvpRead'
import { downloadNflPickCard } from './shareCard'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import StarMemory from '../watch/StarMemory'
import MultiLine from '../ledger/MultiLine'
import { injuryTag, injuryTitle, injuryColor } from '../../lib/nfl/injury'
import ScoreAnatomy from './ScoreAnatomy'
import NflPlayerRead from './NflPlayerRead'
import SplitDumbbell from './SplitDumbbell'
import NflGameCombo from './NflGameCombo'
import { THIN_G } from '../../lib/nfl/gameSplits'
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
  // Kickers have no play-level split: nflverse attributes a field goal to the
  // kicker but the situational buckets here are built off receiver/rusher/
  // passer roles. Rather than render an empty grid, say nothing.
  if (!entry) return null
  const [statKey, unit] = entry

  const pairs = (data?.pairs || []).filter(([a, b]) => sp[a] || sp[b])
  if (!pairs.length) return null

  // 2026-09-13: six two-column rows became six dumbbells. Same numbers, but
  // the GAP is now a length instead of a subtraction the reader has to do.
  // One dumbbell per situational pair, each on its own scale — a TD rate and
  // a yardage rate never shared an axis and drawing them as if they did would
  // flatten every rate row to nothing.
  const rows = pairs.map(([a, b]) => ({
    key: `${a}-${b}`,
    label: `${SPLIT_SHORT[a] || data?.labels?.[a] || a} / ${SPLIT_SHORT[b] || data?.labels?.[b] || b}`,
    // Games behind the thinner side; a pair with one side missing is thin by definition.
    thin: !(sp[a]?.g >= THIN_G && sp[b]?.g >= THIN_G),
    thinTitle: `Thin sample: ${sp[a]?.g ?? 0} and ${sp[b]?.g ?? 0} games (under ${THIN_G} on a side).`,
    a: Number.isFinite(sp[a]?.[statKey]) ? Number(sp[a][statKey]) : null,
    b: Number.isFinite(sp[b]?.[statKey]) ? Number(sp[b][statKey]) : null,
    ga: sp[a]?.g,
    gb: sp[b]?.g,
  }))

  return (
    <>
      <div style={{
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}>SPLITS — {unit}</div>
      <SplitDumbbell
        rows={rows}
        note={`Per-game ${unit}. Filled is the first side of each label, hollow the second, each pair on its own scale. The number on the right is the gap — it lights past 15%, because a smaller one on this sample is noise.`}
      />
    </>
  )
}


// ── coverage + explosive ──────────────────────────────────────────────────────

function Mini({ label, children, accent }) {
  return (
    <div style={{
      flex: '1 1 210px', background: 'rgba(255,255,255,.03)',
      border: `1px solid ${C.border}`, borderLeft: `2px solid ${accent}`,
      borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{
        fontSize: 8.5, fontWeight: 900, color: C.text3, letterSpacing: '.09em',
        marginBottom: 5,
      }}>{label}</div>
      {children}
    </div>
  )
}

function KV({ k, v, hi }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
      <span style={{ fontSize: 10, color: C.text3 }}>{k}</span>
      <span style={{
        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, color: hi ? C.green : C.text,
      }}>{v}</span>
    </div>
  )
}

function CoverageAndExplosive({ player, matchup, slate = null }) {
  const cov = matchup?.coverage_player?.[player?.player_id]
  const exp = matchup?.player_explosive?.[player?.player_id]
  const oppCov = matchup?.coverage_team?.[player?.opp]
  if (!cov && !exp) return null

  // Which side he's better against, and by how much — the reason to show the
  // split at all rather than two columns of numbers.
  let edge = null
  if (cov?.man && cov?.zone) {
    const d = cov.zone.ypt - cov.man.ypt
    if (Math.abs(d) >= 1.0) edge = d > 0 ? 'zone' : 'man'
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}><span>COVERAGE &amp; EXPLOSIVE</span><SourceSeason matchup={matchup} kind="charting" slateSeason={slate?.season} /></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {cov?.man && (
          <Mini label="VS MAN" accent={edge === 'man' ? C.green : C.border2}>
            <KV k="Targets" v={cov.man.tgts} />
            <KV k="Yds / target" v={cov.man.ypt} hi={edge === 'man'} />
            <KV k="Catch %" v={`${cov.man.catch_pct}%`} />
            <KV k="TD" v={cov.man.td} />
          </Mini>
        )}
        {cov?.zone && (
          <Mini label="VS ZONE" accent={edge === 'zone' ? C.green : C.border2}>
            <KV k="Targets" v={cov.zone.tgts} />
            <KV k="Yds / target" v={cov.zone.ypt} hi={edge === 'zone'} />
            <KV k="Catch %" v={`${cov.zone.catch_pct}%`} />
            <KV k="TD" v={cov.zone.td} />
          </Mini>
        )}
        {exp && (
          <Mini label="EXPLOSIVE" accent={C.purple}>
            <KV k="10+ / 20+" v={`${exp.rec_10} / ${exp.rec_20}`} />
            <KV k="30+ / 40+" v={`${exp.rec_30} / ${exp.rec_40}`} />
            <KV k="Longest" v={exp.lng} />
            <KV k="Air yards" v={exp.air} />
          </Mini>
        )}
      </div>
      {edge && oppCov && (
        <div style={{ fontSize: 10.5, color: C.text2, marginTop: 7, lineHeight: 1.6 }}>
          Better vs <b style={{ color: C.green }}>{edge}</b> · {player.opp} plays{' '}
          <b style={{ color: C.cyan }}>
            {edge === 'zone' ? `${oppCov.zone_pct}% zone` : `${oppCov.man_pct}% man`}
          </b>
        </div>
      )}
    </>
  )
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
      <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.06em' }}>
        {term ? <NflExplain label={label} term={term} /> : label}
      </div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, color: accent || C.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 8.5, color: C.text3, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
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
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}>THE FILE</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Fact
          label="SINCE LAST TD" term="since last td"
          value={since == null ? '—' : never ? 'NONE' : since}
          accent={since === 0 ? C.green : undefined}
          sub={since == null ? 'no game log for him'
            : never ? `no TD in ${games} logged game${games === 1 ? '' : 's'}`
            : since === 0 ? 'scored last time out'
            : `game${since === 1 ? '' : 's'} without one`}
        />
        <Fact label="SEASON TD" term="season td"
          value={seasonTd == null ? '—' : seasonTd}
          sub={seasonTd == null ? 'not published for him' : 'this season'} />
        <Fact label="LOGGED GAMES" term="logged games"
          value={games || '—'}
          sub={games ? 'every rate here is over these' : 'no play-by-play held'} />
      </div>
    </>
  )
}

// ── RATES AT THE CARD'S BAR (2026-09-27, TUDDY depth step 2) ────────────
// Every market he has a score in, best score first: how often he reached
// the card's own bar over his last 4 games, last 8, and this season, with
// the games counted ("3/4 · 5/8 · 7/11"). Same log and same rule HitRate
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
      return { key: k, label, bar: Number.isFinite(bar) ? bar : null, score: player.scores[k], l4: at(all.slice(-4)), l8: at(all.slice(-8)), season: at(cur), seasonYear: season || null }
    })
    .sort((a, b) => b.score - a.score)
}


function RatesTable({ player, markets, log }) {
  const rows = ratesFor(player, markets, log)
  if (!rows.length || !Array.isArray(log) || !log.length) return null
  return (
    <>
      <Head>RATES AT THE CARD&apos;S BAR</Head>
      {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): the same rows
          and colours; each window sorts by the share of games that reached the
          bar. Best score first, as before. */}
      <NflTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={20} caption="His rates at the card's bar"
        rows={rows.map((r, i) => {
          const share = (pair) => (pair && pair[1] ? (100 * pair[0]) / pair[1] : null)
          return { ...r, _key: r.key, _i: i, l4p: share(r.l4), l8p: share(r.l8), seasonp: share(r.season) }
        })}
        columns={[
          { key: 'label', label: 'Market · bar', heat: false, sticky: true, w: 150, fmt: (v, r) => (
            <span style={{ fontWeight: r._i === 0 ? 900 : 700, color: r._i === 0 ? C.text : C.text2 }}>
              <NflExplain label={v} term={r.key} />
              <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 700 }}>{r.bar != null ? ` · ${r.bar}+` : ''}</span>
            </span>) },
          { key: 'score', label: 'Score', w: 50, primary: true, fmt: (v) => Math.round(v), tone: (n) => ({ color: gradeFor(n).color, weight: 900 }) },
          ...[['l4p', 'l4', 'L4'], ['l8p', 'l8', 'L8'], ['seasonp', 'season', rows[0].seasonYear || 'Season']].map(([k, pk, label]) => ({
            key: k, label: String(label), w: 52,
            fmt: (_, r) => { const pair = r[pk]; if (!pair || !pair[1]) return '—'; return `${pair[0]}/${pair[1]}` },
            tone: (pct) => (Number.isFinite(pct) ? { color: pct >= 60 ? C.green : pct >= 45 ? C.yellow : C.red, weight: 800 } : { color: C.text3 }),
          })),
        ]} />
      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 5 }}>Games that reached the bar, of games played. Best score first; the chart below opens on it.</div>
    </>
  )
}

function Head({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
      margin: '18px 0 8px',
    }}>{children}</div>
  )
}

// THE FIELD (2026-10-01, 0e c): one football picture on the Matchup tab --
// components/nfl/TheField.js. It replaced three drawings of the same
// defence (FieldChart, TouchMap, and MatchupSection's MatchupMap), the
// isPassCatcher() rule that gave a 1-target, 1-carry back a passing field,
// and the thin-sample paragraph, which is TheField's own lead line now.

// ...and the same defence read the orthodox way. The map says where the field
// is soft; this says whether it's soft to somebody in HIS chair. A defence can
// leak deep right all day and still smother the WR3 who runs those routes.
// 0e d (2026-10-01): the BY DEPTH ROLE grid and the DRIFT chart went; the
// read is sentences per role, the ranked Doors, and the table one tap down
// (components/nfl/DvpRead.js).
function DvpSection({ player, matchup, slate = null }) {
  if (!player?.opp) return null
  return <DvpRead matchup={matchup} def={player.opp} position={player.position}
    role={matchup?.roles?.[player.player_id] || null} slateSeason={slate?.season} playerName={player.name} />
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
  { key: 'matchup', label: '\u{1F6E1} Matchup' },
  { key: 'splits', label: '\u{1F4C5} Splits' },
]



export default function NflPlayerModal({ player, market, markets, splitMeta, logs, matchup, slate, picks, results, onClose, onFullProfile, peers = [], onNavigate = null, initialTab = '', onViewChange = null, odds = null, inline = false }) {
  const dash = useDashLines()   // our line beside the book's (TEST)
  // inline (2026-09-30): the Players page shows this card in its right pane,
  // the way MOONSHOT's PlayerBoard shows PlayerModal inline -- no backdrop,
  // no scroll lock, no close.
  useScrollLock(Boolean(player) && !inline)
  const watchlist = useNflWatchlist(slate)
  const [tab, setTab] = useState('overview')
  // A new player opens on Overview unless the caller asked for a view --
  // MOONSHOT's initialTab, same contract, so a deep link can land on the
  // tab that matters instead of the top of the card every time.
  useEffect(() => {
    // A shared Field link (#...&view=field&win=, TheField.js) opens
    // the card on the Matchup tab, where the Field is.
    const fieldLink = typeof window !== 'undefined' && /(?:^#|&)view=field(?:&|$)/.test(window.location.hash)
    setTab(TABS.some((t) => t.key === initialTab) ? initialTab : fieldLink ? 'matchup' : 'overview')
  }, [player?.player_id, initialTab])
  // Escape lives in lib/useDialog.js now (2026-09-24), with focus and Tab.

  if (!player) return null
  const spec = (markets || []).find((m) => m.key === market)
  const weights = spec?.weights || {}


  return (
    // MOONSHOT's shell (components/CardShell.js, 2026-09-29): same backdrop,
    // focus trap and the .modal-* phone sheet as the MLB card. Width still
    // follows the content (620 overview / 900 table tabs).
    <CardShell inline={inline} theme={C} accent={C.green} width={tab === 'overview' ? 620 : 900} onClose={onClose} label={`${player?.name || 'Player'} card`}>
        {/* THE HEAD (phone pass, 2026-09-27): name + a close that is always on
            screen. The actions used to share this row without wrapping, which
            pushed the 📸 and the close button off the right edge of a phone --
            there was no visible way out of the card. They have their own row now. */}
        {/* THE CLOSE, ALWAYS ON SCREEN (phone pass 2026-09-27): a zero-height
            sticky bar, so the ✕ pins without pinning the whole hero under it. */}
        {!inline && <div className="nfl-card-head" style={{ position: 'sticky', top: 0, zIndex: 4, height: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            flexShrink: 0, width: 44, height: 44, marginTop: 6, marginRight: 6, display: 'grid', placeItems: 'center',
            background: C.bg2, border: `1px solid ${C.border}`, color: C.text2,
            borderRadius: 10, cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}>✕</button>
        </div>}
        {/* MOONSHOT'S HERO (2026-09-29, parity): the face-led VerdictHero the
            MLB props card uses -- face, name, the grade for the market on
            screen as the badge, its score on the dial -- in TUDDY's theme. */}
        {(() => {
          const s0 = player.scores?.[market]
          const g0 = gradeFor(s0)
          const tag = injuryTag(player)
          return (
            <VerdictHero lead="face" theme={C} numFont={NUM_FONT}
              photo={faceUrl({ sport: 'nfl', espnId: player.espn_id, size: 96 })}
              col={g0.color} score={Number.isFinite(s0) ? s0 : null}
              // the name is the player's own link (a shared link to his page; check-clickable)
              title={<a href={playerHref('nfl', player.player_id)} style={{ color: 'inherit', textDecoration: 'none' }}>{player.name}</a>} badge={Number.isFinite(s0) ? g0.label : 'UNSCORED'} badgeQuiet={!Number.isFinite(s0)}
              market={spec?.label || market}
              meta={<>
                {player.jersey_number ? `#${player.jersey_number} · ` : ''}
                {/* the clubs open their team pages (route audit B6; team page since 10-03 -- was their players list) */}
                {player.position} · {player.team ? <a href={`#sport=nfl&tab=team&team=${player.team}`} style={CLUB_LINK} title={`${player.team} team page`}>{player.team}</a> : null}
                {player.opp ? <>{' vs '}<a href={`#sport=nfl&tab=team&team=${player.opp}`} style={CLUB_LINK} title={`${player.opp} team page`}>{player.opp}</a></> : null}
                {ageOf(player.birth_date) ? ` · age ${ageOf(player.birth_date)}` : ''}
                {tag && <span title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), fontWeight: 900 }}>{' · '}{tag}</span>}
                {player.low_sample && <span style={{ color: C.text3 }}> · low sample</span>}
              </>}
              right={<span aria-hidden="true" style={{ display: 'inline-block', width: 44 }} />}
            />
          )
        })()}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <StarMemory sport="nfl" id={player?.player_id} />
          <button onClick={() => watchlist.toggle(player)}
            aria-label={watchlist.isPinned(player.player_id) ? `Remove ${player.name} from watchlist` : `Save ${player.name} to watchlist`}
            style={{
              background: watchlist.isPinned(player.player_id) ? `${C.yellow}26` : 'transparent',
              border: `1px solid ${watchlist.isPinned(player.player_id) ? C.yellow + '66' : C.border}`,
              color: watchlist.isPinned(player.player_id) ? C.yellow : C.text3,
              borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 900,
            }}>{watchlist.isPinned(player.player_id) ? '★ SAVED' : '☆ SAVE'}</button>
          {onFullProfile && <button onClick={() => onFullProfile(player)}
            style={{
              background: `${C.green}20`, border: `1px solid ${C.green}70`, color: C.green,
              borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 10,
              fontWeight: 900,
            }}>FULL PROFILE →</button>}
          {/* 🎴 his card as a PNG -- the NFL twin of the MLB share button
              (components/PlayerModal.js). Client-side only. */}
          <button onClick={() => downloadNflPickCard(pickFromPlayer(player, market, spec))}
            title="Download his pick card as a PNG for posting -- the bot's call on this market, ready to share manually"
            aria-label="Download pick card as image"
            style={{
              background: 'transparent', border: `1px solid ${C.border}`, color: C.text3,
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
            }}>📸</button>
        </div>
        {/* MOONSHOT's multi-HR line, TUDDY's words (it was on the player file, not the card). */}
        <MultiLine sport="nfl" playerId={player?.player_id} words={{ TD: 'multi-TD', PASS_TD: '2+ passing-TD' }} color={C.green} textColor={C.text2} />

        {/* every market's score, so you can see the whole player at once --
            MOONSHOT's StatStrip (2026-09-29), each tile in its grade's colour.
            The market on screen leads. */}
        <StatStrip style={{ margin: '13px 0 4px' }} stats={[...MARKETS]
          .sort(([a], [b]) => (b === market) - (a === market))
          .filter(([k]) => Number.isFinite(player.scores?.[k]))
          .map(([k, label]) => {
            const s = player.scores[k]
            return { id: k, label: MARKET_SHORT[k] || label, text: String(Math.round(s)), color: gradeFor(s).color, title: `${label}: ${Math.round(s)} (score, a ranking -- not a percentage)` }
          })} />
        {/* MOONSHOT's HitRateBoxes under the strip, as on its card: how often he
            reached the card's bar in the market on screen -- the same numbers
            as the rates table below (ratesFor), last 4 / last 8 / this season. */}
        {(() => {
          const r = ratesFor(player, markets, logs?.logs?.[player.player_id]?.log).find((x) => x.key === market)
          if (!r || r.bar == null) return null
          const boxes = [['l4', 'L4', r.l4], ['l8', 'L8', r.l8], ['szn', String(r.seasonYear || 'Season'), r.season]]
            .filter(([, , pr]) => pr[1] > 0)
            .map(([id, label, [num, den]]) => ({ id, label, num, den, unit: 'G' }))
          return <HitRateBoxes boxes={boxes} style={{ margin: '6px 0 2px' }}
            text={(b) => `${b.num}/${b.den}`}
            sub={() => (r.key === 'TD' ? 'G with a TD' : `G at ${r.bar}+`)}
            tip={(b) => `${r.label}: reached ${r.bar}+ in ${b.num} of his last ${b.den} games${b.id === 'szn' ? ' this season' : ''}.`} />
        })()}

        {/* THE PRICE (2026-09-27): TUDDY has prices again (/api/odds/latest,
            our own feed). The line for the market on screen, the best book,
            and the break-even the price implies. "Different line" says so
            when the books' line isn't the model's bar -- then it is a
            different bet. */}
        {(() => {
          const q = quoteFor(odds, player, market)
          if (!q) return null
          return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', margin: '8px 0 2px', fontSize: 11.5, color: C.text2, fontFamily: NUM_FONT }}>
              <b style={{ color: C.text3, fontSize: 9.5, letterSpacing: '.08em' }}>PRICE</b>
              <span>o{q.line} <b style={{ color: C.text }}>{fmtOdds(q.over)}</b></span>
              {q.best_over != null && q.best_over !== q.over && <span>best <b style={{ color: C.green }}>{fmtOdds(q.best_over)}</b>{q.best_book ? ` ${q.best_book}` : ''}</span>}
              {q.implied != null && <span>needs {q.implied}%</span>}
              {q.books ? <span style={{ color: C.text3 }}>{q.books} book{q.books === 1 ? '' : 's'}</span> : null}
              {!q.matches && <span style={{ color: C.yellow }}>different line from the model&apos;s bar</span>}
            </div>
          )
        })()}
        {/* OUR LINE beside the book's (TEST, BATCH-DASH-LINE): DASH 62.5 · BOOK 54.5 · OVER */}
        {dash && DASH_OF[market] && dash.by.get(`${player.player_id}|${DASH_OF[market]}`) && (
          <div style={{ margin: '2px 0 4px' }}><DashChip row={dash.by.get(`${player.player_id}|${DASH_OF[market]}`)} /></div>
        )}

        {/* THE TAB ROW AND THE PEER ARROWS, on one line. MOONSHOT puts the
            navigator beside its tabs for the same reason: they are both "which
            thing am I looking at" controls and splitting them puts two
            navigation vocabularies on one card. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexWrap: 'wrap', margin: '10px 0 12px',
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <TabBtn key={t.key} active={tab === t.key} onClick={() => { setTab(t.key); onViewChange?.(t.key) }}>{t.label}</TabBtn>
            ))}
          </div>
          {onNavigate && <Navigator peers={peers} cur={player} onNavigate={onNavigate} idOf={nflIdOf} noun="player" />}
        </div>

        {/* graded state and your card, before the matchup: the two things a
            bettor opens the card to do (2026-09-05, Batch 2). */}
        {tab === 'overview' && <>
        <VerdictStamp player={player} results={results} bars={Object.fromEntries((markets || []).map((m) => [m.key, Number(m.bar)]))} />
        <PutOnCard player={player} market={market} picks={picks} slate={slate} />
        {/* Plain facts before the analysis. The score anatomy below explains
            why the model likes him; this says who he is and what he has
            actually done, which is what the card was missing entirely. */}
        {/* MOONSHOT's Read (2026-09-30): the storyline desk's sentences, where
            the MLB card puts its own -- before the facts that back them. */}
        <NflPlayerRead player={player} market={market} rows={logs?.logs?.[player.player_id]?.log || []} matchup={matchup} />
        <TheFile player={player} log={logs?.logs?.[player.player_id]?.log} />
        <RatesTable player={player} markets={markets} log={logs?.logs?.[player.player_id]?.log} />
        </>}

        {tab === 'matchup' && <>
        {/* THE FIELD (0e c): one picture -- his targets (or his gaps, by
            where his work is) over this week's defence, the red zone under
            it. Its title is the section head. */}
        {player.team && (
          <TheField key={player.player_id} team={player.team} player={player} defTeam={player.opp} defWeek={slate?.week} venue={gameVenue(slate?.games, player.team, player.opp)}
            matchup={matchup} players={slate?.players} hashSync={inline} />
        )}
        <DvpSection player={player} matchup={matchup} slate={slate} />
        <CoverageAndExplosive player={player} matchup={matchup} slate={slate} />
        </>}

        {tab === 'overview' && Number.isFinite(player.scores?.[market]) && (
          <div style={{ marginTop: 18 }}>
            <ScoreAnatomy
              player={player}
              market={market}
              weights={weights}
              pool={slate?.players}
              marketLabel={spec?.label || market}
            />
          </div>
        )}

        {tab === 'overview' && Object.keys(player.stats || {}).length > 0 && (
          <>
            <div style={{
              fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
              margin: '16px 0 7px',
            }}>PER-GAME</div>
            <div className="nfl-card-stats" style={{
              display: 'grid', gap: 5,
              gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
            }}>
              {Object.entries(player.stats).map(([k, v]) => (
                <div key={k} style={{
                  background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '5px 8px',
                }}>
                  {/* TAPPABLE (2026-09-20). These 23 abbreviations -- SEP,
                      YACOE, TDoE, CPOE, WOPR -- had no explanation anywhere on
                      the site, and a title= tooltip would have none on a phone
                      either. See lib/nfl/glossary.js. */}
                  <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800 }}>
                    {/* The SAME vocabulary the full profile uses, from
                        lib/nfl/statLabels.js. These tiles printed the raw
                        payload key while StatPortal expanded it, so the two
                        surfaces named the same number differently. `term` is
                        the raw key so the glossary still resolves whichever
                        way the label is written. */}
                    <NflExplain label={statLabel(k)} term={k} />
                  </div>
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: C.text,
                  }}>{typeof v === 'number' ? statFmt(k, v) : v}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 🎯 The props grid, football edition (2026-08-15) — the MLB matrix
            ported. HitRate still draws the bars; it now rides INSIDE the grid
            and follows whichever row is open, so the modal keeps one chart
            and gains the every-market glance above it. */}
        {tab === 'overview' && logs?.logs?.[player.player_id]?.log && (
          // HIS BEST MARKET LEADS (TUDDY depth step 2): the chart opens on the
          // market he scores highest in -- not passing yards on a running back
          // because the card was opened from the passing board.
          (() => {
            const best = ratesFor(player, markets, logs.logs[player.player_id].log)[0]
            const lead = best?.key || market
            // The market's published bar -- the week's, else the log file's own
            // (nfl_logs.json `bars`). Never a made-up 1: with no bar, no chart.
            const leadBar = Number((markets || []).find((m) => m.key === lead)?.bar ?? logs?.bars?.[lead]?.[1])
            if (!Number.isFinite(leadBar)) return null
            return (
              <PropsGrid
                key={`${player.player_id}-${lead}`}
                log={logs.logs[player.player_id].log}
                market={lead}
                defaultBar={leadBar}
                scores={player.scores}
              />
            )
          })()
        )}

        {tab === 'splits' && <SplitsForMarket player={player} market={market} data={splitMeta} />}
        {/* MOONSHOT's combine filters, per game: renders nothing until the bot's log carries the per-game context. */}
        {tab === 'splits' && <NflGameCombo log={logs?.logs?.[player.player_id]?.log} venue={gameVenue(slate?.games, player.team, player.opp)} />}

        {/* Same per-device note store as MOONSHOT's card; ids can't collide.
            Stays on Overview, where MOONSHOT keeps its own. */}
        {tab === 'overview' && <PlayerNotes playerId={player.player_id} accent={C.green} />}
        {/* 🔢 His numbers (numerology step 7). A team defense is not a name. */}
        {tab === 'overview' && player.position !== 'DEF' && <HisNumbers name={player.name} jersey={player.jersey_number} birthDate={player.birth_date} next={Number.isFinite(player?.season_td) ? player.season_td + 1 : null} nextWord="TD" date={etToday()} theme={C} accent={C.green} numFont={NUM_FONT} />}

        {tab === 'overview' && player.carryover && (
          <div style={{
            marginTop: 14, fontSize: 10.5, color: C.text2, lineHeight: 1.6,
            background: `${C.purple}20`, border: `1px solid ${C.purple}4d`,
            borderRadius: 9, padding: '7px 10px',
          }}>
            <b style={{ color: C.purple }}>Carryover</b> — last season&apos;s per-game baseline.
          </div>
        )}
        {/* The head stays pinned so the close is always reachable (2026-09-27),
            now inside MOONSHOT's scroll box, which is full-screen on a phone. */}
        <style>{`
          @media (max-width: 560px) {
            .nfl-card-head { top: env(safe-area-inset-top) !important; margin-right: -8px; }
            .nfl-card-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          }
        `}</style>
    </CardShell>
  )
}
