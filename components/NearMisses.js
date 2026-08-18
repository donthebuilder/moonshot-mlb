'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, n, clean } from '../lib/player'
import SprayField from './SprayField'

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
// ── NO MINIMUM (2026-08-18) ──────────────────────────────────────────────
// Donovan: "make the near misses thing useable and more visual... and just
// do near miss no minimum." The old gate required a 2+ game homer drought
// before a hitter could even be considered — so a guy who WAS hitting close
// ones but had gone deep only three games back never showed up, even though
// that's exactly the read this panel exists for. Dropped. The quality bar
// stays: real contact (`close >= 2`, see below) is still what makes this a
// near miss instead of a random name — that bar is the definition of the
// list, not an arbitrary cutoff, so it's the one filter that stays.
//
// ── MORE VISUAL (2026-08-18) ─────────────────────────────────────────────
// Text-only rows read as a stat line, not a "how close was this" picture.
// Two additions, both off data already on the row — no new fetch:
//   1. a distance bar per hitter, 340ft (a routine flyout) to 430ft (a
//      no-doubt shot), so "385ft" becomes a bar three-quarters of the way
//      there instead of a number you have to already know how to judge.
//   2. an expand toggle that opens that hitter's own SprayField (season,
//      last 5 games) in place — the actual shape of his recent contact,
//      not just the one best swing this card is ranked on.
const dist = (p) => n(p?.hr_shape_components?.max_distance, 0)
const ev = (p) => n(p?.hr_shape_components?.max_ev, 0)
const scrapers = (p) => n(p?.hr_shape_profile?.wall_scraper, 0)
const bigFly = (p) => n(p?.hr_shape_profile?.moonshot, 0) + n(p?.hr_shape_profile?.no_doubter, 0)
const barrels = (p) => n(p?.recent_barrel_rate, 0)

// Distance bar range: 340ft is a ball that stayed in the park almost
// everywhere; 430ft is a no-doubter in every park in the league. Clamped to
// [0,1] so a 460ft moonshot doesn't overflow the bar, and a 300ft ground-out
// distance (shouldn't happen — near misses require real contact — but a
// stale field is possible) doesn't go negative.
const DIST_LO = 340
const DIST_HI = 430
const barPct = (d) => Math.max(0, Math.min(1, (d - DIST_LO) / (DIST_HI - DIST_LO)))

// Hoisted out of the component (2026-08-18) so Scoreboard.js can put a real
// count in the Rundown's collapsed-fold label ("Near misses (11)") instead of
// a generic one — without a second, drifting copy of the "close >= 2" bar.
// One function, two callers; see the Rundown flow-pass note for why the
// count needed to exist at all.
export function nearMissRows(players) {
  return (players || [])
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
}

export default function NearMisses({ players = [], onPlayerClick }) {
  const [expanded, setExpanded] = useState(null) // player_id-game_pk key, or null

  const rows = useMemo(() => nearMissRows(players), [players])

  if (!rows.length) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, padding: '6px 0' }}>
        Nobody on this card has genuine near-miss contact tonight — nothing at homer distance,
        homer exit velo, or a wall scraper in the recent shape data. Not a drought question anymore,
        just no close contact to show.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, marginBottom: 8, maxWidth: 740 }}>
        Every hitter whose recent contact says a homer was close — ranked by how close, no drought
        required. Distance and exit velo are his best recent batted ball (statcast, off the bot&apos;s
        own shape data); <b style={{ color: C.text2 }}>wall</b> counts literal warning-track scrapers
        in his recent hard contact. Bar shows that distance against a 340ft flyout (empty) to a
        430ft no-doubter (full). Tap <b style={{ color: C.text2 }}>▸</b> to open his season spray
        chart in place; tap the row to open his full page.
      </div>
      <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
        {rows.map(({ p, d, e, w, since }) => {
          const key = `${p.player_id}-${p.game_pk}`
          const isOpen = expanded === key
          const pct = barPct(d)
          return (
            <div key={key} style={{
              gridColumn: isOpen ? '1 / -1' : 'auto',
              background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
              padding: '6px 10px', minWidth: 0,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  title={isOpen ? 'Collapse spray chart' : 'Show his season spray chart'}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
                    color: isOpen ? C.orange : C.text3, fontSize: 11, padding: '2px 3px',
                    transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s',
                  }}
                >▸</button>
                <button onClick={() => onPlayerClick?.(p)} className="tap-row"
                  style={{
                    display: 'flex', gap: 8, alignItems: 'baseline', textAlign: 'left', cursor: 'pointer',
                    background: 'transparent', border: 'none', padding: 0, flex: 1, minWidth: 0,
                  }}>
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, flexShrink: 0,
                    color: since >= 10 ? '#f87171' : since >= 5 ? C.orange : C.text2, minWidth: 30,
                  }} title={`${since} game${since === 1 ? '' : 's'} since his last homer`}>{since}g</span>
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
              </div>
              {/* Distance bar: 340ft (routine flyout, empty) to 430ft (no-doubter,
                  full). Same orange ramp as the rest of the site — no new colour
                  language for "how close". */}
              <div style={{
                marginTop: 5, marginLeft: 20, height: 4, borderRadius: 999,
                background: C.bg3, overflow: 'hidden',
              }} title={`${d ? Math.round(d) : '?'}ft of a 340–430ft range`}>
                <div style={{
                  height: '100%', width: `${(pct * 100).toFixed(0)}%`, borderRadius: 999,
                  background: pct >= 0.85 ? '#f87171' : pct >= 0.5 ? C.orange : '#FCD34D',
                }} />
              </div>
              {isOpen && (
                <div style={{ marginTop: 8, marginLeft: 20 }}>
                  <SprayField player={p} height={260} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
