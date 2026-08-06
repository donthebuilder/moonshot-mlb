'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import DenseTable from '../DenseTable'

// League Leaders — SEASON STATS ONLY.
//
// This page used to rank hitters by the bot's model scores: HR score, HRR
// score, hit score, pitch-mix, damage conversion, IHR, barrel rate. Those all
// belong to the model, and every other board on this site already shows them —
// which made Leaders a fifth copy of the same ranking rather than a page of its
// own.
//
// It's a batter summary now: the actual season line. Average, on-base,
// slugging, OPS, ISO, home runs, RBI, runs, strikeout and walk rates, BABIP and
// the platoon splits. Nothing here is modelled, weighted, projected or scored.
// If a number on this page disagrees with a baseball card, the payload is
// wrong — there's no interpretation layer left to blame.
//
// TOTAL BASES IS THE ONE DERIVED COLUMN AND IT SAYS SO.
// The slate carries no season hits, at-bats, doubles or triples — only last
// 5/7/10 windows — so TB can't be read off the payload. It's computed as:
//
//     AB ≈ PA × (1 − BB%)        TB = SLG × AB
//
// which ignores hit-by-pitch and sacrifices and therefore runs a few bases
// light. Good enough to rank by, wrong enough that the column is labelled
// "TB est" and the caption explains it rather than letting it pass as a
// counting stat.

const MIN_PA_STEPS = [0, 50, 100, 200, 300]

// AB estimate, kept in its own function so the assumption lives in one place.
const estAB = (p) => {
  const pa = n(p?.season_pa, 0)
  const bb = n(p?.season_bb_rate, 0)
  if (pa <= 0) return 0
  return pa * (1 - Math.min(0.35, Math.max(0, bb)))
}

const COLUMNS = [
  { key: 'name', label: 'Batter', heat: false, w: 150, bold: true, sticky: true },
  { key: 'team', label: 'Tm',  heat: false, w: 34, mono: true, dim: true },
  { key: 'opp',  label: 'Opp', heat: false, w: 34, mono: true, dim: true },
  { key: 'bats', label: 'B',   heat: false, w: 26, mono: true, dim: true },
  { key: 'pa',   label: 'PA',  w: 46,
    title: 'Season plate appearances — read this before any rate on the row' },
  { key: 'avg',  label: 'AVG', w: 52, dp: 3 },
  { key: 'obp',  label: 'OBP', w: 52, dp: 3 },
  { key: 'slg',  label: 'SLG', w: 52, dp: 3 },
  { key: 'ops',  label: 'OPS', w: 54, dp: 3 },
  { key: 'iso',  label: 'ISO', w: 52, dp: 3,
    title: 'Slugging minus average — raw power with the singles stripped out' },
  { key: 'hr',   label: 'HR',  w: 42 },
  { key: 'rbi',  label: 'RBI', w: 44 },
  { key: 'runs', label: 'R',   w: 42 },
  { key: 'tb',   label: 'TB est', w: 56, dp: 0,
    title: 'DERIVED, not published: SLG × (PA × (1 − BB%)). Ignores HBP and sacrifices.' },
  { key: 'hrPA', label: 'HR/PA', w: 56, dp: 3 },
  { key: 'paHR', label: 'PA/HR', w: 54, dp: 1, invert: true,
    title: 'Plate appearances per home run. Inverted — fewer is better.' },
  { key: 'kPct', label: 'K%',  w: 46, dp: 1, invert: true,
    title: 'Inverted — a low strikeout rate is the good outcome for the hitter' },
  { key: 'bbPct', label: 'BB%', w: 46, dp: 1 },
  { key: 'babip', label: 'BABIP', w: 54, dp: 3,
    title: 'Average on balls in play. Well above .320 tends to come back down.' },
  { key: 'avgL', label: 'AVG vs L', w: 60, dp: 3 },
  { key: 'avgR', label: 'AVG vs R', w: 60, dp: 3 },
  { key: 'isoL', label: 'ISO vs L', w: 58, dp: 3 },
  { key: 'isoR', label: 'ISO vs R', w: 58, dp: 3 },
]

