'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { bvpSplits } from '../lib/situational'

// BATTER vs PITCHER — the head-to-head, live from the API.
//
// This was deliberately left off the site during the PropFinder teardown,
// because BvP is the most over-quoted number in baseball: 3-for-7 lifetime is
// a coin flip wearing a batting average. It's here now because the user asked
// and because hidden data is worse than caveated data — but the panel grades
// its own sample size and says so out loud. Under 10 PA the verdict line
// literally calls it noise.
//
// Career block from vsPlayerTotal (or summed client-side when they first met
// this year), season chips underneath when there's more than one.

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0)

function Stat({ label, value, strong }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 40 }}>
      <div style={{ fontSize: 7.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: strong ? C.orange : C.text }}>{value}</div>
    </div>
  )
}

// Loose name matching for spray rows: statcast writes "Last, First", the
// slate writes "First Last" — token sets, lowercased, accents stripped.
const nameTokens = (s) => new Set(
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1),
)
const sameName = (a, b) => {
  const ta = nameTokens(a), tb = nameTokens(b)
  if (!ta.size || !tb.size) return false
  let hit = 0
  ta.forEach((t) => { if (tb.has(t)) hit++ })
  return hit >= Math.min(ta.size, tb.size)
}

export default function BvP({ batterId, pitcherId, pitcherName, player }) {
  const [data, setData] = useState(undefined)

  useEffect(() => {
    let alive = true
    setData(undefined)
    bvpSplits(batterId, pitcherId).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [batterId, pitcherId])

  if (!pitcherId) return null
  if (data === undefined) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Checking the head-to-head…</div>
  }
  if (!data?.total) {
    return (
      <div style={{ fontSize: 10, color: C.text3, padding: '4px 0 8px', fontFamily: NUM_FONT }}>
        ⚔ No head-to-head history vs {pitcherName || 'tonight’s starter'} — they’ve never met. That’s
        an answer too: every read on this page is profile, not memory.
      </div>
    )
  }

  const t = data.total
  const pa = num(t.plateAppearances)
  const hr = num(t.homeRuns)

  // CONTACT QUALITY vs him — the results above say what happened; this says
  // how the contact LOOKED. From the player's own tracked-ball log (season-
  // long once the bot's spray window ships), filtered to balls hit off THIS
  // pitcher by name. BBE / hard-hit / barrels / EV — the stuff a 3-for-7
  // can't tell you.
  const log = player?.batted_ball_log || player?.spray_chart || []
  const vsHim = pitcherName ? log.filter((h) => sameName(h.pitcher || h.pitcher_name, pitcherName)) : []
  const bbe = vsHim.length
  const hh = vsHim.filter((h) => h.is_hard_hit).length
  const brl = vsHim.filter((h) => h.is_barrel).length
  const evs = vsHim.map((h) => Number(h.ev) || 0).filter((v) => v > 0)
  const avgEv = evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : null
  const maxEv = evs.length ? Math.max(...evs) : null
  const small = pa < 10
  const verdict = small
    ? `${pa} PA is noise, not a scouting report — color only.`
    : pa < 25
      ? `${pa} PA — enough to notice, not enough to bet on by itself.`
      : `${pa} PA — a real sample by BvP standards, and BvP standards are low.`

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>⚔ vs {pitcherName || 'tonight’s starter'}</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>career head-to-head · live API</span>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Stat label="PA" value={pa} />
        <Stat label="H/AB" value={`${num(t.hits)}/${num(t.atBats)}`} />
        <Stat label="AVG" value={t.avg ?? '—'} />
        {t.ops != null && <Stat label="OPS" value={t.ops} />}
        <Stat label="HR" value={hr} strong={hr > 0} />
        <Stat label="TB" value={num(t.totalBases)} />
        <Stat label="BB" value={num(t.baseOnBalls)} />
        <Stat label="K" value={num(t.strikeOuts)} />
      </div>

      {bbe > 0 && (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', marginTop: 9,
          paddingTop: 8, borderTop: `1px dashed ${C.border2}`,
        }}>
          <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
            Contact vs him
          </span>
          <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text2 }}>
            <b style={{ color: C.text }}>{bbe}</b> tracked ball{bbe === 1 ? '' : 's'}
          </span>
          <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: hh > 0 ? C.orange : C.text3 }}>
            <b>{hh}</b> hard-hit
          </span>
          <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: brl > 0 ? C.orange : C.text3 }}>
            <b>{brl}</b> barrel{brl === 1 ? '' : 's'}
          </span>
          {avgEv != null && (
            <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text2 }}>
              avg EV <b>{avgEv.toFixed(1)}</b>
            </span>
          )}
          {maxEv != null && (
            <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: maxEv >= 105 ? C.orange : C.text2 }}>
              max <b>{maxEv.toFixed(1)}</b>
            </span>
          )}
          <span style={{ fontSize: 8.5, color: C.text3 }}>
            how the contact looked, not just what it counted for — a loud 0-for-5 lives here
          </span>
        </div>
      )}

      {data.seasons.length > 1 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {data.seasons.map((s) => (
            <span key={s.season} style={{
              fontSize: 9, fontFamily: NUM_FONT, color: C.text3,
              border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 8px',
            }}>
              {s.season}: {num(s.stat.hits)}/{num(s.stat.atBats)}
              {num(s.stat.homeRuns) > 0 && <b style={{ color: C.orange }}> · {num(s.stat.homeRuns)} HR</b>}
              {num(s.stat.strikeOuts) > 0 && ` · ${num(s.stat.strikeOuts)}K`}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 8.5, color: small ? C.orange : C.text3, marginTop: 7, lineHeight: 1.5 }}>
        {verdict} The splits below (arm side, zones, pitch mix) are built on hundreds of pitches —
        when they disagree with this box, trust them.
      </div>
    </div>
  )
}
