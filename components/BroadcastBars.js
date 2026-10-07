'use client'
import TeamMark from './TeamMark'
import { alpha } from '../lib/scales'

// THE BROADCAST BARS (2026-10-07, Donovan on TUDDY's props chart: "it just looks wack, give it
// some real style" -- an NFL / ESPN broadcast graphic, SIMPLE, LARGE, granny-readable).
// ValueBars' `variant="broadcast"`; MOONSHOT's own bars (the default variant) are untouched.
//
//   one big bar per game, oldest left, NEWEST RIGHT (lit with a soft panel behind it)
//   a bar over the line wears the product accent; a miss is neutral grey (no red / green)
//   the line is a white dashed rule with its number on a tag at the right edge
//   the value is printed above every bar, bold and large (it never hides)
//   the opponent's logo and the week sit under each bar
//   a tap pins a game (the caller draws that game's line), same as MOONSHOT's bars
//
//   games   oldest-left: [{ key, val, title, opp, week, season }]
//   thr     the count that clears (line + 0.5), the rule sits at thr - 0.5
//   look    { clear, miss, missInk, rule, ink, ink2, bg } -- the product's tokens (lib/nfl/theme BARS + C)
const H = 148           // the chart's own height
const LH_FULL = 66           // the label row under it: logo + week
const GUT = 40          // the right gutter that carries the line's number
const FULL = 12         // up to this many games each bar wears its value and its opponent
export default function BroadcastBars({ games = [], thr, numFont, look, sport = 'nfl', selected = null, onSelect = null }) {
  if (!games.length || !look) return null
  const line = thr - 0.5
  const full = games.length <= FULL
  const LH = full ? LH_FULL : 26
  const gap = full ? 6 : 2
  const maxVal = Math.max(thr + 1, ...games.map((g) => g.val), 1)
  const room = H - 26                         // headroom for the value above the tallest bar
  const y = (v) => Math.max(0, Math.min(room, (v / maxVal) * room))
  const lineY = y(line)
  const lastKey = games[games.length - 1].key
  const stroke = { paintOrder: 'stroke fill', WebkitTextStroke: `3px ${look.bg}` }
  return (
    <div style={{ position: 'relative', paddingRight: GUT, maxWidth: 760 }}>
      {/* the line: white, dashed, edge to edge, its number on a tag in the gutter */}
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: LH + lineY, height: 0, borderTop: `2px dashed ${alpha(look.rule, 0.85)}`, pointerEvents: 'none', zIndex: 3 }} />
      <div aria-label={`the line: ${line}`} style={{
        position: 'absolute', right: 0, bottom: LH + lineY - 13, width: GUT - 4, height: 26, borderRadius: 7, zIndex: 4,
        display: 'grid', placeItems: 'center', background: look.rule, color: look.bg,
        fontFamily: numFont, fontWeight: 900, fontSize: 14, letterSpacing: '-.01em', pointerEvents: 'none',
      }}>{line}</div>
      <div role="group" aria-label="One bar for each game, oldest on the left" style={{ display: 'flex', gap, alignItems: 'stretch' }}>
        {games.map((g, gi) => {
          const ok = g.val >= thr
          const isSel = selected != null && selected === g.key
          const newest = g.key === lastKey
          const newYear = full && g.season != null && (gi === 0 || games[gi - 1].season !== g.season)
          const h = g.val > 0 ? Math.max(6, y(g.val)) : 4
          return (
            <button key={g.key} type="button" title={g.title} aria-pressed={isSel} aria-label={g.title}
              onClick={onSelect ? () => onSelect(isSel ? null : g.key) : undefined}
              style={{
                flex: 1, minWidth: 0, padding: 0, margin: 0, border: 'none', font: 'inherit', color: 'inherit',
                cursor: onSelect ? 'pointer' : 'default', display: 'flex', flexDirection: 'column',
                borderRadius: 10, background: isSel ? alpha(look.rule, 0.14) : newest ? alpha(look.rule, 0.06) : 'transparent',
                outline: isSel ? `2px solid ${look.rule}` : 'none', outlineOffset: -1,
                borderLeft: newYear && gi > 0 ? `1px dashed ${alpha(look.rule, 0.35)}` : 'none',
              }}>
              <div style={{ height: H, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                {full && (
                  <span style={{ fontFamily: numFont, fontWeight: 900, fontSize: 15, lineHeight: 1, marginBottom: 4, zIndex: 5, color: ok ? look.rule : look.missInk, ...stroke }}>{g.val}</span>
                )}
                <div style={{
                  width: full ? '72%' : '100%', maxWidth: 34, height: h, borderRadius: '6px 6px 2px 2px',
                  background: ok ? `linear-gradient(180deg, ${look.clear}, ${alpha(look.clear, 0.62)})` : look.miss,
                  boxShadow: ok ? `0 0 16px ${alpha(look.clear, 0.38)}` : 'none',
                }} />
              </div>
              <div style={{ height: LH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                {full ? (
                  <>
                    {g.opp ? <TeamMark sport={sport} abbr={g.opp} variant="logo" px={20} /> : <span style={{ height: 20 }} />}
                    <span style={{ fontFamily: numFont, fontSize: 11, fontWeight: 800, lineHeight: 1, color: newest ? look.rule : look.ink2 }}>
                      {g.week != null ? `W${g.week}` : ''}
                    </span>
                    <span style={{ fontFamily: numFont, fontSize: 11, fontWeight: 700, lineHeight: 1, height: 11, color: look.ink2 }}>{newYear ? `'${String(g.season).slice(-2)}` : ''}</span>
                  </>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
      {!full && (
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: GUT, bottom: 6, display: 'flex', justifyContent: 'space-between', fontFamily: numFont, fontSize: 11, fontWeight: 800, color: look.ink2, pointerEvents: 'none' }}>
          <span>OLDEST</span><span>NEWEST</span>
        </div>
      )}
    </div>
  )
}
