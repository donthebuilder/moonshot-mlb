'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  hrScore, barrelRate, playerId,
} from '../../lib/player'
import { PanelTitle, Empty, inputStyle } from '../ui'
import DenseTable from '../DenseTable'
import { SCORE } from '../../lib/scales'

// Power-3 — who has hit the ball hardest and farthest all season.
//
// This board replaced the Due board on 2026-09-06. The homer night audit
// (158 nights, 4,596 HR hitter-nights, every pre-game signal against the
// field) found the due score ranked the night's homer hitters BELOW the
// field, and that HR rate is highest the game after a homer and falls as the
// drought lengthens. Donovan: "remove the due board, it's not good and
// doesn't help — I do like knowing a player's drought in columns." So the
// drought survives as a column here (and on the boards), and the lens is now
// the signal that audit found holds night in, night out:
//
//   power3_score = 100 × mean of three within-slate percentile ranks —
//                  season HR per ball in play, season average EV, season max EV
//   power3_rank  = 1 is the strongest season-power bat on tonight's slate
//   power3_flag  = top ten with at least 60 season balls in play
//
// Measured: above the field on 150 of 155 nights (AUC 0.607); the nightly
// top ten homered at 21.4% against an 11.2% base; the top five 21.8%. No
// single signal, no form add-on, and no weighting beat the plain average, so
// it is a plain average. All three numbers and the rank are PUBLISHED BY THE
// BOT (mlb_dashboard.py, same commit) — nothing is recomputed here, so this
// board and the bot's own flag can never disagree.
//
// Until the first slate after that bot ship, the fields are absent and the
// board says so instead of inventing a stand-in from other columns.
const buildColumns = (onWatch) => [
  { key: 'watched', label: '☆',       action: true, w: 30, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
  { key: 'name',    label: 'Batter',  heat: false, w: 148, bold: true, sticky: true },
  { key: 'p3flag',  label: '⚡',       flag: true, mark: '⚡', w: 30,
    title: 'Power-3 top ten tonight (with a real season sample). Historically these homer 21% of the time.' },
  { key: 'p3',      label: 'Power-3', w: 58, dp: 0, domain: [0, 100], primary: true,
    title: 'Mean of his three season-power ranks on tonight’s slate — HR per ball in play, average EV, max EV. 100 = best on the slate in all three.' },
  { key: 'p3rank',  label: 'Rank',    w: 44, invert: true,
    title: '1 = strongest season-power bat on the slate' },
  { key: 'hrBBE',   label: 'HR/BBE',  w: 54, dp: 1,
    title: 'Season home runs per 100 balls in play — one of the three' },
  { key: 'avgEV',   label: 'Avg EV',  w: 52, dp: 1,
    title: 'Season average exit velocity — one of the three' },
  { key: 'maxEV',   label: 'Max EV',  w: 52, dp: 1,
    title: 'Hardest ball he has hit this season — one of the three. 115+ homers 18% of the time.' },
  { key: 'bbe',     label: 'BBE',     w: 44,
    title: 'Season balls in play — the sample under the three numbers. The ⚡ flag needs 60.' },
  { key: 'drought', label: 'Drought', heat: false, w: 58, mono: true,
    fmt: (v) => (Number(v) === 0 ? 'last gm' : `${v}g`),
    title: 'Games since his last home run. Kept because you asked for it; measured over 155 nights it predicts nothing — 10+ games without one homer at 9%, the game after a homer at 15%.' },
  { key: 'l5hr',    label: 'HR L5',   w: 46,
    title: 'Homers in his last five games — 3+ homered 17.5% of the time' },
  { key: 'hr',      label: 'HR scr',  w: 48, dp: 1, ...SCORE },
  { key: 'hrw',     label: 'HRW',     w: 46, dp: 0, ...SCORE,
    title: 'The bot’s HR window score — its strongest single term in the audit (80+ homered 25% of the time in the tracked pool)' },
  { key: 'barrel',  label: 'Brl%',    w: 44, dp: 1,
    title: 'Recent barrel rate' },
  { key: 'matchup', label: 'vs',      heat: false, w: 120, dim: true,
    title: 'Tonight’s starter' },
  { key: 'hr9',     label: 'P HR/9',  w: 48, dp: 2,
    title: 'Homers per nine the starter allows — 1.3+ was worth about +3.5 points of HR rate in the audit' },
  { key: 'parkHR',  label: 'Park×',   w: 46, dp: 2,
    title: 'Park home-run factor — measured near coin-flip in the audit; shown for context' },
]

// Who homered inside the last N games, N scalable 1–5. Carried over from the
// Due board unchanged — heat and drought are two ends of one axis and you
// check them in the same breath. Folded by default.
function RecentBombers({ all = [], onPlayerClick }) {
  const [win, setWin] = useState(5)
  const [exact, setExact] = useState(true)
  const [open, setOpen] = useState(false)

  // THE ONE PARAMETER: games_since_last_hr, on every slate row. 0 = homered
  // in his most recent game, so "within the last N games" is drought <= N−1.
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
            l10hr: n(r._raw?.last10_hr, 0),
            l5x: n(r._raw?.last5_xbh, 0),
            sHR: n(r._raw?.season_hr, 0),
            pick: clean(r._raw?.game_pick_role, ''),
            isPick: String(r._raw?.game_pick_role || '').trim() ? 1 : 0,
          }))}
          columns={[
            { key: 'name',    label: 'Batter', heat: false, w: 148, bold: true, sticky: true },
            { key: 'team',    label: 'Tm',  heat: false, w: 34, mono: true, dim: true },
            { key: 'opp',     label: 'Opp', heat: false, w: 34, mono: true, dim: true },
            { key: 'matchup', label: 'Facing', heat: false, w: 118, dim: true },
            { key: 'isPick',  label: '🤖', flag: true, mark: '●', w: 32,
              title: 'One of the bot’s designated picks tonight' },
            { key: 'p3flag',  label: '⚡', flag: true, mark: '⚡', w: 30, title: 'Power-3 top ten tonight' },
            { key: 'drought', label: 'Last HR', heat: false, w: 58, mono: true,
              fmt: (v) => (Number(v) === 0 ? 'last gm' : `${v}g ago`),
              title: 'How many games since the homer — 0 means his most recent game.' },
            { key: 'l5hr',    label: 'HR L5', w: 46 },
            { key: 'l10hr',   label: 'HR L10', w: 50 },
            { key: 'l5x',     label: 'XBH L5', w: 52 },
            { key: 'sHR',     label: 'Szn HR', w: 50 },
            { key: 'p3',      label: 'Power-3', w: 58, dp: 0, domain: [0, 100] },
            { key: 'hr',      label: 'HR scr', w: 48, dp: 1, ...SCORE },
            { key: 'hrw',     label: 'HRW', w: 46, dp: 0, ...SCORE },
            { key: 'hr9',     label: 'P HR/9', w: 50, dp: 2 },
          ]}
          onRowClick={onPlayerClick}
          initialSort={null}
          maxHeight={360}
          caption={`Everyone on tonight's slate whose last homer came within his last ${win} game${win > 1 ? 's' : ''} — the only parameter is games_since_last_hr ≤ ${win - 1}. A hitter whose team isn't on tonight's slate can't appear, and the window counts HIS games, not calendar days. The audit's read on this list: the game after a homer is the best night to be on a hitter (14.6% vs 11.2% base) and it fades from there — read Power-3 next to it, not the drought.`}
        />
      ))}
    </div>
  )
}

