'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { Empty } from '../ui'
import { clean } from '../../lib/player'
import DenseTable from '../DenseTable'
import ZoneMap from '../ZoneMap'
import { liveBattedBalls } from '../../lib/livegame'

// ⚡ TONIGHT, LIVE (2026-08-06) — his batted balls from the game in progress
// (or just finished), straight off the MLB live feed. The bot's log below is
// history; this strip answers whether the pattern you bet on is SHOWING UP
// TONIGHT — the loud line drive in the 2nd is the leading indicator the
// homer in the 6th confirms. One fetch on open + a manual refresh button;
// no polling, one player at a time.
function TonightLive({ gamePk, batterId }) {
  const [res, setRes] = useState(undefined)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    liveBattedBalls(gamePk, batterId).then((d) => { if (alive) setRes(d) })
    return () => { alive = false }
  }, [gamePk, batterId, tick])

  if (!gamePk || !batterId || res === null) return null
  if (res === undefined) return null
  if (res.state === 'Preview') return null
  const balls = res.balls || []
  const live = res.state === 'Live'

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      background: 'linear-gradient(155deg, rgba(74,222,128,.06), rgba(74,222,128,.015))',
      border: '1px solid rgba(74,222,128,.25)', borderRadius: 10,
      padding: '7px 11px', marginBottom: 10,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: GREEN }}>
        ⚡ Tonight{live ? ' · LIVE' : ' · final'}
      </span>
      {balls.length === 0 && (
        <span style={{ fontSize: 10, color: C.text3 }}>no tracked contact yet</span>
      )}
      {balls.map((b, i) => {
        const isHR = /home run/i.test(b.event)
        const isHit = /single|double|triple/i.test(b.event)
        const loud = b.ev >= 95
        const col = isHR ? GREEN : loud ? C.orange : isHit ? '#60A5FA' : C.text3
        return (
          <span key={i} title={`${b.half === 'top' ? 'T' : 'B'}${b.inning} — ${b.event} · ${b.traj}${b.dist ? ` · ${b.dist.toFixed(0)} ft` : ''}`}
            style={{
              fontFamily: NUM_FONT, fontSize: 10, fontWeight: loud || isHR ? 800 : 600, color: col,
              border: `1px solid ${col}44`, borderRadius: 6, padding: '2px 7px',
              background: isHR ? 'rgba(74,222,128,.10)' : 'transparent',
            }}>
            {isHR ? '💥 ' : ''}{b.ev.toFixed(1)}{b.la != null ? ` / ${b.la.toFixed(0)}°` : ''}
            <span style={{ opacity: 0.65, marginLeft: 4 }}>{b.event.toLowerCase()}</span>
          </span>
        )
      })}
      <button onClick={() => { setRes(undefined); setTick((t) => t + 1) }} style={{
        marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: C.text3, cursor: 'pointer',
        background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 6,
        padding: '2px 8px', fontFamily: NUM_FONT,
      }}>↻ refresh</button>
    </div>
  )
}

