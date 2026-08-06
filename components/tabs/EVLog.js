'use client'
import { useEffect, useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { Empty } from '../ui'
import { clean } from '../../lib/player'
import DenseTable from '../DenseTable'
import ZoneMap from '../ZoneMap'

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

// Widened 2026-08-06 ("pull as much as we can"): both window ladders now run
// to everything the bot published — the log's ceiling is the spray cache's
// lookback, so the All stop shows every tracked ball we actually have.
const GAME_STEPS = [5, 10, 15, 25, 40]
const BBE_STEPS = [15, 25, 50, 100, 9999]
const bbeLabel = (v) => (v >= 9999 ? 'All' : `${v}BBE`)

export default function EVLog({ player, bbeRange: bbeRangeProp }) {
  const [mode, setMode] = useState('bbe')          // 'bbe' | 'games'
  const [games, setGames] = useState(10)
  const [bbeRange, setBbeRange] = useState(25)
  // The arm filter opens on TONIGHT'S arm, not ALL — same logic as the pitch
  // mix auto-select: the question this log opens with is "how has he handled
  // what he'll see tonight". One click back to All widens it.
  const tonightArm = String(player?.pitcher_throws || '').toUpperCase().slice(0, 1)
  const [armFilter, setArmFilter] = useState(tonightArm === 'L' || tonightArm === 'R' ? tonightArm : 'ALL')
  useEffect(() => {
    const a = String(player?.pitcher_throws || '').toUpperCase().slice(0, 1)
    setArmFilter(a === 'L' || a === 'R' ? a : 'ALL')
  }, [player])
  const [batterHand, setBatterHand] = useState('ALL')
  // Pitch selection defaults to tonight's starter's arsenal, matched to the
  // side this hitter bats from — the same behaviour the Spray tab has. The
  // question you open this log with is "how has he handled what he'll see
  // tonight", and a flat ALL buries that under every pitch he's faced all year.
  const [pitchSel, setPitchSel] = useState(null)   // null = all
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

  // Tonight's mix, from the side-split string the bot publishes on every slate
  // row (pitcher_primary_mix_vs_lhb / _vs_rhb, 267/267). Intersected with the
  // pitches he actually has batted balls against, so selecting the mix can
  // never filter the table to nothing.
  const tonightMix = useMemo(() => {
    const side = String(player?.bats || '').toUpperCase().slice(0, 1) === 'L' ? 'lhb' : 'rhb'
    const raw = player?.[`pitcher_primary_mix_vs_${side}`] || player?.pitcher_primary_mix || ''
    const codes = new Set()
    String(raw).split('|').forEach((part) => {
      const m = part.trim().match(/^([A-Z]{2,3})\s+[\d.]+\s*%?$/)
      if (m) codes.add(m[1])
    })
    Object.keys(player?.pitcher_pitch_usage_pct || {}).forEach((k) => codes.add(k))
    const seen = new Set(log.map((h) => h.pitch_type).filter(Boolean))
    return [...codes].filter((c) => seen.has(c))
  }, [player, log])

  useEffect(() => {
    if (pitchSel === null && tonightMix.length) setPitchSel(new Set(tonightMix))
  }, [tonightMix, pitchSel])
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
    if (pitchSel && pitchSel.size && !pitchSel.has(h.pitch_type)) return false
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
  })), [windowed, armFilter, batterHand, pitchSel, resFilter])

  const pid = player?.player_id || player?.id

  // The zone map is live API, so it renders even when the spray payload is
  // empty — the log needs the bot, the plate map doesn't.
  if (!log.length) {
    return (
      <div>
        <ZoneMap playerId={pid} bats={String(player?.bats || '').toUpperCase().slice(0, 1)} />
        <Empty text="No batted ball data. Run spray_cache.py." />
      </div>
    )
  }

  // Restyled 2026-08-05 — the old flat grey squares read as leftover
  // Streamlit chrome next to the rest of the site. Same behaviour, the
  // site's pill language: rounded, tinted active with a soft glow.
  const seg = (active) => ({
    padding: '4px 11px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
    background: active ? 'linear-gradient(135deg, #f97316, #ea6a0a)' : 'transparent',
    color: active ? '#1a0d02' : C.text2,
    fontFamily: NUM_FONT, borderRadius: 999,
    boxShadow: active ? '0 0 10px rgba(249,115,22,.35)' : 'none',
    transition: 'background .12s',
  })
  const groupBox = {
    display: 'flex', gap: 2, borderRadius: 999, padding: 2,
    border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.025)',
  }
  // Controls grouped and labelled. The row was eleven undifferentiated buttons
  // and two selects with no indication which belonged together — you had to
  // click one to find out what it did.
  const cluster = { display: 'flex', alignItems: 'center', gap: 5 }
  const clusterLbl = {
    fontSize: 8, color: C.text3, textTransform: 'uppercase',
    letterSpacing: '.09em', fontWeight: 800, whiteSpace: 'nowrap',
  }
  const selectStyle = {
    fontSize: 10, padding: '3px 7px', borderRadius: 6, border: `1px solid ${C.border2}`,
    background: C.bg3, color: C.text, cursor: 'pointer', fontFamily: NUM_FONT,
  }

  const batsLabel = player?.bats && player.bats !== '?' ? player.bats : null
  const gamesShown = new Set(windowed.map((h) => h.date)).size

  return (
    <div>
      <ZoneMap playerId={pid} bats={String(player?.bats || '').toUpperCase().slice(0, 1)} />
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
      }}>
        {bbeRangeProp == null && (
          <div style={cluster}>
            <span style={clusterLbl}>Window</span>
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
                >{mode === 'games' ? `${v}G` : bbeLabel(v)}</button>
              ))}
            </div>
          </div>
        )}

        <div style={cluster}>
          <span style={clusterLbl}>Arm</span>
          <div style={groupBox}>
            {['ALL', 'R', 'L'].map((v) => (
              <button key={v} style={seg(armFilter === v)} onClick={() => setArmFilter(v)}
                title={v === tonightArm ? "Tonight's starter throws from this side — the log opens here" : undefined}>
                {v === 'ALL' ? 'All' : v === 'R' ? 'RHP' : 'LHP'}{v === tonightArm ? ' ⌖' : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={cluster}>
          <span style={clusterLbl}>Bats</span>
          <div style={groupBox}>
            {['ALL', 'R', 'L'].map((v) => (
              <button key={v} style={seg(batterHand === v)} onClick={() => setBatterHand(v)}>
                {v === 'ALL' ? 'All' : v === 'R' ? 'RHB' : 'LHB'}{batsLabel && v === batsLabel ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={groupBox}>
          <button style={seg(!pitchSel)} onClick={() => setPitchSel(null)}>All pitches</button>
          {tonightMix.length > 0 && (
            <button
              style={seg(!!pitchSel && pitchSel.size === tonightMix.length && tonightMix.every((c) => pitchSel.has(c)))}
              onClick={() => setPitchSel(new Set(tonightMix))}
              title={`${clean(player?.pitcher_name, "Tonight's starter")}'s mix vs ${String(player?.bats || '?').toUpperCase()}HB`}
            >⌖ Tonight&apos;s mix</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {pitchTypes.filter((p) => p !== 'ALL').map((p) => {
            const on = !!pitchSel && pitchSel.has(p)
            const inMix = tonightMix.includes(p)
            return (
              <button key={p}
                onClick={() => setPitchSel((s) => {
                  const next = new Set(s || pitchTypes.filter((x) => x !== 'ALL'))
                  if (next.has(p)) next.delete(p); else next.add(p)
                  return next.size ? next : null
                })}
                title={`${PITCH_NAMES[p] || p}${inMix ? " — in tonight's mix" : " — not in tonight's mix"}`}
                style={{
                  padding: '3px 7px', fontSize: 9.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
                  fontFamily: NUM_FONT,
                  border: `1px solid ${on ? C.orange : C.border}`,
                  background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                  color: on ? C.orange : C.text3,
                }}>
                {inMix && <span style={{ color: C.orange, marginRight: 2 }}>•</span>}{p}
              </button>
            )
          })}
        </div>
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
