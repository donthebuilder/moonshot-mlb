'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import DenseTable from '../DenseTable'
import { fetchPitcherDetail } from '../../lib/dataSource'
import { hotColdZones } from '../../lib/situational'
import { seqColor } from '../../lib/scales'
import { inkOn } from '../../lib/palette'
import { mlbHeadshot } from '../../lib/mlbTeams'
import { hr9Color } from '../../lib/hr9'

// ⚔ THE MATCHUP -- the card's Pitches tab, rebuilt (2026-10-23, Donovan: "home run by pitch type, pitch by pitch, remove ...
// [the batter] vs pitch type, I just don't understand it ... three different like column types ... the strike map ... not
// showing like the alignment or like if they're matching up pitcher zones ... show the numbers ... it sucks ... the arsenal,
// you can kind of remove that ... all of this can just be remade into better graphs ... what's been going on, that shit is
// just terrible"). Plan: claude/BATCH-MLB-CARD-V3-PLAN-2026-10-23.txt (B3).
//
// Three pieces, numbers not sentences:
//   THE ARM       his face and his line, in tiles; HR/9 coloured by the site's one HR/9 rule (lib/hr9)
//   PITCH BY PITCH ONE table: each pitch he throws to this side, how much, what it gives up, and what THIS hitter does to it.
//                 A ★ marks a main pitch (15%+ of the mix) the hitter hits harder than he hits everything else (10+ balls in
//                 play on it: the card's own sample gate). Nothing else is judged.
//   THE ZONES     two strike zones side by side, the same nine boxes: where the hitter slugs and where the arm throws. A box
//                 that is top-3 on BOTH is ringed on both and named under them -- the overlap is the whole point.
// Sources: the bot's starter file (arsenal by side) or, when it has none, Statcast live (lib/savant savantPitcherArsenal); the
// batter file's pitch-type profile or his Statcast balls live; MLB's hot/cold zones for both men (season). Nothing invented:
// a missing number is a dash, a thin one is in brackets.

export const PITCH_NAMES = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', CU: 'Curve', KC: 'K-Curve', CH: 'Changeup',
  FS: 'Splitter', FA: 'Fastball', SV: 'Slurve', KN: 'Knuckle', EP: 'Eephus', FO: 'Forkball', CS: 'Slow curve',
}
const MIN_BBE = 10       // the card's sample gate (components/tabs/PitchBreakdown.js)
const MAIN_PITCH = 15    // a "main pitch": 15%+ of what he throws to this side
const num = (v) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(x) ? x : null }
const pct = (v) => (v == null ? null : v <= 1 ? v * 100 : v)   // the bot writes some rates 0-1, some 0-100
const d3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const thin = (r, s) => (r?.hBbe != null && r.hBbe < MIN_BBE ? `(${s})` : s)

// ── the data ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function useArsenal(pitcherId, hand, slateMode) {
  const [detail, setDetail] = useState(undefined)
  const [live, setLive] = useState(null)
  useEffect(() => {
    let alive = true
    setDetail(undefined); setLive(null)
    if (!pitcherId) { setDetail(null); return undefined }
    fetchPitcherDetail(pitcherId, slateMode).then(({ data }) => { if (alive) setDetail(data || null) }).catch(() => { if (alive) setDetail(null) })
    return () => { alive = false }
  }, [pitcherId, slateMode])
  const key = hand === 'L' ? 'pitcher_pitch_mix_vs_lhb' : hand === 'R' ? 'pitcher_pitch_mix_vs_rhb' : null
  const botRows = (key && detail?.[key]?.pitch_type_summary) || []
  useEffect(() => {
    if (detail === undefined || botRows.length || !pitcherId) return undefined
    let alive = true
    import('../../lib/savant').then(({ savantPitcherArsenal }) => savantPitcherArsenal(pitcherId)).then((a) => { if (alive) setLive(a || null) }).catch(() => {})
    return () => { alive = false }
  }, [detail, pitcherId, botRows.length])
  return useMemo(() => {
    if (detail === undefined) return { rows: null, source: null }
    if (botRows.length) {
      return {
        source: 'bot',
        rows: botRows.map((a) => {
          const code = String(a.pitch_code || a.pitch_type || '')
          const bbe = num(a.bbe_allowed ?? a.bbe), hr = num(a.hr_allowed ?? a.hr)
          return { code, use: num(a.usage_pct ?? a.usage), pBbe: bbe, pHr: hr, pEv: num(a.avg_ev_allowed ?? a.avg_ev), pWhiff: pct(num(a.whiff_pct)), pXwoba: num(a.xwoba_allowed ?? a.xwoba) }
        }),
      }
    }
    const side = live ? (hand === 'L' ? live.vsL : hand === 'R' ? live.vsR : live.overall) || live.overall : null
    if (!side?.length) return { rows: live === null ? null : [], source: 'live' }
    return { source: 'live', rows: side.map((a) => ({ code: a.code, use: num(a.usage), pBbe: num(a.bbe), pHr: num(a.hr), pEv: num(a.ev), pWhiff: num(a.whiffPct), pXwoba: null })) }
  }, [detail, live, hand, botRows])
}

