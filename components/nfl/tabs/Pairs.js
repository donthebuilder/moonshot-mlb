'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'
import DenseTable from '../../DenseTable'

// 🤝 PAIRS — two props from the same slate, sold as one. The NFL sibling of
// the MLB side's PairBoard/PairMe/PairBuilder/PairTray (components/Pair*.js),
// but ONE FILE and a genuinely smaller idea, not a port of all four.
//
// WHY THIS IS SCOPED THE WAY IT IS, MARKET BY MARKET:
//
// MLB's PairBoard exists because the bot pairs two DIFFERENT hitters and
// grades the combination against measured co-homer history
// (lib/pairEvidence.js — 186,000 sampled same-night pairs across 58 graded
// archive nights). NFL has no equivalent archive: this is a preseason build,
// week one of live grading, with a single nfl_results.json that OVERWRITES
// itself every run (see Accountability.js's header note). There is no way to
// measure "how often do these two actually land together" honestly right
// now — doing that with zero real samples would mean inventing the numbers
// lib/pairEvidence.js's own header warns against manufacturing. So this file
// does NOT try to be pairEvidence's NFL sibling. lib/nfl/pairEvidence.js was
// considered and deliberately NOT built this pass — there is nothing real to
// measure yet. Revisit once a season of nfl_outcome_log_*.jsonl exists to
// build a real archive from.
//
// What NFL has instead, on every player row already in nfl_week.json, is
// something MLB's PairBoard doesn't: several INDEPENDENT market scores for
// the SAME player (a RB can carry TD, REC_YDS, REC, RUSH_YDS and RUSH_ATT
// scores at once). Two of those markets on one player, played together, is a
// pair in every sense that matters — same game, same workload, two separate
// bars — and it needs no history file to be defensible: the correlation is
// mechanical (the same touches drive both numbers), not a backtested claim.
// THAT is section 1, and it is the real v1 here.
//
// Section 2 is the stretch goal the brief allowed skipping if time ran out —
// it didn't, so it's here, clearly smaller and clearly labelled: a QB's
// passing-yards score plus his own team's top receiver's receiving-yards
// score, same team, same game, same drive-by-drive game script. It is the
// cross-player case the brief called out by name. It stops there — no
// opposing-team pairs, no RB+K, no anything that needs a real correlation
// claim to justify. lib/pairEvidence.js's own finding (same-game pairs on
// the MLB archive measure NO better than random) is the reason this file
// doesn't reach for more cross-player combinations than the one the brief
// asked for: without an NFL archive to check it against, "these two players
// on the same team probably move together" is a plausible story, not a
// measured one, and this file says so rather than dressing it up.
//
// NOT BUILT, ON PURPOSE: PairMe's search-a-player / three-suggestions flow,
// PairBuilder's drag-together custom builder, PairTray's saved-pairs tray.
// Those are interaction surfaces on top of a pairing idea that has to exist
// first — this file is that idea, rendered as one board. Build the picker on
// top of this once the board itself has been looked at.
//
// LIVE GRADING reuses exactly what Accountability.js already established:
// results.lines (actual value per player per market, keyed by player_id) and
// results.bars (the number that market's bar actually is this run), with the
// same TD caveat — a value of exactly 0 never survives nfl_results.py's
// falsy-drop, so a TD leg reads as ungraded rather than a miss when a player
// took the field and scored zero. results is optional; every pair here is
// still shown, just unranked by outcome, before anything is graded.

const MARKET_LABEL = Object.fromEntries(MARKETS.map(([k, label]) => [k, label]))

