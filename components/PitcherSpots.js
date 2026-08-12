'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, hrScore, hitScore, prodScore, median } from '../lib/player'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// Where this pitcher actually gets hurt, spot by spot.
//
// Ported from streamlit_app.py's spot_answer(). The bot stamps every BATTER
// row with the pitcher's damage in THAT batter's lineup slot
// (pitcher_spot_damage_score / _label / _reason), so walking his opposing
// lineup reconstructs the full nine-spot map — the same structure Streamlit
// builds, assembled from the other side.
//
// The verdict thresholds are copied exactly, including the order they're
// checked in. Sample size is tested FIRST and on purpose: 8 plate appearances
// can't answer anything, and the bot's own HOT/WARM labels get shaky under
// about 15. Getting that order wrong turns a three-PA fluke into "he gets
// hurt here", which is the single most expensive mistake this panel could make.

function verdictFor({ dmg, pa, label, ownMed }) {
  if (pa < 10) return { text: 'NOT ENOUGH DATA', color: C.text3, rank: 0 }
  if (label === 'HOT' || label === 'WARM' || (dmg >= 50 && dmg > ownMed + 12)) {
    return { text: 'YES — he gets hurt here', color: C.red, rank: 3 }
  }
  if (dmg <= 15 || label === 'PITCHER ADV') {
    return { text: "NO — pitcher's advantage", color: C.green, rank: 1 }
  }
  return { text: 'NEUTRAL', color: C.text2, rank: 2 }
}

// "spot #1: 39 PA, 0.324 SLG, 0.088 ISO, HR rate 2.6%, XBH rate 2.6%, HH 27.3%"
function parseReason(reason) {
  const s = clean(reason, '')
  const num = (re) => {
    const m = s.match(re)
    return m ? Number(m[1]) : null
  }
  return {
    pa: num(/([\d.]+)\s*PA/i),
    slg: num(/([\d.]+)\s*SLG/i),
    iso: num(/([\d.]+)\s*ISO/i),
    hrRate: num(/HR rate\s*([\d.]+)%/i),
    xbhRate: num(/XBH rate\s*([\d.]+)%/i),
    hh: num(/HH\s*([\d.]+)%/i),
  }
}

const COLUMNS = [
  { key: 'spot',    label: 'Spot',   heat: false, w: 40, mono: true, bold: true, sticky: true },
  { key: 'batter',  label: 'Batter', heat: false, w: 146, bold: true },
  { key: 'bats',    label: 'B',      heat: false, w: 22, mono: true, dim: true },
  { key: 'label',   label: 'Bot call', heat: false, w: 96, dim: true },
  { key: 'verdict', label: 'Verdict', heat: false, w: 168,
    fmt: (v, r) => v,
  },
  { key: 'weak',    label: '★',      flag: true, mark: '★', w: 30 },
  // 2026-08-12: "Damage" here was matching the GLOSSARY entry written for a
  // HITTER's own damage-conversion rate ("when HE hits it hard..."). This is
  // the opposite side of the ball — how much damage HITTERS have done TO
  // THIS PITCHER in this lineup spot.
  { key: 'damage',  label: 'Damage', w: 52, dp: 1,
    explain: 'How much damage hitters have done against this pitcher specifically in this lineup spot — his vulnerability here, not a hitter\'s own damage-conversion rate.' },
  { key: 'vsOwn',   label: 'vs own', w: 52, dp: 1,
    title: 'Damage in this spot minus the median across his other eight' },
  { key: 'pa',      label: 'PA',     w: 40 },
  { key: 'slg',     label: 'SLG ag', w: 50, dp: 3 },
  { key: 'iso',     label: 'ISO ag', w: 50, dp: 3 },
  // Same GLOSSARY['hr'] score-collision fix as MatchupPitcher.js's tables.
  { key: 'hrRate',  label: 'HR%',    w: 44, dp: 1,
    explain: 'Home runs as a share of plate appearances against hitters in this lineup spot.' },
  { key: 'xbhRate', label: 'XBH%',   w: 46, dp: 1 },
  { key: 'hh',      label: 'HH%',    w: 44, dp: 1 },
  { key: 'zone',    label: 'Zone',   w: 44, dp: 1 },
  { key: 'hr',      label: 'HR scr', w: 48, dp: 1 },
  { key: 'hit',     label: 'Hit',    w: 44, dp: 1 },
  { key: 'hrr',     label: 'HRR',    w: 44, dp: 1 },
]

