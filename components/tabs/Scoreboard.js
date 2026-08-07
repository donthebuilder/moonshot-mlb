'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  recent375, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore, playerId,
} from '../../lib/player'
import { tierRole, shortRole, isAligned } from '../../lib/scoring'
import { PanelTitle, Empty, btnStyle } from '../ui'
import DenseTable from '../DenseTable'
import { kRiskScore } from '../../lib/scoring_additions'
import BotPicksStrip from '../BotPicksStrip'
import StartHere from '../StartHere'
import SlatePulse from '../SlatePulse'
import LiveWire from '../LiveWire'
import Storylines from '../Storylines'
import { groupPitchers } from '../../lib/data'

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
]

// Two trackers above the grid, ported from Streamlit. Both answer questions
// the 268-row table can't: who has ALREADY gone deep tonight, and which arms
// have soft spots the lineup can reach. Neither is derivable by sorting.
function Tracker({ title, count, children, note }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
        {title} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontWeight: 600 }}>({count})</span>
      </div>
      {children}
      {note && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5 }}>{note}</div>}
    </div>
  )
}

export default function Scoreboard({ players, results, backtest, onWatch, watchIds, onPlayerClick, onNavigate }) {
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
      kRisk: kRiskScore(p),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    }))
  }, [players, alignedOnly, watchIds])

  // Who has already homered tonight, matched back to where the board had him.
  // The board rank is the point: a scoreboard that only lists the homers tells
  // you nothing about whether the model saw them coming.
  const goneYard = useMemo(() => {
    const homers = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    const byRank = [...players].sort((a, b) => hrScore(b) - hrScore(a))
    return homers.map((h, i) => {
      const k = String(h?.name || '').toLowerCase().replace(/[^a-z]/g, '')
      const idx = byRank.findIndex((p) => String(nameOf(p) || '').toLowerCase().replace(/[^a-z]/g, '') === k)
      const p = idx >= 0 ? byRank[idx] : null
      return {
        _key: `${h?.player_id ?? h?.name}-${i}`,
        _raw: p,
        rank: idx >= 0 ? idx + 1 : null,
        name: clean(h?.name, '—'),
        team: clean(h?.team, ''),
        hr: n(h?.hr, 1),
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

  if (!players.length) return <Empty text="No players yet." />

  const lit = (k) => rows.filter((r) => r[k]).length

  return (
    <div>
      <PanelTitle
        title="Scoreboard"
        sub={`${rows.length} batters · ★${lit('weak')} weak spot · ◆${lit('aligned')} aligned · ▲${lit('edge')} matchup edge`}
        right={
          alignedCount > 0 && (
            <button
              onClick={() => setAlignedOnly((v) => !v)}
              title="Weak-spot + pitch-match + real recent contact quality all stacking together"
              style={btnStyle(C.purple, alignedOnly)}
            >
              ◆ Aligned only ({alignedCount})
            </button>
          )
        }
      />

      {/* First thing a new visitor sees: the workflow, drawn, not a wall of
          glossary text. Dismisses per device; a small "?" chip brings it
          back. The Guide tab keeps the depth. */}
      <StartHere onNavigate={onNavigate} />

      {/* Unconfirmed-pick countdowns + what changed since yesterday. */}
      {/* The live feed — appears once first pitch lands, waits quietly before. */}
      <LiveWire players={players} results={results} watchIds={watchIds} onPlayerClick={onPlayerClick} />
      <SlatePulse players={players} backtest={backtest} onPlayerClick={onPlayerClick} />
      <Storylines players={players} onPlayerClick={onPlayerClick} />

      <BotPicksStrip players={players} onPlayerClick={onPlayerClick} />

      <div style={{
        display: 'grid', gap: 16, marginBottom: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}>
        {goneYard.length > 0 && (
          <Tracker
            title="💥 Gone yard"
            count={goneYard.length}
            note={`${goneYard.filter((r) => r.rank && r.rank <= 15).length} of ${goneYard.length} came from the top 15 of the board.`}
          >
            <DenseTable
              rows={goneYard}
              columns={[
                { key: 'rank', label: 'Board', heat: false, w: 46, mono: true, dim: true,
                  fmt: (v) => (v == null ? '—' : `#${v}`) },
                { key: 'name', label: 'Player', heat: false, w: 132, bold: true },
                { key: 'team', label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
                { key: 'hr',   label: 'HR',     w: 34 },
                { key: 'score', label: 'HR score', w: 54, dp: 1 },
                { key: 'role', label: 'Role',   heat: false, w: 78, dim: true },
              ]}
              onRowClick={onPlayerClick}
              initialSort="score"
              maxHeight={260}
              caption=""
            />
          </Tracker>
        )}

        {weakSpots.length > 0 && (
          <Tracker
            title="★ Weak spots"
            count={weakSpots.length}
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
        )}
      </div>

      <DenseTable
        rows={rows}
        columns={buildColumns(onWatch)}
        onRowClick={onPlayerClick}
        initialSort="hr"
        maxHeight={640}
        caption="Every numeric column coloured against its own range. K% is inverted — a high strikeout rate is bad for the hitter, so it reads dark. Click a header to sort, a row to open the hitter."
      />
    </div>
  )
}