function useHitterByPitch(player, detail, arm) {
  const prof = player?.batter_pitch_type_profile || detail?.batter_pitch_type_profile
  const bot = (arm === 'L' ? prof?.vs_lhp?.by_pitch : arm === 'R' ? prof?.vs_rhp?.by_pitch : null) || prof?.by_pitch || null
  const has = bot && Object.keys(bot).length > 0
  const pid = player?.player_id || player?.id
  const [live, setLive] = useState(null)
  useEffect(() => {
    if (has || !pid) { setLive(null); return undefined }
    let alive = true
    import('../../lib/savant').then(({ savantBattedBalls }) => savantBattedBalls(pid)).then((rows) => { if (alive) setLive(rows || []) }).catch(() => { if (alive) setLive([]) })
    return () => { alive = false }
  }, [has, pid])
  return useMemo(() => {
    if (has) {
      const out = {}
      for (const [code, d] of Object.entries(bot)) out[code] = { bbe: num(d.bbe), hr: num(d.hr), ev: num(d.ev), xwoba: num(d.xwoba), whiff: pct(num(d.whiff)) }
      return { by: out, source: 'bot' }
    }
    if (!Array.isArray(live)) return { by: null, source: null }
    const acc = {}
    for (const h of live) {
      if (h?.is_k) continue
      if (arm && String(h.arm || '').toUpperCase() !== arm) continue
      const code = String(h.pitch_type || '').trim()
      if (!code || code === 'nan') continue
      const a = acc[code] || (acc[code] = { bbe: 0, hr: 0, evSum: 0, evN: 0 })
      a.bbe += 1; if (h.is_hr) a.hr += 1
      const ev = Number(h.ev); if (Number.isFinite(ev)) { a.evSum += ev; a.evN += 1 }
    }
    const out = {}
    for (const [code, a] of Object.entries(acc)) out[code] = { bbe: a.bbe, hr: a.hr, ev: a.evN ? a.evSum / a.evN : null, xwoba: null, whiff: null }
    return { by: out, source: 'live' }
  }, [has, bot, live, arm])
}

// ── the arm ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function Tile({ label, value, color = null, title }) {
  return (
    <div title={title} style={{ textAlign: 'center', padding: '5px 2px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.03)', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, fontFamily: NUM_FONT, color: color || C.text }}>{value}</div>
    </div>
  )
}

