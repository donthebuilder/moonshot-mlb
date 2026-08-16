'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  recent375, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore, playerId, mlbId,
} from '../../lib/player'
import { tierRole, shortRole, isAligned, hrRank } from '../../lib/scoring'
import { PanelTitle, Empty, btnStyle } from '../ui'
import DenseTable from '../DenseTable'
import { kRiskScore } from '../../lib/scoring_additions'
import BotPicksStrip from '../BotPicksStrip'
import StartHere from '../StartHere'
import SlatePulse from '../SlatePulse'
import HomerLedger from '../HomerLedger'
import LiveWire from '../LiveWire'
import NearMisses from '../NearMisses'
import { groupPitchers } from '../../lib/data'
import { airParts, airVerdict } from '../../lib/conditions'

// Scoreboard — every hitter on the slate, every column, sortable.
//
// This page was already a sortable table; what it lacked was colour. At 15+
// numeric columns an uncoloured grid gets read one cell at a time, which is
// the opposite of what a scoreboard is for. It now shares DenseTable with
// Games and the boards, so sorting, the ramp and the row-click behave
// identically everywhere instead of three tables each doing it their own way.
//
// The bespoke table this replaces carried its own comparator with a
// null-handling fix in it. DenseTable covers the same case: non-numeric values
// fall through to a string compare, and a missing lineup spot renders as '—'
// rather than a sentinel number.
//
// ── FLOW PASS (2026-08-16, Donovan: pages "all over the palace or scrroll up
// to scoll back down") ───────────────────────────────────────────────────────
//
// Two things were wrong with the running order, and neither was a missing
// panel — everything on this page earns its place, it was arranged badly.
//
//   1. THE HOMER SECTIONS WERE SPLIT. Pre-game the order ran picks → near
//      misses → wire → LEDGER → pulse → GONE YARD → weak spots, so the two
//      panels about tonight's home runs — who has hit one (Gone yard) and what
//      number it was for him and from which lineup spot (the Ledger) — had
//      two unrelated sections wedged between them. Reading one meant scrolling
//      past the other and back. They are one subject and they now sit as one
//      block, with Near misses (the homers that almost happened) beside them.
//
//   2. REFERENCE MATERIAL FLOATED ABOVE THE THING IT EXPLAINS. Weak spots is
//      the roster behind the board's ★ column; it was stranded mid-page in one
//      order and above the orientation panel in the other. It is now the last
//      thing before the 266-row board in both orders — fold it open and the
//      column it explains is right there.
//
// The page also opens on a stated line instead of a symbol code. The header
// sub used to read "266 batters · ★12 weak spot · ◆9 aligned · ▲41 matchup
// edge", which is only legible if you already know all three glyphs; the same
// counts are now a sentence that says what each mark means, plus how tonight's
// air is playing (lib/conditions, not a fifth private chip strip) and how many
// balls have already left the yard. Every count is printed with its
// denominator — k of n — because that is the only honest form for a frequency.

const matchupEdge = (p) => {
  const weak = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weak || !bats) return 0
  return (weak === 'LHB' && bats === 'L') || (weak === 'RHB' && bats === 'R') ? 1 : 0
}

