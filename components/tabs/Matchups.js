'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { groupPitchers } from '../../lib/data'
import DenseTable from '../DenseTable'
import PageHeader from '../PageHeader'
import TeamVsStarter from '../TeamVsStarter'
import { mlbFaceStrict } from '../PlayerFace'

// ⚾ MOONSHOT MATCHUPS (2026-09-27, matchups plan Part C, in the shape Donovan
// signed off on TUDDY's): a ranked table of tonight's starters leads, a tap
// opens the matchup below it. The Pitchers page ranks an arm by his own
// attack score; this ranks him by the LINEUP IN FRONT OF HIM: the average of
// the bot's pitch_mix_score (how each hitter's damage lines up with this
// starter's pitch mix, 0-100, on every slate row) over the hitters he faces.
// The best-fit hitter carries the bot's own note ("Crush FF/SL"). Park and
// handedness are one line each. Only fields the slate publishes; nothing
// here is a new score.
const PREVIEW = 8
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
const mixOf = (row) => (Array.isArray(row?.pitcher_pitch_type_summary) ? row.pitcher_pitch_type_summary : [])
  .map((p) => ({ code: p.pitch_code || p.pitch_type, use: num(p.usage_pct ?? p.usage) }))
  .filter((p) => p.code && p.use != null).sort((a, b) => b.use - a.use)

