'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { logUrl, dataUrl } from '../../lib/dataSource'
import { nameOf, teamOf, oppOf, clean, n, obj, hrScore, hitScore, dateText } from '../../lib/player'
import { groupGames } from '../../lib/data'
import { fetchPenFatigue, penTier } from '../../lib/bullpen'
import { teamAbbrs } from '../../lib/gamelogs'
import Storylines from '../Storylines'

// HOME — the front porch.
//
// The site used to open on the Scoreboard, 268 rows deep, every column lit.
// Great once you know the house; a wall of stats if you just walked in.
// This tab is the answer to "make the first page welcoming — something good,
// living and breathing": a greeting that knows what time it is, tonight in
// four numbers, the one game worth circling, the bot's own graded record,
// and three doors into the rest of the site. Everything on this page is
// either in the slate payload, the live results file, or the bot's published
// today.txt — nothing invented, and every missing piece says so out loud.

const greeting = (h) => {
  if (h >= 5 && h < 12) return ['Good morning', '☀️']
  if (h >= 12 && h < 17) return ['Good afternoon', '⚾']
  if (h >= 17 && h < 22) return ['Good evening', '🌆']
  return ['Burning the midnight oil', '🌙']
}

// One line that changes every few seconds — the "living" part. All computed
// from data already on the page; lines that can't be computed simply don't
// enter the rotation.
function useRotating(lines, ms = 6500) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (lines.length < 2) return
    const id = setInterval(() => setI((x) => (x + 1) % lines.length), ms)
    return () => clearInterval(id)
  }, [lines.length, ms])
  return lines.length ? lines[i % lines.length] : null
}

function StatCell({ label, value, sub, col = C.orange, pulse = false }) {
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 0,
      background: `linear-gradient(160deg, ${col}12, transparent 70%)`,
      border: `1px solid ${C.border}`, borderTop: `2px solid ${col}66`,
      borderRadius: 12, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, animation: 'homePulse 2s infinite', flexShrink: 0 }} />}
        <span style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: NUM_FONT }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: NUM_FONT, color: col, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

