'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  nameOf, teamOf, n, nn, clean, hrScore, hitScore, prodScore, tbScore,
  pitchMixScore, barrelRate, ihrVal, recent375,
} from '../lib/player'
import { tierRole, shortRole, isAligned } from '../lib/scoring'
import { designationOf } from '../lib/verdict'
import DenseTable from './DenseTable'
import { SCORE } from '../lib/scales'

// The full lineup, dense and colored — not the top-8 card grid.
//
// The card grid answers "who are the names here". This answers "what is the
// shape of this game", which is a different question and the one you actually
// have to scan. Weak spot, aligned and matchup edge are heat columns rather
// than icons, so a lineup with four of them lights up as a block instead of
// making you count little symbols down the column.
//
// ── 2026-08-15 — THE SPOT READ, AND WHY IT LEADS ────────────────────────────
//
// Donovan, on opening a game from the Games tab: "instead of click off to
// lineups maybe somewhere just a little shift to see the pitcher weak spots
// and what the pitcher is doing to that spot."
//
// Two things were wrong with what this component gave him.
//
//   1. To learn that tonight's arm has been beaten in the 5-hole you had to
//      notice a ★ in a 30-column table and then hover a HEADER — on a phone,
//      where there is no hover, that fact was simply not readable. The bot
//      publishes `weak_spot_reason` as a finished English sentence with the
//      count and the slugging already in it, and we were rendering a glyph
//      instead. That is the "tiles and boxes lose to sentences" rule losing
//      to a single character.
//   2. `pitcher_spot_damage_*` and `pitcher_zone_damage_*` — what this arm
//      allows to THAT batting-order slot, and to that third of the order —
//      were on every row and appeared nowhere on this surface at all. They
//      lived only in PitcherSpots (Pitchers tab / pitcher modal), which is a
//      click off the game he is reading.
//
// So the default view is now a READ: one line per hitter, in batting order,
// saying what this arm has done to the spot he is standing in, with the
// numbers inside the clause. The dense table is one pill away and did not
// lose a column — it GAINED four (spot damage, its PA, its SLG, zone damage),
// so every number the read speaks is also sortable.
//
// PitcherSpots stays the deep version (nine-spot heatmap, verdict table,
// median-vs-his-own-spots). This is the read you get without leaving the game.

const matchupEdge = (p) => {
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weakSide || !bats) return 0
  return (weakSide === 'LHB' && bats === 'L') || (weakSide === 'RHB' && bats === 'R') ? 1 : 0
}

// "spot #1: 38 PA, 0.500 SLG, 0.219 ISO, HR rate 5.3%, XBH rate 7.9%, HH 33.3%"
// Same tolerant parse PitcherSpots uses — keyed off the labels rather than the
// comma positions, so a reason string that grows a field still reads.
function parseSpotReason(reason) {
  const s = clean(reason, '')
  const num = (re) => {
    const m = s.match(re)
    return m ? Number(m[1]) : null
  }
  return {
    pa: num(/([\d.]+)\s*PA/i),
    slg: num(/([\d.]+)\s*SLG/i),
    iso: num(/([\d.]+)\s*ISO/i),
    hrRate: num(/HR rate\s*([\d.]+)%/i),
    xbhRate: num(/XBH rate\s*([\d.]+)%/i),
    hh: num(/HH\s*([\d.]+)%/i),
  }
}

// The bot's own labels, said as a verdict, with the SAMPLE GATE FIRST.
//
// Copied from PitcherSpots.verdictFor including the order of the checks, and
// for the same reason: ten plate appearances cannot answer anything, and
// calling a three-PA fluke "he gets hurt here" is the most expensive mistake
// this read could make. Two panels disagreeing about the same nine spots would
// be worse than either of them being wrong.
function spotVerdict({ dmg, pa, label }) {
  if (!pa || pa < 10) return { text: 'too thin to call', color: C.text3, thin: true }
  if (label === 'HOT' || label === 'WARM' || dmg >= 60) {
    return { text: 'this is a spot he gets hurt in', color: C.red, hurt: true }
  }
  if (dmg <= 15 || label === 'PITCHER ADV') {
    return { text: 'this spot has been his, not the hitters’', color: C.green }
  }
  return { text: 'this spot has played neutral', color: C.text2 }
}

const ZONES = [
  { key: 'top', from: 1, to: 3, word: 'the top of the order (1-3)' },
  { key: 'mid', from: 4, to: 6, word: 'the middle (4-6)' },
  { key: 'bot', from: 7, to: 9, word: 'the bottom (7-9)' },
]
const zoneOf = (spot) => ZONES.find((z) => spot >= z.from && spot <= z.to) || null

