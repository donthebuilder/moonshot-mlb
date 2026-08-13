'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchLiveSlate } from '../lib/liveSlate'
import { fetchBattedBallLog } from '../lib/livePitches'

// 📡 BATTED BALL LOG — the loudest contact on today's slate, everyone's.
//
// 2026-08-13, Donovan, after the 🔥 Hardest hit toggle shipped as a mode on
// JustNow: "i'd like to see hh deep fly out barrels distance and ev... just
// like how we can see the live spray the live ev... bbes from the game...
// basically a whole new reconstruction of the at the plate page... i don't
// like how the top of the page looks right before the lineups."
//
// Two things changed from that toggle:
//   1. ITS OWN SECTION, not a mode buried under a button. JustNow asks "what
//      happened to MY guys" and this asks "who's squaring the ball up
//      anywhere on the slate" — different questions, so now they're two
//      labelled rails instead of one rail quietly meaning different things
//      depending on which pill was last tapped. That double meaning was
//      part of what made the top of the page hard to read at a glance.
//   2. THREE TAGS, not one number. 🔥 hard-hit, 💎 barrel and 📏 deep fly out
//      each get their own gate in fetchBattedBallLog() — a ball can earn any
//      combination of the three — plus real distance and exit velo on every
//      row, not just the EV that used to be the whole story.
//
// COSTS NOTHING NEW. Same feedFor() cache fetchSkinEvents and the old
// fetchHardHitLog already shared — this is a different read of a feed
// something on the page was already pulling, not a new fetch.
const BADGE = {
  fontSize: 7.5, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.03em',
  borderRadius: 999, padding: '1px 5px', whiteSpace: 'nowrap', lineHeight: 1.5,
}

const TONE_COL = {
  hr: '#f97316', xbh: '#FCD34D', hot: '#fb7185',
  on: '#4ade80', out: '#8b8b95', k: '#f87171',
}

const SHORT = (e) => String(e || '')
  .replace(/^Home Run$/i, 'HOME RUN')
  .replace(/^Strikeout.*/i, 'struck out')
  .replace(/^Groundout$/i, 'grounded out')
  .replace(/^Flyout$/i, 'flied out')
  .replace(/^Lineout$/i, 'lined out')
  .replace(/^Pop Out$/i, 'popped out')
  .replace(/^Forceout$/i, 'forced out')
  .replace(/^Sac Fly.*/i, 'sac fly')
  .replace(/^Field Error$/i, 'reached on error')
  .toLowerCase()
  .replace(/^home run$/, 'HOME RUN')

