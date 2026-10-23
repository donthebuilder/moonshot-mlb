'use client'
import LineMoveChip from './LineMoveChip'
import { mlbFaceStrict } from './PlayerFace'
import { teamKey, teamName } from '../lib/mlbTeams'
import { useEffect, useMemo, useRef, useState } from 'react'

import useScrollLock from '../lib/useScrollLock'
import { C, NUM_FONT } from '../lib/theme'
import { fetchBatterDetail } from '../lib/dataSource'
import BornLine from './player/BirthdayChip'
import { birthdayChip } from '../lib/birthday'
import {
  nameOf, teamOf, oppOf, n, clean, pct, sc, playerId,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  ihrVal,
  babipVal, pitcherBabipVal, avgVsRHP, avgVsLHP,
} from '../lib/player'
import { compactRole, roleColor, gradeFor, signalPills, bestBet } from '../lib/scoring'
// Aliased: lib/scoring exports a roleColor of its own for the chip row, and
// two different functions of the same name in one file is how a colour quietly
// starts meaning two things.
import {
  primaryRole, verdictFor, sentenceFor, chipsFor,
  roleColor as verdictRoleColor,
} from '../lib/verdict'
import { quoteFor, fmtOdds } from '../lib/odds'
import VerdictHero from './VerdictHero'
import CardShell from './CardShell'
import { TabBtn, Navigator } from './card/CardNav'
import PickVerdictStamp from './PickVerdictStamp'
import StarMemory from './watch/StarMemory'
import { oddsHistoryPaths } from '../lib/dataSource'
import MultiLine from './ledger/MultiLine'
import { Chip } from './ui'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import Explain from './Explain'
import VerdictBlock from './player/VerdictBlock'
import { useCardLock, useMemberState, CardLockLine } from './MemberGate'
import StatRow from './player/StatRow'
import HelpTip from './HelpTip'
import { useIsPhone } from './MobileFold'
import { useMlbBot, mlbStatus, mlbRecordLine, mlbLastLine, mlbStatRow } from './player/mlbAdapter'
import EVLog from './tabs/EVLog'
import PitchBreakdown from './tabs/PitchBreakdown'
import HRPitchProfile from './HRPitchProfile'
import SprayField from './SprayField'
import { fetchLiveGame, parseLiveGame } from '../lib/livePitches'
import MatchupPitcher from './MatchupPitcher'
import PlayerSplits from './PlayerSplits'
import MlbGameLog from './MlbGameLog'
import SituationalSplits from './SituationalSplits'
import PlayerNotes from './PlayerNotes'
import HisNumbers from './HisNumbers'
import InTheLedger from './ledger/InTheLedger'
import { etToday } from '../lib/freshness'
import { BatterSim } from './GameSimulator'
import ThresholdGrid from './ThresholdGrid'
import ColdCase from './ColdCase'
import PlayerRead from './PlayerRead'
import HomerShape from './HomerShape'
import ShareCardButton from './card/ShareCardButton'
import { playerUrl, slug, stamp } from '../lib/cards/saveCard'
import CardFlip, { PostseasonChip } from './player/CardFlip'
import CardsEarned from './player/CardsEarned'
import BvP from './BvP'
import FirstPitchSplit from './FirstPitchSplit'
import { venueRecord } from '../lib/venueHr'
import { pullWallFor } from '../lib/walls'
import PlayerCompare from './PlayerCompare'
import ContactSection from './ContactSection'
import { reasonContext, boardReasonFor, reasonLines } from '../lib/mlb/boardReason'
import BotOnHim from './BotOnHim'
import Checklist from './player/Checklist'
import SplitsPanel from './player/SplitsPanel'
import { checklist } from '../lib/mlb/checklist'
import PlayerInjuryChip from './injuries/PlayerInjuryChip'

// 🧱 "How far is HIS wall tonight" (audit #7, 2026-08-08). fieldInfo hydrate
// verified live; percentile computed from the same payload. Switch hitters
// get their shorter side. Context row — never a score input.
// A label and its value; when the value is longer than the room it drops under the label and
// wraps -- never an ellipsis (Donovan 2026-10-07: "tonight's park" could not be read in full).
const ROW_BOX = { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 10, rowGap: 1, padding: '7px 0', borderBottom: `1px solid ${C.border}`, minWidth: 0 }

function PullWallRow({ bats, venueName }) {
  const [w, setW] = useState(undefined)
  useEffect(() => {
    let alive = true
    setW(undefined)
    if (!venueName || !bats) { setW(null); return }
    pullWallFor(bats, venueName).then((r) => { if (alive) setW(r) })
    return () => { alive = false }
  }, [bats, venueName])
  if (w === undefined) return <Row label="Pull-side wall" value="…" />
  if (!w) return null
  const col = w.linePct != null && w.linePct <= 20 ? C.orange
    : w.linePct != null && w.linePct >= 80 ? '#38bdf8' : C.text
  return (
    <div style={ROW_BOX}>
      {/* CLEANED (2026-08-08, Donovan): no emoji, one line — the full
          sentence lives behind a tap.
          TAP-TO-EXPLAIN (2026-08-21, Phase 2): this used to be a bare
          title= — invisible on a phone, which is most of the audience per
          Explain.js's own rationale. Same Explain component Row already
          uses everywhere else in this modal, just with an explicit text=
          since this line isn't in the glossary. */}
      <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap' }}>
        <Explain label="Pull-side wall" text={`His pull side (${w.side}) at ${venueName}: ${w.line} ft down the line${w.gap ? `, ${w.gap} ft to the gap` : ''}. Percentile is vs all 30 parks' same-side line from the league's own fieldInfo — ${w.linePct}% of parks are shorter. Context, not a score input.`} />
      </span>
      <span style={{ fontSize: 12, fontFamily: NUM_FONT, fontWeight: 600, textAlign: 'right', color: col, minWidth: 0 }}>
        {w.side} {w.line}′{w.gap ? `/${w.gap}′` : ''}{w.word ? ` · ${w.word}` : ''}
      </span>
    </div>
  )
}

// "Does he have HRs in THIS building" (2026-08-08). Self-fetching row:
// season + last season gameLogs joined to venues by gamePk (the league has
// no byVenue split — probed). Color, not a score input; the sample is said
// out loud and a 0 renders honestly instead of hiding.
function VenueHrRow({ pid, venueName, gamePk }) {
  const [rec, setRec] = useState(undefined)
  useEffect(() => {
    let alive = true
    setRec(undefined)
    if (!pid || !venueName) { setRec(null); return }
    // gamePk → venue-ID matching (immune to park renames); name is fallback
    venueRecord(pid, venueName, gamePk).then((r) => { if (alive) setRec(r) })
    return () => { alive = false }
  }, [pid, venueName, gamePk])
  if (rec === undefined) {
    return <Row label="At tonight's park" value="…" />
  }
  if (!rec || !rec.games) {
    return <Row label="At tonight's park" value={rec ? 'no games here since last yr' : '—'} mono={false} />
  }
  // MADE READABLE (2026-08-08, Donovan: "defs need more on that stat").
  // Three reads in one line: the record, the per-game pace ("1 per 5.2" —
  // 1-per-4 is elite, 1-per-8 is average), and the one that actually
  // matters: the park rate vs HIS OWN rate over the same window. Sample-
  // gated: under 8 games here, the vs-self read stays quiet.
  const per = rec.rate > 0 ? (1 / rec.rate) : null
  const vs = rec.games >= 8 ? rec.vsSelf : null
  const vsWord = vs == null ? null
    : vs >= 1.25 ? { t: '▲ plays UP for him', col: C.orange }
    : vs <= 0.75 ? { t: '▼ plays down', col: '#38bdf8' }
    : { t: '· his usual pace', col: C.text3 }
  const hot = vs != null ? vs >= 1.25 : rec.hr >= 2
  return (
    <div style={ROW_BOX}>
      {/* TAP-TO-EXPLAIN (2026-08-21, Phase 2) — see PullWallRow above. */}
      <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap' }}>
        <Explain label="At tonight's park" text={`${venueName}, ${rec.seasons}: ${rec.hr} HR in ${rec.games} games here vs ${rec.hrAll} in ${rec.gamesAll} everywhere — same two seasons of game logs, so the comparison is apples to apples. Rules of thumb: 1 HR per 4 games = elite pace, 1 per 5–6 = real power, 1 per 8+ = average. Under 8 games here the vs-himself read is hidden — small samples lie.`} />
      </span>
      <span style={{ fontSize: 12, fontFamily: NUM_FONT, fontWeight: 600, textAlign: 'right', color: hot ? C.orange : C.text, minWidth: 0 }}>
        {rec.hr} HR / {rec.games} gm{rec.games !== 1 ? 's' : ''}
        {per != null && rec.hr > 0 && <span style={{ color: C.text3, fontWeight: 500 }}> · 1 per {per.toFixed(1)}</span>}
        {vsWord && <span style={{ color: vsWord.col, fontSize: 10.5 }}> {vsWord.t}</span>}
      </span>
    </div>
  )
}