export default function Power3Board({ players = [], onWatch, watchIds, onPlayerClick, showTitle = true }) {
  const [minBBE, setMinBBE] = useState(60)
  const [flagOnly, setFlagOnly] = useState(false)
  const [limit, setLimit] = useState(30)
  const [query, setQuery] = useState('')

  const all = useMemo(() => players.map((p, i) => ({
    _key: `${p?.player_id ?? nameOf(p)}-${i}`,
    _raw: p,
    name: nameOf(p),
    team: teamOf(p),
    opp: oppOf(p),
    p3: n(p?.power3_score, 0),
    p3rank: n(p?.power3_rank, 0),
    p3flag: p?.power3_flag ? 1 : 0,
    hrBBE: n(p?.season_hr_per_bbe, 0) * 100,
    avgEV: n(p?.season_avg_ev, 0),
    maxEV: n(p?.season_max_ev, 0),
    bbe: n(p?.season_bbe_n, 0),
    drought: n(p?.games_since_last_hr, 0),
    l5hr: n(p?.last5_hr, 0),
    hr: hrScore(p),
    hrw: n(p?.hrw_score, 0),
    barrel: barrelRate(p) * 100,
    matchup: clean(p?.pitcher_name, 'TBD'),
    hr9: n(p?.pitcher_hr9, 0),
    parkHR: n(p?.park_hr_factor, n(p?.park_dist_factor, 1)),
    watched: watchIds?.has(playerId(p)) ? 1 : 0,
  })), [players, watchIds])

  const published = useMemo(() => all.some((r) => r.p3 > 0), [all])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => r.bbe >= minBBE)
      .filter((r) => !flagOnly || r.p3flag)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
      .sort((a, b) => b.p3 - a.p3 || a.p3rank - b.p3rank)
      .slice(0, limit)
  }, [all, minBBE, flagOnly, query, limit])

  if (!players.length) return <Empty text="No players on this slate yet." />

  const flagged = all.filter((r) => r.p3flag).length

  return (
    <div>
      {showTitle && (
        <PanelTitle
          title="Power-3"
          sub="Who hits it hardest and farthest, all season"
          right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} shown</span>}
        />
      )}

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 680,
      }}>
        {!showTitle && (
          <>
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rows.length} shown.</b>{' '}
            Who hits it hardest and farthest, all season — <b style={{ color: C.text2 }}>a season-power board, not a form board</b>.{' '}
          </>
        )}
        Three season numbers, ranked against tonight&apos;s slate and averaged: <b style={{ color: C.text2 }}>HR per ball in play</b>,{' '}
        <b style={{ color: C.text2 }}>average exit velocity</b>, <b style={{ color: C.text2 }}>max exit velocity</b>. Over 155 nights this
        ordering beat the field on 150 of them, and the top ten each night homered{' '}
        <b style={{ color: C.text2, fontFamily: NUM_FONT }}>21.4%</b> of the time against an{' '}
        <b style={{ color: C.text2, fontFamily: NUM_FONT }}>11.2%</b> base. The drought column is for information — it does not move the rank.
      </div>

      {!published ? (
        <Empty text="Power-3 is not on this slate yet — it arrives with the first slate the bot publishes after the 2026-09-06 ship." />
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.7, marginBottom: 12, maxWidth: 680 }}>
            <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{flagged}</b> hitters carry the ⚡ tonight — the top ten by Power-3
            with at least <span style={{ fontFamily: NUM_FONT }}>60</span> season balls in play.
          </div>

          <div style={{
            display: 'grid', gap: 10, marginBottom: 12, alignItems: 'end',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          }}>
            <label style={{ fontSize: 10, color: C.text3 }}>
              Min season BBE: <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{minBBE}</b>
              <input type="range" min={0} max={300} step={10} value={minBBE}
                onChange={(e) => setMinBBE(Number(e.target.value))}
                style={{ width: '100%', accentColor: C.orange }} />
            </label>
            <label style={{ fontSize: 10, color: C.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={flagOnly} onChange={(e) => setFlagOnly(e.target.checked)} style={{ accentColor: C.orange }} />
              ⚡ only
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
            <DenseTable
              rows={rows}
              columns={buildColumns(onWatch)}
              onRowClick={onPlayerClick}
              initialSort="p3"
              heatMode="sorted"
              maxHeight={480}
            />
          )}
        </>
      )}

      <RecentBombers all={all} onPlayerClick={onPlayerClick} />
    </div>
  )
}