const buildColumns = (onWatch) => [
  { key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
  { key: 'name',    label: 'Player', heat: false, w: 168, bold: true, sticky: true },
  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
  { key: 'opp',     label: 'Opp',    heat: false, w: 34, mono: true, dim: true },
  { key: 'role',    label: 'Role',   heat: false, w: 76, dim: true },
  { key: 'spot',    label: 'Spot',   heat: false, w: 40, mono: true, dim: true,
    fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'weak',    label: '★',      flag: true, mark: '★', w: 32 },
  { key: 'aligned', label: '◆',      flag: true, mark: '◆', w: 32 },
  { key: 'edge',    label: '▲',      flag: true, mark: '▲', w: 32 },
  { key: 'hr',      label: 'HR',     w: 44, dp: 1 },
  { key: 'dmg',     label: 'Damage', w: 50, dp: 1 },
  { key: 'pmatch',  label: 'PMatch', w: 50, dp: 1 },
  { key: 'hrr',     label: 'HRR',    w: 44, dp: 1 },
  { key: 'hit',     label: 'Hit',    w: 44, dp: 1 },
  { key: 'tb',      label: 'TB',     w: 44, dp: 1 },
  { key: 'hrw',     label: 'HRW',    w: 44, dp: 1 },
  { key: 'due',     label: 'Due',    w: 44, dp: 1 },
  { key: 'longest', label: 'Long',   w: 44, dp: 1 },
  { key: 'pmix',    label: 'PMix',   w: 44, dp: 1 },
  { key: 'd375',    label: '375+',   w: 42 },
  { key: 'p375',    label: 'P375 ag', w: 50,
    title: 'Balls of 375ft+ this pitcher has allowed' },
  { key: 'p400',    label: 'P400 ag', w: 50,
    title: 'Balls of 400ft+ this pitcher has allowed' },
  { key: 'ihr',     label: 'IHR',    w: 46, dp: 3 },
  // A high strikeout rate is bad for the hitter, so this column runs the other
  // way. Left alone, the most strikeout-prone bats on the slate glow brightest.
  { key: 'k',       label: 'K%',     w: 42, dp: 1, invert: true },
  { key: 'kRisk',  label: 'K risk', w: 50, dp: 0, invert: true,
    title: 'Strikeout risk: hitter K% 40%, pitcher K% 25%, SwStr 20%, putaway 15%. Inverted — low is good for the bat. Composite, not a bot field, and not calibrated: the graded archive has no strikeout outcome to check it against.' },
  { key: 'hr9',     label: 'P HR/9', w: 46, dp: 2 },
  // PARK (2026-08-09). The one piece of tonight's context this table never
  // carried. The Park board ranks buildings and every board on the site talks
  // about carry, but the sheet with all 268 hitters on it had no way to ask
  // "who's in a launch pad tonight" — you had to read the park board, memorise
  // the venues, then come back and scan by opponent. It's park_hr_factor, the
  // same field the park board ranks on, already stamped on every slate row.
  { key: 'park',    label: 'Park',   w: 46, dp: 2,
    fmt: (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `×${Number(v).toFixed(2)}`),
    title: "The bot's park HR factor for tonight's building. 1.00 is neutral, ×1.10 means the park adds about 10% of home-run rate. Bright is hitter-friendly, same as every other column. Park only — the weather adjustment lives on the Park board, not in this number. A dash means no factor was published for that game." },
]

// Two trackers above the grid, ported from Streamlit. Both answer questions
// the 268-row table can't: who has ALREADY gone deep tonight, and which arms
// have soft spots the lineup can reach. Neither is derivable by sorting.
// `answers` is not optional in practice — the 2026-08-09 spoon-feed pass:
// every panel says in one plain sentence what decision it helps with, and it
// has to sit inside the panel rather than in the fold label, because in live
// mode these render open with no label at all.
function Tracker({ title, count, children, note, answers }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: answers ? 2 : 6 }}>
        {title} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontWeight: 600 }}>({count})</span>
      </div>
      {answers && (
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.55, marginBottom: 7 }}>
          <b style={{ color: C.text2 }}>What this answers:</b> {answers}
        </div>
      )}
      {children}
      {note && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5 }}>{note}</div>}
    </div>
  )
}

