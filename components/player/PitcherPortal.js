'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import DenseTable from '../DenseTable'
import { hotColdZones } from '../../lib/situational'
import { useArsenal, Zone, top3, NINE, ZONE_WORD, PITCH_NAMES } from './MatchupTab'

// ⚾ THE PITCHER'S CARD, THE BATTER CARD'S WAY (2026-10-23, Donovan: "what about the ... pitch thing inside of the player model?
// That's where this [all] stemmed from ... once it gets clear, we can just share that across all four sports"). The pieces the
// rebuilt PitcherModal draws, all numbers, no sentences:
//   PitcherSplitsTable  every split he has, one table (it was a pill picker showing one split at a time)
//   PitcherArsenal      each pitch: how much to lefties, how much to righties, and what it gives up to each side
//   PitcherZones        where he throws and where he gets hit, the same nine boxes; a box top-3 on both is where he gets hurt
// Sources are the ones the card already used: the slate row's pitcher_* fields and the bot's published splits first, MLB's
// statSplits live when the bot has none (lib/situational pitcherSplitBoard), the starter file or Statcast for the arsenal
// (MatchupTab useArsenal), MLB's hot/cold zones for the boxes.

const num = (v) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(x) ? x : null }
const f2 = (v) => (v == null ? '—' : v.toFixed(2))
const f3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))

// the bot's situational keys -> the live StatsAPI sitCode for the same question (the old SplitsControl's map)
const SIT_TO_LIVE = { home: 'h', away: 'a', day: 'd', night: 'n', risp: 'risp', ahead: 'ac', behind: 'bc' }
const SITS = [['home', 'In park'], ['away', 'Road'], ['day', 'Day'], ['night', 'Night'], ['risp', 'RISP'], ['ahead', 'Ahead'], ['behind', 'Behind']]
const LIVE_ONLY = [['pi000', 'Pitches 1–75'], ['pi760', 'Pitch 76+'], ['i01', '1st inning']]

export function PitcherSplitsTable({ src, pitcherId }) {
  const [live, setLive] = useState({})
  useEffect(() => {
    if (!pitcherId) return undefined
    let alive = true
    import('../../lib/situational').then(({ pitcherSplitBoard }) => pitcherSplitBoard(pitcherId)).then((b) => { if (alive) setLive(b || {}) }).catch(() => {})
    return () => { alive = false }
  }, [pitcherId])
  const n = (k) => num(src(k))
  const sit = src('pitcher_situational_splits') || {}
  const l3n = n('pitcher_l3_starts_found') || 0
  const rows = [
    { _id: 'season', split: 'Season', hr9: n('pitcher_hr9'), whip: n('pitcher_whip'), era: n('pitcher_era'), ops: null, hr: n('pitcher_hr_allowed'), bf: null },
    ...(n('pitcher_hr9_vs_lhb') != null ? [{ _id: 'lhb', split: 'vs LHB', hr9: n('pitcher_hr9_vs_lhb'), whip: n('pitcher_whip_vs_lhb'), era: null, ops: null, hr: n('pitcher_hr_vs_lhb'), bf: null }] : []),
    ...(n('pitcher_hr9_vs_rhb') != null ? [{ _id: 'rhb', split: 'vs RHB', hr9: n('pitcher_hr9_vs_rhb'), whip: n('pitcher_whip_vs_rhb'), era: null, ops: null, hr: n('pitcher_hr_vs_rhb'), bf: null }] : []),
    ...(l3n > 0 ? [{ _id: 'l3', split: `Last ${l3n} starts`, hr9: n('pitcher_l3_hr9'), whip: n('pitcher_l3_whip'), era: n('pitcher_l3_era'), ops: null, hr: null, bf: null }] : []),
    ...SITS.map(([k, label]) => {
      const bot = sit[k] && sit[k].hr9 != null ? sit[k] : null
      const b = bot || live[SIT_TO_LIVE[k]]
      return b ? { _id: k, split: label, hr9: num(b.hr9), whip: num(b.whip), era: num(b.era), ops: num(b.ops), hr: num(b.hr), bf: num(b.bf) } : null
    }).filter(Boolean),
    ...LIVE_ONLY.map(([code, label]) => (live[code] ? { _id: code, split: label, hr9: num(live[code].hr9), whip: num(live[code].whip), era: num(live[code].era), ops: num(live[code].ops), hr: num(live[code].hr), bf: num(live[code].bf) } : null)).filter(Boolean),
  ]
  const cols = [
    { key: 'split', label: 'Split', group: 'Split', w: 104, heat: false, sticky: true, bold: true, numeric: false },
    { key: 'bf', label: 'BF', group: 'Sample', w: 40, heat: false, title: 'Batters faced in this split (blank on the season-long rows the bot publishes without it)' },
    { key: 'hr9', label: 'HR/9', group: 'What he allows', w: 50, fmt: f2, primary: true, title: 'Homers per nine -- bright = a leak, good for the bats' },
    { key: 'hr', label: 'HR', group: 'What he allows', w: 38, title: 'Homers allowed in this split' },
    { key: 'ops', label: 'OPS', group: 'What he allows', w: 50, fmt: f3, title: 'OPS against in this split' },
    { key: 'whip', label: 'WHIP', group: 'Traffic', w: 50, fmt: f2, title: 'Walks + hits per inning' },
    { key: 'era', label: 'ERA', group: 'Traffic', w: 48, fmt: f2 },
  ]
  return (
    <section aria-label="His splits">
      <div style={{ font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text, marginBottom: 6 }}>SPLITS <span style={{ color: C.text3, fontWeight: 700, fontSize: 10 }}>every cut, one table</span></div>
      <DenseTable rows={rows} columns={cols} initialSort={null} maxRows={16} maxHeight={9999} dimRow={(r) => { const x = r?._raw ?? r; return x.bf != null && x.bf < 40 }}
        caption="Bright = good news for the bats. Under 40 batters faced is dimmed. Situational rows are the bot's when it publishes them, else MLB's own split, live." />
    </section>
  )
}

