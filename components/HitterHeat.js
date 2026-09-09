'use client'
import { useMemo } from 'react'
import { C } from '../lib/theme'
import {
  nameOf, teamOf, oppOf, nn, clean, hrScore, hitScore, prodScore, tbScore,
  pitchMixScore, barrelRate, ihrVal, recent375,
} from '../lib/player'
import { tierRole, scoreFor, isAligned } from '../lib/scoring'
import { designationOf, hitterRoleTitle, hitterLaneLabel, hitterLaneTitle, laneRanker } from '../lib/verdict'
import { hrOverlayRead } from '../lib/hrOverlay'
import { gameNumbers, gameNumOf, doubleheaderNote } from '../lib/doubleheader'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// One block, reused by every hitter board: the profile heatmap over the top
// names, then the full dense table underneath.
//
// The card grids each board already had say WHO. Neither of these says who --
// the heatmap says which input is carrying each name, and the table lets you
// re-sort on any column and find the ones the default ranking buried.

const matchupEdge = (p) => {
  const weak = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weak || !bats) return 0
  return (weak === 'LHB' && bats === 'L') || (weak === 'RHB' && bats === 'R') ? 1 : 0
}

// ── THE G COLUMN (2026-08-17) ────────────────────────────────────────────────
// Present ONLY on a slate with a doubleheader — see lib/doubleheader.js for why
// two identical-looking rows were the honest answer and still read as a bug.
// It is a real column rather than a glyph on the name so it can be sorted on:
// "show me only the nightcap" is a question this board could not previously be
// asked. On every ordinary slate it is spliced out entirely, so nobody pays a
// column for a situation that is not happening.
const DH_COLUMN = {
  key: 'g',
  label: 'G',
  heat: false,
  w: 26,
  mono: true,
  dim: true,
  explain: 'Which game of a doubleheader this row is. G1 is the earlier first '
    + 'pitch, G2 the later one. A hitter whose team plays twice appears once per '
    + 'game and both rows are real.',
}

const COLUMNS = [
  { key: 'name',    label: 'Batter',  heat: false, w: 148, bold: true, sticky: true },
  { key: 'team',    label: 'Tm',      heat: false, w: 34, mono: true, dim: true },
  { key: 'opp',     label: 'Opp',     heat: false, w: 34, mono: true, dim: true },
  { key: 'spot',    label: '#',       heat: false, w: 24, mono: true, dim: true },
  { key: 'role',    label: 'Role',    heat: false, w: 158, dim: true, titleKey: 'roleTitle',
    title: 'The hitter archetype comes first; the grading market stays in parentheses. Official picks settle on that market. Other rows show their strongest profile lane, not an official pick.' },
  { key: 'hrPct', label: 'HR%', w: 48, dp: 1, domain: [0, 35], primary: true,
    title: 'His small-sample-shrunk season-derived chance of 1+ HR in this game. This is a probability; HR score is not.' },
  { key: 'hrFit', label: 'Power', w: 48, dp: 0, domain: [0, 2], fmt: (v) => `${Number(v).toFixed(0)}/2`,
    title: 'Current HR Overlay progress: Air% >50 and Avg EV >87. The full 2/2 gate went 23/130 (17.7%) versus 8.0% outside it in the newest clean locked slice.' },
  { key: 'weak',    label: '★ Spot',  flag: true, mark: '★', w: 44 },
  { key: 'aligned', label: 'Align',   flag: true, mark: '◆', w: 40 },
  { key: 'edge',    label: 'Edge',    flag: true, mark: '▲', w: 40 },
  { key: 'hr',      label: 'HR',      w: 40, dp: 1, primary: true },
  { key: 'hit',     label: 'Hit',     w: 40, dp: 1 },
  { key: 'hrr',     label: 'HRR',     w: 40, dp: 1 },
  { key: 'tb',      label: 'TB',      w: 40, dp: 1 },
  { key: 'hrw',     label: 'HRW',     w: 40, dp: 1 },
  { key: 'dc',      label: 'DC',      w: 40, dp: 1 },
  { key: 'p3',      label: 'Pwr-3',   w: 44, dp: 0 },
  { key: 'drought', label: 'Since HR', w: 50, invert: true },
  { key: 'longest', label: 'Long',    w: 42, dp: 1 },
  { key: 'pmix',    label: 'PMix',    w: 42, dp: 1 },
  { key: 'barrel',  label: 'Brl%',    w: 42, dp: 1 },
  { key: 'ihr',     label: 'IHR',     w: 44, dp: 3 },
  { key: 'd375',    label: '375+',    w: 40 },
  { key: 'hr9',     label: 'P HR/9',  w: 46, dp: 2 },
]