// Five same-player combinations, one per eligible position group. Chosen to
// be MECHANICALLY linked (the same touches drive both numbers) rather than
// near-duplicates of each other — Receptions + Receiving yards is the
// closest thing to a near-duplicate on this list and it stays because a
// PPR-minded bettor genuinely prices those as two separate bars, not because
// it's a strong correlation claim.
const SAME_PLAYER_TEMPLATES = [
  { a: 'RUSH_YDS', b: 'TD', pos: ['RB'], color: C.green,
    label: 'Rush yards + Anytime TD',
    why: 'Same carries drive both — a heavy rushing workload is also the clearest path to the end zone.' },
  { a: 'REC_YDS', b: 'TD', pos: ['WR', 'TE'], color: C.cyan,
    label: 'Receiving yards + Anytime TD',
    why: 'A featured target share on the same routes shows up as both yardage and a scoring chance.' },
  { a: 'REC', b: 'REC_YDS', pos: ['RB', 'WR', 'TE'], color: C.lime,
    label: 'Receptions + Receiving yards',
    why: 'Two bars on the same target share — one rewards volume, the other explosiveness per catch.' },
  { a: 'PASS_YDS', b: 'RUSH_YDS', pos: ['QB'], color: C.purple,
    label: 'Passing yards + Rushing yards',
    why: 'Dual-threat QBs: a clean pocket usually lifts both, a broken one can swing yards from arm to legs.' },
  { a: 'RUSH_ATT', b: 'RUSH_YDS', pos: ['RB'], color: C.blue,
    label: 'Rush attempts + Rush yards',
    why: 'Volume and the yards it buys — separate bars on the same workload, not the same bet twice.' },
]

// results.bars wins when a card has actually been graded this run — it's the
// bar the bot graded AGAINST. data.markets (published on every slate, graded
// or not) is the fallback so a pair still shows a bar before first kickoff.
function barMap(data, results) {
  const out = {}
  ;(data?.markets || []).forEach((m) => { if (m?.key) out[m.key] = m.bar })
  Object.entries(results?.bars || {}).forEach(([k, v]) => { if (Number.isFinite(v)) out[k] = v })
  return out
}

// null = ungraded/void (no line, or no bar to grade against yet).
function gradeLeg(playerId, market, bars, results) {
  const line = results?.lines?.[String(playerId)]
  const bar = bars[market]
  if (!line || line[market] == null || !Number.isFinite(bar)) return null
  return Number(line[market]) >= bar
}

function gradePair(aId, marketA, bId, marketB, bars, results) {
  if (!results) return { state: 'ungraded' }
  const hitA = gradeLeg(aId, marketA, bars, results)
  const hitB = gradeLeg(bId, marketB, bars, results)
  if (hitA == null && hitB == null) return { state: 'ungraded' }
  if (hitA == null || hitB == null) return { state: 'partial', hitA, hitB }
  return { state: hitA && hitB ? 'both' : (hitA || hitB) ? 'one' : 'none', hitA, hitB }
}

const GRADE_STYLE = {
  both: { text: 'BOTH ✓', color: C.green },
  one: { text: '1 of 2', color: C.yellow },
  none: { text: 'NEITHER', color: C.red },
  partial: { text: 'partial', color: C.text3 },
  ungraded: { text: '—', color: C.text3 },
}

function GradeBadge({ state }) {
  const s = GRADE_STYLE[state] || GRADE_STYLE.ungraded
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color: s.color,
      letterSpacing: '.03em',
    }}>{s.text}</span>
  )
}

// ── section 1: same player, two markets ─────────────────────────────────────

function buildSamePlayerRows(players, bars, results) {
  const rows = []
  players.forEach((p) => {
    if (p.low_sample) return
    SAME_PLAYER_TEMPLATES.forEach((t) => {
      if (!t.pos.includes(p.position)) return
      const sa = p.scores?.[t.a]
      const sb = p.scores?.[t.b]
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) return
      const grade = gradePair(p.player_id, t.a, p.player_id, t.b, bars, results)
      rows.push({
        _key: `${p.player_id}-${t.a}-${t.b}`,
        _raw: p,
        _market: t.a,
        name: p.name,
        position: p.position,
        team: p.team,
        opp: p.opp ? `vs ${p.opp}` : '',
        pairLabel: t.label,
        color: t.color,
        why: t.why,
        legA: sa,
        legB: sb,
        weaker: Math.min(sa, sb),
        stronger: Math.max(sa, sb),
        gap: Math.abs(sa - sb),
        gradeState: grade.state,
      })
    })
  })
  return rows.sort((a, b) => b.weaker - a.weaker)
}

// ── section 2: QB + his own team's top receiver, same game ─────────────────