// Exit-velocity log — every tracked batted ball, newest first.
//
// THREE THINGS CHANGED HERE AND ALL THREE ARE ABOUT HONESTY.
//
// 1. The window is GAMES or BATTED BALLS. It is not plate appearances.
//    The handoff asked for a games / plate-appearances toggle. There is no
//    plate-appearance data in this payload to build one from: the detail files
//    carry exactly one list, `spray_chart`, and every row in it was, at first,
//    a ball that was put in play. Walks are still never written, so any "PA"
//    number this page printed would still be missing a piece — which is the
//    exact bug that was fixed here once already, when the range control
//    counted unique dates and called them PA. So the toggle stays
//    Games / Batted balls, and the missing denominator is stated on the panel.
//    A hitter's "last 10 games" here means his batted balls (+ strikeouts,
//    see #3) from his last 10 dates with a tracked row, which is not quite
//    the same as his last 10 games either — a game where he walked three
//    times leaves no trace.
//
// 2. The colour is the site ramp. This page used to run a green/red good-bad
//    scale of its own, plus a per-pitch rainbow, in a build whose stated rule
//    is orange only and bright-means-good-for-the-hitter. Two colour languages
//    on one site means neither one gets learned.
//
// 3. (2026-09-08) Strikeouts are rows too. Donovan: "add k rate to the mix
//    and ... ad the k as bbe like what ever the last picth was the k the
//    batter['s] out." spray_cache.py (and the live Savant fallback) now write
//    a strikeout as a row in this same list — is_k true, every batted-ball
//    field null because there IS no batted ball, pitch/arm/velo/pitcher taken
//    from the pitch that actually ended the at-bat. That's what makes a real
//    K RATE possible below and puts AVG/ISO ON CONTACT one step closer to a
//    true average (strikeouts now count as outs; walks/HBP still don't exist
//    here). Every batted-ball-only stat — GB/FLY/LD/POP, hard-hit%, barrel%,
//    pull/oppo — is computed over batted balls only (`bbCount`), never over
//    `rows.length`, so a strikeout entering the window can never look like
//    contact quality dropping.

