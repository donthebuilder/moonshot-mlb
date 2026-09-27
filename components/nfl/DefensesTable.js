'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { softRole, stingyRole, STARTER_ROLES } from '../../lib/nfl/dvpSignal'
import NflTable from './NflTable'
import NflFace from './NflFace'

// THE DEFENSES TO ATTACK THIS WEEK (2026-09-27, matchups plan, REVISED:
// Donovan -- "I don't see how this equates with the MLB pages"). MOONSHOT's
// Pitchers page shape for TUDDY: a ranked table leads, one row per defense
// playing this week, softest first; tap a row for the defense's detail (the
// map, the DvP grid, drift and panels below it on the Matchups tab).
//
// Every number is lib/nfl/dvpSignal.js's, the same z-vs-league measure the
// verdict line and the DvP callout already use (starter roles only -- depth
// rows swing to 3x or 0x on two plays). WHO FITS is the offense's player the
// bot's depth chart puts in that role this week (matchup.roles), with his
// face; nobody in that role -> nothing, never a guess.
const PREVIEW = 8
const one = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null)
const spot = (d) => (d ? `${d.role} · ${d.label}${d.multiple === 0 ? ' · none' : d.multiple ? ` ${one(d.multiple)}x` : ''}` : null)

export default function DefensesTable({ matchup, data, win = 'season', active, onPick }) {
  const [all, setAll] = useState(false)

  const rows = useMemo(() => {
    const oppOf = new Map()
    for (const g of data?.games || []) {
      if (g?.away && g?.home) { oppOf.set(g.away, g.home); oppOf.set(g.home, g.away) }
    }
    const teams = all ? Object.keys(matchup?.dvp?.[win] || {}) : [...oppOf.keys()]
    const byRole = new Map()   // `${team}|${role}` -> best-scored player
    for (const p of data?.players || []) {
      const role = matchup?.roles?.[p.player_id]
      if (!role || !p.team) continue
      const k = `${p.team}|${role}`
      const best = Math.max(0, ...Object.values(p.scores || {}).map(Number).filter(Number.isFinite))
      if (!byRole.has(k) || best > byRole.get(k)._best) byRole.set(k, { ...p, _best: best })
    }
    return teams.map((def) => {
      const soft = softRole(matchup, def, win, STARTER_ROLES)
      const tough = stingyRole(matchup, def, win, STARTER_ROLES)
      const opp = oppOf.get(def) || null
      const fits = soft && opp ? byRole.get(`${opp}|${soft.role}`) || null : null
      return {
        _id: def, def, opp: opp || '—',
        edge: soft ? one(soft.z) : null,
        soft: soft?.standout ? spot(soft) : 'no standout',
        _plain: soft?.standout ? `the ${soft.plain} (${soft.label}${soft.multiple ? ` ${one(soft.multiple)}x the league` : ''})` : null,
        fits: fits ? fits.name : null, _fits: fits,
        tough: tough?.standout ? spot(tough) : '—',
        _standout: Boolean(soft?.standout),
      }
    }).filter((r) => r.edge != null).sort((a, b) => b.edge - a.edge).map((r, i) => ({ ...r, rank: i + 1 }))
  }, [matchup, data, win, all])

  const columns = [
    { key: 'rank', label: '#', w: 30, heat: false },
    { key: 'def', label: 'Defense', w: 70, heat: false, sticky: true, fmt: (v) => <b>{v}</b> },
    { key: 'opp', label: 'Vs', w: 50, heat: false },
    { key: 'edge', label: 'Edge', w: 54, primary: true, scale: 'seq', domain: [1, 3], fmt: (v) => (v == null ? '—' : `+${v.toFixed(1)}`) },
    { key: 'soft', label: 'Softest spot', w: 190, heat: false, fmt: (v, r) => <span style={{ color: r._standout ? C.cyan : C.text3, fontWeight: r._standout ? 800 : 500 }}>{v}</span> },
    { key: 'fits', label: 'Who fits it', w: 170, heat: false, fmt: (v, r) => (r._fits
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><NflFace player={r._fits} size={22} />{v}<span style={{ color: C.text3, fontSize: 10 }}>{r._fits.position}</span></span>
      : <span style={{ color: C.text3 }}>—</span>) },
    { key: 'tough', label: 'Toughest spot', w: 170, heat: false, fmt: (v) => <span style={{ color: C.text3 }}>{v}</span> },
  ]

  if (!rows.length) return null
  const byeWeek = Object.keys(matchup?.dvp?.[win] || {}).length > new Set((data?.games || []).flatMap((g) => [g.away, g.home]).filter(Boolean)).size
  const lastSeason = Number(matchup?.season) && Number(data?.season) && Number(matchup.season) < Number(data.season)
  const lead = rows[0]
  const btn = { minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg2, color: C.cyan, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }
  return (
    <section aria-label="The defenses to attack this week" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: TYPE.title, fontWeight: 900 }}>The defenses to attack this week</h2>
        <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: lastSeason ? C.amber : C.text3, fontWeight: lastSeason ? 800 : 500 }}>
          {matchup.season} DvP{lastSeason ? ' · LAST SEASON' : ''}
        </span>
      </div>
      {/* The one-line takeaway first (chart rule, Part A). */}
      <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
        {lead._standout
          ? <>Softest: <b style={{ color: C.text }}>{lead.def}</b> vs {lead._plain}{lead.fits ? <>, and <b style={{ color: C.text }}>{lead.fits}</b> ({lead.opp}) fills that role</> : null}. Tap a row for the defense&apos;s map.</>
          : <>No defense on this week&apos;s card stands out; the ranking is by how far each one&apos;s softest spot sits above the league. Tap a defense for its map.</>}
      </p>
      <NflTable
        rows={rows}
        columns={columns}
        heatMode="primary"
        // DenseTable's own "show 8 more / show all" runs the preview.
        maxRows={PREVIEW}
        maxHeight={9999}
        onRowClick={(r) => onPick?.(r.def)}
        rowEdge={(r) => (r.def === active ? C.cyan : null)}
      />
      <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.5, color: C.text3 }}>
        Edge = how many standard deviations the defense&apos;s softest starter-role cell sits above the league&apos;s own average for that role and stat (1.0 and up is a standout). Starters only; depth rows swing on two plays.{lastSeason ? ' Last season\'s table until three weeks of this one are played.' : ''}
      </p>
      {/* Off-slate defenses only exist in a bye week; the switch shows then. */}
      {(all || byeWeek) && (
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={() => setAll((v) => !v)} aria-pressed={all} style={{ ...btn, color: all ? C.green : C.text3 }}>{all ? 'This week only' : 'All 32 defenses'}</button>
        </div>
      )}
    </section>
  )
}
