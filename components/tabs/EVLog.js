'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { Empty } from '../ui'
import DenseTable from '../DenseTable'

// Exit-velocity log — every tracked batted ball, newest first.
//
// TWO THINGS CHANGED HERE AND BOTH ARE ABOUT HONESTY.
//
// 1. The window is GAMES or BATTED BALLS. It is not plate appearances.
//    The handoff asked for a games / plate-appearances toggle. There is no
//    plate-appearance data in this payload to build one from: the detail files
//    carry exactly one list, `spray_chart`, and every row in it is a ball that
//    was put in play. Walks and strikeouts are never written, so any "PA"
//    number this page printed would be a batted-ball count wearing a different
//    label — which is the exact bug that was fixed here once already, when the
//    range control counted unique dates and called them PA. So the toggle is
//    Games / Batted balls, and the missing denominator is stated on the panel.
//    A hitter's "last 10 games" here means his batted balls from his last 10
//    dates with a tracked ball, which is not quite the same as his last 10
//    games either — a game where he walked three times leaves no trace.
//
// 2. The colour is the site ramp. This page used to run a green/red good-bad
//    scale of its own, plus a per-pitch rainbow, in a build whose stated rule
//    is orange only and bright-means-good-for-the-hitter. Two colour languages
//    on one site means neither one gets learned.

const PITCH_NAMES = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', CU: 'Curveball',
  KC: 'K-Curve', CH: 'Changeup', FS: 'Splitter', KN: 'Knuckleball',
  ST: 'Sweeper', SV: 'Slurve', FA: 'Fastball', EP: 'Eephus', FO: 'Forkball',
  CS: 'Slow curve',
}

const GAME_STEPS = [5, 10, 15, 30]
const BBE_STEPS = [10, 15, 25, 40, 50]

