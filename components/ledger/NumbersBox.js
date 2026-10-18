import DayNumbers from '../numerology/DayNumbers'
import LaneTable from '../numerology/LaneTable'

// THE NUMBERS BOX every sport's ledger prints (2026-10-18; it was the same grid wrapper copied into four files): the day's numbers named,
// the preceding day's, and the lane scoreboard. Markup identical to the old inline copies, so MOONSHOT does not move.
export default function NumbersBox({ sport, date, theme, numFont, accent, eventWord }) {
  return (
    <div style={{ display: 'grid', gap: 10, margin: '8px 0', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <DayNumbers sport={sport} date={date} theme={theme} numFont={numFont} accent={accent} eventWord={eventWord} />
      <LaneTable sport={sport} theme={theme} numFont={numFont} accent={accent} />
    </div>
  )
}
