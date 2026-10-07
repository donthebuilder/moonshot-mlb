'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { firstPitchRows } from '../lib/mlb/firstPitch'
import DenseTable from './DenseTable'

// FIRST PITCH vs TONIGHT'S ARM (2026-10-07, Donovan: after Props, "batter-vs-pitcher first-pitch
// splits; if there is no data show nothing"). One DenseTable (skin v2): career, then each of his
// last seasons against this pitcher, over the 0-0 pitches he has really seen from him (Statcast,
// the same download the head-to-head makes: lib/savant.js savantPitchRows, cached per URL).
// No first pitch on record -> the component renders nothing, not an empty box.
// `loader` and `words` let another sport hand in its own pitch rows and its own words.
export default function FirstPitchSplit({ batterId, pitcherId, pitcherName, loader = null, words = {} }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    setRows(null)
    if (!batterId || !pitcherId) return undefined
    const load = loader || ((b, p) => import('../lib/savant').then((m) => m.savantPitchRows(b, { pitcherId: p, career: true })))
    Promise.resolve(load(batterId, pitcherId)).then((r) => { if (alive) setRows(firstPitchRows(r)) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [batterId, pitcherId, loader])

  if (!rows || !rows.length) return null
  const head = words.title || 'First pitch'
  const cols = [
    { key: 'label', label: 'Span', group: 'Window', w: 64, heat: false, sticky: true, bold: true },
    { key: 'pitches', label: 'P', group: 'Window', w: 36, dp: 0, heat: false, title: 'First pitches (0-0) he has seen from this pitcher.' },
    { key: 'swingPct', label: 'Swing%', group: 'Approach', w: 58, dp: 0, title: 'Share of first pitches he swung at.' },
    { key: 'whiffPct', label: 'Whiff%', group: 'Approach', w: 58, dp: 0, invert: true, title: 'Misses per swing on the first pitch.' },
    { key: 'takeStrikePct', label: 'Called K%', group: 'Approach', w: 66, dp: 0, invert: true, title: 'Share of first pitches taken for a called strike.' },
    { key: 'inPlay', label: 'BIP', group: 'Result', w: 40, dp: 0, title: 'First pitches put in play.' },
    { key: 'hits', label: 'H', group: 'Result', w: 34, dp: 0 },
    { key: 'hr', label: 'HR', group: 'Result', w: 36, dp: 0 },
    { key: 'hitPerBip', label: 'H/BIP', group: 'Result', w: 52, dp: 0, title: 'Hits per ball put in play on the first pitch.' },
  ]
  return (
    <div style={{ margin: '4px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{head} vs {pitcherName || 'tonight’s starter'}</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows[0].pitches} first pitches · Statcast, live</span>
      </div>
      <DenseTable rows={rows} columns={cols} initialSort={null} maxHeight={9999} bare
        caption="First pitch = the 0-0 pitch of a plate appearance. Swing% counts swings, fouls and balls in play; Whiff% is per swing. Small samples are colour, not a call." />
    </div>
  )
}
