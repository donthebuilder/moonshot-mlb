'use client'

import { useRouter } from 'next/navigation'

import DenseTable from '../DenseTable'
import TeamMark from './TeamMark'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { C, ACCENT } from '../../lib/fantasy/theme'

// FRANCHISE'S LISTS ON THE SHARED TABLE (2026-10-03, COMPONENT-REUSE R10 step 4;
// Donovan 10-03: standings and power rankings only -- the wire's rows are
// claim forms and the roster is the lineup UI, both stay custom).
// Standings were a grid of divs and power rankings a stack of cards; only the
// team NAME was a link. Now both are DenseTable (skin v2): a column group on
// every column, sortable headers, no colour at rest (only the column you sort
// by is graded), the whole row opens that team, the gold edge marks yours.
// The server page still does every read and hands in plain rows.

// No glossary: without one DenseTable looks labels up in the BASEBALL
// dictionary (it found "TEAM") and draws a 10px ⓘ that fails the tap rule.
const NO_TERMS = {}

const teamCell = (size) => (v, r) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
    <TeamMark team={r.mark} size={size} />
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
  </span>
)

function useOpenTeam(leagueId) {
  const router = useRouter()
  return (r) => router.push(`/fantasy/league/${leagueId}/team/${r.id}`)
}

/**
 * rows: [{ id, name, mark, rank, w, l, t, pf, pa, mine, seed }] in standings order.
 * seed = true for a playoff spot once games are final (the old cut line).
 */
export function FranchiseStandings({ leagueId, rows }) {
  const open = useOpenTeam(leagueId)
  const columns = [
    { key: 'rank', label: '#', heat: false, rankCol: true, w: 34, group: 'Team' },
    { key: 'name', label: 'TEAM', heat: false, sticky: true, w: 190, fmt: teamCell(20), group: 'Team' },
    { key: 'w', label: 'W', w: 40, group: 'Record' },
    { key: 'l', label: 'L', w: 40, invert: true, group: 'Record' },
    { key: 't', label: 'T', w: 40, group: 'Record' },
    { key: 'pf', label: 'PF', w: 62, fmt: (v) => Number(v).toFixed(1), group: 'Points' },
    { key: 'pa', label: 'PA', w: 62, invert: true, fmt: (v) => Number(v).toFixed(1), group: 'Points' },
  ]
  return (
    <DenseTable
      rows={rows}
      columns={columns}
      heatMode="sorted"
      accent={ACCENT}
      dict={NO_TERMS}
      onRowClick={open}
      rowEdge={(r) => (r.mine ? ACCENT : r.seed ? C.green : null)}
      maxHeight={null}
      caption="Standings: win %, then wins, then points for. Gold edge = your team; green edge = a playoff spot once games are final. Tap a row to open that team."
    />
  )
}

/** rows: [{ id, name, mark, rank, move, power, why, mine }] in ranking order. move: +n up, -n down, null new.
 *  The explanation is not a column: a table row is one 36px line, and the
 *  sentence clipped to "..." even scrolled to (check-mobile, 10-03). It reads
 *  under the table instead, three shown and "+N more" (the long-list rule). */
export function FranchisePower({ leagueId, rows }) {
  const open = useOpenTeam(leagueId)
  const columns = [
    { key: 'rank', label: '#', heat: false, rankCol: true, w: 34, group: 'Team' },
    { key: 'name', label: 'TEAM', heat: false, sticky: true, w: 190, fmt: teamCell(20), group: 'Team' },
    { key: 'move', label: 'MOVE', w: 54, fmt: (v) => (v == null ? 'NEW' : v > 0 ? `▲ ${v}` : v < 0 ? `▼ ${-v}` : '—'), group: 'Index' },
    { key: 'power', label: 'POWER', w: 62, fmt: (v) => Number(v).toFixed(1), group: 'Index' },
  ]
  const why = rows.filter((r) => r.why)
  const { shown, open: all, restN, toggle } = usePreview(why, 3)
  return (
    <>
      <DenseTable
        rows={rows}
        columns={columns}
        heatMode="sorted"
        accent={ACCENT}
        dict={NO_TERMS}
        onRowClick={open}
        rowEdge={(r) => (r.mine ? ACCENT : null)}
        maxHeight={null}
        caption="DASH power index: results, scoring and momentum. MOVE is places since last week. Tap a row to open that team."
      />
      {why.length > 0 && (
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 10 }} aria-label="Why each team is where it is">
          {shown.map((r) => (
            <li key={r.id} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 8, alignItems: 'start' }}>
              <b style={{ color: r.mine ? ACCENT : C.text3, fontSize: 13, textAlign: 'right' }}>{r.rank}</b>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: C.text2 }}><strong style={{ color: C.text }}>{r.name}</strong> — {r.why}</span>
            </li>
          ))}
        </ol>
      )}
      {restN > 0 && <ShowMoreButton open={all} restN={restN} toggle={toggle} itemWord="teams" />}
    </>
  )
}