// 🧤 opponent team defense (2026-08-08): BABIP-against + league percentile,
// live from season totals. Matters most for HIT/TB picks — a leaky defense
// turns his ground balls into knocks. Context row; scores untouched until
// the archive validates it (two-lane rule).
function OppDefenseRow({ opp }) {
  const [d, setD] = useState(undefined)
  useEffect(() => {
    let alive = true
    setD(undefined)
    if (!opp) { setD(null); return undefined }
    import('../lib/defense').then(({ teamDefense }) =>
      teamDefense().then((m) => { if (alive) setD(m?.get(String(opp).toUpperCase()) || null) }))
      .catch(() => { if (alive) setD(null) })
    return () => { alive = false }
  }, [opp])
  if (d === undefined) return <Row label="Opp defense" value="…" />
  if (!d) return null
  const col = d.pct >= 80 ? C.orange : d.pct <= 20 ? '#38bdf8' : C.text
  return (
    <div style={ROW_BOX}>
      {/* TAP-TO-EXPLAIN (2026-08-21, Phase 2) — see PullWallRow above. */}
      <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap' }}>
        <Explain label="Opp defense" text={`${opp}'s BABIP-against: how often a ball in play against them becomes a hit, from the league's season totals. Percentile vs all 30 teams — high = leaky defense, good news for HIT/TB props. Context only; not folded into any score.`} />
      </span>
      <span style={{ fontSize: 12, fontFamily: NUM_FONT, fontWeight: 600, textAlign: 'right', color: col, minWidth: 0 }}>
        .{String(Math.round(d.babip * 1000)).padStart(3, '0')} BABIP · {d.word}
      </span>
    </div>
  )
}

// FIT PASS (2026-08-08): labels keep their width, values shrink with an
// ellipsis and carry the full text in the tooltip — so a long pitcher name
// or a "no games here since last yr" can't push the column apart at any
// modal width. Never let text overflow the box; let it truncate honestly.
// GLOSSARY ON TAP (2026-08-09). Every row here is a label and a number, and
// the label is an abbreviation — "IHR", "PMix", "P-BABIP". On a desktop the
// surrounding tooltips fill that gap; on a phone there are no tooltips at all,
// so this column of numbers arrives with no words attached to it whatsoever.
// A label that has a plain-English entry in the glossary becomes tappable and
// grows the sentence underneath itself. `explain` overrides for a one-off.
function Row({ label, value, mono = true, term, explain, title }) {
  return (
    <div style={ROW_BOX}>
      {/* nowrap stays: the explanation itself re-enables normal wrapping
          inside its own box, so a long sentence can't stretch the row. */}
      <span title={title} style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 0 }}>
        <Explain label={label} term={term} text={explain} />
      </span>
      <span
        title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        style={{
          fontSize: 12, color: C.text, fontFamily: mono ? NUM_FONT : 'inherit', fontWeight: 600,
          minWidth: 0, textAlign: 'right',
        }}>{value}</span>
    </div>
  )
}


// Seven tabs, one question each. The old four crammed the batter's pitch table
// and his spray chart into a single 1180px tab, which meant neither got read —
// and put the opposing starter nowhere at all, despite the whole slate being
// built around him. Pitch and Spray are separate now, and the arm he's facing
// has his own tab.
// Reordered 2026-08-06: reading order, not build order. Overview (the bet),
// Splits (the head-to-head + situational), EV Log (the contact + zone map),
// then the deeper bot panels, with Pitcher last since he has his own modal.
// The api-only subset below is the tabs that run entirely on live pulls.
// THE PORTAL (2026-10-21, Donovan: "just start making the player portal"; PropFinder's layout "just about", more visual
// than textual). The card is ONE page now, not eleven tabs: the read with his checklist, then his spray chart beside his
// EV log, then the head-to-head beside the props grid. These tabs are the deeper panels UNDER that page. The old
// Overview / Spray / EV Log views are the page itself: a link asking for them (#p=<id>&view=spray|ev) scrolls there.
// THE FRONT AND THE BACK (2026-10-22, Donovan, on his screenshot of this card: "we start out with those four things that we
// picked out [splits, spray, EV, props], and then you'll just be able to click to the other side and see the rest of them
// ... pitches, the numbers, things like that"). The front is the page itself; every other view is one tap in the row
// above it and fills the same space. Pitches is three panels side by side: his pitches, tonight's pitcher, him vs that
// pitcher. Old addresses still land: view=pitcher and view=bvp open Pitches, view=splits the front's Splits panel.
const TABS = [
  { key: 'pitch',    label: '🎯 Pitches' },
  { key: 'log',      label: '📋 Game log' },
  { key: 'numbers',  label: '🔢 Numbers' },
  { key: 'read',     label: 'The Read' },
  { key: 'sim',      label: '🎮 Sim' },
  { key: 'sheet',    label: '📅 All splits' },
]
const FRONT = { key: 'front', label: '🃏 Front' }
const VIEW_ALIAS = { pitcher: 'pitch', bvp: 'pitch' }
// ON A PHONE THE PAGE IS TABS TOO (2026-10-22, Donovan: "a full-fledged version ... for the phone, like how it had the
// things where you can click through each ... form-fitted for the phone instead of having it so long"). Where two columns
// don't fit (under 1080px, the same line as app/globals.css .portal-main), the page's own panels become the first tabs and
// one panel shows at a time. Desktop keeps the whole page with the deeper tabs under it.
// THE BLEND (2026-10-22, Donovan: "how can we blend both spray and ev chart together"): the spray chart and the EV log
// are one panel, one filter bar (the chart's), so on a phone they're one tab. view=ev still works: it opens this tab.
const PAGE_TABS = [
  { key: 'spray',    label: '⚾ Batted balls' },
  { key: 'splits',   label: '📅 Splits' },
  { key: 'props',    label: '📊 Props' },
]
const PAGE_KEYS = PAGE_TABS.map((t) => t.key)
// the views that are the page itself (old tabs, still valid in links and pushes); 'overview' is the page's top
const PAGE_VIEWS = ['overview', 'ev', 'front', ...PAGE_KEYS]
// an off-slate (live API) player has no bot panels: these run on live pulls only (no head-to-head without a pitcher)
const API_TABS = ['sheet', 'log', 'read']
const API_PAGE = ['spray', 'splits', 'props']
const firstTab = (apiOnly, tabbed = false) => (tabbed ? 'spray' : 'front')
const TABBED_BELOW = 1080

// BET MARKETS for the slip. Same four the boards offer, so an entry added from
// here is indistinguishable from one added from a card.
const BETS = ['HR', 'Hit', 'HRR', 'TB']

// a portal panel never forces the card wider: its own wide table scrolls inside it (minWidth 0)
const PORTAL_CELL = { minWidth: 0, scrollMarginTop: 12 }

// 44px tap target around inline text, the text itself unmoved (phone rule)
const META_LINK = { color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2, display: 'inline-block', padding: '17px 13px', margin: '-17px -13px' }
// THE TWO-LINE HEAD (2026-10-04, Donovan): line 1 the clubs + the game, line 2
// lineup / hand / pitcher -- on one line the pitcher clipped at 390 and a game
// link at its end never showed. The lines are 20px apart, so each link's target
// is its line (20px tall) and ~44px wide; taller ones would overlap the other line.
// position: relative lifts the padded target over the plain text beside it (" vs ", " (L)"),
// which otherwise paints on top and takes the tap
const ROW_LINK = { ...META_LINK, position: 'relative', lineHeight: '10px', padding: '5px 13px', margin: '-5px -13px' }
// a club code is ~18-26px and " vs " ~24px: 9px + 12px across the gap keeps the two
// clubs apart; the first club's outer side has room for 17px (VerdictHero meta2 pad)
const CLUB_LINK = { ...ROW_LINK, padding: '5px 9px 5px 12px', margin: '-5px -9px -5px -12px' }
const FIRST_CLUB_LINK = { ...ROW_LINK, padding: '5px 9px 5px 17px', margin: '-5px -9px -5px -17px' }
// 'Game ›' is ~37px of text after " · " (~14px): a short left pad clears the club before it
const GAME_LINK = { ...ROW_LINK, padding: '5px 13px 5px 5px', margin: '-5px -13px -5px -5px' }
// The club opens its team page (2026-10-04, Donovan: the card is the phone's way
// to a team -- the board's 11px logos are too small to tap). Not a club -> text.
function clubLink(code, style = CLUB_LINK) {
  const k = teamKey(code)
  return k ? <a href={`#sport=mlb&tab=team&team=${k}`} style={style} title={`${teamName(k)} team page`}>{code}</a> : code
}