function buildCrossPlayerRows(players, bars, results) {
  const byTeam = new Map()
  players.forEach((p) => {
    if (!p.team) return
    if (!byTeam.has(p.team)) byTeam.set(p.team, [])
    byTeam.get(p.team).push(p)
  })
  const rows = []
  byTeam.forEach((roster, team) => {
    const qb = roster
      .filter((p) => p.position === 'QB' && !p.low_sample && Number.isFinite(p.scores?.PASS_YDS))
      .sort((a, b) => b.scores.PASS_YDS - a.scores.PASS_YDS)[0]
    const wr = roster
      .filter((p) => (p.position === 'WR' || p.position === 'TE') && !p.low_sample && Number.isFinite(p.scores?.REC_YDS))
      .sort((a, b) => b.scores.REC_YDS - a.scores.REC_YDS)[0]
    if (!qb || !wr) return
    const sa = qb.scores.PASS_YDS
    const sb = wr.scores.REC_YDS
    const grade = gradePair(qb.player_id, 'PASS_YDS', wr.player_id, 'REC_YDS', bars, results)
    rows.push({
      _key: `${team}-qb-wr`,
      _raw: qb,
      _market: 'PASS_YDS',
      pairName: `${qb.name} + ${wr.name}`,
      team,
      opp: qb.opp ? `vs ${qb.opp}` : '',
      why: `${qb.name}'s dropbacks and ${wr.name}'s targets ride the same passing-game script — same team, same game, no history file behind it.`,
      legA: sa,
      legB: sb,
      weaker: Math.min(sa, sb),
      stronger: Math.max(sa, sb),
      gap: Math.abs(sa - sb),
      gradeState: grade.state,
    })
  })
  return rows.sort((a, b) => b.weaker - a.weaker)
}

// ── section 3: ATD stack — two DIFFERENT players, same market (TD) ─────────
//
// B5 (moonshot-b5-cross-prop-grading-rules-2026-08-28.md §2): the master
// plan's own named example, "ATD stacks" — two different players both
// needing to clear Anytime TD. The grading side is already covered:
// gradePair() is keyed by (playerId, market) independently per side, so
// calling it with the SAME market on both legs (below) needed no new
// function. The only real work is picking which two players to stack — a
// selection question the B5 doc explicitly left open (same team? same
// game/shootout? top-N league-wide, unconstrained?) rather than answering.
//
// Chosen rule: ONE stack per team — that team's two highest-scored TD
// players — mirroring section 2's own "one pair per team" shape exactly,
// not a global top-N pairwise cross join. A league-wide combinatorial pick
// (pair the top 8 TD scores, every combination) would silently manufacture
// a "best stacks" ranking with no correlation claim behind it beyond score
// size; keeping it to one pair per team is the same same-team/same-game-
// script story section 2 already tells and already disclaims, just with
// both legs on the same market instead of two different ones. No same-
// game-correlation claim is made here either, for the same reason section
// 2's caption states plainly: lib/pairEvidence.js's own MLB measurement
// found shared-environment pairs land at or below random once independence
// is accounted for.
//
// Position eligibility for TD itself is NOT re-checked here (unlike the
// same-player templates above, which gate on position because they pair
// TWO DIFFERENT markets whose sensible position list differs per
// template) — nfl_results.py already publishes TD scores only for players
// eligible for that market, so `Number.isFinite(p.scores?.TD)` alone is
// the correct and complete gate.
function buildStackRows(players, bars, results) {
  const byTeam = new Map()
  players.forEach((p) => {
    if (!p.team || p.low_sample || !Number.isFinite(p.scores?.TD)) return
    if (!byTeam.has(p.team)) byTeam.set(p.team, [])
    byTeam.get(p.team).push(p)
  })
  const rows = []
  byTeam.forEach((roster, team) => {
    const top2 = [...roster].sort((a, b) => b.scores.TD - a.scores.TD).slice(0, 2)
    if (top2.length < 2) return
    const [a, b] = top2
    const sa = a.scores.TD
    const sb = b.scores.TD
    const grade = gradePair(a.player_id, 'TD', b.player_id, 'TD', bars, results)
    rows.push({
      _key: `${team}-atd-stack`,
      _raw: a,
      _market: 'TD',
      pairName: `${a.name} + ${b.name}`,
      team,
      opp: a.opp ? `vs ${a.opp}` : '',
      why: `${team}'s two highest anytime-TD scores tonight, same team, same red-zone opportunity — no same-game-correlation claim beyond that.`,
      legA: sa,
      legB: sb,
      weaker: Math.min(sa, sb),
      stronger: Math.max(sa, sb),
      gap: Math.abs(sa - sb),
      gradeState: grade.state,
    })
  })
  return rows.sort((a, b) => b.weaker - a.weaker)
}

