'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { groupPitchers } from '../../lib/data'
import DenseTable from '../DenseTable'
import PageHeader from '../PageHeader'
import TeamVsStarter from '../TeamVsStarter'
import { mlbFaceStrict } from '../PlayerFace'
import { zonesUrl } from '../../lib/dataSource'
import Tap from '../Tap'
import { leaveTarget } from '../../lib/openTarget'
import { MatchupTitle, BarList, FactLines, HeatTiles } from '../matchup/MatchupParts'

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

// ── ZONE OVERLAP (2026-09-27, matchups plan Part C) ────────────────────────
// For the starter you tapped only: his lineup's zone files (current/zones/
// <mode>/batter_<id>.json, ~10 KB each, loaded on the tap -- never for all 30
// starters). Each carries the hitter's 9-zone damage (zone_profile.zones_9)
// and the facing starter's location share (pitcher_zone_profile.tendency).
// Cell = where HE throws (share of his pitches) beside what THIS LINEUP slugs
// there (xSLG, weighted by each hitter's PA in that zone; thin cells left
// out). Zones 1-9 as Statcast numbers them, from the catcher's view.
const ZONE_WORD = { 1: 'high, left', 2: 'high, middle', 3: 'high, right', 4: 'middle, left', 5: 'the heart', 6: 'middle, right', 7: 'low, left', 8: 'low, middle', 9: 'low, right' }
function ZoneOverlap({ lineupIds, pitcherName }) {
  const [state, set] = useState({ loading: true, cells: null, pitches: 0, hitters: 0 })
  const key = lineupIds.join(',')
  useEffect(() => {
    let alive = true
    set({ loading: true, cells: null, pitches: 0, hitters: 0 })
    Promise.all(lineupIds.map((id) => fetch(zonesUrl(id)).then((r) => (r.ok ? r.json() : null)).catch(() => null))).then((files) => {
      if (!alive) return
      const ok = files.filter(Boolean)
      const tend = ok.map((f) => f?.pitcher_zone_profile).filter((p) => Array.isArray(p?.tendency) && p.total_pitches > 0).sort((a, b) => b.total_pitches - a.total_pitches)[0] || null
      const cells = Array.from({ length: 9 }, (_, i) => {
        const zone = i + 1
        let pa = 0; let slg = 0
        for (const f of ok) {
          const z = (f?.zone_profile?.zones_9 || []).find((c) => c.zone === zone)
          if (!z || z.low_sample || !Number.isFinite(z.xslg) || !(z.pa > 0)) continue
          pa += z.pa; slg += z.xslg * z.pa
        }
        const t = (tend?.tendency || []).find((c) => c.zone === zone)
        return { zone, his: Number.isFinite(t?.pct) ? t.pct : null, xslg: pa ? slg / pa : null, pa }
      })
      set({ loading: false, cells, pitches: tend?.total_pitches || 0, hitters: ok.filter((f) => f?.zone_profile?.zones_9?.length).length })
    })
    return () => { alive = false }
  }, [key])   // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) return <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>Loading the zones…</div>
  const cells = state.cells || []
  if (!cells.some((c) => c.xslg != null) || !cells.some((c) => c.his != null)) return <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>No zone files for this matchup yet.</div>
  const slgs = cells.map((c) => c.xslg).filter(Number.isFinite)
  const lo = Math.min(...slgs); const hi = Math.max(...slgs)
  const heat = (v) => (v == null || hi === lo ? 0 : (v - lo) / (hi - lo))
  const hot = cells.filter((c) => c.his != null && c.xslg != null).sort((a, b) => b.his * b.xslg - a.his * a.xslg)[0]
  const fmt3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
  return (
    <HeatTiles
      label="ZONE OVERLAP"
      lead={hot ? <>{pitcherName} throws <b style={{ color: C.text }}>{Math.round(hot.his * 100)}%</b> of his pitches {ZONE_WORD[hot.zone]}, where this lineup slugs <b style={{ color: C.orange }}>{fmt3(hot.xslg)}</b> xSLG — the overlap to watch.</> : null}
      cells={cells.map((c) => ({
        key: c.zone, heat: heat(c.xslg),
        big: c.his != null ? `${Math.round(c.his * 100)}%` : '—', small: fmt3(c.xslg),
        title: `${ZONE_WORD[c.zone]}: ${c.his != null ? `${Math.round(c.his * 100)}% of his pitches` : 'no pitches on file'} · lineup ${fmt3(c.xslg)} xSLG on ${c.pa} PA`,
      }))}
      hotKey={hot?.zone ?? null}
      legend={<>Big number: share of all his pitches in that zone ({state.pitches} on file; {Math.round(cells.reduce((a, c) => a + (c.his || 0), 0) * 100)}% land in these nine, the rest outside the strike zone). Small: the lineup&apos;s xSLG there ({state.hitters} hitters, PA-weighted). More orange = the lineup slugs more. Catcher&apos;s view.</>}
    />
  )
}