function TheArm({ p, bats }) {
  const side = bats === 'L' ? num(p?.pitcher_hr9_vs_lhb) : bats === 'R' ? num(p?.pitcher_hr9_vs_rhb) : null
  const hr9 = num(p?.pitcher_hr9)
  const r2 = (v) => (v == null ? '—' : v.toFixed(2))
  const tiles = [
    ['ERA', r2(num(p?.pitcher_era)), null, 'Earned runs per nine this season'],
    ['WHIP', r2(num(p?.pitcher_whip)), null, 'Walks + hits per inning'],
    ['HR/9', r2(hr9), hr9 != null ? hr9Color(hr9) : null, 'Homers per nine innings (orange = leaky, the site’s HR/9 rule)'],
    ...(bats ? [[`HR/9 v ${bats}HB`, r2(side), side != null ? hr9Color(side) : null, `Homers per nine to ${bats === 'L' ? 'left' : 'right'}-handed bats -- this hitter's side`]] : []),
    ['EV ALLOWED', num(p?.pitcher_ev_allowed) != null ? num(p.pitcher_ev_allowed).toFixed(1) : '—', null, 'Average exit velocity he gives up'],
    ['BARREL%', pct(num(p?.pitcher_barrel_allowed)) != null ? `${pct(num(p.pitcher_barrel_allowed)).toFixed(1)}%` : '—', null, 'Barrels he allows per ball in play'],
    ['MEATBALL%', pct(num(p?.pitcher_meatball_pct)) != null ? `${pct(num(p.pitcher_meatball_pct)).toFixed(0)}%` : '—', null, 'Share of his pitches down the middle'],
    ['K%', pct(num(p?.pitcher_k_rate)) != null ? `${pct(num(p.pitcher_k_rate)).toFixed(0)}%` : '—', null, 'Strikeouts per batter faced'],
  ]
  return (
    <section aria-label="Tonight's pitcher" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, minWidth: 0 }}>
        {p?.pitcher_id ? <img src={mlbHeadshot(p.pitcher_id, 120)} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${C.border2}`, background: C.bg2, flexShrink: 0 }} /> : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p?.pitcher_id ? <a href={`#sport=mlb&tab=pitchers&pitcher=${p.pitcher_id}`} style={{ color: C.text, textDecoration: 'none' }} title="Open his file">{p.pitcher_name}</a> : p?.pitcher_name}
            <span style={{ color: C.text3, fontWeight: 700, fontSize: 11, fontFamily: NUM_FONT }}> {p?.pitcher_throws ? `${p.pitcher_throws}HP` : ''}{p?.pitcher_team ? ` · ${p.pitcher_team}` : ''}</span>
          </div>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>tonight’s starter · this season</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 4, maxWidth: 980 }}>
        {tiles.map(([l, v, c, t]) => <Tile key={l} label={l} value={v} color={c} title={t} />)}
      </div>
    </section>
  )
}

