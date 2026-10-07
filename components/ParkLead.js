'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import DenseTable from './DenseTable'

// DOES HE GET HURT HERE (2026-10-07, Donovan: the lineup block under the pitcher's matchup should lead
// with the park). One DenseTable row from the park fields the slate row already carries (the bot's
// park_hr_factor / park_hits_factor, indexed to 1.00, and the weather's HR effect in percent): no new
// call. Renders nothing when the slate publishes no park factor. `src` is any lineup row; `words` lets
// another sport hand in its own question and verdict words.
export const parkVerdict = (hrFactor, words = {}) => {
  if (hrFactor == null || !Number.isFinite(hrFactor)) return null
  if (hrFactor >= 1.05) return words.up || 'Yes: homers play up'
  if (hrFactor <= 0.95) return words.down || 'No: homers play down'
  return words.flat || 'Neutral for homers'
}

const sgn = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`)

export default function ParkLead({ src, pitcherName = '', words = {} }) {
  const hr = n(src?.park_hr_factor, null)
  if (hr == null) return null
  const hits = n(src?.park_hits_factor, null)
  const wx = n(src?.weather_hr_effect_pct, null)
  const venue = clean(src?.venue_name, '')
  const verdict = parkVerdict(hr, words)
  const rows = [{
    key: 'park', venue: venue || 'Tonight’s park', verdict,
    hr: 100 * (hr - 1), hits: hits != null ? 100 * (hits - 1) : null, wx,
  }]
  const cols = [
    { key: 'venue', label: 'Park', group: 'Where', w: 130, heat: false, bold: true, sticky: true },
    { key: 'verdict', label: 'Hurt here?', group: 'Where', w: 150, heat: false },
    { key: 'hr', label: 'HR %', group: 'Park factor', w: 54, dp: 0, fmt: sgn, title: 'How much more (or less) the park gives up homers than an average park, in percent.' },
    { key: 'hits', label: 'Hits %', group: 'Park factor', w: 56, dp: 0, fmt: sgn },
    { key: 'wx', label: 'Air %', group: 'Weather', w: 52, dp: 0, fmt: sgn, title: 'The weather’s own effect on homers tonight, in percent. Blank when the roof or the forecast gives none.' },
  ]
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Does {clean(pitcherName, 'he')} get hurt here?</span>
        <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>{verdict}</span>
      </div>
      <DenseTable rows={rows} columns={cols} initialSort={null} maxHeight={9999} bare heatMode="none"
        caption="From the slate’s park fields: the park factor is indexed to an average park, so +10 means ten percent more homers. Air is tonight’s weather effect, when there is one." />
    </div>
  )
}