export default function Matchups({ players = [], onPlayerClick, onNavigate = null }) {
  const openPitcher = onNavigate ? (pid) => { leaveTarget('pitcher', pid); onNavigate('pitchers') } : null
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
    // The best-fit hitter's name opens HIS card (a name is a link); the starter
    // cell keeps the row's job, the matchup ("Tap a starter for the matchup").
    { key: 'bestTxt', label: 'Best fit', w: 190, heat: false, link: (r) => (r?.best && onPlayerClick ? () => onPlayerClick(r.best) : null), fmt: (v, r) => (r.best
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
        Softest: <Tap onClick={openPitcher && lead.g.pitcher_id ? () => openPitcher(lead.g.pitcher_id) : null}><b style={{ color: C.text }}>{lead.pitcher}</b></Tap> ({lead.team}), facing a {lead.vs} lineup that fits his mix at {lead.fit}{lead.best ? <> — <Tap onClick={onPlayerClick ? () => onPlayerClick(lead.best) : null}><b style={{ color: C.text }}>{lead.bestTxt}</b></Tap> leads it{lead.best.pitch_mix_note ? ` (${lead.best.pitch_mix_note})` : ''}</> : null}.
      </p>
      <DenseTable rows={rows} columns={columns} heatMode="primary" maxRows={PREVIEW} maxHeight={9999}
        rowEdge={(r) => (r._id === active?._id ? C.orange : null)}
        onRowClick={(r) => { setPick(r._id); if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('ms-matchup-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} />
      <p style={{ margin: '6px 0 14px', fontSize: 11, lineHeight: 1.5, color: C.text3 }}>
        Lineup fit = the average of the bot&apos;s pitch-mix score (0–100: how each hitter&apos;s damage lines up with this starter&apos;s pitches) over the hitters he faces on the slate. Attack is the Pitchers page&apos;s own number, for reference.
      </p>

      {active && (
        <section id="ms-matchup-detail" aria-label={`${active.pitcher} matchup`} style={{ scrollMarginTop: 80 }}>
          <MatchupTitle name={active.pitcher} meta={`${active.team} vs ${active.vs} · tap another row above to switch`} />
          <BarList label="HIS PITCH MIX" items={active.mix.slice(0, 6).map((p) => ({ key: p.code, label: p.code, pct: p.use, text: `${Math.round(p.use)}%` }))} />
          <FactLines lines={[
            ['Handedness', `a ${active.throws}HP against ${Object.entries(active.bats).filter(([h]) => h !== '?').map(([h, c]) => `${c} ${h === 'S' ? 'switch' : h === 'L' ? 'left' : 'right'}`).join(', ') || 'an unknown lineup'}-handed hitter${active.hitters === 1 ? '' : 's'}.`],
            ['Park', `${active.venue || 'tonight’s park'}, home-run factor ${active.park != null ? `${active.park.toFixed(2)}x` : 'not published'}${active.park != null ? (active.park > 1.03 ? ' (plays up)' : active.park < 0.97 ? ' (plays down)' : ' (neutral)') : ''}.`],
          ]} />
          <ZoneOverlap lineupIds={active.raws.map((r) => r?.player_id ?? r?.id).filter((x) => x != null).slice(0, 9)} pitcherName={active.pitcher} />
          <TeamVsStarter players={active.raws} team={active.vs} pitcherName={active.pitcher} pitcherThrows={active.throws} onPlayerClick={onPlayerClick} />
        </section>
      )}
    </div>
  )
}