// ── pitch by pitch ─────────────────────────────────────────────────────────────────────────────────────────────────
function PitchByPitch({ arsenal, hitter, name, bats, arm }) {
  const rows = useMemo(() => {
    if (!arsenal.rows) return null
    const by = hitter.by || {}
    // his overall EV across every pitch type with balls in play: the line a pitch has to beat to earn the ★
    let evSum = 0, evN = 0
    for (const d of Object.values(by)) if (d.ev != null && d.bbe) { evSum += d.ev * d.bbe; evN += d.bbe }
    const myEv = evN ? evSum / evN : null
    return arsenal.rows.filter((a) => (a.use ?? 0) >= 1).sort((a, b) => (b.use ?? 0) - (a.use ?? 0)).map((a) => {
      const h = by[a.code] || {}
      const star = (a.use ?? 0) >= MAIN_PITCH && (h.bbe ?? 0) >= MIN_BBE && h.ev != null && myEv != null && h.ev > myEv
      return {
        _id: a.code, pitch: PITCH_NAMES[a.code] || a.code, star: star ? '★' : '',
        use: a.use, pHrBbe: a.pBbe ? (100 * (a.pHr || 0)) / a.pBbe : null, pEv: a.pEv, pWhiff: a.pWhiff,
        hBbe: h.bbe ?? null, hHr: h.hr ?? null, hEv: h.ev ?? null, hXwoba: h.xwoba ?? null,
      }
    })
  }, [arsenal, hitter])
  if (rows === null || hitter.by === null) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>Loading his pitches…</div>
  if (!rows.length) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>No pitch mix on file for tonight’s starter yet.</div>
  const last = String(name || 'him').split(' ').slice(-1)[0]
  const cols = [
    { key: 'pitch', label: 'Pitch', group: 'Pitch', w: 84, heat: false, sticky: true, bold: true, numeric: false },
    { key: 'star', label: '★', group: 'Pitch', w: 28, heat: false, numeric: false, title: `A main pitch (${MAIN_PITCH}%+ of the mix) ${last} hits harder than he hits everything else (${MIN_BBE}+ balls in play on it)` },
    { key: 'use', label: 'USE %', group: 'He throws', w: 50, dp: 0, primary: true, title: `Share of his pitches to ${bats ? `${bats}HB` : 'everyone'} this season` },
    { key: 'pHrBbe', label: 'HR/BBE', group: 'He throws', w: 54, dp: 1, title: 'Homers he allows per ball in play on this pitch (%)' },
    { key: 'pEv', label: 'EV', group: 'He throws', w: 44, dp: 1, title: 'Exit velocity he allows on it' },
    { key: 'pWhiff', label: 'WHIFF', group: 'He throws', w: 50, dp: 0, invert: true, title: 'Swings and misses per swing (inverted: a high whiff rate is the pitcher’s good outcome)' },
    { key: 'hBbe', label: 'BBE', group: `${last} vs it`, w: 40, heat: false, title: `${last}'s balls in play on this pitch${arm ? ` against ${arm}HP` : ''} -- the sample (under ${MIN_BBE}: rates in brackets)` },
    { key: 'hHr', label: 'HR', group: `${last} vs it`, w: 34, title: 'His homers off it' },
    { key: 'hEv', label: 'EV', group: `${last} vs it`, w: 46, fmt: (v, r) => (v == null ? '—' : thin(r, v.toFixed(1))), title: 'His exit velocity on it' },
    ...(hitter.source === 'bot' ? [{ key: 'hXwoba', label: 'xWOBA', group: `${last} vs it`, w: 54, fmt: (v, r) => (v == null ? '—' : thin(r, d3(v))), title: 'Expected wOBA on contact against it' }] : []),
  ]
  return (
    <DenseTable rows={rows} columns={cols} initialSort={null} maxRows={8} maxHeight={9999}
      dimRow={(r) => (r?._raw ?? r).hBbe != null && (r?._raw ?? r).hBbe < MIN_BBE}
      caption={`${arsenal.source === 'live' ? 'His mix live from Statcast' : 'His mix from his file'}${hitter.source === 'live' ? `; ${last}'s side live from Statcast (balls in play only)` : ''}. ★ = a main pitch ${last} hits harder than his average.`} />
  )
}

// ── the zones ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Catcher's view, zones 1-9 (MLB's numbering): 1 2 3 up, 4 5 6 middle, 7 8 9 down.
export const NINE = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
export const ZONE_WORD = { 1: 'up-in', 2: 'up', 3: 'up-away', 4: 'in', 5: 'middle', 6: 'away', 7: 'down-in', 8: 'down', 9: 'down-away' }
export const top3 = (vals) => new Set(Object.entries(vals).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k))