export default function PlayerModal({ player, slate = null, slateMode, initialTab = '', onViewChange = null, onClose, inline = false, onAdd, onWatch, watched = false, peers = [], onNavigate = null, odds = null, pairSummary = null, onOpenPairHistory = null }) {
  // Inline mode is not an overlay -- it renders in the page, and pinning the
  // body under it would freeze the very thing the reader is scrolling.
  useScrollLock(Boolean(player) && !inline)
  const [tab, setTab] = useState(() => firstTab(!!player?.api_only))
  // the page's own sections, for links that ask for them (view=spray / ev / overview)
  const sprayRef = useRef(null)
  // the balls the spray chart is drawing under its filters; the EV log tables exactly these (null = still loading)
  const [chartBalls, setChartBalls] = useState(null)
  // the one ball picked on either side (a dot or a log row); the other side lights it (#35)
  const [pickedBall, setPickedBall] = useState(null)
  useEffect(() => { setChartBalls(null); setPickedBall(null) }, [player?.player_id || player?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  const evRef = useRef(null)
  const splitsRef = useRef(null)
  const propsRef = useRef(null)
  // phone / narrow screen: one panel at a time (see PAGE_TABS)
  const tabbed = useIsPhone(TABBED_BELOW - 1)
  const pickedRef = useRef(false)   // the reader picked a tab: don't move him when the width settles
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle')
  const [compareOpen, setCompareOpen] = useState(false)
  // THE PLAYER MODEL (2026-10-08): the verdict's record + last-week lines and the role table read ONE fetch
  const botData = useMlbBot(player?.player_id || player?.id)

  // THE MODAL HAS TO FETCH THE DETAIL FILE ITSELF.
  //
  // `player` is a row out of today_slim.json, and make_slim.py deliberately
  // strips the heavy per-player payloads out of that file and writes them to
  // current/detail/<slate>/batter_<id>.json instead. Checked against the live
  // slate: spray_chart, batted_ball_log, contact_log, pitch_type_summary,
  // batter_pitch_type_profile and pitch_mix_matchup are present on 0 of 267
  // slate rows. Every one of them is in the detail file.
  //
  // SprayField, HRPitchProfile and HotZoneMap each fetch that file for
  // themselves, so those three tabs worked. EV Log and PitchBreakdown read
  // straight off the prop, so they didn't: the EV Log tab showed "No batted
  // ball data. Run spray_cache.py." for every hitter on the slate, and the
  // batter half of the pitch table came up blank while the pitcher half — which
  // does live on the slate row — filled in normally. That asymmetry is why it
  // read like missing bot data rather than a wiring bug.
  //
  // Fetched once here and merged, so the whole modal sees one object. The
  // detail keys win on conflict; the slate row supplies everything else.
  const pid = player?.player_id || player?.id
  useEffect(() => {
    if (!pid) return
    // OFF-SLATE PLAYERS (2026-08-28, Donovan: "i need to be able to see the
    // spray chart even if they player isnt on. the bot."). This used to
    // hard-skip the fetch for every api_only player — QuickSearch resolves
    // ANY active player by name, but a slate detail file only ever exists
    // for tonight's ~270, so the fetch was a guaranteed 404 and wasn't even
    // attempted. bots/spray_archive.py now publishes a slate-INDEPENDENT
    // archive (same statcast_batter() pull the slate pipeline already does,
    // pointed at every active-roster hitter league-wide, filled in
    // gradually) — archiveDetailUrl() is where an off-slate player's spray
    // chart / EV log actually live now. Still fails soft to 'missing' for a
    // player the archive hasn't reached yet — that's the honest state, not
    // a bug.
    let alive = true
    setDetailState('loading'); setDetail(null)
    const archive = !!player?.api_only
    // ── ONE REQUEST, AND A THROTTLE IS NOT AN ABSENCE (2026-09-07) ────────
    // Two other panels on this card (SprayField, HRPitchProfile) fetch this
    // same file (a third, HotZoneMap, was deleted 2026-10-01); fetchBatterDetail collapses them
    // into one request. It also returns the HTTP status, which is the whole
    // point: `r.ok ? json : null` used to turn a 429 from
    // raw.githubusercontent into the same null as a real 404, and the header
    // below then told the user "No detail file published for this hitter"
    // about a hitter whose file is on the branch with 120 batted balls in it.
    // See lib/dataSource.js for the measurement.
    fetchBatterDetail(pid, { archive, mode: slateMode })
      .then(({ ok, status, data: j }) => {
        if (!alive) return
        // Couldn't ask — not "isn't there". Different state, different copy.
        if (!ok && status !== 404) { setDetail(null); setDetailState('error'); return }
        // ── A DETAIL FILE FROM ANOTHER NIGHT IS NOT THIS MAN'S FILE ───────
        // (2026-08-29.) The slate detail directory on the data branch was
        // found holding a complete snapshot of a night that was on NEITHER
        // slate published beside it — 0 of 17 game_pks in common. A hitter
        // who plays most nights keeps his player_id, so his stale
        // batter_<id>.json was fetched, matched, and rendered: last week's
        // batted balls drawn as tonight's spray chart, with nothing on
        // screen saying so.
        //
        // The real repair is bot-side (make_slim.py stamps each directory
        // with its slate and publish_data.sh refuses to ship one that
        // disagrees). This is the second lock: if the file says it belongs
        // to a different game than the row that opened this modal, it is
        // treated as missing, which every panel below already renders
        // honestly. Note this is the same symptom as the 2026-08-24 Tatis
        // watchlist bug — a detail game_pk of 823262 against a slate
        // game_pk of 823260 — which was read at the time as an hourly
        // republish clock skew. It was this.
        //
        // The archive file is exempt: it is slate-independent by design and
        // carries no game of its own.
        const mine = player?.game_pk
        if (!archive && j && mine != null && j.game_pk != null && String(j.game_pk) !== String(mine)) {
          setDetail(null)
          setDetailState('missing')
          return
        }
        setDetail(j)
        setDetailState(j ? 'done' : 'missing')
      })
    return () => { alive = false }
  }, [pid, slateMode, player?.api_only, player?.game_pk])

  // An API-only player can land while a bot-only tab is open — snap home.
  useEffect(() => { pickedRef.current = false; if (player?.api_only) setTab(firstTab(true, tabbed)) }, [player])   // eslint-disable-line react-hooks/exhaustive-deps
  // the width is known only after mount: a phone opens on the spray chart, a desktop on the Pitcher panel; a page panel
  // picked on a phone is already on screen on a desktop, so the desktop's tab row falls back to its first tab
  useEffect(() => {
    if (tabbed && tab === 'front') { setTab('spray'); return }
    if (!tabbed && PAGE_KEYS.includes(tab)) { setTab('front'); return }
    if (pickedRef.current) return
    if (tabbed && !PAGE_KEYS.includes(tab)) setTab('spray')
  }, [tabbed])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── TONIGHT'S BALLS ON THE CARD'S OWN SPRAY (2026-09-03) ─────────────────
  //
  // Donovan, on the homer notification: "the live spray would be cool."
  //
  // Everything needed for this already existed and had never been joined up.
  // SprayField has drawn a live layer over the season dots since 08-10 --
  // tonight's contact, ringed, in the result colours -- but the ONLY caller
  // that ever passed `liveBalls` was the At the Plate tab. The player card,
  // which is where a notification now lands, rendered the season chart and
  // nothing else. So the alert said "he went yard" and the chart it opened
  // was the one picture of this hitter that did not contain the home run.
  //
  // One game's feed, the same fetchLiveGame/parseLiveGame the live pages use,
  // filtered to this batter. Deliberately narrow:
  //   · only while the Spray tab is actually open -- a card opened on
  //     Overview costs nothing, and most are
  //   · only with a game_pk, and never on tomorrow's slate, where there is no
  //     game to have a feed
  //   · no polling. The card is a thing you open, read and close; a 15s timer
  //     behind it would be the third live poller on the page. It refetches
  //     when you leave the tab and come back, which is the same gesture.
  // A failure is silent and leaves the season chart exactly as it was -- the
  // live layer is an addition, never a dependency.
  const [liveBalls, setLiveBalls] = useState(null)
  useEffect(() => {
    let alive = true
    setLiveBalls(null)
    const pk = Number(player?.game_pk)
    if (!pk || slateMode === 'tomorrow' || !pid) return undefined   // the spray chart is on the page now, not behind a tab
    fetchLiveGame(pk)
      .then((j) => {
        if (!alive || !j) return
        const balls = (parseLiveGame(j)?.balls || []).filter((b) => Number(b.batterId) === Number(pid))
        if (balls.length) setLiveBalls(balls)
      })
      .catch(() => { /* season chart stands on its own */ })
    return () => { alive = false }
  }, [player?.game_pk, pid, slateMode])

  // ── A NOTIFICATION CAN NAME THE TAB (2026-09-03) ─────────────────────────
  //
  // "I clicked that notification and it took me to the homepage instead of
  // the spray chart of the home run." The card now opens where the news is:
  // lib/dash/pushRules.js puts `&view=spray` on the two alerts whose subject
  // is the batted ball (homer, extra-base hit) and nothing on the rest.
  //
  // Runs AFTER the api_only snap-home above so the two cannot fight; and it
  // refuses a tab this player does not have rather than rendering an empty
  // panel -- an API-only man has four tabs, not nine, and Spray is one of
  // them, which is the case that matters here.
  //
  // THE TAB IS IN THE ADDRESS (2026-10-06, Dashboard.js modalView): the shell
  // hands the address's view back as initialTab and hears every pick through
  // onViewChange. initialTab going back to '' (Back, or the card closing) puts
  // the card back on Overview; a pick the card cannot show is reported as ''.
  const lastViewRef = useRef('')
  useEffect(() => {
    if (!player) return
    if (!initialTab) {
      if (lastViewRef.current) setTab(firstTab(!!player?.api_only, tabbed))
      lastViewRef.current = ''
      return
    }
    lastViewRef.current = initialTab
    const view = VIEW_ALIAS[initialTab] || initialTab
    // the page's own sections: scroll to the one asked for (the spray chart for a homer push)
    if (PAGE_VIEWS.includes(initialTab)) {
      const key = initialTab === 'overview' || initialTab === 'ev' || initialTab === 'front' ? 'spray' : initialTab
      if (tabbed) {   // a phone: that panel is a tab (the EV log sits under the spray chart in it)
        pickedRef.current = true; setTab(key)
        if (initialTab === 'ev') setTimeout(() => { try { evRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } catch { /* old engine */ } }, 400)
        return
      }
      setTab('front')
      const el = { spray: sprayRef, ev: evRef, splits: splitsRef, props: propsRef }[initialTab]?.current
      if (el) setTimeout(() => { try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }) } catch { /* old engine */ } }, 250)
      return
    }
    const allowed = player?.api_only ? API_TABS : TABS.map((t) => t.key)
    if (allowed.includes(view)) { pickedRef.current = true; setTab(view) }
    else onViewChange?.('')
  }, [player, initialTab, tabbed])   // eslint-disable-line react-hooks/exhaustive-deps

  // 🎽 JERSEY NUMBER (2026-08-13, Donovan: "add jersey numbers to the players
  // modal"). Not something the bot publishes — it's static roster info, the
  // same one-field pull HomerLedger's numerology feature already proved out
  // the same day (statsapi.mlb.com/api/v1/people, primaryNumber). Kept
  // deliberately separate from that cache rather than reaching into it: this
  // fetches at most once per modal-open, not a hot enough path to share one.
  const [jersey, setJersey] = useState(null)
  // birthDate rides the same one call (numerology step 7: His Numbers).
  const [birthDate, setBirthDate] = useState(null)
  useEffect(() => {
    setJersey(null); setBirthDate(null)
    if (!pid) return undefined
    let alive = true
    fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${pid}&fields=people,id,primaryNumber,birthDate`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        const person = j?.people?.[0]
        const num = Number(person?.primaryNumber)
        // '' -> Number('') -> 0, which IS a real jersey number for someone —
        // the explicit "!== ''" check is the same guard the numerology
        // feature needed for the identical reason, so a player with no
        // number on file renders nothing instead of a fake "#0".
        setJersey(person?.primaryNumber != null && person.primaryNumber !== '' && Number.isFinite(num) ? num : null)
        setBirthDate(/^\d{4}-\d{2}-\d{2}$/.test(String(person?.birthDate || '')) ? person.birthDate : null)
      })
      .catch(() => { if (alive) setJersey(null) })
    return () => { alive = false }
  }, [pid])

  // LIVE SEASON FALLBACK (2026-08-08, Donovan: "season stats need to
  // populate as best as possible" for non-slate players). When the bot
  // fields are missing, one small people/stats call fills AVG/HR/PA/OPS.
  const [liveSeason, setLiveSeason] = useState(null)
  useEffect(() => {
    setLiveSeason(null)
    if (!pid) return undefined
    const hasBot = player?.season_avg != null || player?.season_hr != null
    if (hasBot) return undefined
    let alive = true
    import('../lib/savant').then(({ liveSeasonStats }) =>
      liveSeasonStats(pid).then((s) => { if (alive && s) setLiveSeason(s) }))
      .catch(() => {})
    return () => { alive = false }
  }, [pid, player])

  // WHY / WATCH (2026-09-30, BATCH-SIGNAL-WHY S3a): lib/mlb/boardReason.js
  // for this hitter, ranked against `slate` -- the WHOLE slate the caller
  // holds (never the filtered on-screen list). No slate, or a live-API-only
  // player with no board row -> no block, never a guess.
  const reasons = useMemo(() => {
    if (!player || player.api_only || !Array.isArray(slate) || slate.length < 2) return null
    const r = boardReasonFor(player, reasonContext(slate))
    return r.why.length || r.watch ? r : null
  }, [player, slate])

  // MEMBERS (2026-10-16): the card's lock. Same key as the boards' (playerId|game_pk); his game's own start; the sport's one status word.
  const cardLockKey = `${playerId(player || {})}|${player?.game_pk ?? ''}`
  const cardLockIn = { key: cardLockKey, time: player?.game_time, graded: player?.graded === true }
  const nonMember = useMemberState() === 'free'
  const cardLocked = useCardLock({ status: player && !player.api_only ? mlbStatus(player) : null, ...cardLockIn }).locked
  if (!player) return null
  // IDENTITY FIELDS NEVER COME FROM detail (2026-08-24, Donovan: "the add to
  // watch list problem" — reported again after two other real fixes to
  // narrower entry points, because this one is the modal itself, the most
  // common way a player gets added).
  //
  // detail/today republishes on its own hourly clock (lib/dataSource.js's
  // own comment above the cache-buster), while the slate this player row
  // came from can have moved since. Caught live: the published slate had
  // Fernando Tatis Jr. on game_pk 823260 — his real game tonight — while his
  // detail file still carried 823262. "detail keys win on conflict" then let
  // that stale game_pk overwrite the correct one in `p`, so the watchlist
  // entry got SAVED under 823262. The very next tick, Dashboard.js's slate-
  // prune effect checked 823262 against tonight's real game_pks, found no
  // match, and silently deleted the entry it had just added — a star that
  // fills in and then, within one render, empties itself. Confirmed with
  // instrumented localStorage writes against the live site: one click, two
  // writes, add then remove, net zero.
  //
  // detail is still the richer source for everything ELSE — spray chart,
  // pitch mix, splits, all the content this merge exists for — so only the
  // two fields anything downstream uses to IDENTIFY this row (which game,
  // which man) are pinned back to the slate's own values, which are never
  // more than one poll old.
  const p = detail
    ? { ...player, ...detail, game_pk: player?.game_pk ?? detail?.game_pk, player_id: player?.player_id ?? player?.id ?? detail?.player_id }
    : player
  // Which market's counting stats the slash line should lead with. A hitter
  // the bot designated as an HRR pick is graded on hits + runs + RBI, so those
  // are the numbers his card owes you — not season homers.
  const primaryType = (String(player?.game_pick_role || '').split('/')[0].trim() || 'hr').toLowerCase()
  // His season homers so far (bot row, else the live pull): His Numbers' "next HR".
  const hrSoFar = Number.isFinite(Number(p?.season_hr ?? liveSeason?.hr)) && (p?.season_hr ?? liveSeason?.hr) !== null && (p?.season_hr ?? liveSeason?.hr) !== '' ? Number(p?.season_hr ?? liveSeason?.hr) : null

  // API-ONLY PLAYERS (2026-08-06): anyone found through the league-wide
  // search who isn't on the bot's slate. Every live-pull panel works for them
  // — props grid, situational splits, zone map, EV-log header — so those tabs
  // show; the bot-fed panels (scores, pitch tables) would render empty zeros
  // and are hidden instead of faked.
  //
  // 'spray' ADDED (2026-08-28, Donovan: "i need to be able to see the spray
  // chart even if they player isnt on. the bot."). Used to be hidden here
  // for the same reason pitch/pitcher/sim still are — no data existed for
  // an off-slate player at all. Now bots/spray_archive.py publishes one
  // (league-wide, gradually filled in) and SprayField.js/the detail-fetch
  // effect above both know to ask archiveDetailUrl() for an api_only
  // player, so the tab has somewhere real to point. If the archive hasn't
  // reached him yet it 404s honestly, same as a slate player with no
  // detail file — see the caveat right below, no longer suppressed for
  // apiOnly either, now that a real fetch is actually attempted.
  const apiOnly = !!p?.api_only
  const deeperTabs = apiOnly ? TABS.filter((t) => API_TABS.includes(t.key)) : TABS
  const pageTabs = apiOnly ? PAGE_TABS.filter((t) => API_PAGE.includes(t.key)) : PAGE_TABS
  // a phone: the front's panels first, then the back's views, one row of flat chips; a desktop: Front, then the back
  const visibleTabs = tabbed ? [...pageTabs, ...deeperTabs] : [FRONT, ...deeperTabs]
  // a front panel draws when the front is up (desktop) or when it is the picked tab (phone)
  const showPanel = (k) => (tabbed ? tab === k || (k === 'ev' && tab === 'spray') : tab === 'front')

  const role = compactRole(p)
  const rc = roleColor(role, C)
  const pills = signalPills(p, C, 'hr')
  const b = babipVal(p), pb = pitcherBabipVal(p)
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const batsHand = clean(p?.bats || p?.handedness, '')
  const matchesWeak = weakSide && batsHand && (
    (weakSide === 'LHB' && batsHand === 'L') ||
    (weakSide === 'RHB' && batsHand === 'R')
  )
  const weakLabel = weakSide
    ? `Weak vs ${weakSide}`
    : p?.pitcher_throws ? (p.pitcher_throws === 'R' ? 'RHP' : 'LHP') : '—'

  // Documented batter-vs-pitch exploit found by the model (pitch_type_match_score > 0).
  // Backtested separator: HR_PICKS with this flag hit 23.9% vs 9.5% without it
  // across 22 days / 241 picks -- the single largest gap found in that analysis.
  const hasMatchupEdge = n(p?.pitch_type_match_score, 0) > 0

  // ── the hero's four values ────────────────────────────────────────────────
  // One registry (lib/verdict.js) decides which score is HIS score, so the
  // modal and the Props card can never disagree about what a hitter's number
  // is. The price is the same subtle treatment the cards got — dimmed, at the
  // end of the matchup line, and only when the book is quoting the same bar
  // the pick has to clear.
  const heroRole = apiOnly ? 'NONE' : (primaryRole(p) || 'NONE')
  const heroCol = apiOnly ? C.text3 : verdictRoleColor(heroRole)
  const heroScore = apiOnly || cardLocked ? null : verdictFor(heroRole).score(p)
  const heroQuote = (() => {
    if (apiOnly || !odds) return null
    const cat = heroRole === 'WATCH' ? 'HR' : heroRole === 'NONE' ? null : heroRole
    if (!cat) return null
    const q = quoteFor(odds, p, cat)
    return q?.matches ? q : null
  })()
  // THE FLAGS (2026-10-08): the grade, the better bet, the matchup edge, the bot's pills and the hero's two
  // chips, as one small chip row inside the verdict. The role itself is the hero's badge, so it is not repeated.
  // A Skip HR wears no grade (grading a market the bot said to skip is decoration, 2026-08-15).
  const showChecklist = !apiOnly && !cardLocked
  const verdictSignals = (() => {
    if (apiOnly) return []
    const skipHr = /skip/i.test(role)
    const roleType = /hit/i.test(role) && !skipHr ? 'hit' : /hrr/i.test(role) ? 'hrr' : /(tb|contact)/i.test(role) ? 'tb' : 'hr'
    const roleBet = bestBet(p, roleType)
    const all = []
    if (!skipHr && roleBet && roleBet !== role) all.push({ t: roleBet })
    if (!skipHr) all.push({ t: `Grade ${gradeFor(p, roleType)}` })
    if (hasMatchupEdge) all.push({ t: '🎯 Matchup Edge' })
    pills.forEach((x) => all.push({ t: x.label }))
    chipsFor(p, heroRole).forEach((c) => all.push(c))
    // ONE CHIP PER FACT (2026-10-22, Donovan: "chips of repeated data"): "Trap" and "⚠ trap risk" are one fact (keyed on
    // the first word), and his ISO is already the VS HIS HAND tile on the checklist right under it.
    const seen = new Set()
    const firstWord = (t) => (String(t).toUpperCase().match(/[A-Z0-9]+/) || [''])[0]
    return all.filter((c) => {
      const k = firstWord(c.t)
      if (!k || seen.has(k) || (showChecklist && k === 'ISO')) return false
      seen.add(k); return true
    })
  })()
  const heroPriceText = heroQuote ? fmtOdds(heroQuote.over) : '—'
  // the line-moved chip beside his price (10-20, MOONSHOT parity: TUDDY / LAMP / BUCKETS wear it); no opening price on the quote, no chip
  const heroPrice = heroPriceText === '—' || cardLocked ? null
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{heroPriceText}<LineMoveChip quote={heroQuote} compact /></span>

  // Width follows the widest table on the tab. Pitch and Pitcher carry ten-plus
  // stat columns; Spray is a fixed-size chart and gets cramped, not helped, by
  // extra width.
  // Overview widened 480 → 580 (2026-08-06): the props hero earns the room —
  // six window tiles, a value chart and three filter rows were living in a
  // phone-width column on a desktop screen.
  // ONE WIDTH (2026-10-21, the portal): two columns on a desktop (spray | EV log, head-to-head | props), one on a phone.
  // THE WHOLE SCREEN (2026-10-22): on a desktop the card takes nearly all of it (CardShell fill); a phone is full width anyway
  const modalWidth = 1760

  return (
    <>
    <CardShell inline={inline} onClose={onClose} width={modalWidth} fill label={`${nameOf(p)} card`}>

          {/* THE TOOLBAR, ON ITS OWN LINE (2026-08-23). These five controls
              plus the badge left about 90px for the hitter's NAME on a 430px
              phone, and the name has an ellipsis, so it collapsed to nothing —
              caught in the render, not in review. A toolbar is not part of the
              verdict; it goes above it, right-aligned, and the name gets the
              whole width of the line it deserves. */}
          {/* one line that scrolls sideways when the buttons outgrow a phone (the right-aligned row used to push Card off the
              left edge, out of reach); the inner row rides right with margin auto so scrolling reaches every button */}
          <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flex: '0 0 auto' }}>

            {/* the ✕ was a bare 22px glyph — about a 22px square to hit with a
                thumb on a modal that now covers the whole phone screen. The
                padding makes it a real target without moving it a pixel. */}
              {/* 🎴 his card as a PNG — the single-player twin of the
                  watchlist share card (2026-08-15). Bot fields only, so an
                  API-only player has no card to print. */}
              {!apiOnly && p?.player_id != null && <CardFlip sport="mlb" id={String(p.player_id)} name={nameOf(p)} />}
              {/* a player off the slate has no season card; if he played in the postseason his postseason card is one tap (draws nothing otherwise) */}
              {apiOnly && p?.player_id != null && <PostseasonChip sport="mlb" id={String(p.player_id)} name={nameOf(p)} />}
              {/* 📸 his card as a picture: the same baseball card MOONSHOT's alerts use (his call, his stat tiles, his place on the board), beside the flip Card button */}
              {!apiOnly && <ShareCardButton sport="mlb" what="his card" url={playerUrl({ sport: 'mlb', id: p.player_id })} filename={`${slug(nameOf(p), 'player')}_${stamp(p?.game_date || p?.day)}.png`} />}
              {/* ⚖ COMPARE (2026-08-21, Phase 4) — nothing in the codebase let
                  you put two hitters' numbers next to each other before this;
                  the Navigator right beside it only ever holds one player at
                  a time, and its own comment names that exact gap. Gated the
                  same way the watchlist/slip actions are: an api-only search
                  hit has no model scores to compare. */}
              {!apiOnly && peers.length > 1 && (
                <button onClick={() => setCompareOpen(true)} title="Compare this hitter against another on tonight's slate"
                  style={{
                    background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2,
                    borderRadius: 7, padding: '3px 9px', fontSize: 12, lineHeight: 1,
                    cursor: 'pointer', minHeight: 32, minWidth: 34,
                  }}>⚖</button>
              )}
              {onNavigate && peers.length > 1 && (
                <Navigator peers={peers} cur={player} onNavigate={onNavigate} />
              )}
          </div>
          </div>

          {/* ── THE HERO (2026-08-23) ─────────────────────────────────────
              Donovan, after the Props redraw: "i .ike how the props pages
              looks. please up grade both pitcher and player moadlas like this
              too". Scope, asked and answered: THE HERO ONLY. This block
              replaces the 19px name and its grey line; every panel below is
              untouched, because a look change is not worth risking the zone
              map, the arsenal or the splits.

              The dial reads HIS market's score, out of lib/verdict.js — the
              same registry the Props cards use, so a hitter cannot show 74 on
              the board and 80 in his own modal. An api-only hitter has no
              model score at all, so his dial is empty and says so rather than
              drawing a zero. */}
          {/* #59: the outcome leads once there is one. See the long note in
              components/PickVerdictStamp.js -- the card was the one surface
              on this site that never graded itself. */}
          {!apiOnly && <PickVerdictStamp player={p} />}
          {/* THE TOP, ON A WIDE DESKTOP (2026-10-22, Donovan: open and it "almost engulfs the whole screen" with the spray, the
              EV, the props): who he is and the verdict on the left, his checklist and price on the right (app/globals.css
              .portal-top), so the charts start in the first screen. One column under 1280px. */}
          <div className="portal-top">
          <div className="portal-who">
          <VerdictHero
            style={{ marginBottom: 12 }}
            // The face INSIDE the dial (2026-09-27): it used to sit beside it
            // from 561px up and cut "#15 Hunter Goodman" at 390; in the ring it
            // costs zero width, so phones get it too. No photo -> the number.
            photo={mlbFaceStrict(clean(p?.player_id, ''), 128)}
            col={heroCol}
            score={heroScore}
            title={<>
              {jersey != null && (
                <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT }}>#{jersey} </span>
              )}
              {nameOf(p)}
              <PlayerInjuryChip who={{ player_id: p?.player_id, name: nameOf(p), team: teamOf(p) }} />
            </>}
            badge={apiOnly ? 'LIVE' : cardLocked ? 'MEMBERS' : heroRole === 'NONE' ? 'NO BADGE' : heroRole === 'WATCH' ? '👀 WATCH' : heroRole}
            badgeQuiet={apiOnly || cardLocked || heroRole === 'NONE' || heroRole === 'WATCH'}
            meta={apiOnly
              ? <>{clubLink(clean(p?.team, '—'), META_LINK)}{`${p?.position ? ` · ${p.position}` : ''} · ${clean(p?.bats, '?')}HB · ${p?.status_word || "not on tonight's slate"}${p?.season_line?.pa ? ` · ${String(p.season_line.avg?.toFixed?.(3) ?? '—').replace(/^0/, '')} / ${p.season_line.hr} HR / ${p.season_line.rbi} RBI in ${p.season_line.pa} PA` : ''}`}</>
              // The game and the arm are links (2026-10-04, route audit B6): Player ->
              // Game opens his game on the Slate, Player -> pitcher opens the
              // pitcher's file -- the addresses those tabs already read. The two
              // clubs open their team pages; the game is 'Game ›' (two-line head above).
              : <>
                  {clubLink(teamOf(p), FIRST_CLUB_LINK)}{' vs '}{clubLink(oppOf(p))}
                  {p?.game_pk ? <>{' · '}<a href={`#sport=mlb&tab=games&game=${p.game_pk}`} style={GAME_LINK} title="Open his game on the Slate">Game ›</a></> : null}
                </>}
            meta2={apiOnly ? null : <>
                  {`#${clean(p?.lineup_spot, '?')} · ${clean(p?.handedness || p?.bats, '?')}HB`}
                  {p?.pitcher_name ? <>{' · vs '}{p?.pitcher_id ? <a href={`#sport=mlb&tab=pitchers&pitcher=${p.pitcher_id}`} style={ROW_LINK} title="Open the pitcher's file">{p.pitcher_name}</a> : p.pitcher_name}{` (${clean(p?.pitcher_throws, '?')})${p?.pitcher_projected ? ' ≈' : ''}`}</> : null}
                </>}
            metaRight={heroPrice}
            market={apiOnly ? (p?.roster ? 'on the roster, not the slate' : 'live data only') : cardLocked ? null : verdictFor(heroRole).market}
            right={!inline && (
              <button onClick={onClose} aria-label="Close" style={{
                background: 'transparent', border: 'none', color: C.text3, fontSize: 20,
                cursor: 'pointer', lineHeight: 1, padding: '2px 6px', margin: '0 -6px 0 0',
                flexShrink: 0,
              }}>✕</button>
            )}
          />
          {/* HIS BIRTHDAY (real date from the league people file; nothing when unknown) */}
          {/* a phone shows it only near his birthday (the chip is the point); the top of a phone card is for the read */}
          {(!tabbed || birthdayChip(birthDate, etToday())) && <BornLine birth={birthDate} on={etToday()} accent={C.orange} C={C} font={NUM_FONT} style={{ marginTop: -4 }} />}

          {/* STAT-FIRST HEADER (2026-08-09). The card used to open on chips,
              then model scores. The two sites people call easier to read both
              open on the same thing: the raw numbers, colour-coded, and a
              recent-homer count. Both are here now, above everything — the
              model scores are still a scroll away in their own panel, where a
              verdict belongs. The homer boxes keep their denominators visible
              because L5/L10 count GAMES and season counts PLATE APPEARANCES;
              stacking those as bare percentages compares two different units. */}
          {/* THE PLAYER MODEL (2026-10-08, components/player/): MOONSHOT ON HIM first (the call word, the score, why, the
              flags, last week), then ONE row of his key numbers. Replaces the slash line, the stat tiles, the L5 / L10 /
              season boxes and the WHY box; every number they carried is in the row, the verdict or its (?). */}
          <VerdictBlock
            lock={cardLockIn}
            status={apiOnly ? null : mlbStatus(p)}
            score={heroScore}
            scoreLabel={apiOnly || heroRole === 'NONE' || heroRole === 'WATCH' ? null : heroRole}
            why={reasons && !apiOnly ? reasons.why.map((r) => r.text) : []}
            watch={reasons && !apiOnly ? (reasons.watch?.text || null) : null}
            explain={reasons && !apiOnly ? reasonLines(reasons, nameOf(p)).explain : null}
            signals={verdictSignals}
            help={apiOnly ? null : sentenceFor(p, heroRole)}
            offSlate={apiOnly ? "Not on tonight's slate." : null}
            offSlateHelp={apiOnly ? (p?.roster
              ? 'On a club\u2019s roster but not in tonight\u2019s lineup, so MOONSHOT did not rate him. The season line is real and every panel is pulled live; no model score, on purpose. Watch and slip are not available for him.'
              : 'Found through the league-wide search, not on MOONSHOT\u2019s slate. Every panel here is pulled live and none carries a model score. Watch and slip are not available for him.') : null}
            recordLine={botData === undefined ? null : mlbRecordLine(botData)}
            lastLine={botData === undefined ? null : mlbLastLine(botData)}
          />
          {/* HR is the checklist's first tile; the row keeps the numbers the checklist doesn't (4 tiles, even) */}
          <StatRow stats={mlbStatRow(p, slate, liveSeason).filter((s) => !(showChecklist && s.id === 'hr'))} style={{ marginBottom: 8 }} />

          {/* THE BUTTON THAT WASN'T THERE (2026-08-24, Donovan: "I click add
              to watch, nothing happens"). It wasn't broken — this whole block
              was gated on `!apiOnly` and just didn't render at all for a
              LIVE-API-only player (one looked up from the league feed because
              he isn't on the bot's currently-published slate — the normal
              state while the nightly build is still catching up). A vanished
              button and a dead click look identical from the outside, so this
              now renders SOMETHING either way: the real controls when the
              player carries slate data, a plain explanation when he doesn't,
              instead of silence. */}
          {/* StarMemory and MultiLine moved into the ONE folded More section at the end of the card (2026-10-17 trim). */}
          {/* Watchlist + slip. You could open a hitter from any board, decide
              he's worth playing, and then have to close the modal and find his
              card again to add him. Both actions live here now. */}
          {/* ONE EVEN ROW (2026-10-22, Donovan: watch and slip "taking a whole row with it not being symmetrical"): Watch and the
              four slip adds are equal cells in one line. MOONSHOT's pick wears a ★ on its chip instead of a sentence beside it;
              a pass night (Skip) stars nothing. */}
          {!apiOnly && (onAdd || onWatch) && (() => {
            const pick = /skip/i.test(role) ? '' : (String(bestBet(p, 'hr') || '').toUpperCase().match(/[A-Z]+/) || [''])[0]
            const cells = (onWatch ? 1 : 0) + (onAdd ? BETS.length : 0)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))`, gap: 6, marginBottom: 10 }}>
                {onWatch && (
                  <button
                    onClick={() => onWatch(p)}
                    title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                    className={FLAT_CHIP_CLASS} style={{ ...flatChip(watched, C.orange, C, NUM_FONT), justifyContent: 'center', whiteSpace: 'nowrap' }}
                  >{watched ? '★ Watching' : '☆ Watch'}</button>
                )}
                {onAdd && BETS.map((b) => {
                  const isPick = !!pick && b.toUpperCase() === pick
                  return (
                    <button
                      key={b}
                      onClick={() => onAdd(p, b)}
                      aria-label={`Add to slip: ${b}${isPick ? " (MOONSHOT's pick)" : ''}`}
                      title={`Add ${nameOf(p)} — ${b} — to the slip${isPick ? ". MOONSHOT's pick for him tonight." : ''}`}
                      className={FLAT_CHIP_CLASS}
                      style={{ ...flatChip(false, C.orange, C, NUM_FONT), justifyContent: 'center', whiteSpace: 'nowrap', ...(isPick ? { color: C.orange, borderColor: C.orange } : null) }}
                    >+ {b}{isPick ? ' ★' : ''}</button>
                  )
                })}
              </div>
            )
          })()}

          {/* ── THE PORTAL (2026-10-21) ─────────────────────────────────────────────────────────────────────────────────
              1 the read: his checklist (lib/mlb/checklist.js) and the price line
              2 his spray chart | his EV log          (one column on a phone, spray first)
              3 the head-to-head + first pitch | the props grid
              4 the deeper panels, as tabs
              5 his record: star, multi-HR, MOONSHOT on him, the ledger, his numbers, my note */}
          </div>
          <div className="portal-read">
          {!apiOnly && (cardLocked
            ? (nonMember ? <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ margin: '4px 0 10px' }} /> : null)
            : <Checklist rows={checklist(p)} />)}
          {/* his numbers near the top: jersey, life path, personal day, next HR, and what lines up tonight (HisNumbers strip) */}
          <HisNumbers look="strip" name={nameOf(p)} jersey={jersey} birthDate={birthDate} next={hrSoFar != null ? hrSoFar + 1 : null} nextWord="HR" date={etToday()} theme={C} accent={C.orange} numFont={NUM_FONT} />
          {/* NO PRICE TIMELINE (2026-10-21, Donovan: "remove the price timeline inside of the player model ... remove it"; #207) */}
          </div>
          </div>

          <div style={{ minHeight: 0 }}>
            {detailState === 'loading' && (
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>Loading detail…</span>
            )}
            {/* 'error' no longer borrows 'missing''s sentence (2026-09-07).
                They are different facts: one says the bot published nothing
                for this man, the other says we couldn't reach the file. Saying
                the first when the second is true is the site lying about its
                own data, and it was the most common thing it said. */}
            {detailState === 'error' && (
              <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT }}>
                Couldn’t load his data just now. Reopen the card to retry.
              </span>
            )}
            {/* a slate hitter with no saved file says nothing here: each panel below says what it drew from, and the spray
                chart and EV log pull his season live (2026-10-22, a two-line orange note under the checklist was noise) */}
            {detailState === 'missing' && apiOnly && (
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                Not archived yet — this player isn’t on tonight’s slate and the off-slate archive hasn’t reached him
              </span>
            )}
          </div>

          {/* the side row: Front and the back's views (desktop), or every panel as a tab (phone); it stays at the top of the
              card while you read, so the next view is one tap away */}
          <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '8px 0', margin: '2px 0 12px', position: 'sticky', top: 0, zIndex: 5, background: C.bg2 }}>
            <div className="chip-row" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {visibleTabs.map(t => (
                <TabBtn key={t.key} active={tab === t.key} onClick={() => { pickedRef.current = true; setTab(t.key); onViewChange?.(t.key === 'front' ? '' : t.key) }}>{t.label}</TabBtn>
              ))}
            </div>
          </div>
          {/* THE FRONT (app/globals.css .portal-main): splits | spray | EV log | props across a wide desktop, two by two on a
              laptop, one panel at a time on a phone (picked in the row above) */}
          <div className="portal-main">
            {showPanel('splits') && (
              <section ref={splitsRef} className="portal-splits" style={PORTAL_CELL} aria-label="Splits">
                <SplitsPanel player={p} />
              </section>
            )}
            {showPanel('spray') && <section ref={sprayRef} className="portal-spray" style={PORTAL_CELL} aria-label="Spray chart">
              <SprayField
                player={p}
                height={340}
                slateMode={slateMode}
                // Season chart with tonight layered on: "here is what he does, and here is what he did tonight" in one
                // picture. The ● Tonight chip in the window row turns the layer off.
                liveBalls={liveBalls}
                liveFocusId={Number(pid) || null}
                liveLabel={nameOf(p)}
                // the blend: his HR setup on the way in (L10, the starter's top 3, hard hit), rarer filters folded away,
                // and the balls it draws go straight to the EV log beside it
                preset="hr"
                moreFilters
                onShown={setChartBalls}
                pickedBall={pickedBall}
                onPickBall={setPickedBall}
              />
            </section>}
            {showPanel('ev') && <section ref={evRef} className="portal-ev" style={PORTAL_CELL} aria-label="EV log">
              {chartBalls === null
                ? <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading batted balls…</div>
                : <EVLog player={p} balls={chartBalls} pickedBall={pickedBall} onPickBall={setPickedBall} />}
            </section>}
            {showPanel('props') && (
              <section ref={propsRef} className="portal-props" style={PORTAL_CELL} aria-label="Props">
                <ThresholdGrid playerId={pid} odds={odds} />
              </section>
            )}
          </div>

          {/* THE BACK: PITCHES, three panels side by side (one column on a phone): what he does to each pitch, the arm he
              faces tonight, and him against that arm (the head-to-head and the first-pitch split) */}
          {tab === 'pitch' && (
            <div className="portal-back3">
              <section style={PORTAL_CELL} aria-label="His pitches">
                {detailState === 'loading'
                  ? <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading pitch profile…</div>
                  : <>
                      {/* the strike-zone map with his line per pitch (it sat on top of the EV log before the blend) */}
                      <EVLog player={p} zoneOnly />
                      {/* `detail` is the batter file this modal already fetched (see the note at the top of PitchBreakdown.js) */}
                      <PitchBreakdown player={p} detail={detail} />
                      {/* which pitches he homers off, against tonight's mix */}
                      <HRPitchProfile player={p} slateMode={slateMode} />
                    </>}
              </section>
              {!apiOnly && (
                <section style={PORTAL_CELL} aria-label="Tonight's pitcher">
                  <MatchupPitcher player={p} slateMode={slateMode} />
                </section>
              )}
              {!apiOnly && (
                <section style={PORTAL_CELL} aria-label="Against tonight's pitcher">
                  <BvP batterId={pid} pitcherId={p?.pitcher_id} pitcherName={p?.pitcher_name} player={p} />
                  <FirstPitchSplit batterId={pid} pitcherId={p?.pitcher_id} pitcherName={p?.pitcher_name} />
                </section>
              )}
            </div>
          )}

          {tab === 'numbers' && !apiOnly && (
              <div style={{ marginBottom: 14 }}>
              {/* Same anchored-section shape as the cold case, so the page
                  reads as chapters instead of one unbroken wall. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>The numbers</span>
                <span style={{ fontSize: 11, color: C.text3 }}>the evidence behind the read — tap any label for what it means</span>
              </div>
              {/* 🧱 CONTACT (2026-09-27, blast columns plan): Blast Report's
                  windows and filters over his batted balls, counts beside
                  rates. Replaces the Batted Ball and Recent Distance blocks. */}
              <ContactSection p={p} />
              {/* auto-fit so the two columns become one on a phone instead of
                  squeezing every value row into ellipsis territory */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '0 24px' }}>
                <div>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Model Scores</div>
                  <Row label="HR Score"  value={hrScore(p).toFixed(1)} />
                  <Row label="HRR Score" value={prodScore(p).toFixed(1)} />
                  <Row label="Hit Score" value={hitScore(p).toFixed(1)} />
                  <Row label="TB Score"  value={tbScore(p).toFixed(1)} />
                  <Row label="Pitch Mix" value={pitchMixScore(p).toFixed(1)} />
                  <VenueHrRow pid={pid} venueName={clean(p?.venue_name, '')} gamePk={p?.game_pk} />
                  <OppDefenseRow opp={clean(p?.opponent || p?.opp, '')} />
                  <PullWallRow bats={clean(p?.bats || p?.handedness, '')} venueName={clean(p?.venue_name, '')} />
                  {/* moved here from "Recent Distance" (2026-09-27) when the
                      Contact section took over the batted-ball numbers */}
                  <Row label="Ideal HR %" value={ihrVal(p) ? (ihrVal(p) * 100).toFixed(1) + '%' : '—'} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Season</div>
                  {/* live fallback fills these for non-slate players */}
                  <Row label="AVG"    value={clean(p?.season_avg ?? liveSeason?.avg, '—')} />
                  {/* explicit: a bare "HR" in the Season block is his home-run
                      COUNT, not the HR score the glossary would hand it. */}
                  <Row label="HR"     value={clean(p?.season_hr ?? liveSeason?.hr, '—')}
                    explain="Home runs he has actually hit this season." />
                  <Row label="PA"     value={clean(p?.season_pa || p?.pa || liveSeason?.pa, '—')} />
                  {liveSeason && p?.season_avg == null && (
                    <Row label="OPS"  value={clean(liveSeason.ops, '—')} />
                  )}
                  <Row label="K Rate" value={pct(p?.season_k_rate)} />
                  <Row label="BB Rate" value={pct(p?.season_bb_rate)}
                    explain="How often a plate appearance ends in a walk, this season." />
                  {b > 0 && <Row label="BABIP" value={b.toFixed(3)} />}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Splits</div>
                  {avgVsRHP(p) > 0 && <Row label="vs RHP" value={avgVsRHP(p).toFixed(3)} />}
                  {avgVsLHP(p) > 0 && <Row label="vs LHP" value={avgVsLHP(p).toFixed(3)} />}
                  <Row label="L5 Hits" value={n(p?.last5_hits, 0)} />
                  <Row label="L5 HR"   value={n(p?.last5_hr, 0)} />
                  <Row label="L5 XBH"  value={n(p?.last5_xbh, 0)} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Opposing Pitcher</div>
                  {/* the pitcher's name opens his file, as the header's does (clickable rule) */}
                  <Row label="Name"   value={p?.pitcher_name && p?.pitcher_id ? <a href={`#sport=mlb&tab=pitchers&pitcher=${p.pitcher_id}`} style={META_LINK} title="Open the pitcher's file">{p.pitcher_name}</a> : clean(p?.pitcher_name, '—')} mono={false} />
                  <Row label="Throws" value={clean(p?.pitcher_throws, '—')} />
                  <Row label="HR/9"   value={sc(p?.pitcher_hr9)} />
                  <Row label="BB/9"   value={sc(p?.pitcher_bb9)}
                    explain="Walks this pitcher allows per nine innings, season-long — not specific to tonight's matchup. Higher is better for the hitter." />
                  <Row label="WHIP"   value={sc(p?.pitcher_whip)} />
                  <Row label="BB%"    value={pct(p?.pitcher_bb_pct)}
                    explain="His walk rate against every batter he's faced this season — not specific to tonight's matchup." />
                  {weakSide && (
                    <div style={ROW_BOX}>
                      <span style={{ fontSize: 11, color: C.text3 }}>Weak Side</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: NUM_FONT, color: matchesWeak ? C.orange : C.text }}>
                        {weakLabel}{matchesWeak ? ' ✓' : ''}
                      </span>
                    </div>
                  )}
                  {pb > 0 && <Row label="P-BABIP" value={pb.toFixed(3)} />}
                </div>
              </div>
              </div>
          )}

          {/* THE READ (2026-10-07): the sentences, his homer shape, the cold case -- one accent */}
          {tab === 'read' && (
            <>
              {!apiOnly && (cardLocked ? null : <PlayerRead p={p} odds={odds} />)}
              {!apiOnly && nonMember && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ margin: '4px 0 8px' }} />}
              <HomerShape player={p} />
              <ColdCase playerId={pid} player={player} />
            </>
          )}


          {/* his game-by-game line, one row a game (the live game log the props grid already reads) */}
          {tab === 'log' && <MlbGameLog pid={pid} />}


          {/* where he puts the ball */}

          {/* day/night, home/away, day of week, win/loss — bot-published, plus
              the situational block pulled live from the MLB StatsAPI: RISP,
              ahead-in-count, two-strike, home/away ISO. Those four aren't in
              any bot file, which is why this is the one place the site goes to
              an outside source. Context only — none of it moves a score. */}
          {/* ⚡ EV LOG and 🎮 SIM, their own tabs again (10-20) -- `p` is the merged slate row + detail file */}
          {tab === 'sim' && !apiOnly && <BatterSim player={p} name={nameOf(p)} />}
          {tab === 'sheet' && (
            <>
              {/* every split as one long sheet (Donovan, 2026-08-15); the front's Splits panel is the quick read */}
              {!apiOnly && <PlayerSplits player={p} slateMode={slateMode} />}
              <SituationalSplits playerId={pid} kind="batter" />
            </>
          )}


          {/* his record, at the end of the card: your star and note, his multi-HR games, MOONSHOT on him, the ledger */}
          <div style={{ margin: '16px 0 8px' }}>
            <div style={{ marginBottom: 8 }}>
              <StarMemory sport="mlb" id={clean(p?.player_id, '')} pricesPath={oddsHistoryPaths()[0]} />
            </div>
            <MultiLine sport="mlb" playerId={clean(p?.player_id, '')} words={{ HR: 'multi-HR' }} color={C.orange} textColor={C.text2} />
            <BotOnHim pid={pid} data={botData} />
            <PlayerNotes playerId={pid} />
            <InTheLedger sport="mlb" id={pid} name={nameOf(p)} jersey={jersey} birthDate={birthDate} next={hrSoFar != null ? hrSoFar + 1 : null} date={etToday()} />
          </div>

          {/* the cards he has earned (his real multi-homer games, a long shot that cashed): at the END of the card, no section when he has none */}
          {pid != null && <CardsEarned sport="mlb" id={String(pid)} name={nameOf(p)} />}

    </CardShell>
    {compareOpen && (
      <PlayerCompare
        anchor={p}
        peers={peers}
        pairHistorySummary={pairSummary}
        onClose={() => setCompareOpen(false)}
        // Closes BOTH layers (Compare, then this modal) before handing off
        // to the tab switch, rather than leaving a stale player card open
        // behind the History page.
        onOpenPairHistory={onOpenPairHistory ? () => { setCompareOpen(false); onClose?.(); onOpenPairHistory() } : null}
      />
    )}
    </>
  )
}
