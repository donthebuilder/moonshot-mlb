'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean, obj,
  hrScore, barrelRate, maxEV, avgEV, launchAngle, playerId,
} from '../../lib/player'
import { PanelTitle, Empty, inputStyle } from '../ui'
import Rail from '../Rail'
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

// FIELD-NAME FIX (2026-08-04): this board read `temp_f` and `wind_mph`, but
// the bot publishes `weather_temp_f` and `weather_wind_mph` (confirmed in the
// graded archive schema, where those are the only spellings that carry
// values). Every weather cell rendered 0 and the park+air adjustment was
// silently inert — "Adjusted" and "Raw" were the same ranking with different
// labels. Each read now falls back across the published spellings.
const wTemp = (p) => n(p?.weather_temp_f, n(p?.temp_f, 0))
const wWind = (p) => n(p?.weather_wind_mph, n(p?.wind_mph, 0))

const carry = (p) => {
  const park = n(p?.park_dist_factor, n(p?.park_hr_factor, 1)) || 1
  const temp = wTemp(p) || 70
  // ~1% per 10°F off a 70°F baseline, capped either way so a 100°F day can't
  // outweigh the hitter himself.
  const air = Math.max(0.94, Math.min(1.06, 1 + (temp - 70) / 1000))
  return park * air
}

const bbeCount = (p) => n(obj(p?.bbe_profile).sample_bbe, n(p?.recent_distance_tracked, 0))

// Docket #19 pre-wiring: the moment the bot publishes true distance fields
// (recent_max_distance / recent_avg_hr_distance / recent_400_num), these
// columns appear on their own — until then they're absent, not zero-filled.
const DIST_COLUMNS = [
  { key: 'maxDist', label: 'Longest', w: 54, dp: 0,
    title: 'His longest tracked batted ball in the recent window, in feet — the direct answer to the question this board asks' },
  { key: 'avgHrDist', label: 'HR dist', w: 54, dp: 0,
    title: 'Average distance of his recent home runs' },
  { key: 'd400', label: '400+', w: 44,
    title: 'Count of 400+ ft batted balls in the tracked window' },
]

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
  { key: 'd375p',   label: '375+%',   w: 50, dp: 0,
    title: 'INFERRED: his 375+ ft count over the same tracked-ball denominator as 350+%. The elite-distance rate — 350 is a warning-track flyout, 375 is trouble everywhere.' },
  { key: 'fresh350', label: 'L20 350+%', w: 62, dp: 0,
    title: 'INFERRED: 350+ rate over just his last ~20 PA — the freshest distance read. Well above his 350+% and the power is arriving; well below and it\'s cooling.' },
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
  { key: 'pull',    label: 'P PullAir%', w: 62, dp: 0,
    title: 'How often THIS PITCHER concedes pulled air contact — the shortest route over a fence. (Pitcher-side; the batter\'s own pull rate is the next column.)' },
  // Batter-side batted-ball identity, from the same recent tracking window the
  // distance counts come from. These were on every slate row and unused here.
  { key: 'bPull',   label: 'B Pull%',  w: 54, dp: 0,
    title: 'His own recent pull rate. Pulled contact travels — pair a high number here with the pitcher PullAir% beside it.' },
  { key: 'bFB',     label: 'B FB%',    w: 50, dp: 0,
    title: 'His recent fly-ball rate — distance needs air under it, and a ground-ball hitter can\'t win this board' },
  { key: 'bSweet',  label: 'Sweet%',   w: 52, dp: 0,
    title: 'Recent sweet-spot rate — batted balls in the 8–32° launch window where distance lives' },
  // Conditions. Distance is the one board where air and park do real work, so
  // the game environment belongs on the row rather than a tooltip away.
  { key: 'hrEff',   label: 'Wx HR%',  w: 52, dp: 0,
    title: 'The bot’s own estimate of how much tonight’s weather moves home runs at this park' },
  { key: 'humid',   label: 'Humid%',  w: 50, dp: 0,
    title: 'Humid air is less dense, so the ball carries slightly further — the opposite of what most people assume' },
  { key: 'feels',   label: 'Feels',   w: 46, dp: 0,
    title: 'Feels-like temperature' },
  { key: 'rain',    label: 'Rain%',   w: 46, dp: 0, invert: true,
    title: 'Precipitation chance. Inverted — rain is a delay risk, not a hitting edge.' },
  { key: 'parkAll', label: 'Park F',  w: 48, dp: 0,
    title: 'Overall park factor, 100 = neutral' },
  { key: 'parkBrl', label: 'Park Brl×', w: 58, dp: 2,
    title: 'Park barrel factor — above 1.00 helps hard contact' },
]