export function PitcherArsenal({ pitcherId, slateMode }) {
  const vsL = useArsenal(pitcherId, 'L', slateMode)
  const vsR = useArsenal(pitcherId, 'R', slateMode)
  if (!vsL.rows || !vsR.rows) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>Loading his arsenal…</div>
  const codes = [...new Set([...vsL.rows, ...vsR.rows].map((a) => a.code))]
  const by = (rows, c) => rows.find((a) => a.code === c) || {}
  const rows = codes.map((c) => {
    const l = by(vsL.rows, c), r = by(vsR.rows, c)
    const hrBbe = (a) => (a.pBbe ? (100 * (a.pHr || 0)) / a.pBbe : null)
    return { _id: c, pitch: PITCH_NAMES[c] || c, useL: l.use ?? null, useR: r.use ?? null, hrL: hrBbe(l), hrR: hrBbe(r), ev: r.pEv ?? l.pEv ?? null, whiff: r.pWhiff ?? l.pWhiff ?? null }
  }).filter((x) => (x.useL ?? 0) >= 1 || (x.useR ?? 0) >= 1).sort((a, b) => ((b.useL ?? 0) + (b.useR ?? 0)) - ((a.useL ?? 0) + (a.useR ?? 0)))
  if (!rows.length) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>No pitch mix on file for him yet.</div>
  const cols = [
    { key: 'pitch', label: 'Pitch', group: 'Pitch', w: 84, heat: false, sticky: true, bold: true, numeric: false },
    { key: 'useL', label: 'vs LHB', group: 'How much (%)', w: 56, dp: 0, title: 'Share of his pitches to left-handed bats' },
    { key: 'useR', label: 'vs RHB', group: 'How much (%)', w: 56, dp: 0, title: 'Share of his pitches to right-handed bats' },
    { key: 'hrL', label: 'vs LHB', group: 'HR / ball in play (%)', w: 56, dp: 1, title: 'Homers per ball in play on this pitch, to lefties -- bright = a leak' },
    { key: 'hrR', label: 'vs RHB', group: 'HR / ball in play (%)', w: 56, dp: 1, title: 'Homers per ball in play on this pitch, to righties' },
    { key: 'ev', label: 'EV', group: 'Contact', w: 46, dp: 1, title: 'Exit velocity allowed on it' },
    { key: 'whiff', label: 'WHIFF', group: 'Contact', w: 50, dp: 0, invert: true, title: 'Swings and misses per swing (inverted: high is his strength)' },
  ]
  return (
    <section aria-label="His arsenal" style={{ minWidth: 0 }}>
      <div style={{ font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text, marginBottom: 6 }}>ARSENAL <span style={{ color: C.text3, fontWeight: 700, fontSize: 10 }}>to each side</span></div>
      <DenseTable rows={rows} columns={cols} initialSort={null} maxRows={10} maxHeight={9999}
        caption={`${vsL.source === 'live' || vsR.source === 'live' ? 'Live from Statcast (his file has no split).' : 'From his file.'} Bright = good for the bats.`} />
    </section>
  )
}

export function PitcherZones({ pitcherId, name }) {
  const [z, setZ] = useState(undefined)
  useEffect(() => {
    let alive = true
    setZ(undefined)
    if (!pitcherId) { setZ(null); return undefined }
    hotColdZones(pitcherId, 'pitching').then((d) => { if (alive) setZ(d || null) })
    return () => { alive = false }
  }, [pitcherId])
  if (z === undefined) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>Loading his zones…</div>
  const zk = (k) => `0${k}`
  const total = Object.values(z?.pitches || {}).reduce((s, x) => s + (num(x?.value) || 0), 0)
  const share = {}, slg = {}
  NINE.forEach((k) => { const c = num(z?.pitches?.[zk(k)]?.value); share[k] = c != null && total ? (100 * c) / total : null; slg[k] = num(z?.slg?.[zk(k)]?.value) })
  if (!Object.values(share).some((v) => v != null)) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>MLB has no zone numbers for him yet.</div>
  const hurt = new Set([...top3(share)].filter((k) => top3(slg).has(k)))
  const last = String(name || 'He').split(' ').slice(-1)[0]
  return (
    <section aria-label="His zones">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 240px))', gap: 12 }}>
        <Zone title={`${last} throws`} sub="% of his pitches · this season" vals={share} fmt={(v) => `${v.toFixed(0)}%`} ring={hurt} accent={C.orange} />
        <Zone title="Gets hit" sub="SLG against by zone" vals={slg} fmt={(v) => f3(v)} ring={hurt} accent={C.orange} />
      </div>
      <div style={{ marginTop: 8, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: hurt.size ? C.orange : C.text3 }}>
        {hurt.size ? `WHERE HE GETS HURT · ${[...hurt].map((k) => ZONE_WORD[k]).join(' · ')}` : 'NO OVERLAP · he isn’t living where he gets hit'}
      </div>
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>Catcher’s view. A ring = a top-3 box on both: he throws there a lot and gets hit there.</div>
    </section>
  )
}
