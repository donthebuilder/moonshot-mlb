'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean, median,
  hrScore, barrelRate, playerId,
} from '../../lib/player'
import { PanelTitle, Empty, inputStyle } from '../ui'
import DenseTable from '../DenseTable'
import { kRiskScore } from '../../lib/scoring_additions'

// Due — hitters overdue for a homer.
//
// The most seductive board on the site and the one most likely to be wrong.
// "Due" is the gambler's fallacy wearing a jersey: a hitter who hasn't homered
// in 60 games is not more likely to homer tonight, he's more likely to be a
// hitter who doesn't homer. The board is still worth having, because the bot's
// due score is a RATIO — expected HR rate against actual drought — so it
// separates "good power, cold streak" from "no power, ongoing". But the
// drought column on its own is noise, and the page says so.
//
// Fields checked against the published slate: hr_due_score, hr_due_ratio,
// hr_due_tag, games_since_last_hr and hr_per_pa are all present on 268/268.

const buildColumns = (onWatch) => [
  { key: 'watched', label: '☆',       action: true, w: 30, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
  { key: 'name',    label: 'Batter',  heat: false, w: 148, bold: true, sticky: true },
  { key: 'weak',    label: '★',       flag: true, mark: '★', w: 30 },
  { key: 'due',     label: 'Due',     w: 44, dp: 1 },
  { key: 'ratio',   label: 'Ratio',   w: 46, dp: 2,
    title: 'Expected HR rate against the actual drought — above 1 means overdue on his own rate' },
  { key: 'drought', label: 'Drought', w: 50,
    title: 'Games since his last home run' },
  { key: 'hrPA',    label: 'HR/PA',   w: 50, dp: 3,
    title: 'Season HR per plate appearance — the power that makes a drought mean anything' },
  { key: 'gap',     label: 'HR gap',  w: 48, dp: 2,
    title: 'Drought minus what his own rate would predict' },
  { key: 'hr',      label: 'HR scr',  w: 48, dp: 1 },
  { key: 'barrel',  label: 'Brl%',    w: 44, dp: 1 },
  { key: 'dc',      label: 'DC',      w: 44, dp: 1 },
  { key: 'hr9',     label: 'P HR/9',  w: 48, dp: 2 },
  { key: 'l7hr',    label: 'L7 HR',   w: 46,
    title: 'Home runs in his last 7 — a drought that already broke is not a drought' },
  { key: 'l5h',     label: 'L5 H',    w: 44,
    title: 'Hits in his last 5. Cold bat plus long drought is a different bet from hot bat plus long drought.' },
  { key: 'ev',      label: 'EV',      w: 46, dp: 1,
    title: 'Recent average exit velocity — is he still hitting it hard through the drought?' },
  { key: 'ihr',     label: 'IHR%',    w: 46, dp: 1,
    title: 'Ideal HR contact rate — the launch/EV combination that produces homers' },
  { key: 'd350',    label: '350+%',   w: 50, dp: 0,
    title: 'Share of tracked balls travelling 350+ ft — distance he still has' },
  { key: 'kRisk',   label: 'K risk',  w: 50, dp: 0, invert: true,
    title: 'Strikeout risk. Inverted — low is good. A drought plus a high K risk is the worst combination on this board.' },
  { key: 'pa',      label: 'PA',      w: 42,
    title: 'Season plate appearances — the denominator under HR/PA' },
  // The matchup half. A drought is only interesting against an arm that gives
  // homers up — "due" plus a pitcher who suppresses them is not a bet.
  { key: 'matchup', label: 'vs',      heat: false, w: 120, dim: true,
    title: 'Tonight’s starter' },
  { key: 'pFB',     label: 'P FB%',   w: 48, dp: 0,
    title: 'Fly balls he allows — a drought breaks in the air' },
  { key: 'pBrl',    label: 'P Brl%',  w: 50, dp: 1,
    title: 'Barrel rate allowed' },
  { key: 'pEV',     label: 'P EV',    w: 46, dp: 1,
    title: 'Average exit velocity allowed' },
  { key: 'p375',    label: 'P 375+',  w: 50,
    title: 'Balls he has let travel 375+ ft' },
  { key: 'parkHR',  label: 'Park×',   w: 46, dp: 2,
    title: 'Park home-run factor — above 1.00 helps' },
  { key: 'weakSide', label: 'Weak side', heat: false, w: 62, dim: true,
    title: 'The side this pitcher struggles against' },
]

function Tile({ label, value, sub }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
    }}>
      <div style={{
        fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em',
        color: C.text3, fontWeight: 700, whiteSpace: 'nowrap',
      }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 18, fontWeight: 800, color: C.orange }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
    </div>
  )
}