export default function Scoreboard({ players, mode = 'today', slateDate = '', results, backtest, onWatch, watchIds, onPlayerClick, onNavigate, odds = null }) {
  const [alignedOnly, setAlignedOnly] = useState(false)

  const alignedCount = useMemo(() => players.filter(isAligned).length, [players])

  const rows = useMemo(() => {
    const pool = alignedOnly ? players.filter(isAligned) : players
    return pool.map((p, i) => ({
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      role: shortRole(p),
      spot: p?.lineup_spot == null || p?.lineup_spot === '' ? null : n(p.lineup_spot, null),
      weak: p?.weak_spot_flag ? 1 : 0,
      aligned: isAligned(p) ? 1 : 0,
      edge: matchupEdge(p),
      hr: hrScore(p),
      dmg: n(p?.damage_conversion_score, 0),
      pmatch: n(p?.pitch_type_match_score, 0),
      hrr: prodScore(p),
      hit: hitScore(p),
      tb: tbScore(p),
      hrw: n(p?.hrw_score, 0),
      due: n(p?.hr_due_score, 0),
      longest: n(p?.longest_hr_score, 0),
      pmix: pitchMixScore(p),
      d375: recent375(p),
      p375: n(p?.pitcher_375_allowed, 0),
      p400: n(p?.pitcher_400_allowed, 0),
      ihr: ihrVal(p),
      k: n(p?.season_k_rate, 0) * 100,
      hr9: n(p?.pitcher_hr9, 0),
      // null rather than 0 when the field is absent — a park factor of zero
      // isn't a thing, and a 0.00 in this column would read as "worst park on
      // the slate" instead of "not published".
      park: n(p?.park_hr_factor, 0) > 0 ? n(p?.park_hr_factor, 0) : null,
      kRisk: kRiskScore(p),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    }))
  }, [players, alignedOnly, watchIds])

  // Who has already homered tonight, matched back to where the board had him.
  // The board rank is the point: a scoreboard that only lists the homers tells
  // you nothing about whether the model saw them coming.
  const goneYard = useMemo(() => {
    const homers = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    // 🔒 THE rank, not a local one (2026-08-11). hrRank in lib/scoring.js is
    // the single source of the HR ordering — the HR board shows these same
    // numbers, so a hitter is #4 here and #4 there and nowhere else. Enforced
    // by scripts/check-rank-lock.mjs; do not reintroduce a local sort.
    const rankOf = hrRank(players)
    // JOIN BY ID, NOT BY NAME. The id is on these entries — the _key below
    // already used it — and this joined on a letters-only squash of the name
    // instead. MLB carries same-named hitters, and findIndex on a list sorted
    // by HR score returns whichever of them scores higher, so the homer got
    // the wrong man's board rank, HR score and tier role. Any name the two
    // sources spell differently (accents, a suffix) silently rendered no rank
    // at all. tabs/Derby.js joins the identical array by player_id already.
    const byId = new Map(players.map((p) => [mlbId(p), p]).filter(([k2]) => k2))
    return homers.map((h, i) => {
      const p = byId.get(Number(h?.player_id)) || null
      return {
        _key: `${h?.player_id ?? h?.name}-${i}`,
        _raw: p,
        rank: p ? rankOf.get(mlbId(p)) ?? null : null,
        name: clean(h?.name, '—'),
        team: clean(h?.team, ''),
        // n(h?.hr, 1) invented "1 HR" whenever the field was absent, under a
        // column captioned "how many home runs he has already hit tonight".
        // A missing count is unknown, and reads as one.
        hr: Number.isFinite(Number(h?.hr)) ? Number(h.hr) : null,
        score: p ? hrScore(p) : 0,
        role: p ? tierRole(p) : '—',
      }
    })
  }, [results, players])

  // Every starter with at least one weak lineup slot the opposing order fills.
  const weakSpots = useMemo(() => {
    return groupPitchers(players)
      .map((e, i) => {
        const hit = (e.lineup || []).filter((b) => b.weak_spot_flag)
        if (!hit.length) return null
        return {
          _key: e.pitcher_id ?? e.pitcher_name ?? i,
          pitcher: clean(e.pitcher_name, 'Unknown'),
          hr9: n(e.pitcher_hr9, 0),
          spots: hit.map((b) => b.lineup_spot).filter((x) => x != null).join(', '),
          hitters: hit.map((b) => b.name).join(', '),
          damage: Math.max(...hit.map((b) => n(b.raw?.pitcher_spot_damage_score, 0)), 0),
        }
      })
      .filter(Boolean)
  }, [players])

  // ── how the air is playing, one game per game_pk (2026-08-16) ────────────
  // The Park column at the far right of the board carries the factor per
  // hitter, and the ranked ladder with weather lives on Power — but the page
  // opened with no statement of whether tonight is a carrying slate at all.
  // airVerdict only speaks when temp, wind direction and park agree strongly
  // enough to claim something, and returns '' otherwise, so a neutral night
  // counts as neither. Counted, never averaged: k of n, with n stated.
  const airRead = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const pk = p?.game_pk ?? `${teamOf(p)}-${oppOf(p)}`
      if (!seen.has(pk)) seen.set(pk, p)
    })
    const rows2 = [...seen.values()]
    const carrying = rows2.filter((p) => airVerdict(p) === 'carrying')
    const dead = rows2.filter((p) => airVerdict(p) === 'dead')
    return { games: rows2.length, carrying, dead }
  }, [players])

  if (!players.length) return <Empty text="No players yet." />

  const lit = (k) => rows.filter((r) => r[k]).length

  // ── SECTION ORDER (2026-08-08 rearrange): live first when live ──────────
  // Pre-game the page reads top-down as a plan: how to read it → the picks →
  // the pulse. Once games are live it reads as a broadcast: the wire and
  // who's gone yard jump to the top, and the orientation panels step back.
  // Heavy panels (storylines, weak spots, and gone-yard pre-live) collapse
  // by default so the first screen is calm — everything is one click deep,
  // nothing is gone.
  const liveNow = results?.live_mode === true

  const Fold = ({ label, open = false, children }) => (
    <details open={open} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 10 }}>
      <summary style={{ padding: '8px 13px', fontSize: 11, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>{label}</summary>
      <div style={{ padding: '2px 12px 10px' }}>{children}</div>
    </details>
  )

  const secStart = <StartHere key="start" onNavigate={onNavigate} />
  const secWire = <LiveWire key="wire" players={players} mode={mode} results={results} watchIds={watchIds} odds={odds} onPlayerClick={onPlayerClick} />
  const secPulse = <SlatePulse key="pulse" players={players} slateDate={slateDate} backtest={backtest} onPlayerClick={onPlayerClick} />
  const secPicks = <BotPicksStrip key="picks" players={players} onPlayerClick={onPlayerClick} />
  // 🧱 NEAR MISSES replaced Storylines AND the slate-strength fold here
  // (2026-08-15, Donovan, this page only: "take storylines off and put near
  // misses from players who haven't gone yard in 2+ games, and statcast
  // when... the tonight's board one you can just remove"). Storylines still
  // lives on Home and in every game's deep dive; SlateStrength still renders
  // inside Boards. This page is the one you watch between innings, and the
  // between-innings question is who's been hitting homers without getting
  // one — that's the drought most likely to end tonight.
  const secNear = (
    <Fold key="near" label="🧱 Near misses — homer contact, no homer, 2+ games" open>
      <NearMisses players={players} onPlayerClick={onPlayerClick} />
    </Fold>
  )
  // 🧾 the ledger builds through the night — lives with the live layer.
  // 2026-08-13: passes `results` now instead of HomerLedger fetching its own
  // copy of the identical payload — see the note in HomerLedger.js.
  const secLedger = <HomerLedger key="ledger" players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} />
  const goneTable = goneYard.length > 0 && (
    <Tracker
      title="💥 Gone yard"
      count={goneYard.length}
      answers="is the model seeing tonight coming? Every homer already hit, next to where this board had that hitter ranked."
      note={`${goneYard.filter((r) => r.rank && r.rank <= 15).length} of ${goneYard.length} came from the top 15 of the board.`}
    >
      <DenseTable
        rows={goneYard}
        columns={[
          { key: 'rank', label: 'Board', heat: false, w: 46, mono: true, dim: true,
            fmt: (v) => (v == null ? '—' : `#${v}`) },
          { key: 'name', label: 'Player', heat: false, w: 132, bold: true },
          { key: 'team', label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
          // explicit: here "HR" is homers hit TONIGHT, not the HR score the
          // glossary would otherwise attach to that label
          { key: 'hr',   label: 'HR',     w: 34,
            explain: 'How many home runs he has already hit tonight.' },
          { key: 'score', label: 'HR score', w: 54, dp: 1 },
          { key: 'role', label: 'Role',   heat: false, w: 78, dim: true },
        ]}
        onRowClick={onPlayerClick}
        initialSort="score"
        maxHeight={260}
        caption=""
      />
    </Tracker>
  )
  // Live: who's gone yard is the news — it renders open, right under the
  // wire. Pre-live (or an empty list) it stays out of the way.
  const secGone = goneYard.length > 0 && (
    liveNow
      ? <div key="gone" style={{ marginBottom: 14 }}>{goneTable}</div>
      : <Fold key="gone" label={`💥 Gone yard (${goneYard.length}) — tonight's homers vs where the board had them`}>{goneTable}</Fold>
  )
  const secWeak = weakSpots.length > 0 && (
    <Fold key="weak" label={`★ Weak spots (${weakSpots.length}) — the arms with reachable soft spots tonight`}>
      <Tracker
        title="★ Weak spots"
        count={weakSpots.length}
        answers="which starters have a soft lineup slot tonight, and which hitters are standing in it."
        note="Damage is how hard that pitcher gets hit in those spots. Sorted hardest first."
      >
        <DenseTable
          rows={weakSpots}
          columns={[
            { key: 'pitcher', label: 'Pitcher', heat: false, w: 126, bold: true },
            { key: 'hr9',     label: 'HR/9',    w: 44, dp: 2 },
            { key: 'spots',   label: 'Spots',   heat: false, w: 54, mono: true, dim: true },
            { key: 'hitters', label: 'Hitters', heat: false, w: 190, dim: true },
            { key: 'damage',  label: 'Damage',  w: 52, dp: 1 },
          ]}
          initialSort="damage"
          maxHeight={260}
          caption=""
        />
      </Tracker>
    </Fold>
  )

  // ── RUNNING ORDER (2026-08-16 flow pass; see the note above the imports) ──
  //
  // Live — the page is a broadcast, and the lead is what just happened:
  //   wire → THE HOMER BLOCK (gone yard, the ledger, the near misses that
  //   nearly joined them) → how to read this → the picks → the picks' own
  //   clock and what changed since yesterday → weak spots → the board.
  //
  // Pre-game — the page is a plan, and the lead is THE FOUR:
  //   how to read this → THE FOUR → the picks' clock + yesterday's diff →
  //   near misses → the wire (renders nothing until something is live) →
  //   the homer block → weak spots → the board.
  //
  // Two rules drive both: panels read together sit together (gone yard beside
  // the ledger; the pick strip beside the unconfirmed countdown that is about
  // those same picks), and reference sits below what it supports (weak spots
  // immediately above the board whose ★ column it lists).
  //
  // StartHere sits directly above the pick strip in BOTH orders now. It used
  // to be last in live mode, where its own first step — "The Four, right
  // below" — pointed at the bottom of the page. It is self-dismissing and
  // collapses to a single "?" chip once you've read it, so it costs a
  // returning visitor one line.
  const order = liveNow
    ? [secWire, secGone, secLedger, secNear, secStart, secPicks, secPulse, secWeak]
    : [secStart, secPicks, secPulse, secNear, secWire, secGone, secLedger, secWeak]

  return (
    <div>
      <PanelTitle
        title="Scoreboard"
        sub={`${rows.length} batters on the board${alignedOnly ? ' (aligned only — the filter is on)' : ''}${liveNow ? ' · live — the wire and tonight’s homers lead' : ''}`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {alignedCount > 0 && (
              <button
                onClick={() => setAlignedOnly((v) => !v)}
                title="Weak-spot + pitch-match + real recent contact quality all stacking together"
                style={btnStyle(C.purple, alignedOnly)}
              >
                ◆ Aligned only ({alignedCount})
              </button>
            )}
            {/* The Park column below gives you the raw factor per hitter; the
                ranked board with weather, wind, rain and first pitch lives on
                Power. A link, not a second copy of the board — this page
                already carries seven panels. */}
            {onNavigate && (
              <button
                onClick={() => onNavigate('longest')}
                title="Tonight's parks ranked — park factor plus weather, wind, rain risk and first pitch, on the Power tab"
                style={btnStyle(C.orange, false)}
              >
                🏟 Parks ranked →
              </button>
            )}
          </div>
        }
      />

      {/* ── THE SLATE, STATED (2026-08-16) ──────────────────────────────────
          What stood here was the header's own sub-line: "266 batters · ★12
          weak spot · ◆9 aligned · ▲41 matchup edge". Four counts in a glyph
          code you have to already know, above a page that then opened on a
          four-tile orientation strip. Same four counts, plus the two facts the
          page never stated out loud — how the air is playing tonight, and how
          many balls have already gone — as one sentence that names each mark
          as it uses it. Every mark still has its own column on the board
          below, and each count keeps its denominator. */}
      <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.7, margin: '0 0 12px', maxWidth: 760 }}>
        <b style={{ color: C.text, fontFamily: NUM_FONT }}>{rows.length}</b> hitters
        {alignedOnly ? ' pass the ◆ aligned filter' : ' are on tonight’s board'}, across{' '}
        <b style={{ color: C.text, fontFamily: NUM_FONT }}>{airRead.games}</b> games.{' '}
        <span title="Weak spot: this pitcher has been hurt by the lineup slot this hitter is standing in. The validated flag — 18.0% vs 13.9% — and its own ★ column on the board.">
          <b style={{ color: C.text, fontFamily: NUM_FONT }}>{lit('weak')}</b> of them stand in a
          ★ weak lineup spot against tonight&apos;s arm
        </span>,{' '}
        <span title="Aligned: weak spot, pitch-type match and real recent contact quality all stacking on the same hitter. Its own ◆ column, and the filter button above.">
          <b style={{ color: C.purple, fontFamily: NUM_FONT }}>{lit('aligned')}</b> are ◆ aligned
        </span>{' '}and{' '}
        <span title="Matchup edge: the hitter bats from the side this pitcher is weakest against. Its own ▲ column on the board.">
          <b style={{ color: C.text, fontFamily: NUM_FONT }}>{lit('edge')}</b> hold the ▲ handedness edge
        </span>.{' '}
        {/* The air, spoken by lib/conditions. Silent when no game is strong
            enough either way — a neutral slate is a finding, not a gap. */}
        {(airRead.carrying.length > 0 || airRead.dead.length > 0) && (
          <>
            {airRead.carrying.length > 0 && (
              <>The air is carrying in{' '}
                <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{airRead.carrying.length} of {airRead.games}</b>{' '}
                games —{' '}
                {airRead.carrying.slice(0, 2).map((p, i) => (
                  <span key={i} title={airParts(p).map((x) => `${x.text} — ${x.title}`).join('\n')} style={{ cursor: 'help' }}>
                    {i > 0 && '; '}
                    <b style={{ color: C.text }}>{clean(p?.venue_name, `${teamOf(p)} vs ${oppOf(p)}`)}</b>
                    {airParts(p).length > 0 && <span style={{ color: C.text3 }}> ({airParts(p).map((x) => x.text).join(', ')})</span>}
                  </span>
                ))}
                {airRead.carrying.length > 2 && <span style={{ color: C.text3 }}> and {airRead.carrying.length - 2} more</span>}
                {airRead.dead.length > 0 ? ', and ' : '. '}
              </>
            )}
            {airRead.dead.length > 0 && (
              <>{airRead.carrying.length > 0 ? 'playing dead in ' : 'The air is playing dead in '}
                <b style={{ color: C.blue, fontFamily: NUM_FONT }}>{airRead.dead.length} of {airRead.games}</b>
                {airRead.carrying.length > 0 ? '. ' : ' games. '}
              </>
            )}
          </>
        )}
        {goneYard.length > 0 && (
          <>
            <b style={{ color: C.green, fontFamily: NUM_FONT }}>{goneYard.length}</b> ball
            {goneYard.length === 1 ? ' has' : 's have'} already left the yard tonight, and{' '}
            <b style={{ color: C.green, fontFamily: NUM_FONT }}>
              {goneYard.filter((r) => r.rank && r.rank <= 15).length} of {goneYard.length}
            </b>{' '}
            came from the top 15 of this board — Gone yard has the full list against its ranks.{' '}
          </>
        )}
        <span style={{ color: C.text3 }}>
          {liveNow
            ? 'Live: the wire and tonight’s homers lead, the picks and the plan sit under them.'
            : 'The Four — the bot’s headline pick per category, three deep — leads below; the full board is at the foot of the page.'}
        </span>
      </div>

      {order}

      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, margin: '4px 0 8px', maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> who to look at first tonight. It&apos;s
        every hitter on the slate, sorted by home-run score — <b style={{ color: C.text2 }}>you can
        use the order without reading a single column</b>. Sort by any other header to ask a
        different question (Hit for contact plays, Park for launch pads, K risk for the ones likely
        to strike out), and click any row to open that hitter.{' '}
        <b style={{ color: C.text2 }}>Don&apos;t know what a column means? Tap the ⓘ next to its
        name</b> — it says so in plain English, no baseball background needed.
      </div>

      <DenseTable
        rows={rows}
        columns={buildColumns(onWatch)}
        onRowClick={onPlayerClick}
        initialSort="hr"
        maxHeight={640}
        caption="Every numeric column coloured against its own range. K% is inverted — a high strikeout rate is bad for the hitter, so it reads dark. Park is tonight's park HR factor (1.00 neutral), so sorting by it pulls every hitter in a launch pad to the top; it's the park term only, with no weather in it. Click a header to sort, a row to open the hitter."
      />
    </div>
  )
}