export default function BattedBallLog({ players = [], onPlayerClick, limit = 12 }) {
  const [rows, setRows] = useState([])
  const [hasGames, setHasGames] = useState(false)

  // Most names in this log ARE on tonight's slate (that's most of the site's
  // player pool), but a few won't be — a stranger's teammate with no HR card
  // this slate, say. byId + the `p ?` guard below is the same rule JustNow
  // uses: open the real card when we have one, otherwise the row still shows
  // everything it knows but isn't a dead click into a blank modal.
  const byId = useMemo(() => {
    const m = new Map()
    players.forEach((p) => m.set(Number(p?.player_id ?? p?.id), p))
    return m
  }, [players])

  useEffect(() => {
    let alive = true
    let t = null
    const pull = async () => {
      const snap = await fetchLiveSlate().catch(() => null)
      if (!alive || !snap) return
      setHasGames((snap.games || []).some((g) => g.state === 'Live' || g.state === 'Final'))
      const ev = await fetchBattedBallLog(snap, limit).catch(() => [])
      if (!alive) return
      setRows(ev)
      const anyLive = snap.games?.some((g) => g.state === 'Live')
      clearInterval(t)
      // Matches the 45s feed-cache TTL, same cadence as JustNow — never asks
      // for bytes it wouldn't already get handed back from cache.
      t = setInterval(() => { if (!document.hidden) pull() }, anyLive ? 45000 : 180000)
    }
    pull()
    return () => { alive = false; clearInterval(t) }
  }, [limit])

  if (!rows.length && !hasGames) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📡 Batted balls</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          🔥 hard-hit · 💎 barrel · 📏 deep fly out — every live and final game tonight
        </span>
      </div>

      {!rows.length ? (
        <div style={{ fontSize: 10, color: C.text3, fontStyle: 'italic' }}>
          Nothing loud yet tonight.
        </div>
      ) : (
        <div className="rail dense-scroll" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 7, minWidth: 'max-content', paddingBottom: 2 }}>
            {rows.map((r) => {
              const col = TONE_COL[r.tone] || C.text3
              const p = byId.get(r.id) || null
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => p && onPlayerClick?.(p)}
                  title={`${r.name} — ${r.event}${r.pitcher ? ` off ${r.pitcher}` : ''} · ${r.half} ${r.inning}${r.ev ? ` · ${Math.round(r.ev)}mph off the bat` : ''}${r.dist ? ` · ${Math.round(r.dist)}ft` : ''}${r.la != null ? ` · ${Math.round(r.la)}° launch` : ''}`}
                  style={{
                    flex: '0 0 auto', width: 190, textAlign: 'left', cursor: p ? 'pointer' : 'default',
                    color: C.text,
                    background: r.tone === 'hr' ? `${col}1a` : C.bg3,
                    border: `1px solid ${r.tone === 'hr' || r.tone === 'hot' ? `${col}77` : C.border2}`,
                    borderRadius: 10, padding: '7px 10px 8px', minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: NUM_FONT }}>
                    <span style={{ fontSize: 10 }}>{r.icon}</span>
                    <span style={{ fontSize: 9, color: C.text2, fontWeight: 700 }}>
                      {/^top/i.test(r.half) ? '▲' : '▼'}{r.inning}
                    </span>
                    {r.ev ? (
                      <span style={{
                        marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800,
                        color: r.ev >= 100 ? '#fb7185' : C.text2,
                      }}>
                        {Math.round(r.ev)}<span style={{ fontSize: 7.5, color: C.text3 }}> mph</span>
                      </span>
                    ) : null}
                  </div>

                  <div style={{
                    fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2,
                    color: C.text, letterSpacing: '-.01em',
                  }}>{r.name}</div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 1 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: r.tone === 'hr' ? 900 : 700, color: col,
                      fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textTransform: r.tone === 'hr' ? 'none' : 'uppercase', letterSpacing: '.02em', minWidth: 0,
                    }}>{SHORT(r.event)}</span>
                    {r.dist ? (
                      <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto', flexShrink: 0 }}>
                        {Math.round(r.dist)}ft
                      </span>
                    ) : null}
                  </div>

                  {/* the three quality gates, from fetchBattedBallLog — a ball
                      can clear any combination, so this renders 0-3 pills */}
                  {(r.hh || r.barrel || r.deepFly) && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                      {r.hh && (
                        <span title="95+ mph off the bat — Statcast's own hard-hit line" style={{
                          ...BADGE, color: '#fb7185', border: '1px solid rgba(251,113,133,.45)', background: 'rgba(251,113,133,.10)',
                        }}>🔥 HH</span>
                      )}
                      {r.barrel && (
                        <span title="A real barrel — the exit velo / launch angle combination that has historically produced .500+ AVG and 1.500+ SLG" style={{
                          ...BADGE, color: '#38bdf8', border: '1px solid rgba(56,189,248,.45)', background: 'rgba(56,189,248,.10)',
                        }}>💎 BARREL</span>
                      )}
                      {r.deepFly && (
                        <span title="A fly ball hit 370+ feet that did not land for a hit — well-struck enough to travel, caught anyway" style={{
                          ...BADGE, color: '#a78bfa', border: '1px solid rgba(167,139,250,.45)', background: 'rgba(167,139,250,.10)',
                        }}>📏 DEEP</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
