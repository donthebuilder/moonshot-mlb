import styles from '../../app/fantasy/fantasy.module.css'
import { TREND_GLYPH, TREND_LABEL } from '../../lib/fantasy/form'

// ── THE FORM CELL ───────────────────────────────────────────────────────────
//
// Four weeks of what a man actually scored, and what he has scored THIS week,
// on the one page where you decide whether to sign him. See lib/fantasy/form.js
// for the arithmetic and for why a blank line in a finished game is a real 0.0.
//
// The bars are scaled to HIS OWN best week, not to a league maximum: the cell
// is 40px wide and its job is the shape of a run, not a cross-player
// comparison. The number underneath is the comparison, and the sort does the
// ranking. Scaling to a league max would leave every bar in the list one pixel
// tall and say nothing.
//
// A week with no stored row is not a zero -- it is a week nothing was
// published for -- so it renders as an empty slot rather than a floor-height
// bar that would read as "he played and did nothing".
const TRACK = 18

export default function PlayerForm({ form, span = 4, week }) {
  if (!form) return null
  const first = Math.max(1, Number(week) - (span - 1))
  const slots = []
  for (let w = first; w <= Number(week); w += 1) {
    slots.push(form.rows.find((row) => row.week === w) || { week: w, played: false, points: null, status: 'missing' })
  }
  const current = form.current
  const scale = (points) => (form.best > 0 ? Math.max(2, Math.round((points / form.best) * TRACK)) : 2)

  return (
    <span className={styles.formCell} data-trend={form.trend || undefined}>
      <span className={styles.formBars} aria-hidden="true">
        {slots.map((slot) => (
          <i
            key={slot.week}
            data-state={slot.played ? 'played' : slot.status === 'missing' ? 'missing' : 'pending'}
            style={slot.played ? { height: `${scale(slot.points)}px` } : undefined}
          />
        ))}
      </span>
      <b>{current?.played ? current.points.toFixed(1) : '—'}</b>
      {/* The week is always in the note, never only the trend. On a phone
          .wireColumns is display:none, so a bare 18.4 under four bars would be
          the same unlabelled number finding #6 was about -- and PROJ and DASH
          both carry their own label at that width for exactly this reason. */}
      <i className={styles.formNote}>
        {current?.played
          ? (form.trend ? `W${week} ${TREND_GLYPH[form.trend]}${TREND_LABEL[form.trend]}` : `WK ${week}`)
          : current
          ? 'NOT PLAYED'
          : 'NO LINE'}
      </i>
      <em className={styles.formSr}>
        {form.played
          ? `Scored ${current?.played ? `${current.points.toFixed(1)} this week, ` : ''}averaging ${form.average?.toFixed(1)} over ${form.played} played ${form.played === 1 ? 'week' : 'weeks'}.`
          : 'No completed weeks on record.'}
      </em>
    </span>
  )
}
