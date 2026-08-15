'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, n, clean } from '../lib/player'

// 🧱 NEAR MISSES — the homers that almost happened, from the bats that
// haven't had one lately.
//
// 2026-08-15, Donovan, for the Scoreboard only: "put near misses from players
// who haven't gone yard in 2+ games, and statcast when." Replaces Storylines
// and the slate-strength fold on this page — this is the read he actually
// wants between innings: who is hitting the ball like a homer without getting
// one, because that's the drought most likely to end tonight.
//
// EVERYTHING HERE IS ALREADY ON THE SLATE ROW — no new fetch. The bot ships
// per-hitter statcast shape: max exit velo and max distance over the recent
// window (hr_shape_components), the batted-ball census of his recent hard
// contact (hr_shape_profile: wall_scrapers, moonshots, no-doubters), recent
// barrel rate, and games_since_last_hr. A "near miss" is defined from those:
// recent contact that reached homer distance or homer EV without the homer.
//
// THE BAR TO MAKE THIS LIST IS REAL CONTACT, not a long drought alone — a
// drought with no hard contact is a slump, not a near miss, and belongs on
// the cold case, not here.

const dist = (p) => n(p?.hr_shape_components?.max_distance, 0)
const ev = (p) => n(p?.hr_shape_components?.max_ev, 0)
const scrapers = (p) => n(p?.hr_shape_profile?.wall_scraper, 0)
const bigFly = (p) => n(p?.hr_shape_profile?.moonshot, 0) + n(p?.hr_shape_profile?.no_doubter, 0)
const barrels = (p) => n(p?.recent_barrel_rate, 0)

export default function NearMisses({ players = [], onPlayerClick }) {
  const rows = useMemo(() => {
    return (players || [])
      .filter((p) => n(p?.games_since_last_hr, 0) >= 2)
      .map((p) => {
        const d = dist(p)
        const e = ev(p)
        const w = scrapers(p)
        // How close has he actually come? Distance is the honest core of it:
        // 380+ reaches seats in most parks. Wall scrapers are literal near
        // misses. EV 108+ is homer contact whatever the angle did. Barrels
        // keep a live bat from being outranked by one lucky poke.
        const close = (d >= 400 ? 3 : d >= 385 ? 2 : d >= 372 ? 1 : 0)
          + w * 2
          + (e >= 110 ? 2 : e >= 106 ? 1 : 0)
          + (barrels(p) >= 0.12 ? 1 : 0)
        return { p, d, e, w, close, since: n(p?.games_since_last_hr, 0) }
      })
      .filter((r) => r.close >= 2)
      .sort((a, b) => b.close - a.close || b.d - a.d)
      .slice(0, 14)
  }, [players])

  if (!rows.length) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, padding: '6px 0' }}>
        Nobody on this card pairs a 2+ game homer drought with genuine near-miss contact tonight —
        the droughts out there are slumps, not bad luck, and those live in the cold case.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, marginBottom: 8, maxWidth: 740 }}>
        Hitters <b style={{ color: C.text2 }}>2+ games since a homer</b> whose recent contact says one
        was close — ranked by how close. Distance and exit velo are his best recent batted ball
        (statcast, off the bot&apos;s own shape data); <b style={{ color: C.text2 }}>wall</b> counts
        literal warning-track scrapers in his recent hard contact.
      </div>
      <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
        {rows.map(({ p, d, e, w, since }) => (
          <button key={`${p.player_id}-${p.game_pk}`} onClick={() => onPlayerClick?.(p)} className="tap-row"
            style={{
              display: 'flex', gap: 8, alignItems: 'baseline', textAlign: 'left', cursor: 'pointer',
              background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
              padding: '6px 10px', minWidth: 0,
            }}>
            <span style={{
              fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, flexShrink: 0,
              color: since >= 10 ? '#f87171' : since >= 5 ? C.orange : C.text2, minWidth: 30,
            }} title={`${since} games since his last homer`}>{since}g</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
              {nameOf(p)}
              <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>{teamOf(p)}</span>
            </span>
            <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text2, flexShrink: 0, whiteSpace: 'nowrap' }}
              title={`Best recent batted ball: ${d ? `${Math.round(d)} ft` : '—'}${e ? ` at ${e.toFixed(1)} mph` : ''}${w ? ` · ${w} wall scraper${w > 1 ? 's' : ''} in his recent hard contact` : ''}`}>
              {d ? <b style={{ color: d >= 390 ? C.orange : C.text }}>{Math.round(d)}ft</b> : '—'}
              {e ? <span style={{ color: C.text3 }}> · {e.toFixed(0)}mph</span> : null}
              {w > 0 && <b style={{ color: '#FCD34D' }}> · {w} wall</b>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
