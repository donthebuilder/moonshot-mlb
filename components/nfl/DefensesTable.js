'use client'
import { QMark } from './NflNote'
import TeamMark from '../TeamMark'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { softRole, stingyRole, fitsSoft, STARTER_ROLES, SOFT_THIN_GAMES, multipleWords, earlyNote, MULTIPLE_CAP } from '../../lib/nfl/dvpSignal'
import NflTable from './NflTable'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'

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
// '· early: 2 games' in words, and no multiplier on a thin cell (2026-10-04 user review)
const spot = (d) => (d ? `${d.role} · ${d.label}${d.multiple === 0 ? ' · none' : !d.thin && d.multiple ? ` ${d.multiple >= MULTIPLE_CAP ? `${MULTIPLE_CAP}x+` : `${one(d.multiple)}x`}` : ''}${Number.isFinite(d.games) ? (d.games < SOFT_THIN_GAMES ? ` · early: ${d.games} ${d.games === 1 ? 'game' : 'games'}` : ` · ${d.games} games`) : ''}` : null)

export default function DefensesTable({ matchup, data, win = 'season', active, onPick, onPlayerClick = null }) {
  const [all, setAll] = useState(false)

  const rows = useMemo(() => {
    const oppOf = new Map()
    for (const g of data?.games || []) {
      if (g?.away && g?.home) { oppOf.set(g.away, g.home); oppOf.set(g.home, g.away) }
    }
    const teams = all ? Object.keys(matchup?.dvp?.[win] || {}) : [...oppOf.keys()]
    const byRole = new Map()   // `${team}|${role}` -> every player in it, best-scored first
    for (const p of data?.players || []) {
      const role = matchup?.roles?.[p.player_id]
      if (!role || !p.team) continue
      const k = `${p.team}|${role}`
      const best = Math.max(0, ...Object.values(p.scores || {}).map(Number).filter(Number.isFinite))
      byRole.set(k, [...(byRole.get(k) || []), { ...p, _best: best }].sort((a, b) => b._best - a._best))
    }
    return teams.map((def) => {
      const soft = softRole(matchup, def, win, STARTER_ROLES)
      const tough = stingyRole(matchup, def, win, STARTER_ROLES)
      const opp = oppOf.get(def) || null
      // In the role AND the kind that exploits the leak (fitsSoft); nobody -> '—'.
      const fits = soft?.standout && opp ? (byRole.get(`${opp}|${soft.role}`) || []).find((p) => fitsSoft(p, soft)) || null : null
      return {
        _id: def, def, opp: opp || '—',
        edge: soft ? one(soft.z) : null,
        soft: soft?.standout ? spot(soft) : 'no standout',
        _plain: soft?.standout ? `the ${soft.plain} (${soft.label}${multipleWords(soft, { short: true }) ? ` ${multipleWords(soft, { short: true })}` : ''}${earlyNote(soft)})` : null,
        fits: fits ? fits.name : null, _fits: fits,
        tough: tough?.standout ? spot(tough) : '—',
        _standout: Boolean(soft?.standout),
      }
    }).filter((r) => r.edge != null).sort((a, b) => b.edge - a.edge).map((r, i) => ({ ...r, rank: i + 1 }))
  }, [matchup, data, win, all])

  const columns = [
    { key: 'rank', label: '#', w: 30, heat: false },
    { key: 'def', label: 'Defense', w: 84, heat: false, sticky: true, fmt: (v) => <b style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><TeamMark sport="nfl" abbr={v} variant="logo" px={16} />{v}</b> },
    { key: 'opp', label: 'Vs', w: 50, heat: false },
    { key: 'edge', label: 'Edge', w: 54, primary: true, scale: 'seq', domain: [1, 3], fmt: (v) => (v == null ? '—' : `+${v.toFixed(1)}`) },
    { key: 'soft', label: 'Softest spot', w: 190, heat: false, fmt: (v, r) => <span style={{ color: r._standout ? C.green : C.text3, fontWeight: r._standout ? 800 : 500 }}>{v}</span> },
    { key: 'fits', label: 'Who fits it', w: 170, heat: false, fmt: (v, r) => (r._fits
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PlayerFace sport="nfl" espnId={r._fits?.espn_id} team={r._fits?.team} name={r._fits?.name} size={22} />{v}<span style={{ color: C.text3, fontSize: 10 }}>{r._fits.position}</span></span>
      : <span style={{ color: C.text3 }}>—</span>) },
    { key: 'tough', label: 'Toughest spot', w: 170, heat: false, fmt: (v) => <span style={{ color: C.text3 }}>{v}</span> },
  ]

  if (!rows.length) return null
  const byeWeek = Object.keys(matchup?.dvp?.[win] || {}).length > new Set((data?.games || []).flatMap((g) => [g.away, g.home]).filter(Boolean)).size
  const lastSeason = Number(matchup?.season) && Number(data?.season) && Number(matchup.season) < Number(data.season)
  const lead = rows[0]
  const btn = { minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg2, color: C.green, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }
  return (
    <section aria-label="The defenses to attack this week" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: TYPE.title, fontWeight: 900 }}>The defenses to attack this week</h2>
        <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: lastSeason ? C.green : C.text3, fontWeight: lastSeason ? 800 : 500 }}>
          {matchup.season} DvP{lastSeason ? ' · LAST SEASON' : ''}
        </span>
      </div>
      {/* The one-line takeaway first (chart rule, Part A). */}
      <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
        {lead._standout
          ? <>Softest: <Tap onClick={() => onPick?.(lead.def)}><b style={{ color: C.text }}>{lead.def}</b></Tap> vs {lead._plain}{lead.fits ? <>, and <Tap onClick={onPlayerClick && lead._fits ? () => onPlayerClick(lead._fits) : null}><b style={{ color: C.text }}>{lead.fits}</b></Tap> ({lead.opp}) fills that role</> : null}. Tap a row for the defense&apos;s map.</>
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
        rowEdge={(r) => (r.def === active ? C.green : null)}
      />
      <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.5, color: C.text3 }}>
        Edge: how far above average this defense gives up. 1.0+ = a soft spot. <QMark label="About Edge" text="Edge counts how many standard deviations a defense's softest starter-role matchup sits above the league average for that role and stat. Starters only: depth roles swing on two plays." />{lastSeason ? ' Last season\'s numbers until three weeks are played.' : ''}
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