// A slash line reads ".500", not "0.500" — the leading zero is noise every
// baseball surface on the site already drops.
const sl = (v) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0\./, '.') : '—')
const zoneColor = (label) => (
  label === 'HOT' || label === 'WARM' ? C.red : label === 'PITCHER ADV' ? C.green : C.text2
)

const COLUMNS = [
  { key: 'spot',   label: '#',      heat: false, w: 26, mono: true, dim: true },
  { key: 'name',   label: 'Batter', heat: false, w: 148, bold: true, sticky: true },
  { key: 'team',   label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
  { key: 'b',      label: 'B',      heat: false, w: 22, mono: true, dim: true },
  { key: 'role',   label: 'Role',   heat: false, w: 104, dim: true },
  { key: 'weak',   label: '★ Spot', flag: true, mark: '★', w: 44,
    title: 'Weak lineup spot — this starter has been beaten in this spot' },
  { key: 'aligned', label: 'Align', flag: true, mark: '◆', w: 40,
    title: 'Signals aligned across boards' },
  { key: 'edge',   label: 'Edge',  flag: true, mark: '▲', w: 40,
    title: 'Bats into the pitcher’s weak side' },
  // ── THE HITTER'S OWN SCORES COME FIRST (2026-08-17) ───────────────────────
  // Donovan: "its all rearaged wrong twhy fuck is spot damage fist."
  //
  // Correct, and it was my doing on 08-15. Spot damage got inserted ahead of
  // HR/Hit/HRR/TB, so the first four numbers on a hitter's row described the
  // PITCHER'S vulnerability in that batting slot, not the hitter. You open a
  // lineup table to find out about the bats; the slot read is context for that
  // answer, not the answer. Restored: the four bot scores lead, the spot
  // cluster sits after them where it was before.
  { key: 'hr',     label: 'HR',    w: 40, dp: 1, ...SCORE, primary: true },
  { key: 'hit',    label: 'Hit',   w: 40, dp: 1, ...SCORE },
  { key: 'hrr',    label: 'HRR',   w: 40, dp: 1, ...SCORE },
  { key: 'tb',     label: 'TB',    w: 40, dp: 1, ...SCORE },
  { key: 'hrw',    label: 'HRW',   w: 40, dp: 1, ...SCORE },
  { key: 'dc',     label: 'DC',    w: 40, dp: 1 },
  { key: 'due',    label: 'Due',   w: 40, dp: 1, ...SCORE },
  { key: 'pmix',   label: 'PMix',  w: 42, dp: 1, ...SCORE },
  { key: 'barrel', label: 'Brl%',  w: 42, dp: 1 },
  { key: 'ihr',    label: 'IHR',   w: 42, dp: 3 },
  { key: 'd375',   label: '375+',  w: 40 },
  // The spot cluster — the STARTER's record against this batting slot. Kept in
  // full (nothing is removed), just no longer occupying the first four columns.
  { key: 'sdmg',   label: 'Spot dmg', w: 56, dp: 1,
    explain: 'How much damage hitters have done to TONIGHT’S STARTER in this batting-order spot, 0-100. His vulnerability in the slot, not the hitter’s own damage rate — and not a probability.' },
  { key: 'spa',    label: 'Spot PA',  w: 52,
    title: 'Plate appearances behind that spot number. Under 10 the read is too thin to lean on.' },
  { key: 'sslg',   label: 'Spot SLG', w: 56, dp: 3,
    title: 'Slugging this starter has allowed to this batting-order spot' },
  { key: 'zdmg',   label: 'Zone dmg', w: 56, dp: 1,
    explain: 'Damage against this third of the order — 1-3, 4-6 or 7-9 — on the same 0-100 scale. Wider sample than one spot, so it is the steadier of the two.' },
  // FORM CLUSTER (2026-08-06, on request): what he's actually hitting lately,
  // next to what the model thinks of him. All published slate fields.
  { key: 'a5',     label: 'L5 AVG',  w: 50, dp: 3,
    title: 'Batting average over his last 5 games' },
  { key: 'a10',    label: 'L10 AVG', w: 52, dp: 3,
    title: 'Batting average over his last 10 games' },
  { key: 'aSzn',   label: 'Szn AVG', w: 52, dp: 3 },
  { key: 'aArm',   label: 'vs Arm',  w: 50, dp: 3,
    title: 'His average against the SIDE tonight’s starter throws from — matchup-aware, not a generic platoon line' },
  { key: 'xw10',   label: 'xwOBA10', w: 56, dp: 3,
    title: 'Expected wOBA over his last 10 games — quality of process, luck stripped out. Beats a hot AVG built on bloops.' },
  { key: 'ev',     label: 'EV',      w: 44, dp: 1,
    title: 'Recent average exit velocity' },
  { key: 'hh',     label: 'HH%',     w: 44, dp: 0,
    title: 'Recent hard-hit rate (95+ mph)' },
  { key: 'since',  label: 'Since HR', w: 54, invert: true,
    title: 'Games since his last homer. Inverted — recent is bright. Not a “due” signal, just recency.' },
  { key: 'hr9',    label: 'P HR/9', w: 46, dp: 2,
    title: 'Opposing starter’s HR per 9 — high is good for the hitter' },
]

// ── One side's batting order, said out loud ─────────────────────────────────
//
// Sentences, not a grid of little stat boxes. Every number the old ★ column
// hid — spot damage, the PA behind it, the SLG and HR rate allowed there, the
// zone score, and the bot's own weak-spot sentence — is in the prose, so this
// reads top to bottom instead of being decoded cell by cell.
function SideRead({ team, rows, onPlayerClick }) {
  const src = (k) => {
    for (const p of rows) { const v = p?.[k]; if (v !== null && v !== undefined && v !== '') return v }
    return null
  }
  const arm = clean(src('pitcher_name'), 'a TBD arm')
  const throws = clean(src('pitcher_throws'), '')

  // Only hitters with a posted slot can be spoken about by slot. The rest are
  // counted out loud at the bottom rather than dropped in silence.
  const seated = rows
    .filter((p) => n(p?.lineup_spot, 0) >= 1 && n(p?.lineup_spot, 0) <= 9)
    .sort((a, b) => n(a?.lineup_spot, 99) - n(b?.lineup_spot, 99))
  const benched = rows.length - seated.length

  const spots = seated.map((p) => {
    const parsed = parseSpotReason(p?.pitcher_spot_damage_reason)
    const dmg = n(p?.pitcher_spot_damage_score, null)
    const label = clean(p?.pitcher_spot_damage_label, '')
    return {
      p,
      spot: n(p?.lineup_spot, 0),
      name: nameOf(p),
      bats: clean(p?.bats || p?.handedness, '?'),
      dmg,
      label,
      ...parsed,
      verdict: spotVerdict({ dmg: dmg ?? 0, pa: parsed.pa ?? 0, label }),
      weak: !!p?.weak_spot_flag,
      weakReason: clean(p?.weak_spot_reason, ''),
    }
  })

  // Rank by damage so the read can say "hardest spot on this card" instead of
  // leaving you to compare nine numbers yourself.
  const ranked = [...spots].filter((s) => s.dmg != null).sort((a, b) => b.dmg - a.dmg)
  const rankOf = (spot) => ranked.findIndex((s) => s.spot === spot) + 1

  // One zone entry per third of the order, off whichever hitter in that third
  // carries the fields — every row in a third publishes the same zone numbers.
  const zones = ZONES.map((z) => {
    const row = seated.find((p) => zoneOf(n(p?.lineup_spot, 0))?.key === z.key)
    if (!row) return null
    return {
      ...z,
      score: n(row?.pitcher_zone_damage_score, null),
      label: clean(row?.pitcher_zone_damage_label, ''),
      reason: clean(row?.pitcher_zone_damage_reason, ''),
    }
  }).filter((z) => z && z.score != null)

  const beaten = spots.filter((s) => s.weak)

  if (!seated.length) return null

  return (
    <div style={{
      flex: '1 1 430px', minWidth: 0, background: C.bg2,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '10px 13px',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 900, marginBottom: 4 }}>
        {team} bats <span style={{ color: C.text3, fontWeight: 600 }}>vs {arm}{throws ? ` (${throws}HP)` : ''}</span>
      </div>

      {/* THE ORDER IN THIRDS — the zone fields, which nothing on this tab used
          to show, as one clause each instead of three little meters. */}
      {zones.length > 0 && (
        <p style={{ margin: '0 0 6px', fontSize: 11.5, lineHeight: 1.7, color: C.text2 }}>
          Against this arm{' '}
          {zones.map((z, i) => (
            <span key={z.key} title={z.reason}>
              {i > 0 && (i === zones.length - 1 ? ' and ' : ', ')}
              {z.word} has done{' '}
              <b style={{ color: zoneColor(z.label), fontFamily: NUM_FONT }}>{z.score.toFixed(0)}</b>
              <span style={{ color: C.text3 }}> damage</span>
              {z.label ? <span style={{ color: C.text3 }}> ({z.label.toLowerCase()})</span> : ''}
            </span>
          ))}
          <span style={{ color: C.text3 }}> — 0-100 against his own season, not a chance of anything.</span>
        </p>
      )}

      {/* THE WEAK SPOTS, IN WORDS. This is the ★ column, spelled out: who is
          standing in a hole this arm has already been beaten in, and by how
          much. The bot publishes the sentence; we stopped hiding it. */}
      <p style={{ margin: '0 0 7px', fontSize: 11.5, lineHeight: 1.65, color: C.text3 }}>
        {beaten.length > 0 ? (
          <>
            <b style={{ color: C.yellow }}>★ {beaten.length}</b> of the {spots.length} posted spots {beaten.length === 1 ? 'is one' : 'are ones'} he has already been beaten in
            {' — '}
            {beaten.map((s, i) => (
              <span key={s.spot}>
                {i > 0 && (i === beaten.length - 1 ? ' and ' : ', ')}
                <b style={{ color: C.yellow }}>#{s.spot} {s.name}</b>
              </span>
            ))}
            .
          </>
        ) : 'No spot in this order is one the bot flags him as beaten in.'}
      </p>

      {/* One hitter, one line, in batting order. */}
      <div>
        {spots.map((s) => {
          const rank = rankOf(s.spot)
          const hottest = rank === 1 && !s.verdict.thin && (s.dmg ?? 0) > 0
          const tail = [
            s.iso != null ? `${sl(s.iso)} ISO` : null,
            s.xbhRate != null ? `${s.xbhRate.toFixed(1)}% extra-base` : null,
            s.hh != null ? `${s.hh.toFixed(0)}% hard-hit` : null,
          ].filter(Boolean)
          return (
            <div
              key={`${s.spot}-${s.name}`}
              onClick={(e) => { e.stopPropagation(); onPlayerClick?.(s.p) }}
              title={`Open ${s.name}`}
              style={{
                cursor: onPlayerClick ? 'pointer' : 'default',
                borderTop: `1px solid ${C.border}`, padding: '5px 0',
                fontSize: 11.5, lineHeight: 1.65, color: C.text2,
              }}
            >
              {/* ── STATS FIRST (2026-08-17) ─────────────────────────────────
                  Donovan: "lineups should be spot read AND the actual pitcher
                  lineup data plus the batters data in that spot. the spot read
                  is missing a little while having too much words."
                  Both fair. The sentence carried the arm's slot numbers buried
                  in clauses and the BATTER'S own numbers not at all. Now: one
                  verdict word, then the arm's slot line as bare figures, then
                  the hitter's own line — HR/Hit score and season average — so
                  the collision this row is about has both halves on it. The
                  connecting prose lives in the tooltips; every fact is kept. */}
              <b style={{ fontFamily: NUM_FONT, color: C.text3 }}>#{s.spot}</b>{' '}
              <b style={{ color: C.text, fontSize: 12 }}>{s.name}</b>
              <span style={{ color: C.text3 }}> ({s.bats})</span>
              {' '}
              <span style={{ color: s.verdict.color, fontWeight: 800, fontSize: 10.5 }}>{s.verdict.text}</span>
              {hottest && <span style={{ color: C.red, fontSize: 10 }} title="The hardest-hit slot on this card"> · hottest</span>}
              <span style={{ fontFamily: NUM_FONT, fontSize: 10.5 }}>
                {s.dmg != null && (
                  <span title="Spot damage 0-100 — how hard hitters have hit this arm from this slot. A score, never a chance.">
                    {' · '}<b style={{ color: s.verdict.color }}>{s.dmg.toFixed(0)}</b>
                    <span style={{ color: C.text3 }}> dmg</span>
                  </span>
                )}
                {s.pa != null && <span style={{ color: C.text3 }} title="Plate appearances this arm has faced in this slot">{' · '}{s.pa} PA</span>}
                {s.slg != null && <span title="Slugging this arm has allowed to this slot">{' · '}<b style={{ color: C.text2 }}>{sl(s.slg)}</b><span style={{ color: C.text3 }}> SLG ag</span></span>}
                {s.hrRate != null && <span title="How often a PA in this slot has left the yard against him">{' · '}<b style={{ color: C.text2 }}>{s.hrRate.toFixed(1)}%</b><span style={{ color: C.text3 }}> HR</span></span>}
                {tail.length > 0 && <span style={{ color: C.text3 }} title="The rest of the bot's published line for this spot">{' · '}{tail.join(' · ')}</span>}
              </span>
              {/* the batter's half — his own numbers, in the same breath */}
              <span style={{ fontFamily: NUM_FONT, fontSize: 10.5 }} title={`${s.name}'s own numbers tonight: bot HR score, bot Hit score, season average`}>
                <span style={{ color: C.text3 }}>{'  ·  him: '}</span>
                <b style={{ color: C.orange }}>{n(s.p?.hr_score, 0).toFixed(0)}</b><span style={{ color: C.text3 }}> HR</span>
                {' '}<b style={{ color: '#a78bfa' }}>{n(s.p?.hit_score, 0).toFixed(0)}</b><span style={{ color: C.text3 }}> Hit</span>
                {n(s.p?.season_avg, 0) > 0 && <>{' '}<b style={{ color: C.text2 }}>{sl(n(s.p.season_avg, 0))}</b><span style={{ color: C.text3 }}> AVG</span></>}
                {n(s.p?.last5_hits, -1) >= 0 && <span style={{ color: C.text3 }} title="Hits and homers over his last five games">{` · L5 ${n(s.p.last5_hits, 0)}H/${n(s.p.last5_hr, 0)}HR`}</span>}
              </span>
              {/* THE ★, SPELLED OUT. The bot's own weak-spot sentence, verbatim
                  — it already carries the count and the slugging, so
                  paraphrasing it would only risk saying something the grader
                  disagrees with.

                  The flag and the sentence are TWO FIELDS and they do not
                  always agree: some rows carry a reason without clearing the
                  weak-spot bar, and a few carry the flag with no published
                  line. Only a flagged spot wears the star (so the count in the
                  paragraph above matches the stars you can see), and the
                  unflagged reason still prints — quieter, and labelled as the
                  under-the-bar note it is. Neither fact gets dropped. */}
              {s.weak && s.weakReason && (
                <span style={{ color: C.yellow }}> ★ {s.weakReason}</span>
              )}
              {s.weak && !s.weakReason && (
                <span style={{ color: C.yellow }}> ★ The bot flags this as a spot he has been beaten in, without publishing the line behind it.</span>
              )}
              {!s.weak && s.weakReason && (
                <span style={{ color: C.text3 }} title="Published for this spot, but under the bot's weak-spot bar — so it is not starred">
                  {' '}{s.weakReason} <span style={{ fontStyle: 'italic' }}>(under the weak-spot bar)</span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {benched > 0 && (
        <div style={{ fontSize: 10, color: C.text3, marginTop: 6 }}>
          {benched} more {team} hitter{benched > 1 ? 's' : ''} on the slate without a posted batting-order spot — {'they\'re'} in the full table.
        </div>
      )}
    </div>
  )
}

export default function GameLineup({ players, onPlayerClick }) {
  const [team, setTeam] = useState('Both')
  // ── THE TABLE LEADS (2026-08-17) ──────────────────────────────────────────
  // Donovan: "lineups need stats not reading", "i liked when you click on the
  // games and it opened the full table", "on the games you gotta do all this
  // clicking to just see everything". The spot read defaulted first and the
  // table sat behind a pill, which meant the thing he opens a game FOR was
  // always one click away. Reversed: the full stat table is what opening a
  // game shows, the read is the pill. Nothing removed — same two views, the
  // other default.
  const [shape, setShape] = useState('table')

  const teams = useMemo(
    () => Array.from(new Set(players.map(teamOf).filter(Boolean))).sort(),
    [players],
  )

  const pool = useMemo(
    () => (team === 'Both' ? players : players.filter((p) => teamOf(p) === team)),
    [players, team],
  )

  const rows = useMemo(() => [...pool]
    .sort((a, b) => teamOf(a).localeCompare(teamOf(b)) || (nn(a?.lineup_spot) || 99) - (nn(b?.lineup_spot) || 99))
    .map((p, i) => {
      const spotReason = parseSpotReason(p?.pitcher_spot_damage_reason)
      return {
        _key: `${p?.player_id ?? nameOf(p)}-${i}`,
        _raw: p,
        spot: p?.lineup_spot ?? '—',
        name: nameOf(p),
        team: teamOf(p),
        b: clean(p?.bats || p?.handedness, '?'),
        // THE DESIGNATION LEADS (2026-08-23). Donovan: "i dont see the watch
        // on the role row." This printed the MODEL's tier (Power / Contact /
        // HR Bet) and never the bot's designation — so WATCH, which exists
        // only as a designation, was invisible in every dense table on the
        // site while tonight's slate carried 45 of them. An undesignated bat
        // still gets his tier; nothing was removed.
        role: designationOf(p) || shortRole(p),
        weak: p?.weak_spot_flag ? 1 : 0,
        aligned: isAligned(p) ? 1 : 0,
        edge: matchupEdge(p),
        sdmg: n(p?.pitcher_spot_damage_score, null),
        spa: spotReason.pa,
        sslg: spotReason.slg,
        zdmg: n(p?.pitcher_zone_damage_score, null),
        hr: hrScore(p),
        hit: hitScore(p),
        hrr: prodScore(p),
        tb: tbScore(p),
        hrw: nn(p?.hrw_score),
        dc: nn(p?.damage_conversion_score),
        due: nn(p?.hr_due_score),
        pmix: pitchMixScore(p),
        barrel: barrelRate(p) * 100,
        ihr: ihrVal(p),
        d375: recent375(p),
        a5: nn(p?.last5_avg) || null,
        a10: nn(p?.last10_avg) || null,
        aSzn: nn(p?.season_avg) || null,
        aArm: (String(p?.pitcher_throws || '').toUpperCase() === 'L'
          ? nn(p?.avg_vs_lhp) : String(p?.pitcher_throws || '').toUpperCase() === 'R'
            ? nn(p?.avg_vs_rhp) : null) || null,
        xw10: nn(p?.l10_xwoba) || null,
        ev: nn(p?.recent_ev) || null,
        hh: nn(p?.recent_hard_hit_rate) * 100,
        since: nn(p?.games_since_last_hr),
        hr9: nn(p?.pitcher_hr9),
      }
    }), [pool])

  const cols = useMemo(
    () => (team === 'Both' ? COLUMNS : COLUMNS.filter((c) => c.key !== 'team')),
    [team],
  )

  // The read renders one block per team present in the current filter, each
  // ordered 1 through 9 against the arm THAT side faces.
  const sides = useMemo(() => {
    const byTeam = new Map()
    pool.forEach((p) => {
      const t = teamOf(p)
      if (!t) return
      if (!byTeam.has(t)) byTeam.set(t, [])
      byTeam.get(t).push(p)
    })
    return [...byTeam.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [pool])

  if (!players.length) return null

  const lit = (k) => rows.filter((r) => r[k]).length
  const pill = (on) => ({
    padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${on ? C.orange : C.border}`,
    background: on ? 'rgba(249,115,22,.12)' : 'transparent',
    color: on ? C.orange : C.text3,
  })

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text2 }}>Lineups</span>
        {teams.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['Both', ...teams].map((t) => (
              <button
                key={t}
                onClick={(e) => { e.stopPropagation(); setTeam(t) }}
                style={pill(team === t)}
              >{t}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Table first in the row too — the pill order matches the default. */}
          <button onClick={(e) => { e.stopPropagation(); setShape('table') }} style={pill(shape === 'table')}
            title="The full dense lineup table — every column, sortable">Full table</button>
          <button onClick={(e) => { e.stopPropagation(); setShape('read') }} style={pill(shape === 'read')}
            title="One line per hitter: what this arm has done to the spot he stands in">Spot read</button>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} hitters · ★{lit('weak')} weak · ◆{lit('aligned')} aligned · ▲{lit('edge')} edge
        </span>
      </div>

      {shape === 'read' ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sides.map(([t, tRows]) => (
              <SideRead key={t} team={t} rows={tRows} onPlayerClick={onPlayerClick} />
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.6 }}>
            Batting order, top to bottom. Red is a slot this arm has been hit in, green is one he has
            owned, and a spot on under 10 plate appearances is called thin rather than graded. Click a
            hitter for his card; switch to the full table for all {cols.length} columns.
          </div>
        </>
      ) : (
        <DenseTable
          heatMode="sorted"
rows={rows}
          columns={cols}
          onRowClick={onPlayerClick}
          maxHeight={420}
          caption="Batting order by default — click a header to re-sort, a row to open the hitter. ★ weak spot · ◆ aligned signals · ▲ bats into the pitcher's weak side. Spot dmg / Spot PA / Spot SLG / Zone dmg are what tonight's starter has allowed to that batting-order slot and to that third of the order — the same numbers the spot read says in words."
        />
      )}
    </div>
  )
}