export default function Matchups({ players = [], onPlayerClick }) {
  const [pick, setPick] = useState(null)
  const rows = useMemo(() => groupPitchers(players).map((g) => {
    const raws = g.lineup.map((b) => b.raw)
    const fits = raws.map((r) => num(r?.pitch_mix_score)).filter((v) => v != null)
    const fit = fits.length ? Math.round((fits.reduce((a, b) => a + b, 0) / fits.length) * 10) / 10 : null
    const best = raws.filter((r) => num(r?.pitch_mix_score) != null).sort((a, b) => num(b.pitch_mix_score) - num(a.pitch_mix_score))[0] || null
    const first = raws[0] || {}
    const mix = mixOf(first)
    const bats = raws.reduce((m, r) => { const h = String(r?.bats || r?.handedness || '?').toUpperCase()[0]; m[h] = (m[h] || 0) + 1; return m }, {})
    return {
      _id: String(g.pitcher_id ?? g.pitcher_name), g, raws, fit, best, mix, bats,
      pitcher: g.pitcher_name, team: g.team, vs: g.opponent_team, throws: g.pitcher_throws,
      mixTxt: mix.slice(0, 2).map((p) => `${p.code} ${Math.round(p.use)}%`).join(' · ') || '—',
      bestTxt: best ? best.name || best.player_name : null,
      park: num(first.park_hr_factor), venue: first.venue_name || g.venue_name || '',
      attack: num(first.pitcher_attack_score),
      hitters: fits.length,
    }
  }).filter((r) => r.fit != null).sort((a, b) => b.fit - a.fit).map((r, i) => ({ ...r, rank: i + 1 })), [players])

  const active = rows.find((r) => r._id === pick) || rows[0] || null
  const lead = rows[0]
  const columns = [
    { key: 'rank', label: '#', w: 30, heat: false },
    { key: 'pitcher', label: 'Starter', w: 160, heat: false, sticky: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {r.g.pitcher_id ? <img src={mlbFaceStrict(r.g.pitcher_id, 44)} alt="" width={22} height={22} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', background: C.bg3 }} /> : null}
        <b>{v}</b><span style={{ color: C.text3, fontSize: 10 }}>{r.throws}HP</span>
      </span>) },
    { key: 'vs', label: 'Faces', w: 82, heat: false, fmt: (v, r) => `${r.team} v ${v}` },
    { key: 'fit', label: 'Lineup fit', w: 70, primary: true, scale: 'seq', domain: [40, 80], dp: 1 },
    { key: 'mixTxt', label: 'His top pitches', w: 120, heat: false },
    { key: 'bestTxt', label: 'Best fit', w: 190, heat: false, fmt: (v, r) => (r.best
      ? <span>{v} <span style={{ color: C.text3, fontSize: 10 }}>{r.best.pitch_mix_note || ''} · {Math.round(num(r.best.pitch_mix_score))}</span></span>
      : <span style={{ color: C.text3 }}>—</span>) },
    { key: 'park', label: 'Park HR', w: 60, heat: false, fmt: (v) => (v == null ? '—' : `${v.toFixed(2)}x`) },
    { key: 'attack', label: 'Attack', w: 56, heat: false, fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
  ]

  if (!rows.length) {
    return (
      <div>
        <PageHeader eyebrow="MOONSHOT · MATCHUPS" title="The arms to attack tonight" theme={C} numFont={NUM_FONT} accent={C.orange}
          note="Tonight's starters, ranked by how well the lineup in front of them fits their pitch mix." />
        <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.text3, fontSize: TYPE.body }}>No starters on tonight&apos;s slate yet.</div>
      </div>
    )
  }
  return (
    <div>
      <PageHeader eyebrow="MOONSHOT · MATCHUPS" title="The arms to attack tonight" theme={C} numFont={NUM_FONT} accent={C.orange}
        note="Tonight's starters, ranked by how well the lineup in front of them fits their pitch mix. Tap a starter for the matchup." />
      <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
        Softest: <b style={{ color: C.text }}>{lead.pitcher}</b> ({lead.team}), facing a {lead.vs} lineup that fits his mix at {lead.fit}{lead.best ? <> — <b style={{ color: C.text }}>{lead.bestTxt}</b> leads it{lead.best.pitch_mix_note ? ` (${lead.best.pitch_mix_note})` : ''}</> : null}.
      </p>
      <DenseTable rows={rows} columns={columns} heatMode="primary" maxRows={PREVIEW} maxHeight={9999}
        rowEdge={(r) => (r._id === active?._id ? C.orange : null)}
        onRowClick={(r) => { setPick(r._id); if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('ms-matchup-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} />
      <p style={{ margin: '6px 0 14px', fontSize: 11, lineHeight: 1.5, color: C.text3 }}>
        Lineup fit = the average of the bot&apos;s pitch-mix score (0–100: how each hitter&apos;s damage lines up with this starter&apos;s pitches) over the hitters he faces on the slate. Attack is the Pitchers page&apos;s own number, for reference.
      </p>

      {active && (
        <section id="ms-matchup-detail" aria-label={`${active.pitcher} matchup`} style={{ scrollMarginTop: 80 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: TYPE.title, fontWeight: 900 }}>
            {active.pitcher} <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3, fontWeight: 600 }}>· {active.team} vs {active.vs} · tap another row above to switch</span>
          </h2>
          {active.mix.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: C.text3, fontFamily: NUM_FONT, marginBottom: 5 }}>HIS PITCH MIX</div>
              <div style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
                {active.mix.slice(0, 6).map((p) => (
                  <div key={p.code} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 44px', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <b style={{ fontFamily: NUM_FONT }}>{p.code}</b>
                    <span style={{ height: 10, borderRadius: 5, background: C.bg3, position: 'relative' }}><span style={{ position: 'absolute', inset: 0, width: `${Math.min(100, p.use)}%`, borderRadius: 5, background: C.orange }} /></span>
                    <span style={{ fontFamily: NUM_FONT, textAlign: 'right', color: C.text2 }}>{Math.round(p.use)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.text2, marginBottom: 12 }}>
            <div><b style={{ color: C.text }}>Handedness:</b> a {active.throws}HP against {Object.entries(active.bats).filter(([h]) => h !== '?').map(([h, c]) => `${c} ${h === 'S' ? 'switch' : h === 'L' ? 'left' : 'right'}`).join(', ') || 'an unknown lineup'}-handed hitter{active.hitters === 1 ? '' : 's'}.</div>
            <div><b style={{ color: C.text }}>Park:</b> {active.venue || 'tonight’s park'}, home-run factor {active.park != null ? `${active.park.toFixed(2)}x` : 'not published'}{active.park != null ? (active.park > 1.03 ? ' (plays up)' : active.park < 0.97 ? ' (plays down)' : ' (neutral)') : ''}.</div>
          </div>
          <TeamVsStarter players={active.raws} team={active.vs} pitcherName={active.pitcher} pitcherThrows={active.throws} onPlayerClick={onPlayerClick} />
        </section>
      )}
    </div>
  )
}
