'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean, obj,
  hrScore, barrelRate, maxEV, avgEV, launchAngle, playerId,
} from '../../lib/player'
import { PanelTitle, Empty, inputStyle } from '../ui'
import DenseTable from '../DenseTable'

// Longest — who hits the FARTHEST ball tonight.
//
// A distance board, not a probability board. It answers a different question
// from the HR tab and regularly disagrees with it, which is the point: the guy
// most likely to go deep and the guy most likely to hit the longest ball of
// the night are usually not the same hitter.
//
// "Adjusted for park + air" multiplies the raw score by the park's distance
// factor and a small temperature term. Warm air carries — that's real physics,
// not a model opinion — but the adjustment is deliberately gentle, because the
// bot already folds park into the raw score and double-counting it would just
// rank Coors first every night.

const carry = (p) => {
  const park = n(p?.park_dist_factor, 1) || 1
  const temp = n(p?.temp_f, 70)
  // ~1% per 10°F off a 70°F baseline, capped either way so a 100°F day can't
  // outweigh the hitter himself.
  const air = Math.max(0.94, Math.min(1.06, 1 + (temp - 70) / 1000))
  return park * air
}

const bbeCount = (p) => n(obj(p?.bbe_profile).sample_bbe, n(p?.recent_distance_tracked, 0))