// Who homered inside the last N games, N scalable 1–5. Sorted most-recent
// first, then by homers in the window, so "went last night" leads.
function RecentBombers({ all = [], onPlayerClick }) {
  const [win, setWin] = useState(5)
  // EXACT-DAY MODE (2026-08-08, Donovan): clicking 2g shows ONLY the hitters
  // whose last homer came exactly two games ago — a bucket, not a range.
  const [exact, setExact] = useState(true)
  const [open, setOpen] = useState(true)

  // THE ONE PARAMETER: games_since_last_hr, on 267/267 slate rows.
  // 0 = homered in his most recent game, so "within the last N games" is
  // drought <= N−1. Nothing else filters — an earlier version also required
  // last5_hr > 0 as a sanity guard, which was exactly the kind of quiet
  // second condition that drops legitimate names when the L5 fields lag the
  // drought counter. Verified against the live payload (2026-08-04): the
  // drought filter alone catches every hitter the L5 fields know about, so
  // the guard bought nothing and could only ever cost.
  //
  // WHO STILL CAN'T APPEAR, by construction: anyone not on TONIGHT'S slate.
  // A hitter who bombed last night but isn't in tonight's player pool has no
  // slate row to read. That's a data boundary, not a filter — the caption
  // says so.
  const rows = useMemo(() => (
    all
      .filter((r) => exact ? r.drought === win - 1 : r.drought <= win - 1)
      .sort((a, b) => (a.drought - b.drought)
        || (n(b._raw?.last5_hr, 0) - n(a._raw?.last5_hr, 0))
        || (b.hr - a.hr))
  ), [all, win, exact])

  return (
    <div style={{ margin: '10px 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
        <span
          onClick={() => setOpen((v) => !v)}
          style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer', color: C.text }}
        >💥 Went deep recently {open ? '▾' : '▸'}</span>
        <button
          onClick={() => setExact((v) => !v)}
          title={exact ? 'Showing hitters whose last HR came EXACTLY N games ago — click for within-last-N' : 'Showing everyone within the last N games — click for the exact-day bucket'}
          style={{
            padding: '3px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 9,
            fontWeight: 800, fontFamily: NUM_FONT, letterSpacing: '.06em',
            border: `1px solid ${C.border2}`, background: 'transparent', color: C.text3,
          }}
        >{exact ? 'EXACTLY' : 'WITHIN'}</button>
        {[1, 2, 3, 4, 5].map((w) => (
          <button
            key={w}
            onClick={() => { setWin(w); setOpen(true) }}
            style={{
              padding: '3px 10px', borderRadius: 7, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${win === w ? C.orange : C.border}`,
              background: win === w ? 'rgba(249,115,22,.12)' : 'transparent',
              color: win === w ? C.orange : C.text3,
            }}
          >{w}g</button>
        ))}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} hitters
        </span>
      </div>

      {open && (rows.length === 0 ? (
        <div style={{ fontSize: 10.5, color: C.text3, padding: '4px 0 2px' }}>
          Nobody on tonight&apos;s slate homered within the last {win} game{win > 1 ? 's' : ''}.
        </div>
      ) : (
        <DenseTable
          rows={rows.map((r) => ({
            ...r,
            l5hr: n(r._raw?.last5_hr, 0),
            l10hr: n(r._raw?.last10_hr, 0),
            l5x: n(r._raw?.last5_xbh, 0),
            iso: n(r._raw?.season_iso, 0) * 100,
            hrw: n(r._raw?.hrw_score, 0),
            sHR: n(r._raw?.season_hr, 0),
            hrPA100: n(r._raw?.hr_per_pa, 0) * 100,
            pick: clean(r._raw?.game_pick_role, ''),
            isPick: String(r._raw?.game_pick_role || '').trim() ? 1 : 0,
          }))}
          columns={[
            { key: 'name',    label: 'Batter', heat: false, w: 148, bold: true, sticky: true },
            { key: 'team',    label: 'Tm',  heat: false, w: 34, mono: true, dim: true },
            { key: 'opp',     label: 'Opp', heat: false, w: 34, mono: true, dim: true },
            { key: 'spot',    label: '#', heat: false, w: 28, mono: true, dim: true,
              title: 'Lineup spot tonight' },
            { key: 'bats',    label: 'B', heat: false, w: 26, mono: true, dim: true },
            { key: 'matchup', label: 'Facing', heat: false, w: 118, dim: true },
            { key: 'isPick',  label: '🤖', flag: true, mark: '●', w: 32,
              title: 'One of the bot’s designated picks tonight' },
            { key: 'weak',    label: '★', flag: true, mark: '★', w: 30,
              title: 'Weak lineup spot against tonight’s starter' },
            { key: 'drought', label: 'Last HR', heat: false, w: 58, mono: true,
              fmt: (v) => (Number(v) === 0 ? 'last gm' : `${v}g ago`),
              title: 'How many games since the homer — 0 means his most recent game. This is the ONLY filter: window of N games = this number ≤ N−1.' },
            { key: 'l5hr',    label: 'HR L5', w: 46,
              title: 'Homers in his last five games — 2+ is a genuine heater' },
            { key: 'l10hr',   label: 'HR L10', w: 50,
              title: 'Homers in his last ten — separates a hot week from one swing' },
            { key: 'l5h',     label: 'H L5', w: 44 },
            { key: 'l5x',     label: 'XBH L5', w: 52 },
            { key: 'sHR',     label: 'Szn HR', w: 50,
              title: 'Season home runs — is the recent one part of a pattern or a surprise' },
            { key: 'hrPA100', label: 'HR/PA', w: 48, dp: 1,
              title: 'Season HR per 100 PA. 4+ is a true power bat; a recent bomb from a 1.5 is much more likely a one-off.' },
            { key: 'hr',      label: 'HR scr', w: 48, dp: 1 },
            { key: 'hrw',     label: 'HRW', w: 46, dp: 0 },
            { key: 'iso',     label: 'ISO', w: 44, dp: 0,
              title: 'Season ISO ×100 — the archive’s strongest HR predictor: sub-13 homered 8.2%, 23+ homered 22.2%' },
            { key: 'barrel',  label: 'Brl%', w: 46, dp: 1,
              title: 'Recent barrel rate — is the contact quality still there' },
            { key: 'ev',      label: 'EV', w: 46, dp: 1 },
            { key: 'ihr',     label: 'IHR%', w: 46, dp: 1,
              title: 'Ideal HR contact rate — the EV/launch window that produces homers' },
            { key: 'hr9',     label: 'P HR/9', w: 50, dp: 2,
              title: 'Tonight’s starter — homers allowed per nine' },
            { key: 'pBrl',    label: 'P Brl%', w: 50, dp: 1,
              title: 'Barrel rate tonight’s starter allows' },
            { key: 'parkHR',  label: 'Park×', w: 48, dp: 2,
              title: 'Park HR factor tonight — above 1.00 helps' },
          ]}
          onRowClick={onPlayerClick}
          initialSort={null}
          maxHeight={360}
          caption={`Everyone on tonight's slate whose last homer came within his last ${win} game${win > 1 ? 's' : ''} — the only parameter is games_since_last_hr ≤ ${win - 1}, nothing else filters. Two boundaries to know: a hitter whose team isn't on tonight's slate can't appear (no slate row to read), and the window counts HIS games, not calendar days. Most recent first, then homers in the window. Read Szn HR and HR/PA before chasing: a bomb from a 4+ HR/PA bat is a pattern, the same bomb from a 1.5 is usually a one-off. Heat-chasers read top-down, regression players read it as a fade list — the table doesn't pick a side.`}
        />
      ))}
    </div>
  )
}

export default function DueBoard({ players = [], onWatch, watchIds, onPlayerClick }) {
  const [minDue, setMinDue] = useState(0)
  const [minDrought, setMinDrought] = useState(0)
  const [tag, setTag] = useState('All')
  const [limit, setLimit] = useState(30)
  const [query, setQuery] = useState('')

  const all = useMemo(() => players.map((p, i) => {
    const drought = n(p?.games_since_last_hr, 0)
    const den350 = Math.max(1, n(p?.recent_350_den, 0))
    const hrPA = n(p?.hr_per_pa, 0)
    // What his own rate predicts over the drought, in games. Roughly 4 PA a
    // game -- close enough for a comparison column, and it keeps the number
    // honest about being an estimate rather than a measured stat.
    const expected = hrPA > 0 ? 1 / (hrPA * 4) : null
    return {
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      tag: clean(p?.hr_due_tag, '—'),
      weak: p?.weak_spot_flag ? 1 : 0,
      due: n(p?.hr_due_score, 0),
      ratio: n(p?.hr_due_ratio, 0),
      drought,
      hrPA,
      gap: expected == null ? 0 : drought / expected,
      hr: hrScore(p),
      barrel: barrelRate(p) * 100,
      dc: n(p?.damage_conversion_score, 0),
      hr9: n(p?.pitcher_hr9, 0),
      // Context columns. A drought only means something next to whether the bat
      // is alive — a cold hitter who hasn't homered in 20 games is not "due",
      // he's just cold, and this board could not tell you which was which.
      spot: clean(p?.lineup_spot, ''),
      bats: clean(p?.bats, ''),
      l7hr: n(p?.last7_hr, 0),
      l5h: n(p?.last5_hits, 0),
      ev: n(p?.recent_ev, 0),
      ihr: n(p?.recent_ideal_hr_contact, 0) * 100,
      d350: (100 * n(p?.recent_350_num, 0)) / den350,
      pa: n(p?.season_pa, 0),
      matchup: clean(p?.pitcher_name, 'TBD'),
      pFB: n(p?.pitcher_fb_rate, 0) * (n(p?.pitcher_fb_rate, 0) <= 1 ? 100 : 1),
      pBrl: n(p?.pitcher_barrel_allowed, 0) * (n(p?.pitcher_barrel_allowed, 0) <= 1 ? 100 : 1),
      pEV: n(p?.pitcher_ev_allowed, 0),
      p375: n(p?.pitcher_375_allowed, 0),
      parkHR: n(p?.park_hr_factor, n(p?.park_dist_factor, 1)),
      weakSide: clean(p?.pitcher_weak_side, ''),
      kRisk: kRiskScore(p),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    }
  }), [players, watchIds])

  const tags = useMemo(
    () => ['All', ...Array.from(new Set(all.map((r) => r.tag).filter((t) => t && t !== '—'))).sort()],
    [all],
  )

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => r.due >= minDue)
      .filter((r) => r.drought >= minDrought)
      .filter((r) => tag === 'All' || r.tag === tag)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
      .sort((a, b) => b.due - a.due || b.gap - a.gap)
      .slice(0, limit)
  }, [all, minDue, minDrought, tag, query, limit])

  if (!players.length) return <Empty text="No players on this slate yet." />

  const elite = all.filter((r) => r.hrPA >= 0.045).length
  const longest = Math.max(...all.map((r) => r.drought), 0)
  const medDue = median(all.map((r) => r.due))
  const biggestGap = Math.max(...all.map((r) => r.gap), 0)

  return (
    <div>
      <PanelTitle
        title="Due"
        sub="Overdue for a homer — a ratio board, not a drought board"
        right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} shown</span>}
      />

      {/* WHO WENT DEEP RECENTLY — the flip side of this tab, on the same
          field. games_since_last_hr is on 268/268: 0 = homered his last game,
          so a window of N games is drought <= N-1. Scales 1..5 with the
          buttons. Lives here because heat and drought are two ends of one
          axis, and you check them in the same breath. */}
      <RecentBombers all={all} onPlayerClick={onPlayerClick} />

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 680,
      }}>
        A long drought on its own is not a signal — it usually just identifies a hitter without
        power. What makes this board worth reading is <b style={{ color: C.text2 }}>Ratio</b> and{' '}
        <b style={{ color: C.text2 }}>HR/PA</b> next to the drought: real power plus a gap is a cold
        streak, no power plus a gap is just who he is.
      </div>

      <div style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
      }}>
        <Tile label="Qualifying" value={all.length} sub="on the slate" />
        <Tile label="Due elite power" value={elite} sub="HR/PA ≥ .045" />
        <Tile label="Longest drought" value={`${longest} g`} />
        <Tile label="Median due score" value={medDue.toFixed(1)} />
        <Tile label="Biggest HR gap" value={`${biggestGap.toFixed(1)}×`} sub="vs his own rate" />
      </div>

      <div style={{
        display: 'grid', gap: 10, marginBottom: 12, alignItems: 'end',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        <label style={{ fontSize: 10, color: C.text3 }}>
          Min due score: <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{minDue}</b>
          <input type="range" min={0} max={100} step={1} value={minDue}
            onChange={(e) => setMinDue(Number(e.target.value))}
            style={{ width: '100%', accentColor: C.orange }} />
        </label>
        <label style={{ fontSize: 10, color: C.text3 }}>
          Min games since HR
          <input type="number" min={0} step={1} value={minDrought}
            onChange={(e) => setMinDrought(Number(e.target.value) || 0)}
            style={{ ...inputStyle(), width: '100%' }} />
        </label>
        <label style={{ fontSize: 10, color: C.text3 }}>
          Show
          <input type="number" min={5} step={5} value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 30)}
            style={{ ...inputStyle(), width: '100%' }} />
        </label>
        <label style={{ fontSize: 10, color: C.text3, gridColumn: 'span 2' }}>
          Search this board
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="name, team, opponent"
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
            initialSort="due"
            maxHeight={480}
          />
        </>
      )}
    </div>
  )
}