export function Zone({ title, sub, vals, fmt, ring, accent }) {
  const known = Object.values(vals).filter((v) => v != null)
  const lo = known.length ? Math.min(...known) : 0, hi = known.length ? Math.max(...known) : 1
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', fontFamily: NUM_FONT, color: C.text, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginBottom: 6 }}>{sub}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, aspectRatio: '3 / 3.6' }}>
        {NINE.map((z) => {
          const v = vals[z]
          const bg = v == null ? C.bg2 : seqColor(v, [lo, hi]) || C.bg2
          const on = ring.has(z)
          return (
            <div key={z} title={`${ZONE_WORD[z]}: ${v == null ? 'no data' : fmt(v)}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: bg,
              color: v == null ? C.text3 : inkOn(bg), font: `800 12px/1 ${NUM_FONT}`, boxShadow: on ? `inset 0 0 0 3px ${accent}` : 'none' }}>
              {v == null ? '—' : fmt(v)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TheZones({ p, last }) {
  const [hz, setHz] = useState(undefined)
  const [pz, setPz] = useState(undefined)
  const pid = p?.player_id || p?.id
  useEffect(() => {
    let alive = true
    setHz(undefined); setPz(undefined)
    hotColdZones(pid).then((d) => { if (alive) setHz(d || null) })
    if (p?.pitcher_id) hotColdZones(p.pitcher_id, 'pitching').then((d) => { if (alive) setPz(d || null) })
    else setPz(null)
    return () => { alive = false }
  }, [pid, p?.pitcher_id])
  if (hz === undefined || pz === undefined) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>Loading the zones…</div>
  // MLB keys the zones '01'..'09' (and '11'..'14' off the plate)
  const zk = (z) => `0${z}`
  const his = {}; NINE.forEach((z) => { his[z] = num(hz?.slg?.[zk(z)]?.value) })
  const counts = {}; NINE.forEach((z) => { counts[z] = num(pz?.pitches?.[zk(z)]?.value) })
  const total = Object.values(pz?.pitches || {}).reduce((s, x) => s + (num(x?.value) || 0), 0)
  const share = {}; NINE.forEach((z) => { share[z] = counts[z] != null && total ? (100 * counts[z]) / total : null })
  const hasHis = Object.values(his).some((v) => v != null), hasArm = Object.values(share).some((v) => v != null)
  if (!hasHis && !hasArm) return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>MLB has no zone numbers for this matchup yet.</div>
  const hTop = top3(his), aTop = top3(share)
  const both = new Set([...hTop].filter((z) => aTop.has(z)))
  const accent = C.orange
  return (
    <section aria-label="The zones">
      {/* side by side even on a phone: the two boxes are the comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 240px))', gap: 12 }}>
        {hasHis && <Zone title={`${last} slugs`} sub="SLG by zone · this season" vals={his} fmt={(v) => d3(v)} ring={both} accent={accent} />}
        {hasArm && <Zone title={`${String(p?.pitcher_name || 'He').split(' ').slice(-1)[0]} throws`} sub="% of his pitches · all hitters" vals={share} fmt={(v) => `${v.toFixed(0)}%`} ring={both} accent={accent} />}
      </div>
      <div style={{ marginTop: 8, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: both.size ? accent : C.text3 }}>
        {hasHis && hasArm ? (both.size ? `OVERLAP · ${[...both].map((z) => ZONE_WORD[z]).join(' · ')}` : 'NO OVERLAP · his best zones aren’t where this arm lives') : null}
      </div>
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>Catcher’s view. A ring = a top-3 box for both men.</div>
    </section>
  )
}

// ── the tab ────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function MatchupTab({ player: p, detail = null, slateMode }) {
  const bats = String(p?.bats || p?.handedness || '').toUpperCase().slice(0, 1)
  const hand = bats === 'L' || bats === 'R' ? bats : (bats === 'S' ? (String(p?.pitcher_throws || '').toUpperCase() === 'L' ? 'R' : 'L') : null)
  const arm = String(p?.pitcher_throws || '').toUpperCase().slice(0, 1) || null
  const arsenal = useArsenal(p?.pitcher_id, hand, slateMode)
  const hitter = useHitterByPitch(p, detail, arm)
  const last = String(p?.name || p?.player_name || 'him').split(' ').slice(-1)[0]
  if (!p?.pitcher_id && !p?.pitcher_name) return <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0' }}>No starter announced for this game yet.</div>
  return (
    <div className="matchup-tab">
      <TheArm p={p} bats={hand} />
      <div className="matchup-grid">
        <section aria-label="Pitch by pitch" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', fontFamily: NUM_FONT, marginBottom: 6 }}>PITCH BY PITCH <span style={{ color: C.text3, fontWeight: 700, fontSize: 10 }}>to {hand ? `${hand}HB` : 'everyone'}</span></div>
          <PitchByPitch arsenal={arsenal} hitter={hitter} name={p?.name || p?.player_name} bats={hand} arm={arm} />
        </section>
        <TheZones p={p} last={last} />
      </div>
    </div>
  )
}