const buildColumns = (onWatch) => [
  { key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
  { key: 'name',    label: 'Batter',  heat: false, w: 148, bold: true, sticky: true },
  { key: 'team',    label: 'Tm',      heat: false, w: 34, mono: true, dim: true },
  { key: 'opp',     label: 'Opp',     heat: false, w: 34, mono: true, dim: true },
  { key: 'venue',   label: 'Park',    heat: false, w: 150, dim: true },
  { key: 'adj',     label: 'Adjusted', w: 54, dp: 1 },
  { key: 'raw',     label: 'Raw',     w: 46, dp: 1 },
  { key: 'parkD',   label: 'Park×',   w: 46, dp: 2 },
  { key: 'temp',    label: 'Temp',    w: 44, dp: 0 },
  { key: 'wind',    label: 'Wind',    w: 44, dp: 0 },
  { key: 'maxEV',   label: 'Max EV',  w: 50, dp: 1 },
  { key: 'avgEV',   label: 'Avg EV',  w: 50, dp: 1 },
  { key: 'la',      label: 'LA',      w: 42, dp: 1 },
  { key: 'barrel',  label: 'Brl%',    w: 44, dp: 1 },
  { key: 'bbe',     label: 'BBE',     w: 42,
    title: 'Batted balls tracked — the sample the distance numbers rest on' },
  // Distance profile: what he actually hits far, against what this arm actually
  // allows far. Every one of these is on the slate row, so the whole board gets
  // them without a per-player fetch.
  { key: 'd350',    label: '350+%',   w: 50, dp: 0,
    title: 'Share of his tracked batted balls that went 350+ ft. Rate, so it survives a small sample better than the raw count next to it.' },
  { key: 'd375',    label: '375+',    w: 44,
    title: 'Count of 375+ ft batted balls in the tracked window' },
  { key: 'p375',    label: 'P 375+',  w: 50,
    title: 'How many 375+ ft balls this pitcher has allowed' },
  { key: 'p400',    label: 'P 400+',  w: 50,
    title: 'How many 400+ ft balls this pitcher has allowed — the closest thing to “he gives up real distance”' },
  { key: 'hr',      label: 'HR scr',  w: 48, dp: 1 },
  { key: 'hr9',     label: 'P HR/9',  w: 48, dp: 2 },
  // Room freed up by dropping the top-15 heatmap, which showed a subset of
  // these same columns for a subset of these same hitters.
  { key: 'parkHR',  label: 'Park HR×', w: 56, dp: 2,
    title: 'Park home-run factor. Above 1.00 helps the hitter.' },
  { key: 'pFB',     label: 'P FB%',   w: 48, dp: 0,
    title: 'Fly balls this pitcher allows — distance needs air under it' },
  { key: 'pEV',     label: 'P EV ag', w: 52, dp: 1,
    title: 'Average exit velocity he gives up' },
  { key: 'pBrl',    label: 'P Brl%',  w: 50, dp: 1,
    title: 'Barrel rate allowed — the contact that actually travels' },
  { key: 'ihr',     label: 'IHR%',    w: 46, dp: 1,
    title: 'Ideal HR contact rate — the launch/EV window that produces homers' },
  { key: 'pull',    label: 'PullAir%', w: 54, dp: 0,
    title: 'How often he pulls the ball in the air — the shortest route over a fence' },
]

export default function LongestBoard({ players = [], onWatch, watchIds, onPlayerClick }) {
  const [rankBy, setRankBy] = useState('adj')
  const [top, setTop] = useState(25)
  const [minBBE, setMinBBE] = useState(0)
  const [query, setQuery] = useState('')

  const all = useMemo(() => players.map((p, i) => {
    const raw = n(p?.longest_hr_score, 0)
    const k = carry(p)
    return {
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      venue: clean(p?.venue_name, ''),
      d350: (100 * n(p?.recent_350_num, 0)) / Math.max(1, n(p?.recent_350_den, 0)),
      d375: n(p?.recent_375_num, 0),
      p375: n(p?.pitcher_375_allowed, 0),
      p400: n(p?.pitcher_400_allowed, 0),
      raw,
      adj: raw * k,
      parkD: n(p?.park_dist_factor, 1),
      temp: n(p?.temp_f, 0),
      wind: n(p?.wind_mph, 0),
      maxEV: maxEV(p),
      avgEV: avgEV(p),
      la: launchAngle(p),
      barrel: barrelRate(p) * 100,
      bbe: bbeCount(p),
      hr: hrScore(p),
      hr9: n(p?.pitcher_hr9, 0),
      parkHR: n(p?.park_hr_factor, n(p?.park_dist_factor, 1)),
      pFB: n(p?.pitcher_fb_rate, 0) * (n(p?.pitcher_fb_rate, 0) <= 1 ? 100 : 1),
      pEV: n(p?.pitcher_ev_allowed, 0),
      pBrl: n(p?.pitcher_barrel_allowed, 0) * (n(p?.pitcher_barrel_allowed, 0) <= 1 ? 100 : 1),
      ihr: n(p?.recent_ideal_hr_contact, 0) * 100,
      pull: n(p?.pitcher_pullair_allowed_pct, 0) * (n(p?.pitcher_pullair_allowed_pct, 0) <= 1 ? 100 : 1),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    }
  }), [players, watchIds])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => r.bbe >= minBBE)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp} ${r.venue}`.toLowerCase().includes(q))
      .sort((a, b) => b[rankBy] - a[rankBy])
      .slice(0, top)
  }, [all, rankBy, top, minBBE, query])

  if (!players.length) return <Empty text="No players on this slate yet." />

  const maxBBE = Math.max(...all.map((r) => r.bbe), 0)

  return (
    <div>
      <PanelTitle
        title="🚀 Longest HR"
        sub="Who hits the farthest ball tonight — a distance board, not a probability board"
        right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} shown</span>}
      />

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 700,
      }}>
        Different question from the HR tab, and it regularly disagrees with it.{' '}
        <b style={{ color: C.text2 }}>Adjusted</b> multiplies the raw score by the park&apos;s distance
        factor and a small temperature term — warm air carries, which is physics rather than a model
        opinion. It&apos;s kept gentle on purpose: the bot already folds park into the raw score, and
        double-counting it would just rank Coors first every night.
      </div>

      <div style={{
        display: 'grid', gap: 10, marginBottom: 12, alignItems: 'end',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <div>
          <div style={{ fontSize: 10, color: C.text3, marginBottom: 3 }}>Rank by</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['adj', 'Adjusted for park + air'], ['raw', 'Raw score']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRankBy(k)}
                style={{
                  padding: '4px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${rankBy === k ? C.orange : C.border}`,
                  background: rankBy === k ? 'rgba(249,115,22,.12)' : 'transparent',
                  color: rankBy === k ? C.orange : C.text3,
                }}
              >{label}</button>
            ))}
          </div>
        </div>
        <label style={{ fontSize: 10, color: C.text3 }}>
          Show top
          <input type="number" min={5} step={5} value={top}
            onChange={(e) => setTop(Number(e.target.value) || 25)}
            style={{ ...inputStyle(), width: '100%' }} />
        </label>
        <label style={{ fontSize: 10, color: C.text3 }}>
          Min tracked batted balls: <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{minBBE}</b>
          <input type="range" min={0} max={Math.max(10, maxBBE)} step={1} value={minBBE}
            onChange={(e) => setMinBBE(Number(e.target.value))}
            style={{ width: '100%', accentColor: C.orange }} />
        </label>
        <label style={{ fontSize: 10, color: C.text3, gridColumn: 'span 2' }}>
          Search this board
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="name, team, opponent or park"
            style={{ ...inputStyle(), width: '100%' }} />
        </label>
      </div>

      {!rows.length ? (
        <Empty text="Nobody matches these filters." />
      ) : (
        <>

          <DenseTable
            rows={rows}
            columns={buildColumns(onWatch)}
            onRowClick={onPlayerClick}
            initialSort={rankBy}
            maxHeight={480}
          />
        </>
      )}
    </div>
  )
}
