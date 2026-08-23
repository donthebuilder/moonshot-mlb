'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { detailUrl } from '../lib/dataSource'
import {
  nameOf, teamOf, oppOf, n, clean, pct, sc,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  recent375, recent400, recent350, ihrVal,
  avgEV, maxEV, hardHitRate, barrelRate, launchAngle,
  babipVal, pitcherBabipVal, avgVsRHP, avgVsLHP, whiffProfile,
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
import { Chip } from './ui'
import Explain from './Explain'
import StatStrip, { HitRateBoxes, SlashLine } from './StatStrip'
import EVLog from './tabs/EVLog'
import PitchBreakdown from './tabs/PitchBreakdown'
import HRPitchProfile from './HRPitchProfile'
import SprayField from './SprayField'
import MatchupPitcher from './MatchupPitcher'
import PlayerSplits from './PlayerSplits'
import SituationalSplits from './SituationalSplits'
import PlayerNotes from './PlayerNotes'
import ThresholdGrid from './ThresholdGrid'
import ColdCase from './ColdCase'
import PlayerRead from './PlayerRead'
import HomerShape from './HomerShape'
import { downloadPlayerCard } from './shareCard'
import BvP from './BvP'
import { venueRecord } from '../lib/venueHr'
import { pullWallFor } from '../lib/walls'
import PlayerCompare from './PlayerCompare'

// 🧱 "How far is HIS wall tonight" (audit #7, 2026-08-08). fieldInfo hydrate
// verified live; percentile computed from the same payload. Switch hitters
// get their shorter side. Context row — never a score input.
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
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      {/* CLEANED (2026-08-08, Donovan): no emoji, one line — the full
          sentence lives behind a tap.
          TAP-TO-EXPLAIN (2026-08-21, Phase 2): this used to be a bare
          title= — invisible on a phone, which is most of the audience per
          Explain.js's own rationale. Same Explain component Row already
          uses everywhere else in this modal, just with an explicit text=
          since this line isn't in the glossary. */}
      <span style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>
        <Explain label="Pull-side wall" text={`His pull side (${w.side}) at ${venueName}: ${w.line} ft down the line${w.gap ? `, ${w.gap} ft to the gap` : ''}. Percentile is vs all 30 parks' same-side line from the league's own fieldInfo — ${w.linePct}% of parks are shorter. Context, not a score input.`} />
      </span>
      <span style={{ fontSize: 12, fontFamily: NUM_FONT, fontWeight: 600, whiteSpace: 'nowrap', color: col, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      {/* TAP-TO-EXPLAIN (2026-08-21, Phase 2) — see PullWallRow above. */}
      <span style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>
        <Explain label="At tonight's park" text={`${venueName}, ${rec.seasons}: ${rec.hr} HR in ${rec.games} games here vs ${rec.hrAll} in ${rec.gamesAll} everywhere — same two seasons of game logs, so the comparison is apples to apples. Rules of thumb: 1 HR per 4 games = elite pace, 1 per 5–6 = real power, 1 per 8+ = average. Under 8 games here the vs-himself read is hidden — small samples lie.`} />
      </span>
      <span style={{ fontSize: 12, fontFamily: NUM_FONT, fontWeight: 600, whiteSpace: 'nowrap', color: hot ? C.orange : C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      {/* TAP-TO-EXPLAIN (2026-08-21, Phase 2) — see PullWallRow above. */}
      <span style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>
        <Explain label="Opp defense" text={`${opp}'s BABIP-against: how often a ball in play against them becomes a hit, from the league's season totals. Percentile vs all 30 teams — high = leaky defense, good news for HIT/TB props. Context only; not folded into any score.`} />
      </span>
      <span style={{ fontSize: 12, fontFamily: NUM_FONT, fontWeight: 600, whiteSpace: 'nowrap', color: col, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.border}`, minWidth: 0 }}>
      {/* nowrap stays: the explanation itself re-enables normal wrapping
          inside its own box, so a long sentence can't stretch the row. */}
      <span title={title} style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 0 }}>
        <Explain label={label} term={term} text={explain} />
      </span>
      <span
        title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        style={{
          fontSize: 12, color: C.text, fontFamily: mono ? NUM_FONT : 'inherit', fontWeight: 600,
          minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
        }}>{value}</span>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
      border: `1px solid ${active ? C.orange : C.border}`,
      background: active ? `${C.orange}22` : 'transparent',
      color: active ? C.orange : C.text3,
      whiteSpace: 'nowrap',
    }}>{children}</button>
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
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'splits',   label: '📅 Splits' },
  { key: 'ev',       label: '⚡ EV Log' },
  { key: 'pitch',    label: '🎯 Pitch' },
  { key: 'spray',    label: '🗺 Spray' },
  // Hot Zones tab RETIRED (2026-08-08, Donovan: "just remove the hot zones
  // tab since everything is in the ev log") — the EV Log's ZoneMap absorbed
  // all of it: matchup view, zone matches, hover popouts with gb/fly and
  // starter bleed. One map, one home.
  { key: 'pitcher',  label: '🥎 Pitcher' },
]

// `inline` renders the same content as a plain panel instead of a popup.
// The Player tab needs exactly this view but sitting still on the page --
// a modal is a bad place to read for five minutes.
function Shell({ inline, onClose, width, children }) {
  if (inline) {
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 18,
        padding: '18px 20px 22px',
      }}>{children}</div>
    )
  }
  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="modal-box"
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          transition: 'width .15s',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

// BET MARKETS for the slip. Same four the boards offer, so an entry added from
// here is indistinguishable from one added from a card.
const BETS = ['HR', 'Hit', 'HRR', 'TB']

// ── 👥 THE NAVIGATOR (2026-08-09, Donovan: "in the player modal we should be
// able to change players if need to, or at least access other players") ──────
//
// Opening a card used to be a dead end: to compare two hitters you closed the
// modal, found the board you came from, scrolled back to where you were and
// opened the next one. Three of those four steps are the site's fault.
//
// Two ways through, because there are two different intentions:
//   ‹ › walks the list you CAME FROM, in its order. If you opened Murakami
//       from the HR board at #3, › is #4 on that board — the ranking is the
//       thing you were reading, so it's the thing the arrows follow.
//   🔍  jumps to anyone on the slate by name, for when you already know who
//       you want and the list you're in doesn't contain him.
//
// Arrow keys drive the same thing, and are deliberately ignored while a text
// field has focus so typing "Judge" in the search box doesn't skip you two
// hitters sideways on the 'e'.
function Navigator({ peers, cur, onNavigate }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const curId = Number(cur?.player_id ?? cur?.id)
  const idx = peers.findIndex((x) => Number(x?.player_id ?? x?.id) === curId)
  const go = (d) => {
    if (idx < 0) return
    const next = peers[idx + d]
    if (next) onNavigate(next)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target
      // A hitter's name is not a keyboard shortcut.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      go(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hits = q.trim().length < 2 ? [] : peers.filter((x) => {
    const nm = nameOf(x).toLowerCase()
    return nm.includes(q.trim().toLowerCase())
  }).slice(0, 8)

  const btn = (enabled) => ({
    background: 'transparent', border: `1px solid ${enabled ? C.border2 : C.border}`,
    color: enabled ? C.text2 : C.text3, borderRadius: 7, padding: '3px 9px',
    fontSize: 13, lineHeight: 1, cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.4, minWidth: 30, minHeight: 26,
  })

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 5, alignItems: 'center' }}>
      <button onClick={() => go(-1)} disabled={idx <= 0} title="Previous hitter in this list (←)" style={btn(idx > 0)}>‹</button>
      <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, minWidth: 44, textAlign: 'center' }}>
        {idx >= 0 ? `${idx + 1} / ${peers.length}` : 'off list'}
      </span>
      <button onClick={() => go(1)} disabled={idx < 0 || idx >= peers.length - 1} title="Next hitter in this list (→)" style={btn(idx >= 0 && idx < peers.length - 1)}>›</button>
      <button onClick={() => setOpen((v) => !v)} title="Jump to any hitter on the slate" style={{ ...btn(true), fontSize: 11 }}>🔍</button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 5, width: 230,
          background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 10,
          padding: 7, boxShadow: '0 10px 30px rgba(0,0,0,.5)',
        }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a hitter…"
            style={{
              width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7,
              padding: '5px 9px', fontSize: 11, color: C.text, outline: 'none', fontFamily: NUM_FONT,
            }} />
          {hits.map((x) => (
            <button key={String(x?.player_id ?? x?.id)}
              onClick={() => { onNavigate(x); setOpen(false); setQ('') }}
              className="tap-row"
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', color: C.text2, fontSize: 11, padding: '5px 6px',
                cursor: 'pointer', borderRadius: 6,
              }}>
              {nameOf(x)} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>{teamOf(x)}</span>
            </button>
          ))}
          {q.trim().length >= 2 && !hits.length && (
            <div style={{ fontSize: 10, color: C.text3, padding: '6px 6px 2px' }}>Nobody on this slate by that name.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlayerModal({ player, slateMode, onClose, inline = false, onAdd, onWatch, watched = false, peers = [], onNavigate = null, odds = null, pairSummary = null, onOpenPairHistory = null }) {
  const [tab, setTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle')
  const [compareOpen, setCompareOpen] = useState(false)

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
    if (player?.api_only) { setDetail(null); setDetailState('missing'); return }
    let alive = true
    setDetailState('loading'); setDetail(null)
    fetch(detailUrl(pid, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setDetail(j); setDetailState(j ? 'done' : 'missing') } })
      .catch(() => { if (alive) setDetailState('error') })
    return () => { alive = false }
  }, [pid, slateMode])

  // An API-only player can land while a bot-only tab is open — snap home.
  useEffect(() => { if (player?.api_only) setTab('overview') }, [player])

  // 🎽 JERSEY NUMBER (2026-08-13, Donovan: "add jersey numbers to the players
  // modal"). Not something the bot publishes — it's static roster info, the
  // same one-field pull HomerLedger's numerology feature already proved out
  // the same day (statsapi.mlb.com/api/v1/people, primaryNumber). Kept
  // deliberately separate from that cache rather than reaching into it: this
  // fetches at most once per modal-open, not a hot enough path to share one.
  const [jersey, setJersey] = useState(null)
  useEffect(() => {
    setJersey(null)
    if (!pid) return undefined
    let alive = true
    fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${pid}&fields=people,id,primaryNumber`)
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

  if (!player) return null
  const p = detail ? { ...player, ...detail } : player
  // Which market's counting stats the slash line should lead with. A hitter
  // the bot designated as an HRR pick is graded on hits + runs + RBI, so those
  // are the numbers his card owes you — not season homers.
  const primaryType = (String(player?.game_pick_role || '').split('/')[0].trim() || 'hr').toLowerCase()

  // API-ONLY PLAYERS (2026-08-06): anyone found through the league-wide
  // search who isn't on the bot's slate. Every live-pull panel works for them
  // — props grid, situational splits, zone map, EV-log header — so those tabs
  // show; the bot-fed panels (scores, pitch tables, spray) would render empty
  // zeros and are hidden instead of faked.
  const apiOnly = !!p?.api_only
  const visibleTabs = apiOnly ? TABS.filter((t) => ['overview', 'splits', 'ev'].includes(t.key)) : TABS

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
  const heroScore = apiOnly ? null : verdictFor(heroRole).score(p)
  const heroPrice = (() => {
    if (apiOnly || !odds) return null
    const cat = heroRole === 'WATCH' ? 'HR' : heroRole === 'NONE' ? null : heroRole
    if (!cat) return null
    const q = quoteFor(odds, p, cat)
    if (!q || !q.matches) return null
    const price = fmtOdds(q.over)
    return price === '—' ? null : price
  })()

  // Width follows the widest table on the tab. Pitch and Pitcher carry ten-plus
  // stat columns; Spray is a fixed-size chart and gets cramped, not helped, by
  // extra width.
  // Overview widened 480 → 580 (2026-08-06): the props hero earns the room —
  // six window tiles, a value chart and three filter rows were living in a
  // phone-width column on a desktop screen.
  const modalWidth = tab === 'overview' ? 580
    : tab === 'spray' ? 780
    : tab === 'pitcher' || tab === 'pitch' || tab === 'splits' || tab === 'ev' ? 1100
    : 900

  return (
    <>
    <Shell inline={inline} onClose={onClose} width={modalWidth}>

          {/* THE TOOLBAR, ON ITS OWN LINE (2026-08-23). These five controls
              plus the badge left about 90px for the hitter's NAME on a 430px
              phone, and the name has an ellipsis, so it collapsed to nothing —
              caught in the render, not in review. A toolbar is not part of the
              verdict; it goes above it, right-aligned, and the name gets the
              whole width of the line it deserves. */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>

            {/* the ✕ was a bare 22px glyph — about a 22px square to hit with a
                thumb on a modal that now covers the whole phone screen. The
                padding makes it a real target without moving it a pixel. */}
              {/* 🎴 his card as a PNG — the single-player twin of the
                  watchlist share card (2026-08-15). Bot fields only, so an
                  API-only player has no card to print. */}
              {!apiOnly && (
                <button onClick={() => downloadPlayerCard(p, { jersey })}
                  title="Download his card as a PNG for posting — the bot's call, his scores, the bat vs the arm, and his homer signature"
                  aria-label="Download player card as image"
                  style={{
                    background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2,
                    borderRadius: 7, padding: '3px 9px', fontSize: 12, lineHeight: 1,
                    cursor: 'pointer', minHeight: 26,
                  }}>📸</button>
              )}
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
                    cursor: 'pointer', minHeight: 26,
                  }}>⚖</button>
              )}
              {onNavigate && peers.length > 1 && (
                <Navigator peers={peers} cur={player} onNavigate={onNavigate} />
              )}
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
          <VerdictHero
            style={{ marginBottom: 12 }}
            col={heroCol}
            score={heroScore}
            title={<>
              {jersey != null && (
                <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT }}>#{jersey} </span>
              )}
              {nameOf(p)}
            </>}
            badge={apiOnly ? 'LIVE API' : heroRole === 'NONE' ? 'NO BADGE' : heroRole === 'WATCH' ? '👀 WATCH' : heroRole}
            badgeQuiet={apiOnly || heroRole === 'NONE' || heroRole === 'WATCH'}
            meta={apiOnly
              ? `${clean(p?.team, '—')}${p?.position ? ` · ${p.position}` : ''} · ${clean(p?.bats, '?')}HB · not on tonight's slate`
              : `${teamOf(p)} vs ${oppOf(p)} · #${clean(p?.lineup_spot, '?')} · ${clean(p?.handedness || p?.bats, '?')}HB${p?.pitcher_name ? ` · vs ${p.pitcher_name} (${clean(p?.pitcher_throws, '?')})${p?.pitcher_projected ? ' ≈' : ''}` : ''}`}
            metaRight={heroPrice}
            market={apiOnly ? 'live API only' : verdictFor(heroRole).market}
            line={apiOnly
              ? 'Found through the league-wide search, not on the bot slate — every panel here is pulled live, and none of it carries a model score.'
              : sentenceFor(p, heroRole)}
            chips={apiOnly ? null : chipsFor(p, heroRole)}
            right={!inline && (
              <button onClick={onClose} aria-label="Close" style={{
                background: 'transparent', border: 'none', color: C.text3, fontSize: 20,
                cursor: 'pointer', lineHeight: 1, padding: '2px 6px', margin: '0 -6px 0 0',
                flexShrink: 0,
              }}>✕</button>
            )}
          />

          {/* STAT-FIRST HEADER (2026-08-09). The card used to open on chips,
              then model scores. The two sites people call easier to read both
              open on the same thing: the raw numbers, colour-coded, and a
              recent-homer count. Both are here now, above everything — the
              model scores are still a scroll away in their own panel, where a
              verdict belongs. The homer boxes keep their denominators visible
              because L5/L10 count GAMES and season counts PLATE APPEARANCES;
              stacking those as bare percentages compares two different units. */}
          <SlashLine p={p} type={primaryType} style={{ marginBottom: 9 }} />
          <StatStrip p={p} type="hr" count={6} style={{ marginBottom: 8 }} />
          <HitRateBoxes p={p} style={{ marginBottom: 10, maxWidth: 320 }} />

          {/* Watchlist + slip. You could open a hitter from any board, decide
              he's worth playing, and then have to close the modal and find his
              card again to add him. Both actions live here now. */}
          {!apiOnly && (onAdd || onWatch) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              {onWatch && (
                <button
                  onClick={() => onWatch(p)}
                  title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                  style={{
                    padding: '4px 11px', fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                    fontFamily: NUM_FONT,
                    border: `1px solid ${watched ? C.orange : C.border}`,
                    background: watched ? 'rgba(249,115,22,.14)' : 'transparent',
                    color: watched ? C.orange : C.text3,
                  }}
                >{watched ? '★ On watchlist' : '☆ Watch'}</button>
              )}
              {onAdd && (
                <>
                  <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', marginLeft: 4 }}>
                    Add to slip
                  </span>
                  {BETS.map((b) => (
                    <button
                      key={b}
                      onClick={() => onAdd(p, b)}
                      title={`Add ${nameOf(p)} — ${b} — to the slip`}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                        fontFamily: NUM_FONT, border: `1px solid ${C.border}`,
                        background: 'transparent', color: C.text2,
                      }}
                    >+ {b}</button>
                  ))}
                  <span style={{ fontSize: 9, color: C.text3 }}>
                    {/* "pick: Avoid for HR" is not a pick — a Skip HR reads as
                        the pass it is (flow-and-clean pass, 2026-08-15). */}
                    bot&apos;s pick: <b style={{ color: C.text2 }}>{/skip/i.test(role) ? 'pass tonight' : bestBet(p, 'hr')}</b>
                  </span>
                </>
              )}
            </div>
          )}

          {/* chips — model opinions, so they don't exist for API-only players.
              COHERENCE FIX (2026-08-15, part of the "flow and clean" pass):
              these used to grade every hitter on HR, which put "Grade A+" and
              "Avoid for HR" side by side on a Skip HR player. The grade and
              bet chips now follow HIS market, same mapping The Read uses —
              and a Skip HR wears no grade at all, because grading a market
              the bot said to skip is decoration. */}
          {!apiOnly && (() => {
            const skipHr = /skip/i.test(role)
            const roleType = /hit/i.test(role) && !skipHr ? 'hit'
              : /hrr/i.test(role) ? 'hrr'
              : /(tb|contact)/i.test(role) ? 'tb'
              : 'hr'
            const roleBet = bestBet(p, roleType)
            return (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <Chip color={rc}>{role}</Chip>
                {!skipHr && roleBet && roleBet !== role && <Chip color={C.text2}>{roleBet}</Chip>}
                {!skipHr && <Chip color={C.text2}>Grade {gradeFor(p, roleType)}</Chip>}
                {hasMatchupEdge && <Chip color={C.orange}>🎯 Matchup Edge</Chip>}
                {pills.map((x, i) => <Chip key={i} color={x.color}>{x.label}</Chip>)}
              </div>
            )
          })()}

          {/* tab bar + range toggle */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10,
            flexWrap: 'wrap',
          }}>
            {/* chip-row: on a phone six tab pills wrap to three lines and push
                the panel below the fold before you've read anything. Same
                sideways-scrolling treatment the board category chips get. */}
            <div className="chip-row" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {visibleTabs.map(t => (
                <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabBtn>
              ))}
            </div>
            {/* The old fixed BBE range toggle lived here and forced EV Log into
                batted-ball mode, hiding its own Games / Batted-balls control.
                EV Log owns its window now — one control, in the panel it
                belongs to. */}
            {tab !== 'overview' && detailState === 'loading' && (
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>Loading detail…</span>
            )}
            {!apiOnly && tab !== 'overview' && (detailState === 'missing' || detailState === 'error') && (
              <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT }}>
                No detail file published for this hitter
              </span>
            )}
          </div>

          {/* overview */}
          {tab === 'overview' && (
            <>
              {/* FLOW PASS (2026-08-15, Donovan: "the overview on the player
                  modal as well — make it flow and clean"). The tab now reads
                  top to bottom as one argument: the read (the story, in
                  sentences) → the record (props matrix) → the case against
                  (cold case) → the numbers (evidence appendix). Nothing was
                  removed; the wall of rows just stopped going first.

                  AMENDED 2026-08-16 (Donovan: "i need hr shape moved up on the
                  player modal"). His homer shape used to be the last thing on
                  the tab, below the numbers — the order above ended "→ his
                  shape" and that clause is now wrong, so it's gone. The order
                  is: the read → HIS SHAPE (who this hitter is) → the record →
                  the case against → the numbers. Shape is a characterisation,
                  not evidence, so it rides with the story; see the note where
                  it used to live, further down this tab. */}
              {!apiOnly && <PlayerRead p={p} odds={odds} />}
              {/* 💥 Two things that are easy to get wrong here, both checked:
                  (1) the prop is `p`, the slate row MERGED with the detail
                  file — batted_ball_log only exists in the detail file, so
                  handing this the bare `player` row would render nothing for
                  every hitter, silently and forever; (2) it is deliberately
                  NOT wrapped in `!apiOnly`, matching where it sat before. An
                  off-slate hitter has no bot log and the component's own guard
                  returns null for him, so the gate would be decoration today —
                  and a lie the day EV Log's live-Statcast fallback grows into
                  a log this panel could read. */}
              <HomerShape player={p} />
              <ThresholdGrid playerId={pid} odds={odds} />
              {/* 🍩 The other half of the read. Everything above this argues
                  for him; this is the only panel that argues against. */}
              <ColdCase playerId={pid} player={player} />
              {apiOnly && (
                <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '4px 0 12px', borderLeft: `2px solid ${C.orange}`, paddingLeft: 10 }}>
                  He&apos;s not in tonight&apos;s bot run, so there are no model scores or batted-ball
                  detail here — but the props record above, the Splits tab (situational, live), and
                  the EV Log&apos;s strike-zone map all pull straight from the league API and work
                  for any player in baseball.
                </div>
              )}
              {!apiOnly && (
              <div style={{ marginTop: 13, paddingTop: 11, borderTop: `1px dashed ${C.border2}`, marginBottom: 14 }}>
              {/* Same anchored-section shape as the cold case, so the page
                  reads as chapters instead of one unbroken wall. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 900 }}>🔢 The numbers</span>
                <span style={{ fontSize: 9, color: C.text3 }}>the evidence behind the read — hover any label for what it means</span>
              </div>
              {/* auto-fit so the two columns become one on a phone instead of
                  squeezing every value row into ellipsis territory */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '0 24px' }}>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Model Scores</div>
                  <Row label="HR Score"  value={hrScore(p).toFixed(1)} />
                  <Row label="HRR Score" value={prodScore(p).toFixed(1)} />
                  <Row label="Hit Score" value={hitScore(p).toFixed(1)} />
                  <Row label="TB Score"  value={tbScore(p).toFixed(1)} />
                  <Row label="Pitch Mix" value={pitchMixScore(p).toFixed(1)} />
                  <VenueHrRow pid={pid} venueName={clean(p?.venue_name, '')} gamePk={p?.game_pk} />
                  <OppDefenseRow opp={clean(p?.opponent || p?.opp, '')} />
                  <PullWallRow bats={clean(p?.bats || p?.handedness, '')} venueName={clean(p?.venue_name, '')} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Batted Ball</div>
                  <Row label="Avg EV"       value={avgEV(p) ? avgEV(p).toFixed(1) + ' mph' : '—'} />
                  <Row label="Max EV"       value={maxEV(p) ? maxEV(p).toFixed(1) + ' mph' : '—'} />
                  <Row label="Barrel %"     value={pct(barrelRate(p))} />
                  <Row label="Hard Hit %"   value={pct(hardHitRate(p))} />
                  <Row label="Launch Angle" value={launchAngle(p) ? launchAngle(p).toFixed(1) + '°' : '—'} />
                  {/* 🌀 WHIFF (2026-08-09, from the Discord: "missing the whiff
                      on the stats for players in the modal"). The bot publishes
                      no overall batter whiff rate — only per-pitch-type rates,
                      in the detail file. whiffProfile() reconstructs the total
                      from those published counts by exact arithmetic; see the
                      note in lib/player.js for the identity and its one
                      caveat. When there is no per-pitch profile to rebuild it
                      from, the row says so instead of showing a fabricated
                      number or quietly disappearing. */}
                  {(() => {
                    const w = whiffProfile(p)
                    if (!w) {
                      return (
                        <Row
                          label="Whiff %"
                          value="not published"
                          mono={false}
                          explain="How often he swings and misses. The bot hasn't published this hitter's pitch-by-pitch swing data yet, and we won't guess at it."
                        />
                      )
                    }
                    const tip = `Rebuilt from his published per-pitch-type rates across ${w.types} pitch types: `
                      + `about ${w.swings} swings out of ${w.pitches} pitches seen. `
                      + `Whiff% is misses per SWING; SwStr% is misses per PITCH. `
                      + `League-average whiff is roughly 24% — under 20% is a contact hitter, over 30% is swing-and-miss. `
                      + `A pitch type he has never missed can't have its swings recovered and is left out of the totals, `
                      + `which nudges this a hair high for such a hitter.`
                    return (
                      <>
                        <Row label="Whiff %" title={tip}
                          value={`${(w.whiff * 100).toFixed(1)}%`} />
                        <Row label="SwStr %" title={tip}
                          value={`${(w.swstr * 100).toFixed(1)}%`} />
                      </>
                    )
                  })()}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Recent Distance</div>
                  <Row label="350+ count" value={recent350(p)} />
                  <Row label="375+ count" value={recent375(p)} />
                  <Row label="400+ count" value={recent400(p)} />
                  <Row label="Ideal HR %" value={ihrVal(p) ? (ihrVal(p) * 100).toFixed(1) + '%' : '—'} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Season</div>
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
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Splits</div>
                  {avgVsRHP(p) > 0 && <Row label="vs RHP" value={avgVsRHP(p).toFixed(3)} />}
                  {avgVsLHP(p) > 0 && <Row label="vs LHP" value={avgVsLHP(p).toFixed(3)} />}
                  <Row label="L5 Hits" value={n(p?.last5_hits, 0)} />
                  <Row label="L5 HR"   value={n(p?.last5_hr, 0)} />
                  <Row label="L5 XBH"  value={n(p?.last5_xbh, 0)} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '10px 0 4px' }}>Opposing Pitcher</div>
                  <Row label="Name"   value={clean(p?.pitcher_name, '—')} mono={false} />
                  <Row label="Throws" value={clean(p?.pitcher_throws, '—')} />
                  <Row label="HR/9"   value={sc(p?.pitcher_hr9)} />
                  <Row label="BB/9"   value={sc(p?.pitcher_bb9)}
                    explain="Walks this pitcher allows per nine innings, season-long — not specific to tonight's matchup. Higher is better for the hitter." />
                  <Row label="WHIP"   value={sc(p?.pitcher_whip)} />
                  <Row label="BB%"    value={pct(p?.pitcher_bb_pct)}
                    explain="His walk rate against every batter he's faced this season — not specific to tonight's matchup." />
                  {weakSide && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
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
              {/* ── 💥 HIS HOMER SHAPE USED TO END THE TAB, RIGHT HERE ────
                  MOVED UP 2026-08-16 (Donovan: "i need hr shape moved up on
                  the player modal"). It shipped on 2026-08-14 as an inline
                  IIFE at this spot — the last thing on the Overview, below the
                  whole two-column "🔢 The numbers" wall, about 1,900px down
                  the 580px-wide modal on the fixture slate. Three screens past
                  the fold on a phone. Nobody scrolled that far, so a panel he
                  had specifically asked for was, in practice, not shipped.

                  It now renders immediately after <PlayerRead />, at the top
                  of this tab, from components/HomerShape.js — moved verbatim,
                  every fact and guard intact, not restyled. The reasoning, in
                  one line: everything above this comment is EVIDENCE (rates,
                  counts, the arm's HR/9), and his homer shape is not evidence,
                  it is a CHARACTERISATION of the hitter — same job The Read
                  does, so it belongs beside The Read.

                  PLEASE DO NOT RE-BURY IT. If this tab ever needs shortening,
                  the thing to cut or collapse is the appendix above, not the
                  one paragraph that says who he is. */}
              {/* The bot's note used to sit here, orphaned at the very bottom
                  of the tab — it rides in The Read now (💬), where a sentence
                  belongs. */}
              {/* Your own words, this device only — the read you had on him
                  three days ago that no stat column remembers. */}
              <PlayerNotes playerId={pid} />
            </>
          )}

          {/* ev log — `p` is the merged slate row + detail file */}
          {tab === 'ev' && (
            detailState === 'loading'
              ? <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading batted balls…</div>
              : <EVLog player={p} />
          )}

          {/* the arm he's facing */}
          {tab === 'pitcher' && <MatchupPitcher player={p} slateMode={slateMode} />}

          {/* what this batter does to each pitch type */}
          {tab === 'pitch' && (
            detailState === 'loading'
              ? <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading pitch profile…</div>
              : (
                <>
                  <PitchBreakdown player={p} />
                  {/* Which pitches he actually homers off, against tonight's
                      mix. The one panel that crosses batter and pitcher, so it
                      belongs under the batter's pitch table rather than in a
                      third place. */}
                  <HRPitchProfile player={p} slateMode={slateMode} />
                </>
              )
          )}

          {/* where he puts the ball */}
          {tab === 'spray' && <SprayField player={p} height={340} slateMode={slateMode} />}

          {/* day/night, home/away, day of week, win/loss — bot-published, plus
              the situational block pulled live from the MLB StatsAPI: RISP,
              ahead-in-count, two-strike, home/away ISO. Those four aren't in
              any bot file, which is why this is the one place the site goes to
              an outside source. Context only — none of it moves a score. */}
          {tab === 'splits' && (
            <>
              {/* The head-to-head leads the tab — it's the split everyone
                  asks for first, so it goes first, wearing its sample-size
                  caveat instead of hiding. */}
              <BvP batterId={pid} pitcherId={p?.pitcher_id} pitcherName={p?.pitcher_name} player={p} />
              {!apiOnly && <PlayerSplits player={p} slateMode={slateMode} />}
              <SituationalSplits playerId={pid} kind="batter" />
            </>
          )}

    </Shell>
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
