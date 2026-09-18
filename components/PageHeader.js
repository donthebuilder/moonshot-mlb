'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'

// ── THE PAGE HEADER, ONE COMPONENT FOR BOTH PRODUCTS (2026-09-18) ──────────
// Donovan, on why MOONSHOT and TUDDY still read as two sites: "imagine
// building a house with the same window just looking in two different rooms."
// The clone-parity audit (claude/clone-parity-audit-2026-09-18.md) found the
// single biggest cause of the mismatch: components/ui.js's PanelTitle framed
// 18 of MOONSHOT's tab pages, and NOTHING under components/nfl/ ever imported
// it -- every TUDDY page hand-rolled its own hero instead, at its own size, in
// its own tag, in its own voice. nfl/tabs/Home.js had even grown a SECOND
// local function called PanelTitle with a different prop shape.
//
// This is that one window frame. It is deliberately the union of what the two
// products were already doing, not a new design:
//   - MOONSHOT's PanelTitle           -> title + sub + right
//   - TUDDY's hand-rolled page heroes -> eyebrow + title + note + a stat block
// so an MLB page passing the old three props renders EXACTLY the markup it
// rendered before (same .panel-title class, same <h2>, same 24px, same right
// slot as last child -- MobileCSS.js targets all three by selector), and a
// TUDDY page can express its whole hero without inventing CSS again.
//
// THEME. components/ui.js reads MLB's C; components/nfl/** reads its own C
// from lib/nfl/theme. Rather than fork the component per sport, `theme` and
// `numFont` are optional props defaulting to MOONSHOT's -- the same
// sport-adapter pattern ScoreRail.js already uses (and the reason a TUDDY page
// keeps its own jade/cyan accent without a second file existing).
//
// TITLE SIZE. 24 is what PanelTitle has always hardcoded and what TUDDY's own
// heroes settled on independently (.nfl-games-hero h1 was 24px too), so it is
// the honest shared value today. It matches neither TYPE.title (17) nor
// TYPE.display (28) -- that is a real, pre-existing orphan number on the MLB
// side, and folding it into the type scale is its own decision, not something
// to change quietly while unifying the markup.

function StatBlock({ stats, accent, T, numFont }) {
  return (
    <div className="page-header-stats" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
      {stats.filter(Boolean).map((s) => (
        <div key={s.label} style={{ textAlign: 'right' }}>
          <div style={{ color: s.tone || accent, font: `900 14px/1 ${numFont}` }}>
            {s.dot && <span className="tuddy-live-dot-sm" aria-hidden="true" />}
            {s.value}
          </div>
          <div style={{ marginTop: 3, color: T.text3, font: `800 7px/1 ${numFont}`, letterSpacing: '.08em' }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * @param {string}   [eyebrow]  small tracked kicker above the title (TUDDY uses it, MOONSHOT mostly doesn't)
 * @param {node}     title      the page's name
 * @param {node}     [sub]      the short mono count/context line PanelTitle has always had
 * @param {node}     [note]     one sentence saying what the page is for
 * @param {node}     [right]    the page's own controls (mode pills, view toggles)
 * @param {Array}    [stats]    [{ value, label, tone?, dot? }] — the hero stat block
 * @param {string}   [accent]   eyebrow/stat colour; defaults to the theme's own accent
 * @param {object}   [theme]    a C object; defaults to MOONSHOT's
 * @param {string}   [numFont]  defaults to MOONSHOT's NUM_FONT (identical string to TUDDY's today)
 */
export default function PageHeader({
  eyebrow = null,
  title,
  sub = null,
  note = null,
  right = null,
  stats = null,
  accent = null,
  theme = null,
  numFont = null,
  style = null,
}) {
  const T = theme || MLB_C
  const NF = numFont || MLB_NUM
  const ac = accent || T.orange || T.green || T.text2
  const hasStats = Array.isArray(stats) && stats.filter(Boolean).length > 0
  // The right-hand side is ONE element so that MobileCSS's
  // `.panel-title > :last-child:not(:first-child)` rule keeps meaning "the
  // controls", exactly as it did when PanelTitle only ever had two children.
  const rightSide = (hasStats || right) ? (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
      {hasStats && <StatBlock stats={stats} accent={ac} T={T} numFont={NF} />}
      {right}
    </div>
  ) : null

  return (
    <div
      className="panel-title"
      style={{
        display: 'flex', justifyContent: 'space-between', gap: 8,
        alignItems: 'end', flexWrap: 'wrap', margin: '4px 0 14px', ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{ color: ac, font: `900 8px/1 ${NF}`, letterSpacing: '.12em', marginBottom: 5 }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ fontSize: 24, margin: '0 0 3px', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.15 }}>
          {title}
        </h2>
        {sub && <div style={{ fontSize: 11, color: T.text3, fontFamily: NF }}>{sub}</div>}
        {note && (
          <div style={{ marginTop: sub ? 3 : 0, maxWidth: 640, fontSize: 11, lineHeight: 1.45, color: T.text3 }}>
            {note}
          </div>
        )}
      </div>
      {rightSide}
    </div>
  )
}
