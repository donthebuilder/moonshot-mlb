'use client'
import { useMemo, useRef } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { useAutoScroll } from '../../lib/headlines'
import { buildNflHeadlines } from '../../lib/nfl/headlines'

// ── THE HEADLINE STRIP (moved out of tabs/Home.js 2026-09-25) ───────────────
// Donovan's 09-25 pass: Live before kickoff opens the way MOONSHOT's Morning
// Edition does -- headline cards first. The strip and its CSS lived inside
// Home.js; Live needed it too, so it is its own component now and Home
// imports it back. The original note follows.
// ── THE ROTATING HEADLINE STRIP (parity pass, 2026-09-16) ─────────────────
// Donovan, side by side with MOONSHOT: TUDDY's home page needs "the same
// exact build as moonshot home page look wise and everything with the
// rotating headliner." MOONSHOT's Home leads with a self-scrolling row of
// headline cards (components/tabs/Home.js's own <Headlines>, built from
// lib/headlines.js's buildHeadlines()) that rolls right-to-left on its own,
// pauses under the pointer, and where every card is a tap. The Six's own
// "headliner" treatment (below) is a different pattern -- one card pulled
// out of a fixed six-up grid, not a rolling strip of several -- so it stays
// exactly as it is; this is the strip MOONSHOT's Home actually has and
// TUDDY's didn't. Same card shape (icon + tag + name + why + stat, 232px,
// two copies back to back for a seamless loop), built from
// lib/nfl/headlines.js's buildNflHeadlines() -- the bot's #1, the
// high-confidence flag, the aligned-signal stack, the softest matchup, the
// game to circle.
export default function NflHeadlineStrip({ players, games, markets, matchup, onPlayerClick, setTab }) {
  const cards = useMemo(
    () => buildNflHeadlines({ players, games, markets, matchup }),
    [players, games, markets, matchup],
  )
  const stripRef = useRef(null)
  useAutoScroll(stripRef, { speed: 30 })
  if (!cards.length) return null
  const open = (c) => (c.p ? onPlayerClick?.(c.p, 'TD') : c.nav ? setTab?.(c.nav) : null)
  const Card = ({ c, i, echo }) => (
    <button type="button" tabIndex={echo ? -1 : 0} aria-hidden={echo || undefined} onClick={() => open(c)}
      className="tuddy-headline-card" style={{ '--card-col': c.col }}>
      <span className="tuddy-headline-top">
        <span className="tuddy-headline-num">{String(i + 1).padStart(2, '0')}</span>
        <span className="tuddy-headline-tag">{c.tag}</span>
        <span className="tuddy-headline-icon">{c.icon}</span>
      </span>
      <span className="tuddy-headline-name">{c.name}</span>
      <span className="tuddy-headline-bottom">
        <span className="tuddy-headline-why">{c.why}</span>
        <span className="tuddy-headline-stat">{c.stat}</span>
      </span>
    </button>
  )
  return (
    <div className="tuddy-headlines">
      <div className="tuddy-headlines-rule">
        <span>HEADLINES</span>
        <i />
        <em>{cards.length} · tap any · swipe or let it roll</em>
      </div>
      <div className="tuddy-headlines-viewport" ref={stripRef}>
        <div className="tuddy-headlines-track">
          {cards.map((c, i) => <Card key={c.k} c={c} i={i} />)}
          {cards.map((c, i) => <Card key={`${c.k}-echo`} c={c} i={i} echo />)}
        </div>
      </div>
      <style>{`.tuddy-headlines{margin-top:2px}.tuddy-headlines-rule{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}.tuddy-headlines-rule>span{font:900 8px/1 ${NUM_FONT};letter-spacing:.16em;color:${C.text3}}.tuddy-headlines-rule>i{flex:1;height:1px;background:linear-gradient(90deg,${C.green}66,transparent)}.tuddy-headlines-rule>em{font:700 8px/1 ${NUM_FONT};color:${C.text3};font-style:normal}.tuddy-headlines-viewport{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)}.tuddy-headlines-track{display:flex;gap:12px;width:max-content;padding-bottom:2px}.tuddy-headline-card{display:grid;grid-template-rows:auto 1fr auto;gap:3px;width:232px;min-height:104px;flex-shrink:0;padding:10px 12px 9px;border-radius:10px;border:1px solid color-mix(in srgb,var(--card-col) 20%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--card-col) 8%,transparent),${C.bg2} 70%);color:inherit;text-align:left;cursor:pointer;font:inherit}.tuddy-headline-top{display:flex;align-items:center;gap:6px}.tuddy-headline-num{font:900 9px/1 ${NUM_FONT};color:var(--card-col)}.tuddy-headline-tag{font:900 8px/1 ${NUM_FONT};letter-spacing:.14em;color:var(--card-col)}.tuddy-headline-icon{margin-left:auto;font-size:13px;line-height:1}.tuddy-headline-name{font-size:13px;font-weight:800;letter-spacing:-.01em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tuddy-headline-bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}.tuddy-headline-why{font-size:10.5px;color:${C.text2};line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.tuddy-headline-stat{font:900 8px/1 ${NUM_FONT}`}</style>
    </div>
  )
}
