'use client'
// NOT SCORED (Donovan 2026-10-18: "I am okay with missing people" -- with the cutoff he picked: the
// starters and anyone with real playing time are scored; "everyone else a visible not-scored row",
// and "still want their stats ... update that as shared too"). One table for every sport, under its
// Rankings: the men tonight's model did not rank, each with his real numbers and one short reason.
// No score, no status word: he is not CALLED / ON / NOT ON the board, he is not ranked at all.
//
// Each sport hands in its own Table skin (NflTable / LampTable / BucketsTable), rows and stat columns;
// this adds the name, the reason and the heading, and previews 4 ("All N" opens the rest).
import DenseTable from '../DenseTable'
import { C as BASE, NUM_FONT } from '../../lib/theme'
import { PREVIEW_ROWS } from '../ListPreview'

/**
 * rows:    [{ _id, name, team, pos, why, ...stat keys }]
 * columns: the sport's stat columns ({ key, label, group, dp, ... }); empty ones are dropped
 */
export default function NotScoredTable({ rows, columns = [], Table = DenseTable, theme = BASE, faceOf = null, onOpen = null, teamMark = null, onOpenTeam = null, label = 'Not scored' }) {
  if (!rows?.length) return null
  const stat = columns.filter((c) => rows.some((r) => r[c.key] != null)).map((c) => ({ heat: false, mono: true, w: 48, ...c }))
  const cols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 44, heat: false, mono: true, ...(teamMark ? { teamMark } : {}), link: (r) => (onOpenTeam && r.team ? () => onOpenTeam(r.team) : null) },
    { key: 'why', label: 'Why', group: 'Why', w: 76, heat: false, dim: true },   // its own group: Player-group columns fold into the name cell
    ...stat,
  ]
  return (
    <section style={{ marginTop: 14 }} aria-label={label}>
      <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: theme.text3, marginBottom: 6 }}>
        {label.toUpperCase()} · {rows.length}
      </div>
      <Table rows={rows} columns={cols} heatMode="none" nameCell={faceOf ? 'player' : undefined} faceOf={faceOf || undefined}
        maxRows={PREVIEW_ROWS} maxHeight={9999} onRowClick={onOpen ? (r) => onOpen(r) : undefined} />
    </section>
  )
}