export default function HitterHeat({
  players = [],
  type = 'hr',
  title = 'Profile',
  topN = 15,
  onPlayerClick,
  showHeatmap = true,
  showTable = true,
}) {
  const ranked = useMemo(
    () => [...players].sort((a, b) => scoreFor(b, type) - scoreFor(a, type)),
    [players, type],
  )

  // Computed off `players` rather than `ranked`: the doubleheader is a fact
  // about the slate, not about this board's sort order.
  const dh = useMemo(() => gameNumbers(players), [players])
  // Percentiles only mean anything against the rows in view, so the ranker is
  // a closure over exactly this list — see laneRanker's own note.
  const laneOf = useMemo(() => laneRanker(players), [players])
  const dhNote = useMemo(() => doubleheaderNote(players), [players])
  const columns = useMemo(
    () => (dh.size
      ? [...COLUMNS.slice(0, 4), DH_COLUMN, ...COLUMNS.slice(4)]
      : COLUMNS),
    [dh],
  )

  const rows = useMemo(() => ranked.map((p, i) => {
    const hrOverlay = hrOverlayRead(p)
    return ({
    // game_pk is in the key because on a doubleheader the same player_id is
    // legitimately two rows, and a duplicate React key silently drops one of
    // them — which would have "fixed" the complaint by deleting a real game.
    _key: `${p?.player_id ?? nameOf(p)}-${p?.game_pk ?? ''}-${i}`,
    _raw: p,
    name: nameOf(p),
    team: teamOf(p),
    opp: oppOf(p),
    g: gameNumOf(p, dh) || '',
    spot: p?.lineup_spot ?? '—',
    // THE LANE, NOT THE TIER, FOR AN UNDESIGNATED BAT (2026-08-23).
    // Donovan: "it seems everyone is contact on the role colume, need a more
    // diverse groupe of roles ... but prescion." Counted: final_hr_role has
    // four values and 74 of 106 hitters carry one of them, so shortRole()
    // printed "Contact" on seventy percent of the board. laneOf() asks the
    // question the column is for instead — which of his four market scores
    // sits highest WITHIN TONIGHT'S SLATE — and says so in upper case only
    // when he is actually in the top quarter of that lane. See lib/verdict.js.
    role: designationOf(p) || hitterLaneLabel(p, laneOf(p)),
    roleTitle: designationOf(p) ? hitterRoleTitle(p) : hitterLaneTitle(p, laneOf(p), players.length),
    hrPct: hrOverlay.probability,
    hrFit: hrOverlay.passed,
    weak: p?.weak_spot_flag ? 1 : 0,
    aligned: isAligned(p) ? 1 : 0,
    edge: matchupEdge(p),
    hr: hrScore(p),
    hit: hitScore(p),
    hrr: prodScore(p),
    tb: tbScore(p),
    hrw: nn(p?.hrw_score),
    dc: nn(p?.damage_conversion_score),
    p3: nn(p?.power3_score),
    drought: nn(p?.games_since_last_hr),
    longest: nn(p?.longest_hr_score),
    pmix: pitchMixScore(p),
    barrel: barrelRate(p) * 100,
    ihr: ihrVal(p),
    d375: recent375(p),
    hr9: nn(p?.pitcher_hr9),
  })}), [ranked, dh])

  if (!ranked.length) return null

  const lit = (k) => rows.filter((r) => r[k]).length

  return (
    <div style={{ margin: '4px 0 20px' }}>
      {showHeatmap && (
        <Heatmap
          rows={ranked.slice(0, topN).map((p) => ({
            label: nameOf(p),
            _raw: p,
            values: {
              Score: scoreFor(p, type),
              HR: hrScore(p), Hit: hitScore(p), HRR: prodScore(p), TB: tbScore(p),
              HRW: nn(p?.hrw_score), DC: nn(p?.damage_conversion_score),
              'Power-3': nn(p?.power3_score), PMix: pitchMixScore(p),
              Barrel: barrelRate(p) * 100,
              'P HR/9': nn(p?.pitcher_hr9) * 30,
            },
          }))}
          columns={['Score', 'HR', 'Hit', 'HRR', 'TB', 'HRW', 'DC', 'Due', 'PMix', 'Barrel', 'P HR/9']}
          title={`${title} — top ${Math.min(topN, ranked.length)} profile`}
          labelWidth={140}
          // DenseTable already unwraps _raw for the handler.
          onRowClick={onPlayerClick || null}
        />
      )}

      {showTable && (
        <>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 0 7px',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text2 }}>Full board</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3 }}>
              {rows.length} hitters · ★{lit('weak')} weak · ◆{lit('aligned')} aligned · ▲{lit('edge')} edge
            </span>
          </div>
          {/* Why a name is here twice, answered before it is asked. Sentence,
              not a symbol legend — the reader's question is about the schedule.
              Empty string on every ordinary slate, so nothing renders. */}
          {dhNote && (
            <div style={{
              fontSize: 10, color: C.text3, lineHeight: 1.6, maxWidth: 780,
              margin: '0 0 7px',
            }}>
              ⚾⚾ {dhNote}
            </div>
          )}
          <DenseTable
            heatMode="sorted"
rows={rows}
            columns={columns}
            onRowClick={onPlayerClick}
            maxHeight={460}
          />
        </>
      )}
    </div>
  )
}