function LeaderTile({ label, row, value, color, onClick }) {
  if (!row) return null
  return (
    <div
      onClick={onClick}
      title={onClick ? `Open ${row.name}` : undefined}
      style={{
        background: `linear-gradient(155deg, ${color}1e, ${color}06)`,
        border: `1px solid ${color}44`, borderRadius: 11, padding: '8px 12px', minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div style={{
        fontSize: 8.5, color: C.text3, textTransform: 'uppercase',
        letterSpacing: '.09em', fontWeight: 800,
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 800, marginTop: 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{row.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, color }}>{value}</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
          {row.team} · {row.pa} PA
        </span>
      </div>
    </div>
  )
}

export default function Leaders({ players = [], onPlayerClick }) {
  const [minPA, setMinPA] = useState(100)
  const [hand, setHand] = useState('all')
  const [query, setQuery] = useState('')

  const all = useMemo(() => players.map((p, i) => {
    const slg = n(p?.season_slg, 0)
    return {
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      bats: clean(p?.bats, ''),
      pa: n(p?.season_pa, 0),
      avg: n(p?.season_avg, 0),
      obp: n(p?.season_obp, 0),
      slg,
      ops: n(p?.season_ops, 0),
      iso: n(p?.season_iso, 0),
      hr: n(p?.season_hr, 0),
      rbi: n(p?.season_rbi, 0),
      runs: n(p?.season_runs, 0),
      tb: Math.round(slg * estAB(p)),
      hrPA: n(p?.hr_per_pa, 0),
      paHR: n(p?.pa_per_hr, 0) || null,
      kPct: n(p?.season_k_rate, 0) * 100,
      bbPct: n(p?.season_bb_rate, 0) * 100,
      babip: n(p?.babip, 0),
      avgL: n(p?.avg_vs_lhp, 0) || null,
      avgR: n(p?.avg_vs_rhp, 0) || null,
      isoL: n(p?.iso_vs_lhp, 0) || null,
      isoR: n(p?.iso_vs_rhp, 0) || null,
    }
  }), [players])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => r.pa >= minPA)
      .filter((r) => hand === 'all' || r.bats.toUpperCase().startsWith(hand))
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
  }, [all, minPA, hand, query])

  if (!players.length) return <Empty text="No players on this slate yet." />

  const top = (key) => [...rows].sort((a, b) => n(b[key], 0) - n(a[key], 0))[0] || null
  const bAvg = top('avg'), bOps = top('ops'), bHr = top('hr'), bRbi = top('rbi'), bIso = top('iso')
  // Power efficiency — FEWEST plate appearances per homer, and only with a few
  // HR banked so one lucky swing can't own the tile.
  const bEff = rows.filter((r) => r.paHR != null && r.hr >= 5).sort((a, b) => a.paHR - b.paHR)[0] || null

  const chip = (on) => ({
    padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
    fontFamily: NUM_FONT,
    border: `1px solid ${on ? C.orange : C.border}`,
    background: on ? 'rgba(249,115,22,.12)' : 'transparent',
    color: on ? C.orange : C.text3,
  })
  const lbl = {
    fontSize: 8, color: C.text3, textTransform: 'uppercase',
    letterSpacing: '.09em', fontWeight: 800,
  }

  return (
    <div>
      <PanelTitle
        title="League Leaders"
        sub="Season stats for tonight's hitters — no model scores on this page"
        right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} of {all.length}</span>}
      />

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 700,
      }}>
        Straight season numbers — the batting line, nothing weighted or projected. Every other board
        here ranks by the model; this one doesn&apos;t. It&apos;s the page for what a hitter has actually
        done, rather than what the bot thinks of him tonight.
      </div>

      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      }}>
        <LeaderTile label="AVG" row={bAvg} value={bAvg ? bAvg.avg.toFixed(3) : '—'} color="#a78bfa" onClick={bAvg && onPlayerClick ? () => onPlayerClick(bAvg._raw) : undefined} />
        <LeaderTile label="OPS" row={bOps} value={bOps ? bOps.ops.toFixed(3) : '—'} color="#f97316" onClick={bOps && onPlayerClick ? () => onPlayerClick(bOps._raw) : undefined} />
        <LeaderTile label="Home runs" row={bHr} value={bHr ? bHr.hr : '—'} color="#f87171" onClick={bHr && onPlayerClick ? () => onPlayerClick(bHr._raw) : undefined} />
        <LeaderTile label="RBI" row={bRbi} value={bRbi ? bRbi.rbi : '—'} color="#22d3ee" onClick={bRbi && onPlayerClick ? () => onPlayerClick(bRbi._raw) : undefined} />
        <LeaderTile label="ISO" row={bIso} value={bIso ? bIso.iso.toFixed(3) : '—'} color="#4ade80" onClick={bIso && onPlayerClick ? () => onPlayerClick(bIso._raw) : undefined} />
        <LeaderTile label="PA per HR · min 5 HR" row={bEff} value={bEff ? bEff.paHR.toFixed(1) : '—'} color="#FCD34D" onClick={bEff && onPlayerClick ? () => onPlayerClick(bEff._raw) : undefined} />
      </div>

      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12,
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={lbl}>Min PA</span>
          {MIN_PA_STEPS.map((v) => (
            <button key={v} onClick={() => setMinPA(v)} style={chip(minPA === v)}>{v || 'Any'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={lbl}>Bats</span>
          {[['all', 'All'], ['L', 'LHB'], ['R', 'RHB']].map(([k, l]) => (
            <button key={k} onClick={() => setHand(k)} style={chip(hand === k)}>{l}</button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a hitter…"
          style={{
            flex: 1, minWidth: 150, background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '5px 10px', fontSize: 11, color: C.text,
            outline: 'none', fontFamily: NUM_FONT,
          }}
        />
      </div>

      {!rows.length ? (
        <Empty text={`Nobody clears ${minPA} plate appearances with this filter.`} />
      ) : (
        <DenseTable
          rows={rows}
          columns={COLUMNS}
          onRowClick={onPlayerClick}
          initialSort="ops"
          maxHeight={620}
          caption={`Season stats, unmodelled. Minimum PA is set to ${minPA} because rate stats on a small sample are noise — a .400 average on 30 plate appearances belongs to nobody. K% and PA/HR are inverted so bright still means good for the hitter; every other column reads high-is-good. TB is the one derived number: the payload has no season hits or at-bats, so it's SLG × (PA × (1 − BB%)), which ignores hit-by-pitch and sacrifices and runs slightly light. Rank by it, don't quote it.`}
        />
      )}
    </div>
  )
}