export default function LongestBoard({ players = [], results = null, onWatch, watchIds, onPlayerClick, venueFilter = '', onClearVenue }) {
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
      d375p: (100 * n(p?.recent_375_num, 0)) / Math.max(1, n(p?.recent_350_den, 0)),
      fresh350: (100 * n(p?.l20pa_350_num, 0)) / Math.max(1, n(p?.l20pa_350_den, 0)),
      bPull: n(p?.recent_pull_rate, 0) * 100,
      bFB: n(p?.recent_fb_rate, 0) * 100,
      bSweet: n(p?.recent_sweet_spot_rate, 0) * 100,
      maxDist: n(p?.recent_max_distance, 0) || null,
      avgHrDist: n(p?.recent_avg_hr_distance, 0) || null,
      d400: n(p?.recent_400_num, 0),
      p375: n(p?.pitcher_375_allowed, 0),
      p400: n(p?.pitcher_400_allowed, 0),
      raw,
      adj: raw * k,
      parkD: n(p?.park_dist_factor, 1),
      temp: wTemp(p),
      wind: wWind(p),
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
      hrEff: n(p?.weather_hr_effect_pct, n(p?.hr_weather_effect_pct, null)),
      humid: n(p?.weather_humidity, n(p?.humidity_pct, null)),
      feels: n(p?.weather_feels_like_f, n(p?.feels_like_f, null)),
      rain: n(p?.weather_precip_chance, n(p?.precip_chance, 0)) * 100,
      parkAll: n(p?.park_factor, null),
      parkBrl: n(p?.park_barrel_factor, null),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    }
  }), [players, watchIds])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => r.bbe >= minBBE)
      .filter((r) => !venueFilter || r.venue === venueFilter)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp} ${r.venue}`.toLowerCase().includes(q))
      .sort((a, b) => b[rankBy] - a[rankBy])
      .slice(0, top)
  }, [all, rankBy, top, minBBE, query, venueFilter])

  if (!players.length) return <Empty text="No players on this slate yet." />

  const maxBBE = Math.max(...all.map((r) => r.bbe), 0)
  // Docket #19: columns light up only when the bot starts publishing distances.
  const hasDist = all.some((r) => r.maxDist > 0)
  const columns = hasDist
    ? (() => { const base = buildColumns(onWatch); base.splice(6, 0, ...DIST_COLUMNS); return base })()
    : buildColumns(onWatch)

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

      {/* 🚀 LONGEST TRACKER — tonight's actual bombs by distance, live off
          the tracker's statcast fold (longest_ft rides the homer entries).
          The board below PROJECTS the farthest ball; this strip is who has
          actually hit it so far. */}
      {(() => {
        // ONE ROW, and each bomb carries whether THIS BOARD called it
        // (2026-08-08, pre-video): the hitter's pregame longest-HR rank
        // rides each chip — 🎯#3 means the distance board had him third
        // before the ball flew. That's the metric that grades the page.
        const rankById = new Map(
          [...players]
            .sort((a2, b2) => n(b2?.longest_hr_score, 0) - n(a2?.longest_hr_score, 0))
            .map((p2, i2) => [String(p2?.player_id ?? p2?.id), i2 + 1])
        )
        const entries = (results?.hr_capture_report?.all_homer_entries || results?.merged_homers || [])
          .filter((h) => Number(h?.longest_ft) > 0)
          .sort((a2, b2) => Number(b2.longest_ft) - Number(a2.longest_ft))
          .slice(0, 6)
        if (!entries.length) return null
        return (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, marginBottom: 5 }}>
              🚀 Longest tonight <span style={{ fontSize: 9, color: C.text3, fontWeight: 400 }}>— measured feet · 🎯#N = where THIS board ranked him pregame</span>
            </div>
            {/* On a Rail — see components/Rail.js. A mouse has no horizontal
                axis, so this strip used to be unreachable past the third card
                unless you owned a trackpad. */}
            <Rail gap={6} label="longest tonight">
              {entries.map((h, i) => {
                const rk = rankById.get(String(h?.player_id))
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 7, alignItems: 'baseline', flexShrink: 0,
                    border: `1px solid ${i === 0 ? 'rgba(249,115,22,.55)' : C.border}`,
                    background: i === 0 ? 'rgba(249,115,22,.1)' : C.bg2,
                    borderRadius: 8, padding: '4px 11px',
                  }}>
                    {i === 0 && <span style={{ fontSize: 11 }}>👑</span>}
                    <span style={{ fontSize: 15, fontWeight: 900, fontFamily: NUM_FONT, color: C.orange }}>{Math.round(h.longest_ft)}</span>
                    <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>ft</span>
                    <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{h.name}</span>
                    {rk && rk <= 25 && (
                      <span title={`This board ranked him #${rk} for distance BEFORE the game`} style={{ fontSize: 9, fontWeight: 900, color: rk <= 5 ? '#4ade80' : C.text3, fontFamily: NUM_FONT }}>🎯#{rk}</span>
                    )}
                    {Number(h?.max_ev_mph) > 0 && <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{Number(h.max_ev_mph).toFixed(0)}mph</span>}
                  </div>
                )
              })}
            </Rail>
          </div>
        )
      })()}

      {venueFilter && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: C.orange }}>🏟 {venueFilter} only</span>
          <button onClick={onClearVenue} style={{
            fontSize: 9.5, fontWeight: 700, cursor: 'pointer', color: C.text3,
            background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 6, padding: '2px 8px',
          }}>× all parks</button>
        </div>
      )}

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
            columns={columns}
            onRowClick={onPlayerClick}
            initialSort={rankBy}
            maxHeight={480}
          />
        </>
      )}
    </div>
  )
}