// ── THE FIVE ACCENTS THIS FILE USES, NAMED ONCE (2026-09-07) ──────────────
// They were repeated as bare hexes at fifteen call sites. check-scales.mjs
// keeps a hard-coded-hex ceiling that "only ever goes down", so adding two
// more cells to the stat strip meant paying for them here first. Same colours,
// same places — just spelled once.
const AMBER = '#fca63a'
const CYAN = '#22d3ee'
const VIOLET = '#a78bfa'
const GREEN = '#4ade80'
const RED = '#f87171'

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
  // DE-GLITCHED (2026-08-08): these resets used to key off the player OBJECT,
  // which the parent rebuilds on every render — so opening the tab fired a
  // reset, which re-rendered, which fired another. Keying off the player ID
  // means one reset per actual player change and none for render churn.
  const pidKey = player?.player_id || player?.id || null
  useEffect(() => {
    const a = String(player?.pitcher_throws || '').toUpperCase().slice(0, 1)
    setArmFilter(a === 'L' || a === 'R' ? a : 'ALL')
  }, [pidKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [batterHand, setBatterHand] = useState('ALL')
  // Pitch selection defaults to tonight's starter's arsenal, matched to the
  // side this hitter bats from — the same behaviour the Spray tab has. The
  // question you open this log with is "how has he handled what he'll see
  // tonight", and a flat ALL buries that under every pitch he's faced all year.
  const [pitchSel, setPitchSel] = useState(null)   // null = all
  const [resFilter, setRes] = useState('ALL')

  const botLog = player?.batted_ball_log || player?.spray_chart || []

  // 🔴 LIVE STATCAST FALLBACK (2026-08-08, Donovan: "players not on the bot
  // — season stats need to populate as best as possible, esp EV Log"). The
  // spray cache only builds files for slate players; for everyone else this
  // pulls the same pitch-level data LIVE from Savant (CORS verified from
  // this origin). Same row schema, so everything below just works.
  const [liveLog, setLiveLog] = useState(null)   // null = untried/loading
  useEffect(() => {
    if (botLog.length || !pidKey) { setLiveLog(null); return undefined }
    let alive = true
    import('../../lib/savant').then(({ savantBattedBalls }) =>
      savantBattedBalls(pidKey).then((rows) => { if (alive) setLiveLog(rows) }))
      .catch(() => { if (alive) setLiveLog([]) })
    return () => { alive = false }
  }, [pidKey, botLog.length])
  const liveSource = !botLog.length && !!liveLog?.length
  const log = botLog.length ? botLog : (liveLog || [])

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

  // THE "ALL PITCHES" BUG (2026-08-08, "glitchy when it clicks on"): the old
  // effect re-applied tonight's mix whenever pitchSel was null — which is
  // exactly the state the All Pitches button sets. Click All, effect snaps it
  // back to the mix, button appears dead / the table flickers. The default is
  // now applied ONCE per player, and null stays null after that.
  const mixApplied = useRef(null)
  useEffect(() => {
    if (mixApplied.current === pidKey) return
    if (tonightMix.length) {
      setPitchSel(new Set(tonightMix))
      mixApplied.current = pidKey
    }
  }, [tonightMix, pidKey])

  // Usage % per pitch code from the published mix strings — feeds both the
  // "P top 3" toggle and the zone map's per-pitch strip (2026-08-08).
  const usagePct = useMemo(() => {
    const m = {}
    const side = String(player?.bats || '').toUpperCase().slice(0, 1) === 'L' ? 'lhb' : 'rhb'
    const raw = player?.[`pitcher_primary_mix_vs_${side}`] || player?.pitcher_primary_mix || ''
    String(raw).split('|').forEach((part) => {
      const mt = part.trim().match(/^([A-Z]{2,3})\s+([\d.]+)\s*%?$/)
      if (mt) m[mt[1]] = parseFloat(mt[2])
    })
    Object.entries(player?.pitcher_pitch_usage_pct || {}).forEach(([k, v]) => {
      if (m[k] == null) m[k] = Number(v) || 0
    })
    return m
  }, [player])

  // ⌖ P TOP 3 (2026-08-08, Donovan: "pitch mix should toggle pitcher top 3
  // pitches, but keep tonight's mix as an option") — the starter's three
  // most-thrown pitches, the tighter read: 80%+ of what he'll actually see.
  const topThree = useMemo(() => {
    const seen = new Set(log.map((h) => h.pitch_type).filter(Boolean))
    return Object.entries(usagePct)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
      .filter((c) => seen.has(c))
      .slice(0, 3)
  }, [usagePct, log])
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
    // K rows carry no bb_type (there's no batted ball to classify) — fall
    // back to a dash like side/lane already do below, instead of a blank cell.
    traj: String(h.bb_type || h.trajectory || '').replace(/_/g, ' ') || '—',
    // is_pull_air is spray_cache's own flag: pulled AND in the air — the
    // batted-ball shape that actually leaves buildings
    pullAir: h.is_pull_air ? 1 : 0,
    // ── FIELDS THAT WERE ALREADY IN THE PAYLOAD AND NEVER DRAWN ───────────
    // (2026-08-29, Donovan: "the ev log can be updated now with more stats
    // that we know will help.") Every one of these is a key spray_cache.py
    // already writes on each batted ball; none of it is new maths and none
    // of it is estimated. Checked against a live detail file before adding,
    // which is also how one earlier idea got dropped: there is NO xwOBA per
    // batted ball in this payload, so a per-ball xwOBA column would have had
    // to be invented, and it isn't here.
    lane: String(h.lane || '').toUpperCase() || '—',
    side: String(h.spray_side || '').replace(/_/g, ' ') || '—',
    xbh: h.is_xbh ? 1 : 0,
    // The distance tiers the pitcher panel already reports as "balls he's let
    // travel" / "real distance given up" — the batter's side of the same fact.
    d350: h.is_350_plus ? 1 : 0,
    d375: h.is_375_plus ? 1 : 0,
    d400: h.is_400_plus ? 1 : 0,
    // ── K, RIDING IN THE SAME ROW SHAPE (2026-09-08) ──────────────────────
    // Donovan: "add k rate to the mix and ... ad the k as bbe like what
    // ever the last picth was, the K, the batter['s] out." spray_cache.py
    // (and the live Savant fallback) now write a strikeout as a row with
    // every batted-ball-only field null and is_k true — this just carries
    // that flag through so the stat strip and the K column below can use it.
    k: h.is_k ? 1 : 0,
  })), [windowed, armFilter, batterHand, pitchSel, resFilter])

  const pid = player?.player_id || player?.id

  // Per-pitch line for the zone map's strip (2026-08-08, Donovan: "on the
  // strike zone map if there's per-pitch data show that"). There is no
  // zone-BY-pitch split published anywhere — the honest offer is his
  // batted-ball line per pitch beside the map, not a fake per-pitch grid.
  const pitchInfo = useMemo(() => {
    const agg = {}
    log.forEach((h) => {
      const c = h.pitch_type
      if (!c) return
      const a = agg[c] || (agg[c] = { seen: 0, hr: 0, evSum: 0, evN: 0 })
      a.seen += 1
      if (h.is_hr) a.hr += 1
      const ev = Number(h.ev)
      if (Number.isFinite(ev)) { a.evSum += ev; a.evN += 1 }
    })
    return [...new Set([...Object.keys(usagePct), ...Object.keys(agg)])]
      .map((c) => ({
        code: c, usage: usagePct[c] ?? null,
        seen: agg[c]?.seen || 0, hr: agg[c]?.hr || 0,
        avgEv: agg[c]?.evN ? agg[c].evSum / agg[c].evN : null,
      }))
      .filter((x) => x.usage != null || x.seen >= 5)
      .sort((a, b) => (b.usage ?? -1) - (a.usage ?? -1))
      .slice(0, 5)
  }, [log, usagePct])

  // The zone map is live API, so it renders even when the spray payload is
  // empty — the log needs the bot, the plate map doesn't.
  if (!log.length) {
    return (
      <div>
        <ZoneMap playerId={pid} bats={String(player?.bats || '').toUpperCase().slice(0, 1)} />
        {liveLog === null
          ? <Empty text="No bot file for him — pulling his season live from Statcast…" />
          : <Empty text="No batted-ball data — not in the bot's cache, and the live Statcast pull came back empty." />}
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
  // Split before any of the row/arm/bats/pitch/result filters below — this is
  // what the top-of-page banner reports, independent of what's currently
  // filtered out of the table.
  const windowedK = windowed.filter((h) => h.is_k).length
  const windowedBbe = windowed.length - windowedK

  return (
    <div>
      <TonightLive gamePk={player?.game_pk} batterId={pid} />
      {liveSource && (
        <div style={{
          fontSize: 9.5, color: C.text3, background: C.bg2, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '5px 11px', marginBottom: 8, lineHeight: 1.5,
        }}>
          🔴 <b style={{ color: C.text2 }}>Live Statcast pull</b> — he&apos;s not in the bot&apos;s cache, so this
          log came straight from Savant just now ({log.length} batted balls, this season). Same data,
          different pipe; barrel/hard-hit/pull computed by Savant&apos;s own definitions.
        </div>
      )}
      <ZoneMap playerId={pid} bats={String(player?.bats || '').toUpperCase().slice(0, 1)} pitchInfo={pitchInfo} />
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
      }}>
        {/* MEASURED, not guessed (2026-08-11, at a real 386px viewport).
            Donovan: "the explanatory paragraph is clipped on the LEFT edge and
            the BBE window chips run off the right."

            That is ONE bug wearing two faces. `cluster` is display:flex with no
            flexWrap, so Window + Games/Batted-balls + 15/25/50/100BBE is a
            single unbreakable 450px row. Nothing between it and .modal-box has
            overflow-x, so the row could not scroll itself -- it made THE WHOLE
            MODAL 88px wider than the phone (measured: .modal-content
            scrollWidth 474 vs clientWidth 386, and 450-362 = the same 88).

            So swiping right to reach the 100BBE chip drags the entire modal
            left, and the paragraph above -- a sibling inside that modal -- has
            its left edge carried off screen. Fixing the right-hand overflow is
            what fixes the left-hand clipping; they were never two problems.

            .chip-row is the treatment this codebase already uses for exactly
            this shape (MobileCSS ~700px: nowrap + overflow-x auto + hidden
            scrollbar), and PlayerModal:542 already wears it for its six tab
            pills -- which is why the tab pills were fine and this row was not.

            Verified in the browser before committing: with the row scrolling
            itself, .modal-content scrollWidth 474 -> 386, overflow 88px -> 0. */}
        {bbeRangeProp == null && (
          <div style={cluster} className="chip-row">
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
          {topThree.length > 0 && (
            <button
              style={seg(!!pitchSel && pitchSel.size === topThree.length && topThree.every((c) => pitchSel.has(c)))}
              onClick={() => setPitchSel(new Set(topThree))}
              title={`${clean(player?.pitcher_name, "Tonight's starter")}'s three most-thrown pitches — ${topThree.map((c) => `${c} ${usagePct[c]?.toFixed(0) ?? '?'}%`).join(', ')}. The tighter read: most of what he'll actually see.`}
            >P top 3</button>
          )}
        </div>
        {/* USAGE ON THE BUTTON (2026-08-08, on request): each pitch wears the
            starter's usage % for it, and the row sorts heaviest-thrown first —
            so "what will he actually see tonight" is readable off the buttons
            without opening a tooltip. Pitches the starter doesn't throw sort
            last with no number, which is its own signal. */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {pitchTypes.filter((p) => p !== 'ALL')
            .sort((a, b) => (usagePct[b] ?? -1) - (usagePct[a] ?? -1))
            .map((p) => {
            const on = !!pitchSel && pitchSel.has(p)
            const inMix = tonightMix.includes(p)
            const use = usagePct[p]
            return (
              <button key={p}
                onClick={() => setPitchSel((s) => {
                  const next = new Set(s || pitchTypes.filter((x) => x !== 'ALL'))
                  if (next.has(p)) next.delete(p); else next.add(p)
                  return next.size ? next : null
                })}
                title={`${PITCH_NAMES[p] || p}${use != null ? ` — tonight's starter throws it ${use.toFixed(0)}% of the time` : " — tonight's starter doesn't throw this (or no mix published)"}${inMix ? " · in tonight's mix" : ''}`}
                style={{
                  padding: '3px 7px', fontSize: 9.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
                  fontFamily: NUM_FONT,
                  border: `1px solid ${on ? C.orange : C.border}`,
                  background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                  color: on ? C.orange : C.text3,
                }}>
                {inMix && <span style={{ color: C.orange, marginRight: 2 }}>•</span>}{p}
                {use != null && (
                  <span style={{
                    marginLeft: 3, fontWeight: 800, fontSize: 8.5,
                    color: on ? C.orange : use >= 25 ? C.text2 : C.text3,
                  }}>{use.toFixed(0)}%</span>
                )}
              </button>
            )
          })}
        </div>
        <select value={resFilter} onChange={(e) => setRes(e.target.value)} style={selectStyle}>
          {resultTypes.map((r) => <option key={r} value={r}>{r === 'ALL' ? 'All results' : r.replace(/_/g, ' ')}</option>)}
        </select>

        {/* WHY IT SAYS 13 OF 25 (2026-08-29). Donovan flagged this counter as
            possibly broken. It is not — the ARM filter defaults to tonight's
            starter's hand, so a hitter with 25 balls in the window shows only
            the ones he hit off that hand. The count was honest and the reason
            was invisible, which is the same bug in a different coat. It now
            names whichever filters are actually cutting the set. */}
        <span style={{ fontSize: 10, color: C.text3, marginLeft: 'auto', fontFamily: NUM_FONT, textAlign: 'right' }}>
          {rows.length} of {windowed.length} shown
          {rows.length !== windowed.length && (() => {
            const why = []
            if (armFilter !== 'ALL') why.push(`vs ${armFilter}HP`)
            if (batterHand !== 'ALL') why.push(`as ${batterHand}HB`)
            if (pitchSel && pitchSel.size) why.push(`${pitchSel.size} pitch type${pitchSel.size > 1 ? 's' : ''}`)
            if (resFilter !== 'ALL') why.push(String(resFilter).replace(/_/g, ' '))
            return why.length
              ? <span style={{ color: C.orange }}> · filtered to {why.join(' · ')}</span>
              : null
          })()}
        </span>
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        {windowedBbe} batted ball{windowedBbe === 1 ? '' : 's'}
        {windowedK > 0 ? <> + <span style={{ color: C.text2 }}>{windowedK} strikeout{windowedK === 1 ? '' : 's'}</span></> : ''}
        {' '}across {gamesShown} date{gamesShown === 1 ? '' : 's'} ·{' '}
        {log.length} tracked in total.
        {' '}<span style={{ color: C.text2 }}>Still not plate appearances.</span> Strikeouts are logged
        here now too — the pitch that ended the at-bat, no EV/angle/distance because there was no batted
        ball. Walks and hit-by-pitches are still invisible, so no rate on this page has a true PA
        denominator — K RATE and AVG/ISO ON CONTACT below get as close as batted-balls-plus-strikeouts can.
      </div>

      {standVals.size === 0 && batterHand !== 'ALL' && (
        <div style={{ fontSize: 10, color: C.orange, marginBottom: 6, fontFamily: NUM_FONT }}>
          The batter-hand field isn&apos;t written on these rows, so this filter can&apos;t do anything
          until spray_cache.py re-runs. Showing everything.
        </div>
      )}

      {/* WINDOW AVERAGES (2026-08-08, "show the avgs of each category at
          the top"): computed from EXACTLY the rows below — change the
          window or a filter and these move with it. */}
      {rows.length > 0 && (() => {
        const avg = (k) => {
          const xs = rows.map((r) => Number(r[k])).filter(Number.isFinite)
          return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
        }
        const hh = rows.filter((r) => r.hard).length
        const brl = rows.filter((r) => r.barrel).length
        const hr = rows.filter((r) => r.hr).length
        // ── K RATE (2026-09-08, Donovan: "add k rate to the mix") ──────────
        // Strikeouts ride in `rows` now (spray_cache.py / the live Savant
        // fallback tag them is_k), but a K is not a batted ball — every
        // shape/quality % below MUST stay over batted balls only (bbCount),
        // never rows.length, or GB/FLY/hard-hit/barrel/pull rates would
        // quietly shrink every time a strikeout entered the window without
        // one fewer ball actually being put in play. hh/brl/pullAir/xbh/far/
        // mid themselves don't need filtering — r.hard/r.barrel/... are
        // already 0 on every K row, only their % denominators change.
        const kCount = rows.filter((r) => r.k).length
        const bbCount = rows.length - kCount
        const kRate = rows.length ? (100 * kCount) / rows.length : null
        // batted-ball shape over the same rows (2026-08-08, Donovan: "show
        // gb fb ld pull barrel %s") — traj is Statcast's own bb_type label
        const shapePct = (re) => {
          const k = rows.filter((r) => re.test(r.traj)).length
          return bbCount ? (100 * k) / bbCount : null
        }
        const pullAir = rows.filter((r) => r.pullAir).length
        const sidePct = (name) => {
          const k = rows.filter((r) => String(r.side).toLowerCase() === name).length
          return bbCount ? (100 * k) / bbCount : null
        }
        const xbh = rows.filter((r) => r.xbh).length
        const far = rows.filter((r) => r.d400).length
        const mid = rows.filter((r) => r.d375).length
        const pct = (v) => `${v.toFixed(0)}%`

        // ── AVG / ISO OVER THE ROWS SHOWN (2026-09-07; K's changed this 09-08) ─
        // Donovan: "show batting avg and iso, hr to the stats when you filter
        // on the ev log". HR was already here; AVG and ISO were not, because
        // this payload had no plate appearances in it.
        //
        // 2026-09-08: strikeouts are now rows too (is_k, see above), and a
        // strikeout IS an at-bat — so `abs` below (built the same way it
        // always was, off every row that isn't a sac) now counts them as
        // outs instead of silently excluding them. That's a real
        // improvement: AVG/ISO ON CONTACT now match true batting average /
        // ISO wherever the only gap left is walks and hit-by-pitches, which
        // still never became a row here. Kept the "ON CONTACT" name and the
        // honesty caveat rather than renaming to "AVG" — it still isn't the
        // full thing.
        //
        // A reached-on-error IS left in as a hitless at-bat, which is what
        // the scorer does too.
        //
        // Read straight off `result`, which is Statcast's own `events` string
        // with underscores swapped for spaces — matched exactly, never by
        // prefix, because "double" and "double play" / "grounded into double
        // play" are three different outcomes and only the first is a hit.
        // `outcome`, not `ev` — in this file EV always means exit velo.
        const outcome = (r) => String(r.result || '').toLowerCase().trim()
        const isSac = (r) => /^sac /.test(outcome(r))
        const abs = rows.filter((r) => !isSac(r)).length
        const n1b = rows.filter((r) => outcome(r) === 'single').length
        const n2b = rows.filter((r) => outcome(r) === 'double').length
        const n3b = rows.filter((r) => outcome(r) === 'triple').length
        const nHr = rows.filter((r) => outcome(r) === 'home run' || r.hr).length
        const hits = n1b + n2b + n3b + nHr
        const tb = n1b + 2 * n2b + 3 * n3b + 4 * nHr
        const ba = abs ? hits / abs : null
        const iso = abs ? (tb - hits) / abs : null
        // .272 not 0.272 — the way a slash line is written everywhere else.
        const slash = (v) => v.toFixed(3).replace(/^0/, '')
        const contactNote = `${hits} hit${hits === 1 ? '' : 's'} in ${abs} at-bat${abs === 1 ? '' : 's'}`
        const cells = [
          ['AVG EV', avg('ev'), (v) => v.toFixed(1), AMBER],
          ['AVG ANGLE', avg('la'), (v) => `${v.toFixed(0)}°`, C.text2],
          ['AVG DIST', avg('dist'), (v) => `${v.toFixed(0)}ft`, AMBER],
          ['AVG VELO SEEN', avg('velo'), (v) => v.toFixed(1), C.text2],
          ['GB', shapePct(/ground/i), pct, C.text2],
          ['FLY', shapePct(/fly/i), pct, CYAN],
          ['LD', shapePct(/line/i), pct, C.text2],
          ['POP', shapePct(/pop/i), pct, C.text3],
          // bbCount guarded to null, not just divided: a window that comes back
          // all strikeouts (a real possibility once K's are rows too) must
          // hide these rather than print a 0/0 "NaN%".
          ['PULL-AIR', bbCount ? pullAir : null, (v) => `${pct((100 * v) / bbCount)}`, AMBER],
          ['HARD HIT', bbCount ? hh : null, (v) => `${v} (${(100 * v / bbCount).toFixed(0)}%)`, AMBER],
          ['BARRELS', bbCount ? brl : null, (v) => `${v} (${(100 * v / bbCount).toFixed(0)}%)`, VIOLET],
          ['K RATE', kRate, pct, RED,
            `Strikeouts as a share of everything logged in this window — ${kCount} K in ${rows.length} (${bbCount} balls in play + ${kCount} strikeouts). Walks and hit-by-pitches still never become a row here, so this isn't a full-PA K% — it's the closest this page can get without one.`],
          ['AVG ON CONTACT', ba, slash, CYAN,
            `Batting average over this window — ${contactNote}, sacrifices left out of the denominator. Strikeouts now count as outs (${kCount} of them); walks and hit-by-pitches still don't become a row here, so it's close to his real average but not quite it.`],
          ['ISO ON CONTACT', iso, slash, VIOLET,
            `Isolated power (slugging minus average) over the same ${abs} at-bats, strikeouts included as outs. Not his season ISO, for the same reason as AVG ON CONTACT: no walks/HBP in this payload.`],
          ['HR', hr, (v) => `${v}`, GREEN],
          // Direction and real distance, from the flags spray_cache already
          // writes. PULL / OPPO are the batted-ball direction split; 375+ and
          // 400+ are the same "balls he's let travel" tiers the pitcher panel
          // reports, read from the bat's side. All counted over exactly the
          // rows below, like everything else in this strip.
          ['PULL', sidePct('pull'), pct, AMBER],
          ['OPPO', sidePct('oppo'), pct, C.text2],
          ['XBH', bbCount ? xbh : null, (v) => `${v} (${(100 * v / bbCount).toFixed(0)}%)`, CYAN],
          ['375+ FT', mid, (v) => `${v}`, AMBER],
          ['400+ FT', far, (v) => `${v}`, RED],
        ]
        return (
          <div style={{
            display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8,
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '8px 14px',
          }}>
            {cells.map(([l, v, fmt, col, tip]) => v == null ? null : (
              <div key={l} title={tip || undefined} style={{ minWidth: 0, cursor: tip ? 'help' : undefined }}>
                {/* 7.5px → 8.5px (2026-09-13). Donovan named this exact
                    stat-strip label — "little text in the ev log" — as too
                    small to read. Matches the "over the N balls" caption
                    two lines down, which was already 8.5. */}
                <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.09em', fontFamily: NUM_FONT }}>{l}</div>
                <div style={{ fontSize: 15, fontWeight: 900, fontFamily: NUM_FONT, color: col }}>{fmt(v)}</div>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', alignSelf: 'end', fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
              over the {bbCount} ball{bbCount === 1 ? '' : 's'}{kCount > 0 ? ` + ${kCount} K${kCount === 1 ? '' : 's'}` : ''} shown below
            </div>
          </div>
        )
      })()}

      {/* The exit-velo-against-launch-angle scatter lived here and is gone
          (2026-08-31, Donovan: "remove this chart"). The wedge was scenery
          for the eye, and the barrel/HR facts it drew are already carried by
          the flags on the rows below, so nothing factual left with it. */}

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
          { key: 'xbh',     label: 'XBH',     flag: true, mark: '●', w: 34,
            explain: 'Extra-base hit — the bot\u2019s own flag on this batted ball.' },
          { key: 'k',       label: 'K',       flag: true, mark: '✕', w: 28,
            title: 'Strikeout — the pitch that ended the at-bat, not a batted ball. EV/Angle/Dist/Side/Lane are blank because none exists; Pitch/Arm/Velo are still his last pitch faced.' },
          { key: 'side',    label: 'Side',    heat: false, w: 64, dim: true,
            title: 'Pull, centre or opposite field. Direction only — it says where the ball went, not how hard.' },
          { key: 'lane',    label: 'Lane',    heat: false, w: 54, mono: true, dim: true,
            title: 'Which slice of the outfield it landed in: LF, LCF, CF, RCF, RF. Straight off the hit coordinates, not modelled.' },
          { key: 'result',  label: 'Result',  heat: false, w: 116, dim: true },
          { key: 'traj',    label: 'Traj',    heat: false, w: 84, dim: true },
        ]}
        initialSort={null}
        maxHeight={460}
        caption="Every column is shaded against its own range within this window, so changing the window changes the shading — that's the point, it shows what's hot relative to what you asked for. Angle is shaded like any other column but read it carefully: high launch angle is a popup, not a good outcome. BRL / HH / HR are the bot's own flags. A K row is a strikeout, not a batted ball — EV/Angle/Dist/Side/Lane are blank on purpose; Pitch/Arm/Velo are still his last pitch faced."
      />
    </div>
  )
}
