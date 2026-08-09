'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, clean, hrScore } from '../../lib/player'
import { PanelTitle, Empty, inputStyle } from '../ui'
import SprayField from '../SprayField'
import HRPitchProfile from '../HRPitchProfile'
import { rampColor, inkFor } from '../Heatmap'
import { dataUrl } from '../../lib/dataSource'

// 🧱 FENCE LINE, PER PLAYER (2026-08-08, on request): the fence-rider counts
// from fence_board.json — every ball he put over 375 and every pulled ball
// that died 320–374 in the last 15 game dates — shown right beside the spray
// chart they were measured from. Same file the Fence Riders board reads;
// this is the single-player cut of it. No row = he has no wall contact in
// the window, and the strip says so instead of hiding.
function FenceLine({ playerId }) {
  const [board, setBoard] = useState(undefined)   // undefined = loading
  useEffect(() => {
    let alive = true
    fetch(`${dataUrl('current/fence_board.json')}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setBoard(j) })
      .catch(() => { if (alive) setBoard(null) })
    return () => { alive = false }
  }, [])
  if (board === undefined || !board?.rows?.length) return null
  const r = board.rows.find((x) => String(x.player_id) === String(playerId))
  const cell = (v, label, col, tip) => (
    <span title={tip} style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text3, cursor: 'help' }}>
      <b style={{ color: col, fontSize: 12, fontWeight: 900 }}>{v}</b> {label}
    </span>
  )
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline',
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px', margin: '8px 0',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 900 }}>🧱 Fence line</span>
      {r ? (
        <>
          {cell(r.over_ct, 'over 375', '#4ade80', `${r.over_ct} balls measured past 375 ft in his last ${r.games} game dates (${r.bbe} tracked balls)`)}
          {cell(r.fence_ct, 'at the wall', C.orange, 'Pulled balls that died 320–374 ft — outs in most parks, homers over a short porch')}
          {cell(r.deep_pull_ct, 'deep pull', '#22d3ee', 'Pulled 350+ ft — the swing shape that clears a pull porch')}
          {(r.robbed_ct || 0) > 0 && cell(r.robbed_ct, 'robbed', '#f87171', 'Wall-zone balls recorded as OUTS — homers in a different park')}
          {(r.oppo_over_ct || 0) > 0 && cell(r.oppo_over_ct, 'oppo 375+', '#a78bfa', '375+ the other way — all-fields power, not just a pull profile')}
          {Number(r.longest) > 0 && cell(`${Number(r.longest).toFixed(0)}′`, 'longest', C.text2, 'His longest measured ball in the window')}
          <span style={{ fontSize: 9, color: C.text3, marginLeft: 'auto', fontFamily: NUM_FONT }}>
            last {r.games} game dates · Statcast landing data
          </span>
        </>
      ) : (
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          no wall contact in the last 15 game dates — nothing over 375, nothing pulled into the scraper zone
        </span>
      )}
    </div>
  )
}

// Spray tab.
//
// The old version handed the whole viewport to one ballpark drawing. A spray
// chart is a small-multiple: it answers "where does this guy hit it" in about
// two seconds and then you want the numbers next to it. So the field is capped,
// and the pitch profile sits underneath rather than off screen.

export default function SprayBoard({ players = [], slateMode, onPlayerClick }) {
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(null)

  const ranked = useMemo(
    () => [...players].sort((a, b) => hrScore(b) - hrScore(a)),
    [players],
  )
  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    return (q
      ? ranked.filter((p) => `${nameOf(p)} ${teamOf(p)} ${oppOf(p)}`.toLowerCase().includes(q))
      : ranked
    ).slice(0, 30)
  }, [ranked, query])

  const selected = useMemo(
    () => ranked.find((p) => (p.player_id ?? nameOf(p)) === pick) || matches[0] || null,
    [ranked, matches, pick],
  )

  if (!players.length) return <Empty text="No players on this slate yet." />

  const lo = Math.min(...matches.map(hrScore), 0)
  const hi = Math.max(...matches.map(hrScore), 1)

  return (
    <div>
      <PanelTitle
        title="Spray"
        sub="Where each hitter puts the ball — and what he homers off"
      />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a hitter…"
        style={{ ...inputStyle(), width: '100%', maxWidth: 320, margin: '8px 0 8px' }}
      />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {matches.slice(0, 18).map((p) => {
          const id = p.player_id ?? nameOf(p)
          const on = selected && (selected.player_id ?? nameOf(selected)) === id
          const bg = rampColor(hrScore(p), lo, hi)
          return (
            <button
              key={id}
              onClick={() => setPick(id)}
              title={`HR ${hrScore(p).toFixed(1)}`}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                fontSize: 10.5, fontWeight: 700,
                border: `1px solid ${on ? C.orange : 'transparent'}`,
                background: bg, color: inkFor(bg),
                boxShadow: on ? `0 0 0 1px ${C.orange}` : 'none',
              }}
            >{nameOf(p).split(' ').slice(-1)[0]}</button>
          )
        })}
      </div>

      {selected && (
        <>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{nameOf(selected)}</span>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(selected)} vs {oppOf(selected)} · {clean(selected?.pitcher_name, 'TBD')} ·
              {' '}HR {hrScore(selected).toFixed(1)}
            </span>
            <button
              onClick={() => onPlayerClick?.(selected)}
              style={{
                marginLeft: 'auto', padding: '3px 10px', fontSize: 10.5, fontWeight: 700,
                borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`,
                background: 'transparent', color: C.text3,
              }}
            >Open full card</button>
          </div>

          <FenceLine playerId={selected?.player_id ?? selected?.id} />
          <SprayField player={selected} height={320} slateMode={slateMode} />
          <HRPitchProfile player={selected} slateMode={slateMode} />
        </>
      )}
    </div>
  )
}
