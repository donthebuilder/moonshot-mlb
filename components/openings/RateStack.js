'use client'
// A RATE WITH ITS COUNT UNDER IT (Donovan 10-24: "lead with 70%, 7/10 small under"). One cell for the openings tables: `v` the percent,
// `pair` [made, of] the count it came from. Right-aligned like a number; '—' when there is no rate.
export default function RateStack({ v, pair = null, C, NUM_FONT }) {
  if (!Number.isFinite(v)) return '—'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
      <span>{v.toFixed(0)}%</span>
      {pair ? <span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${pair[0]}/${pair[1]}`}</span> : null}
    </span>
  )
}