// ── the tab ──────────────────────────────────────────────────────────────────

export default function Pairs({ data, results, onPlayerClick }) {
  // data?.players || [] mints a fresh array reference on every render when
  // data.players is absent, so — same fix Accountability.js's ScoreBands
  // already applies — the fallback lives INSIDE each memo callback rather
  // than as a shared dependency; the memo keys on `data` itself instead.
  const bars = useMemo(() => barMap(data, results), [data, results])
  const sameRows = useMemo(() => buildSamePlayerRows(data?.players || [], bars, results), [data, bars, results])
  const crossRows = useMemo(() => buildCrossPlayerRows(data?.players || [], bars, results), [data, bars, results])
  const stackRows = useMemo(() => buildStackRows(data?.players || [], bars, results), [data, bars, results])

  if (!data?.players?.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>No slate loaded yet.</div>
    )
  }

  const openRow = (r) => onPlayerClick?.(r._raw, r._market)
  const gradedCount = results ? sameRows.filter((r) => r.gradeState === 'both').length : null

  const lead = sameRows[0]

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 12, lineHeight: 1.6 }}>
        Two props, one player, played together — the market on this page is <b style={{ color: C.text2 }}>mechanical
        correlation</b> (the same touches drive both numbers), not a backtested claim. A pair is only ever as good
        as its <b style={{ color: C.text2 }}>weaker leg</b>: both have to clear their own bar, so a 90 + 30 is worth
        30 wearing a big number next to it.
        {results && (
          <> {gradedCount} of {sameRows.length} same-player pairs cleared BOTH legs on the last graded run.</>
        )}
      </div>

      {lead && (
        <div style={{
          background: `linear-gradient(155deg, ${lead.color}1c, ${lead.color}06)`,
          border: `1px solid ${lead.color}55`, borderRadius: 13,
          padding: '11px 14px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: lead.color, letterSpacing: '.09em', fontFamily: NUM_FONT }}>
              🧱 STURDIEST PAIR
            </span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>best weaker-leg score on the board</span>
            {results && <span style={{ marginLeft: 'auto' }}><GradeBadge state={lead.gradeState} /></span>}
          </div>
          <div
            onClick={() => onPlayerClick?.(lead._raw, lead._market)}
            className="tap-row"
            style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
          >
            <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{lead.name}</span>
            <span style={{ fontSize: 10, color: C.text3, marginLeft: 8, fontFamily: NUM_FONT }}>
              {lead.position} · {lead.team} {lead.opp}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: C.text2, marginTop: 4 }}>{lead.pairLabel}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, color: C.text }}>{lead.stronger.toFixed(0)}</span>
            <span style={{ color: C.text3, fontSize: 12 }}>+</span>
            <span style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, color: lead.weaker >= 60 ? lead.color : C.red }}>{lead.weaker.toFixed(0)}</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>gap {lead.gap.toFixed(0)}</span>
          </div>
          <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>{lead.why}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Same player, two markets</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{sameRows.length} pairs</span>
      </div>

      {sameRows.length > 0 ? (
        <DenseTable
          rows={sameRows}
          columns={[
            { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
            { key: 'position', label: 'Pos', heat: false, w: 36, mono: true, dim: true },
            { key: 'team', label: 'Tm', heat: false, w: 36, mono: true, dim: true },
            { key: 'opp', label: 'Opp', heat: false, w: 56, mono: true, dim: true },
            { key: 'pairLabel', label: 'Pairing', heat: false, w: 210, dim: true,
              title: 'Which two markets are paired — the two legs, in order.' },
            { key: 'legA', label: 'Leg 1', w: 48, dp: 0,
              title: 'Score on the FIRST market named in Pairing.' },
            { key: 'legB', label: 'Leg 2', w: 48, dp: 0,
              title: 'Score on the SECOND market named in Pairing.' },
            { key: 'weaker', label: 'Weaker', w: 54, dp: 0,
              title: 'The lower of the two legs — the pair is worth this number, not its headline.' },
            { key: 'gap', label: 'Gap', w: 42, dp: 0, invert: true,
              title: 'How far apart the two legs sit. A wide gap is a worse pair at the same combined score.' },
            { key: 'gradeState', label: 'Graded', heat: false, w: 62,
              title: 'Both legs checked against the last graded run’s actual values. See the caption for the TD-void caveat.',
              fmt: (v) => <GradeBadge state={v} /> },
          ]}
          onRowClick={onPlayerClick ? openRow : undefined}
          initialSort="weaker"
          maxHeight={420}
          caption="Sorted by weaker leg, worst-case first — that's the number that decides whether a pair clears. Leg 1 and Leg 2 are both NFL's mean-47/sd-11 scale (see lib/nfl/theme.js), so unlike MLB's pair board these ARE comparable across different pairings. Graded reuses nfl_results.json's last run only — it is overwritten every grading pass, not a season total — and a TD leg reads ungraded rather than missed when a player scored exactly zero, because nfl_results.py drops falsy values before they reach this page (see the Accountability tab for the full explanation)."
        />
      ) : (
        <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
          No player on this slate currently carries scores on two paired markets at once.
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>QB + his own top receiver, same game</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {crossRows.length} teams · the cross-player case, kept to the one the brief named
        </span>
      </div>

      {crossRows.length > 0 ? (
        <DenseTable
          rows={crossRows}
          columns={[
            { key: 'pairName', label: 'Pair', heat: false, w: 220, bold: true, sticky: true },
            { key: 'team', label: 'Tm', heat: false, w: 36, mono: true, dim: true },
            { key: 'opp', label: 'Opp', heat: false, w: 56, mono: true, dim: true },
            { key: 'legA', label: 'QB pass yds', w: 68, dp: 0 },
            { key: 'legB', label: 'WR/TE rec yds', w: 68, dp: 0 },
            { key: 'weaker', label: 'Weaker', w: 54, dp: 0,
              title: 'The lower of the two legs — the pair is worth this number, not its headline.' },
            { key: 'gap', label: 'Gap', w: 42, dp: 0, invert: true },
            { key: 'gradeState', label: 'Graded', heat: false, w: 62, fmt: (v) => <GradeBadge state={v} /> },
          ]}
          onRowClick={onPlayerClick ? openRow : undefined}
          initialSort="weaker"
          maxHeight={300}
          caption="One pair per team — that team's best-scored QB paired with that team's best-scored receiver, same team, same game. No same-game-correlation claim is made beyond that: lib/pairEvidence.js's own measurement on the MLB archive found shared-environment pairs (same game, same team) landing at or below a random pair once independence is accounted for. This section exists because the brief named the cross-player, same-game case explicitly — treat the pairing as a plausible story tied to one game script, not a measured edge."
        />
      ) : (
        <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
          No team on this slate currently has both a scored QB and a scored receiver.
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>ATD stack — two scorers, same team</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {stackRows.length} teams · same market both legs, the plan's own named case
        </span>
      </div>

      {stackRows.length > 0 ? (
        <DenseTable
          rows={stackRows}
          columns={[
            { key: 'pairName', label: 'Stack', heat: false, w: 220, bold: true, sticky: true },
            { key: 'team', label: 'Tm', heat: false, w: 36, mono: true, dim: true },
            { key: 'opp', label: 'Opp', heat: false, w: 56, mono: true, dim: true },
            { key: 'legA', label: 'TD sc 1', w: 56, dp: 0 },
            { key: 'legB', label: 'TD sc 2', w: 56, dp: 0 },
            { key: 'weaker', label: 'Weaker', w: 54, dp: 0,
              title: 'The lower of the two legs — the stack is worth this number, not its headline.' },
            { key: 'gap', label: 'Gap', w: 42, dp: 0, invert: true },
            { key: 'gradeState', label: 'Graded', heat: false, w: 62,
              title: 'Both legs checked against the last graded run’s actual values — a TD leg reads ungraded rather than missed on a real zero, same caveat as the other sections.',
              fmt: (v) => <GradeBadge state={v} /> },
          ]}
          onRowClick={onPlayerClick ? openRow : undefined}
          initialSort="weaker"
          maxHeight={300}
          caption="One stack per team — that team's two highest anytime-TD scores, paired together. Both legs grade against the SAME market (Anytime TD), unlike the two sections above. No same-game-correlation claim is made: lib/pairEvidence.js's own measurement on the MLB archive found shared-environment pairs (same game, same team) landing at or below a random pair once independence is accounted for — this section exists because the master plan named ATD stacks explicitly, not because a real edge has been measured here yet."
        />
      ) : (
        <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
          No team on this slate currently has two players carrying an Anytime TD score.
        </div>
      )}
    </div>
  )
}