export default function PitcherSpots({ pitcher, onPlayerClick }) {
  const lineup = useMemo(() => (pitcher?.lineup || []).filter(Boolean), [pitcher])

  const spots = useMemo(() => {
    const built = lineup.map((b) => {
      const raw = b.raw || {}
      const parsed = parseReason(raw.pitcher_spot_damage_reason)
      return {
        _key: b.player_id ?? b.name,
        _raw: raw,
        spot: b.lineup_spot ?? null,
        batter: clean(b.name, nameOf(raw)),
        bats: clean(b.bats, '?'),
        label: clean(raw.pitcher_spot_damage_label, '—'),
        weak: b.weak_spot_flag ? 1 : 0,
        weakReason: clean(raw.weak_spot_reason, ''),
        damage: n(raw.pitcher_spot_damage_score, 0),
        zone: n(raw.pitcher_zone_damage_score, 0),
        pa: parsed.pa ?? 0,
        slg: parsed.slg ?? 0,
        iso: parsed.iso ?? 0,
        hrRate: parsed.hrRate ?? 0,
        xbhRate: parsed.xbhRate ?? 0,
        hh: parsed.hh ?? 0,
        hr: n(b.hr_score, hrScore(raw)),
        hit: hitScore(raw),
        hrr: prodScore(raw),
      }
    })

    // Median across his OTHER spots, per spot -- the comparison Streamlit makes.
    return built.map((r) => {
      const others = built.filter((o) => o.spot !== r.spot).map((o) => o.damage)
      const ownMed = median(others)
      const v = verdictFor({ dmg: r.damage, pa: r.pa, label: r.label, ownMed })
      return { ...r, ownMed, vsOwn: r.damage - ownMed, verdict: v.text, verdictColor: v.color, severity: v.rank }
    })
  }, [lineup])

  const [pick, setPick] = useState(null)

  if (!spots.length) return null

  const worst = [...spots].sort((a, b) => b.damage - a.damage)[0]
  // Default to his worst spot rather than the 1-hole: opening on #1 every time
  // makes you click through nine radios to find the answer you came for.
  const sel = spots.find((r) => String(r.spot) === String(pick)) || worst
  const hurtCount = spots.filter((s) => s.severity === 3).length
  const thinCount = spots.filter((s) => s.pa < 10).length

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
        Does he get hurt in the …
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {spots.map((r) => {
          const on = String(r.spot) === String(sel.spot)
          return (
            <button
              key={r.spot ?? r.batter}
              onClick={(e) => { e.stopPropagation(); setPick(r.spot) }}
              title={`${r.batter} · ${r.verdict}`}
              style={{
                padding: '3px 10px', borderRadius: 7, cursor: 'pointer',
                fontSize: 10.5, fontWeight: 700, fontFamily: NUM_FONT,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >{r.spot ?? '?'}-hole{r.weak ? ' ★' : ''}</button>
          )
        })}
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${sel.verdictColor}`, borderRadius: 12,
        padding: '12px 15px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: C.text3, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Does {clean(pitcher?.pitcher_name, 'this starter')} get hurt in the {sel.spot ?? '?'}-hole?
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: sel.verdictColor, margin: '4px 0 3px' }}>
          {sel.verdict}
        </div>
        <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT }}>
          damage {sel.damage.toFixed(1)} · {sel.label} · {sel.pa} PA · ranks #{
            [...spots].sort((a, b) => b.damage - a.damage).findIndex((r) => r.spot === sel.spot) + 1
          } of {spots.length} among his own spots
        </div>
      </div>

      <div style={{
        display: 'grid', gap: 8, marginBottom: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {[
          ['Damage in spot', sel.damage.toFixed(1), `${sel.vsOwn >= 0 ? '+' : ''}${sel.vsOwn.toFixed(1)} vs his other spots`],
          ['SLG / ISO allowed', sel.slg.toFixed(3), `ISO ${sel.iso.toFixed(3)}`],
          ['HR / hard-hit', `${sel.hrRate.toFixed(1)}%`, `HH ${sel.hh.toFixed(0)}%`],
          ['Sample', `${sel.pa} PA`, sel.pa < 10 ? 'too thin to trust' : 'usable'],
        ].map(([l, v, sub]) => (
          <div key={l} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 11px',
          }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: C.text3, fontWeight: 700 }}>{l}</div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 800, color: C.orange }}>{v}</div>
            <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 4, fontFamily: NUM_FONT }}>
        {clean(sel._raw?.pitcher_spot_damage_reason, '')}
      </div>
      <div style={{ fontSize: 11, color: C.text2, marginBottom: 12 }}>
        Batting {sel.spot ?? '?'} today: <b style={{ color: C.text }}>{sel.batter}</b> ({sel.bats}HB)
        {' · '}HR {sel.hr.toFixed(0)} · HRR {sel.hrr.toFixed(0)}
      </div>
      {sel.weakReason && (
        <div style={{ fontSize: 11, color: C.orange, marginBottom: 12, lineHeight: 1.5 }}>
          ★ {sel.weakReason}
        </div>
      )}
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 10 }}>
        {hurtCount} of {spots.length} spots read as live
        {thinCount > 0 && ` · ${thinCount} on under 10 PA`}
      </div>

      <Heatmap
        rows={spots.map((r) => ({
          label: `#${r.spot ?? '?'}  ${r.batter}`,
          _raw: r._raw,
          values: {
            Damage: r.damage,
            'vs own': r.vsOwn,
            Zone: r.zone,
            PA: r.pa,
            'SLG ag': r.slg * 1000,
            'ISO ag': r.iso * 1000,
            'HR%': r.hrRate,
            'XBH%': r.xbhRate,
            'HH%': r.hh,
            'HR scr': r.hr,
          },
        }))}
        columns={['Damage', 'vs own', 'Zone', 'PA', 'SLG ag', 'ISO ag', 'HR%', 'XBH%', 'HH%', 'HR scr']}
        title="Lineup slot × damage — bright is where this arm bleeds"
        labelWidth={190}
        fmt={(v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : '—')}
        onRowClick={onPlayerClick ? (r) => r._raw && onPlayerClick(r._raw) : null}
        caption="In batting order, not sorted by damage — click Damage to rank. SLG and ISO against are ×1000 to share the scale. PA is here so a bright damage cell on a thin sample is visible as exactly that."
      />

      <DenseTable
        rows={spots}
        columns={COLUMNS}
        onRowClick={onPlayerClick}
        maxHeight={380}
        caption="Verdict thresholds are the bot's own: under 10 PA is NOT ENOUGH DATA regardless of how the damage reads, because a three-PA fluke is the easiest way to talk yourself into a bad spot."
      />
    </div>
  )
}