export default function Home({ players = [], results, backtest, mode = 'today', slateDate = '', dateLabel = '', onNavigate, onPlayerClick }) {
  const [hour, setHour] = useState(null) // effect-set so server/client agree
  useEffect(() => {
    setHour(new Date().getHours())
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])
  const [hello, icon] = greeting(hour ?? 18)

  // ── projected HR, from the bot's own published sheet (today.txt) ──
  const [proj, setProj] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!alive || !text) return
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        if (range) setProj({ low: Number(range[1]), high: Number(range[2]), grade: (grade?.[1] || '').trim() })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [mode])

  const games = useMemo(() => groupGames(players), [players])
  const isLive = results?.live_mode === true

  // First pitch: the earliest game that hasn't started yet, else the earliest.
  const firstPitch = useMemo(() => {
    const now = Date.now()
    const times = games.map((g) => new Date(g.game_time || 0).getTime()).filter((t) => t > 0)
    if (!times.length) return null
    const upcoming = times.filter((t) => t > now).sort((a, b) => a - b)
    return new Date(upcoming[0] ?? Math.min(...times))
  }, [games])

  // THE headline game — the one whose three best power bats sum highest.
  // Same slate scores the boards run on; this is a ranking, not a projection.
  const headline = useMemo(() => {
    let best = null
    games.forEach((g) => {
      const sorted = [...(g.players || [])].sort((a, b) => hrScore(b) - hrScore(a))
      const heat = sorted.slice(0, 3).reduce((s, p) => s + hrScore(p), 0)
      if (!best || heat > best.heat) best = { g, heat, bats: sorted.slice(0, 2) }
    })
    return best
  }, [games])

  // ── STORYLINES, cherry-picked (2026-08-08, "turn it up, maybe some
  // storyline"). Three hero lines, each from a source that already exists:
  //   🔁 back-to-back watch — pure slate field (games_since_last_hr === 0)
  //   🧱 tonight's fence rider — current/fence_board.json, slate-filtered
  //   🚪 pen door — yesterday's reliever workload (lib/bullpen)
  // Lines that can't be computed don't render; nothing here is invented.
  const b2b = useMemo(() => players
    .filter((p) => Number(p?.games_since_last_hr) === 0)
    .sort((a, b) => hrScore(b) - hrScore(a)), [players])

  const [fence, setFence] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${dataUrl('current/fence_board.json')}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setFence(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  const fenceRider = useMemo(() => {
    if (!fence?.rows?.length || !players.length) return null
    const byId = new Map(players.map((p) => [String(p?.player_id ?? p?.id), p]))
    // Same base fit the Fence Riders board leads with (contact vs the wall),
    // minus the per-park wall pull — this is one hero line, not the board.
    const scored = fence.rows
      .filter((r) => byId.has(String(r.player_id)))
      .map((r) => ({
        r, p: byId.get(String(r.player_id)),
        fit: (r.deep_pull_ct || 0) * 3 + (r.fence_ct || 0) * 1.5 + (r.over_ct || 0) + (r.robbed_ct || 0) * 1.5,
      }))
      .sort((a, b) => b.fit - a.fit)
    return scored[0] || null
  }, [fence, players])

  // Gassed / worked pens among TONIGHT's teams. Yesterday's workload only
  // means anything for today's slate, so tomorrow mode skips the fetch.
  const [pens, setPens] = useState([])
  const penApplies = !slateDate || slateDate <= new Date().toLocaleDateString('en-CA')
  useEffect(() => {
    if (!penApplies || !players.length) { setPens([]); return undefined }
    let alive = true
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([pen, abbrs]) => {
      if (!alive) return
      const tonight = new Set()
      players.forEach((p) => { [teamOf(p), oppOf(p)].forEach((t) => t && tonight.add(String(t).toUpperCase())) })
      const out = []
      Object.entries(pen || {}).forEach(([tid, t]) => {
        const ab = String(abbrs?.[tid] || '').toUpperCase()
        if (!ab || !tonight.has(ab)) return
        const tier = penTier(t)
        if (tier) out.push({ ab, t, tier })
      })
      out.sort((a, b) =>
        ((a.tier.key === 'gassed' ? 0 : 1) - (b.tier.key === 'gassed' ? 0 : 1)) || b.t.pitches - a.t.pitches)
      setPens(out)
    }).catch(() => {})
    return () => { alive = false }
  }, [penApplies, players.length])

  // Bot record from the graded backtest file — the number he can quote.
  const record = useMemo(() => {
    const bt = obj(backtest)
    const acc = n(bt.overall_base_hit_accuracy, null)
    const per = bt.per_day
    const days = Array.isArray(per) ? per.length : Object.keys(obj(per)).length
    return acc != null && acc > 0 ? { acc, days } : null
  }, [backtest])

  // ── the rotating pulse line ──
  const confirmed = useMemo(() => players.filter((p) => p?.lineup_confirmed === true).length, [players])
  const weakStars = useMemo(() => players.filter((p) => p?.weak_spot_flag === true).length, [players])
  const picks = useMemo(() => players.filter((p) => String(p?.game_pick_role || '').trim()).length, [players])
  const homersSoFar = (results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []).length
  const lines = useMemo(() => {
    const out = []
    if (isLive && homersSoFar > 0) out.push(`⚡ ${homersSoFar} ball${homersSoFar > 1 ? 's have' : ' has'} already left a yard tonight — the Scoreboard is grading live.`)
    if (picks > 0) out.push(`🎯 The bot designated ${picks} picks on this slate — The Four on the Scoreboard is the headline cut.`)
    if (weakStars > 0) out.push(`★ ${weakStars} hitters sit in a weak lineup spot against tonight's arm — the stars on every board.`)
    if (confirmed > 0 && players.length > 0) out.push(`✓ ${confirmed} of ${players.length} hitters are in confirmed lineups — confirmed picks homer at a meaningfully higher clip.`)
    if (proj?.grade) out.push(`💣 The bot calls tonight's power grade "${proj.grade}" — the projection tile has the range.`)
    if (record) out.push(`📈 Every pick gets graded in public — ${record.acc.toFixed(1)}% base-hit accuracy across ${record.days} days is the honest number.`)
    return out
  }, [isLive, homersSoFar, picks, weakStars, confirmed, players.length, proj, record])
  const pulse = useRotating(lines)

  const empty = !players.length

  const DOORS = [
    { tab: 'scoreboard', icon: '📊', title: 'The Scoreboard', color: C.orange,
      body: 'Every hitter on the slate, every column, live once first pitch lands. The Four — the bot’s headline picks — sit right on top.' },
    { tab: 'games', icon: '⚾', title: 'Game by game', color: C.cyan,
      body: 'Tonight matchup by matchup: the arm, the park, the lineup, and the designated picks for each game.' },
    { tab: 'results', icon: '✅', title: 'The receipts', color: C.green,
      body: 'Every pick graded against its own job, every night, wins and losses alike. This is why the record above is quotable.' },
  ]

  return (
    <div>
      <style>{`
        @keyframes homePulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes homeFade { from{opacity:0; transform:translateY(3px)} to{opacity:1; transform:none} }
      `}</style>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: `linear-gradient(150deg, ${C.bg2}, rgba(249,115,22,.07) 60%, rgba(252,211,77,.05))`,
        border: `1px solid ${C.border}`, borderRadius: 18,
        padding: '26px 24px 22px', marginBottom: 14,
      }}>
        {/* the ember glow — decoration, kept behind the text */}
        <div style={{
          position: 'absolute', right: -60, top: -60, width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,.16), transparent 70%)', pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 11, color: C.text3, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT }}>
            {dateLabel || (mode === 'today' ? 'Today' : 'Tomorrow')}{slateDate ? ` · ${slateDate}` : ''}
          </span>
          {isLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4,
              fontSize: 9, fontWeight: 900, color: C.green, letterSpacing: '.1em', fontFamily: NUM_FONT,
              border: `1px solid ${C.green}55`, background: `${C.green}14`, borderRadius: 999, padding: '2px 9px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'homePulse 1.6s infinite' }} />
              LIVE
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 6px', lineHeight: 1.15 }}>
          {hello}.{' '}
          <span style={{ background: 'linear-gradient(90deg, #f97316, #FCD34D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {empty ? 'The slate is still cooking.' : isLive ? 'The slate is live.' : 'Tonight’s sheet is ready.'}
          </span>
        </h1>
        <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.6, maxWidth: 640 }}>
          {empty
            ? 'No hitters on the board yet — the bot builds the slate on its morning run. Everything below fills in on its own once the sheet lands; no refresh ritual required.'
            : 'MOONSHOT reads every hitter, every arm and every park on tonight’s slate, then grades its own picks in public the next morning. Start with the glance below, or pick a door.'}
        </div>
        {/* the living line — rotates through real facts about tonight */}
        {pulse && (
          <div key={pulse} style={{
            marginTop: 12, fontSize: 11, color: C.text2, fontFamily: NUM_FONT,
            borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, lineHeight: 1.5,
            animation: 'homeFade .5s ease both',
          }}>{pulse}</div>
        )}
      </div>

      {/* ── TONIGHT AT A GLANCE ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <StatCell label="Games" col={C.blue} pulse={isLive}
          value={empty ? '—' : games.length}
          sub={empty ? 'slate not built yet' : `${games.filter((g) => g.lineup_confirmed).length} with confirmed lineups`} />
        <StatCell label="Projected HR" col={C.orange}
          value={proj ? `${proj.low}–${proj.high}` : '—'}
          sub={proj ? `bot's own range · power grade ${proj.grade || 'n/a'}` : 'appears when the bot publishes its sheet'} />
        <StatCell label="First pitch" col={C.yellow}
          value={firstPitch ? firstPitch.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}
          sub={firstPitch ? 'your local time' : 'no game times on the slate yet'} />
        <StatCell label="Bot base-hit record" col={C.green}
          value={record ? `${record.acc.toFixed(1)}%` : '—'}
          sub={record ? `every pick, ${record.days} graded days` : 'grading archive not published yet'} />
      </div>

      {/* ── THE HEADLINE GAME ────────────────────────────────────────── */}
      {headline && (
        <div style={{
          background: `linear-gradient(155deg, rgba(249,115,22,.1), ${C.bg2} 55%)`,
          border: '1px solid rgba(249,115,22,.35)', borderRadius: 14,
          padding: '13px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: C.orange, letterSpacing: '.1em', fontFamily: NUM_FONT }}>🔥 TONIGHT&apos;S HEADLINER</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>the game whose top power bats stack highest on the board — a ranking, not a promise</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 7 }}>
            <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-.02em', fontFamily: NUM_FONT }}>
              {clean(headline.g.away, '?')} <span style={{ color: C.text3, fontWeight: 400 }}>@</span> {clean(headline.g.home, '?')}
            </div>
            <div style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT }}>{dateText(headline.g.game_time)}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {headline.bats.map((p, i) => (
                <button key={i} onClick={() => onPlayerClick?.(p)} style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 6, cursor: 'pointer',
                  background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '4px 10px',
                }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{nameOf(p)}</span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{teamOf(p)}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.orange, fontFamily: NUM_FONT }}>{hrScore(p).toFixed(1)}</span>
                </button>
              ))}
              <button onClick={() => onNavigate?.('games')} style={{
                fontSize: 10, fontWeight: 800, color: C.orange, cursor: 'pointer',
                background: 'transparent', border: '1px dashed rgba(249,115,22,.4)', borderRadius: 9, padding: '4px 10px',
              }}>full matchup →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TONIGHT'S STORYLINES — hero lines, not tables ────────────── */}
      {(b2b.length > 0 || fenceRider || pens.length > 0) && (
        <div style={{
          background: `linear-gradient(155deg, rgba(252,211,77,.06), ${C.bg2} 60%)`,
          border: '1px solid rgba(252,211,77,.25)', borderRadius: 14,
          padding: '13px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: C.yellow, letterSpacing: '.1em', fontFamily: NUM_FONT }}>📖 TONIGHT&apos;S STORYLINES</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>the lines you say out loud — every one from tonight&apos;s own data</span>
          </div>

          {b2b.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🔁</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Back-to-back watch</b> —{' '}
                {b2b.slice(0, 3).map((p, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <button onClick={() => onPlayerClick?.(p)} style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, color: '#f87171', textDecoration: 'underline', textDecorationColor: 'rgba(248,113,113,.35)',
                    }}>{nameOf(p)}</button>
                    <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(p)}</span>
                  </span>
                ))}
                {b2b.length > 3 && <span style={{ color: C.text3 }}> and {b2b.length - 3} more</span>}
                {' '}went deep last game — tonight is the encore try.
              </span>
            </div>
          )}

          {fenceRider && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🧱</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Tonight&apos;s fence rider</b> —{' '}
                <button onClick={() => onPlayerClick?.(fenceRider.p)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 12, fontWeight: 800, color: C.orange, textDecoration: 'underline', textDecorationColor: 'rgba(249,115,22,.35)',
                }}>{fenceRider.r.name}</button>
                <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {fenceRider.r.team}</span>
                {' '}has <b style={{ fontFamily: NUM_FONT, color: '#4ade80' }}>{fenceRider.r.over_ct}</b> balls over 375ft
                and <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{fenceRider.r.fence_ct}</b> pulled into the wall-scraper zone
                in his last <span style={{ fontFamily: NUM_FONT }}>{fenceRider.r.games}</span> games — measured landing data, all wall, no feel.
              </span>
            </div>
          )}

          {pens.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🚪</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Pen door</b> —{' '}
                {pens.slice(0, 3).map((x, i) => (
                  <span key={x.ab}>
                    {i > 0 && ', '}
                    <b style={{ color: x.tier.col }}>{x.ab}</b>
                    <span title={`${x.ab} bullpen yesterday: ${x.t.used} relievers, ${x.t.pitches} pitches — ${(x.t.names || []).map((r2) => `${String(r2.name).split(' ').slice(-1)[0]} ${r2.pitches}p`).join(', ')}`}
                      style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text3 }}> {x.tier.icon} {x.t.used} arms / {x.t.pitches}p yesterday</span>
                  </span>
                ))}
                {' '}— tired relief gives up homers; the late innings are the window.
              </span>
            </div>
          )}
        </div>
      )}

      {/* The full storyline engine — milestones, duels, revenge games,
          birthdays, giveaways. Same panel the Scoreboard carries; collapsed
          by default, the header counts tell you if it's worth opening. */}
      {/* ── TONIGHT'S TOP 10s (2026-08-08, Donovan: "top 10 hits and hr for
          the home page, awesome but digestible") — two clean boards, ranked
          by the site's own scores, with the ARM each bat gets to attack:
          ★ = weak lineup spot vs this starter, red HR/9 = a leaking arm. */}
      {players.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { title: '💣 Top 10 — HR plays', col: '#FB923C', score: hrScore, door: 'board' },
            { title: '🎯 Top 10 — Hit plays', col: '#60A5FA', score: hitScore, door: 'hitshrr' },
          ].map(({ title, col, score, door }) => {
            const rows = [...players].sort((a, b) => score(b) - score(a)).slice(0, 10)
            const max = score(rows[0]) || 1
            return (
              <div key={title} style={{
                flex: '1 1 340px', minWidth: 0,
                background: `linear-gradient(155deg, ${C.bg2}, ${col}08)`,
                border: `1px solid ${col}30`, borderRadius: 12, padding: '10px 13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>{title}</span>
                  <span onClick={() => onNavigate?.(door)} style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT }}>full board →</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {rows.map((p, i) => {
                    const s = score(p)
                    const hr9 = n(p?.pitcher_hr9, 0)
                    const leaky = hr9 >= 1.4
                    return (
                      <div key={i} onClick={() => onPlayerClick?.(p)} style={{
                        display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer',
                        padding: '2px 5px', borderRadius: 6, minWidth: 0,
                        background: i === 0 ? `${col}12` : 'transparent',
                      }}>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: i < 3 ? col : C.text3, fontWeight: 900, width: 16, flexShrink: 0 }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                          {nameOf(p)}
                          {p?.weak_spot_flag ? <span title="Weak lineup spot vs this starter — the validated 18.0% vs 13.9% flag" style={{ fontSize: 9 }}> ★</span> : null}
                        </span>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          vs {clean(p?.pitcher_name, 'TBD').split(' ').slice(-1)[0]}
                          {hr9 > 0 && <b style={{ color: leaky ? '#f87171' : C.text3 }} title={leaky ? 'This arm leaks homers — 1.40+ HR/9' : 'Starter HR/9'}> {hr9.toFixed(2)}</b>}
                        </span>
                        <div style={{ flex: '0 0 46px', height: 5, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (100 * s) / max)}%`, height: '100%', background: col, opacity: i < 3 ? 1 : 0.55 }} />
                        </div>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 900, color: i < 3 ? col : C.text2, width: 24, textAlign: 'right', flexShrink: 0 }}>
                          {s.toFixed(0)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
                  Ranked by the site&apos;s own score · ★ weak spot vs tonight&apos;s starter ·{' '}
                  <b style={{ color: '#f87171' }}>red HR/9</b> = a leaking arm. Tap a name for his card.
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Storylines players={players} slateDate={slateDate} onPlayerClick={onPlayerClick} />

      {/* ── THREE DOORS ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {DOORS.map((d) => (
          <div key={d.tab} onClick={() => onNavigate?.(d.tab)} style={{
            flex: '1 1 240px', minWidth: 0, cursor: 'pointer',
            background: `linear-gradient(155deg, ${d.color}12, ${d.color}04)`,
            border: `1px solid ${d.color}3d`, borderRadius: 13, padding: '13px 15px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ fontSize: 15 }}>{d.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: d.color }}>{d.title}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: d.color }}>→</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.55 }}>{d.body}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 12, lineHeight: 1.5 }}>
        Everything on this page comes from tonight&apos;s slate file, the live results feed, or the bot&apos;s
        own published sheet — when a number isn&apos;t built yet, the tile says so instead of guessing.
      </div>
    </div>
  )
}