export default function EVLog({ player, bbeRange: bbeRangeProp }) {
  const [mode, setMode] = useState('bbe')          // 'bbe' | 'games'
  const [games, setGames] = useState(10)
  const [bbeRange, setBbeRange] = useState(25)
  const [armFilter, setArmFilter] = useState('ALL')
  const [batterHand, setBatterHand] = useState('ALL')
  const [pitchFilter, setPitch] = useState('ALL')
  const [resFilter, setRes] = useState('ALL')

  const log = player?.batted_ball_log || player?.spray_chart || []

  const pitchTypes = useMemo(
    () => ['ALL', ...new Set(log.map((h) => h.pitch_type).filter((p) => p && p !== 'nan'))],
    [log],
  )
  const resultTypes = useMemo(
    () => ['ALL', ...new Set(log.map((h) => h.result || h.event).filter(Boolean))],
    [log],
  )
  const standVals = useMemo(
    () => new Set(log.map((h) => h.stand || h.batter_stand || h.batter_hand).filter(Boolean)),
    [log],
  )
  const allDates = useMemo(
    () => [...new Set(log.map((h) => h.date).filter(Boolean))].sort().reverse(),
    [log],
  )

  // The window. When PlayerModal drives the range it stays in BBE mode, since
  // that's the control it exposes.
  const windowed = useMemo(() => {
    const byDate = [...log].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    if (bbeRangeProp != null) return byDate.slice(0, bbeRangeProp)
    if (mode === 'games') {
      const keep = new Set(allDates.slice(0, games))
      return byDate.filter((h) => keep.has(h.date))
    }
    return byDate.slice(0, bbeRange)
  }, [log, mode, games, bbeRange, bbeRangeProp, allDates])

  const rows = useMemo(() => windowed.filter((h) => {
    if (armFilter !== 'ALL') {
      const arm = h.arm || h.pitcher_throws || h.p_throws || ''
      if (arm && arm !== armFilter) return false
    }
    if (batterHand !== 'ALL') {
      const stand = h.stand || h.batter_stand || h.batter_hand || ''
      if (stand && stand !== batterHand) return false
    }
    if (pitchFilter !== 'ALL' && h.pitch_type !== pitchFilter) return false
    if (resFilter !== 'ALL' && (h.result || h.event) !== resFilter) return false
    return true
  }).map((h, i) => ({
    _key: `${h.date}-${i}`,
    date: h.date || '—',
    pitcher: h.pitcher || '—',
    arm: h.arm || h.pitcher_throws || '—',
    pitch: PITCH_NAMES[h.pitch_type] || h.pitch_type || '—',
    ev: Number(h.ev) || null,
    la: h.launch_angle ?? h.la ?? null,
    dist: Number(h.distance) || null,
    velo: Number(h.pitch_velocity) || null,
    barrel: h.is_barrel ? 1 : 0,
    hard: h.is_hard_hit ? 1 : 0,
    hr: h.is_hr ? 1 : 0,
    result: String(h.result || h.event || '').replace(/_/g, ' '),
    traj: String(h.bb_type || h.trajectory || '').replace(/_/g, ' '),
  })), [windowed, armFilter, batterHand, pitchFilter, resFilter])

  if (!log.length) return <Empty text="No batted ball data. Run spray_cache.py." />

  const seg = (active) => ({
    padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
    background: active ? C.orange : 'transparent', color: active ? '#1a0d02' : C.text2,
    fontFamily: NUM_FONT,
  })
  const groupBox = {
    display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border2}`,
  }
  const selectStyle = {
    fontSize: 10, padding: '3px 7px', borderRadius: 6, border: `1px solid ${C.border2}`,
    background: C.bg3, color: C.text, cursor: 'pointer', fontFamily: NUM_FONT,
  }

  const batsLabel = player?.bats && player.bats !== '?' ? player.bats : null
  const gamesShown = new Set(windowed.map((h) => h.date)).size

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        {bbeRangeProp == null && (
          <>
            <div style={groupBox}>
              <button style={seg(mode === 'games')} onClick={() => setMode('games')}>Games</button>
              <button style={seg(mode === 'bbe')} onClick={() => setMode('bbe')}>Batted balls</button>
            </div>
            <div style={groupBox}>
              {(mode === 'games' ? GAME_STEPS : BBE_STEPS).map((v) => (
                <button
                  key={v}
                  style={seg(mode === 'games' ? games === v : bbeRange === v)}
                  onClick={() => (mode === 'games' ? setGames(v) : setBbeRange(v))}
                >{mode === 'games' ? `${v}G` : `${v}BBE`}</button>
              ))}
            </div>
          </>
        )}

        <div style={groupBox}>
          {['ALL', 'R', 'L'].map((v) => (
            <button key={v} style={seg(armFilter === v)} onClick={() => setArmFilter(v)}>
              {v === 'ALL' ? 'All arm' : v === 'R' ? 'RHP' : 'LHP'}
            </button>
          ))}
        </div>

        <div style={groupBox}>
          {['ALL', 'R', 'L'].map((v) => (
            <button key={v} style={seg(batterHand === v)} onClick={() => setBatterHand(v)}>
              {v === 'ALL' ? 'All bat' : v === 'R' ? 'RHB' : 'LHB'}{batsLabel && v === batsLabel ? ' ★' : ''}
            </button>
          ))}
        </div>

        <select value={pitchFilter} onChange={(e) => setPitch(e.target.value)} style={selectStyle}>
          {pitchTypes.map((p) => <option key={p} value={p}>{p === 'ALL' ? 'All pitches' : (PITCH_NAMES[p] || p)}</option>)}
        </select>
        <select value={resFilter} onChange={(e) => setRes(e.target.value)} style={selectStyle}>
          {resultTypes.map((r) => <option key={r} value={r}>{r === 'ALL' ? 'All results' : r.replace(/_/g, ' ')}</option>)}
        </select>

        <span style={{ fontSize: 10, color: C.text3, marginLeft: 'auto', fontFamily: NUM_FONT }}>
          {rows.length} of {windowed.length} shown
        </span>
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        {windowed.length} batted balls across {gamesShown} date{gamesShown === 1 ? '' : 's'} ·{' '}
        {log.length} tracked in total.
        {' '}<span style={{ color: C.text2 }}>Not plate appearances.</span> This payload only records
        balls put in play, so walks and strikeouts are invisible here and no rate on this page has a
        true PA denominator.
      </div>

      {standVals.size === 0 && batterHand !== 'ALL' && (
        <div style={{ fontSize: 10, color: C.orange, marginBottom: 6, fontFamily: NUM_FONT }}>
          The batter-hand field isn&apos;t written on these rows, so this filter can&apos;t do anything
          until spray_cache.py re-runs. Showing everything.
        </div>
      )}

      <DenseTable
        rows={rows}
        columns={[
          { key: 'date',    label: 'Date',    heat: false, w: 84, mono: true, sticky: true },
          { key: 'pitcher', label: 'Pitcher', heat: false, w: 130 },
          { key: 'arm',     label: 'Arm',     heat: false, w: 34, mono: true, dim: true },
          { key: 'pitch',   label: 'Pitch',   heat: false, w: 84, dim: true },
          { key: 'ev',      label: 'EV',      w: 48, dp: 1 },
          { key: 'la',      label: 'Angle',   w: 48, dp: 0,
            title: 'Launch angle. Not ramped on its own — high is not good on its own, 70° is a popup.' },
          { key: 'dist',    label: 'Dist',    w: 48, dp: 0 },
          { key: 'velo',    label: 'Velo',    w: 48, dp: 1, invert: true,
            title: 'Pitch velocity. Inverted: a ball crushed off a slower pitch is the less impressive one.' },
          { key: 'barrel',  label: 'BRL',     flag: true, mark: '●', w: 32 },
          { key: 'hard',    label: 'HH',      flag: true, mark: '●', w: 32 },
          { key: 'hr',      label: 'HR',      flag: true, mark: '★', w: 32 },
          { key: 'result',  label: 'Result',  heat: false, w: 116, dim: true },
          { key: 'traj',    label: 'Traj',    heat: false, w: 84, dim: true },
        ]}
        initialSort={null}
        maxHeight={460}
        caption="Every column is shaded against its own range within this window, so changing the window changes the shading — that's the point, it shows what's hot relative to what you asked for. Angle is shaded like any other column but read it carefully: high launch angle is a popup, not a good outcome. BRL / HH / HR are the bot's own flags."
      />
    </div>
  )
}
