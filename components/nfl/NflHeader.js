'use client'
import { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react'
import { NFL_NAV, NFL_MORE_GROUPS } from '../../lib/routes'
import { C, NUM_FONT, GRADIENT } from '../../lib/nfl/theme'
import { setSport } from '../../lib/sport'
import PaletteButton from '../PaletteButton'
import ThemeModeButton from '../ThemeModeButton'
import AlertBell from './AlertBell'
import SignUpPill from '../SignUpPill'

// Same helper as components/Header.js -- kept as its own tiny copy here
// rather than shared, matching how this file already keeps its own C
// (lib/nfl/theme.js) instead of importing MOONSHOT's.
const hexToRgba = (hex, a) => {
  const h = String(hex).replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
// THE TICKER GETS LIVE SCORES + MORE HEADLINES (2026-09-06). Donovan: "the
// roatating thing needs more stats and headlines things." MOONSHOT's header
// has carried live scores + leader stat lines since the ticker rework
// earlier today (lib/headlines.js's useLiveScores) -- TUDDY's own ticker
// never picked them up because it renders a fixed set of slate-projection
// Tiles, not a live feed. Same hook MOONSHOT's Scorebug uses.
//
// SEAMLESS ACROSS THE SITE (2026-09-17). Donovan: "its not showing the
// bsasbll game ... i just want the hader to be seamleass acrre those whole
// site." This used to call the hook as `useLiveScores({ nfl: true })` and
// then immediately `.filter((i) => i.sport === 'nfl')` -- but the hook
// fetches MLB's schedule unconditionally regardless of that `nfl` flag (read
// lib/headlines.js: `pullMlb`/`pullYday`/`pullLines` never check it), so
// this was throwing away MLB scores it had already paid for the network
// call to fetch, for no reason. Removed. Both sports now ride the same
// strip, same as MOONSHOT's header always has -- see `liveItems` below.
import { useLiveScores, useAutoScroll } from '../../lib/headlines'
// Real, icon-tagged NFL story-bites -- see lib/nfl/headlines.js's own
// header comment. NFL equivalent of buildHeadlines() above.
import { buildNflHeadlines } from '../../lib/nfl/headlines'

// The colour key, in football's words. PaletteButton used to render MOONSHOT's
// four pick jobs (Home run / Base hit / Runs + RBI / Total bases) on this
// header. Same seven accents Accountability.js assigns per market.
const NFL_JOBS = () => [
  { key: 'TD', label: 'Anytime TD', color: C.green },
  { key: 'REC YDS', label: 'Receiving yards', color: C.cyan },
  { key: 'REC', label: 'Receptions', color: C.lime },
  { key: 'RUSH YDS', label: 'Rushing yards', color: C.blue },
  { key: 'CARRIES', label: 'Rush attempts', color: C.purple },
  { key: 'PASS YDS', label: 'Passing yards', color: C.orange },
  { key: 'KICK', label: 'Kicking points', color: C.yellow },
]

// Order matches the mobile bottom bar (MobileTabBarNfl.js: Home · Boards ·
// Games · Picks) and MOONSHOT's own bar shape — the 2026-08-29 review caught
// the two rails listing the same destinations in two different orders, which
// makes muscle memory impossible for anyone who uses both widths.
// ── THE TICKER SHELL (2026-09-16 — SAME MECHANISM AS MOONSHOT NOW) ──────────
// Donovan, both headers side by side: "why are the roatating headliner thing
// different... the tuddy page [is] spinnin so fast." It was a real bug, and
// it was this component: the loop used to be a CSS @keyframes slide whose
// duration was `8 * copies` seconds, `copies` a whole number picked only to
// cover 2x the viewport width. That makes the actual px/s rate a function of
// how much content is in the track, not a fixed speed -- so the 2026-09-16
// headline-bite batch, which pushed up to five more tiles into this exact
// strip, grew the track without growing its duration to match, and the ride
// visibly sped up the moment those tiles shipped. MOONSHOT's own ticker
// (components/Header.js's Scorebug) was never built this way: it drives
// el.scrollLeft itself at a literal, content-independent 55px/s, through
// lib/headlines.js's shared useAutoScroll hook. Rather than re-tune the
// keyframe math a second time and drift again the next time either ticker
// grows a tile, this now calls that exact hook -- same file, same speed,
// same mechanism as MOONSHOT, so the two cannot disagree about how fast the
// slate scrolls. useAutoScroll's own math assumes exactly two identical
// copies in the track (it halves scrollWidth to find the loop point), so
// children render twice via Children.toArray, the same trick Scorebug's own
// items.map() done twice does with plain data. Hover/touch pausing is the
// hook's own built-in behavior (same as Scorebug) -- no separate pause
// button, because MOONSHOT's ticker doesn't have one either.
function TickerStrip({ children }) {
  const trackRef = useRef(null)
  useAutoScroll(trackRef, { speed: 55 })
  const items = Children.toArray(children)
  return (
    <div
      ref={trackRef}
      className="nfl-ticker-shell"
      style={{
        flex: '1 1 320px', minWidth: 0, overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none', lineHeight: 1, maxWidth: '100%',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 10px, #000 calc(100% - 22px), transparent)',
        maskImage: 'linear-gradient(90deg, transparent, #000 10px, #000 calc(100% - 22px), transparent)',
      }}
    >
      <div className="nfl-tiles-set nfl-ticker-track" style={{ width: 'max-content' }}>
        {items}
        {items.map((el, i) => cloneElement(el, { key: `echo-${i}`, 'aria-hidden': true }))}
      </div>
    </div>
  )
}

// ── LABELS COME FROM lib/routes.js (2026-09-03) ─────────────────────────────
//
// Same fix MOONSHOT got the same day, for the same reason: this file, the
// phone bar and the route table each carried their own list and `home` was
// "Home" here, "Tonight" on the phone and "This week" in the table. Three
// names for one page, and the phone had borrowed a baseball word -- football's
// unit is a week, not a night.
//
// `home` left the rail. The TUDDY WORDMARK is the home button now (see where
// it renders), which is where a home button belongs and is visible on a phone;
// only the tab rail hides below 760px, not the brand row.
//
// Desktop and the phone bar no longer carry identical stops, on purpose, same
// as MOONSHOT's own two bars don't (MOONSHOT's phone bar drops `bot`/Picks to
// stay at four; this one already dropped Picks the same way, 2026-09-16).
// Boards joined this bar 2026-09-17, promoted from the drawer once round 8
// gave it real depth -- see lib/routes.js's NFL_NAV comment above `boards`.
// The phone bar picks it up too (components/nfl/MobileTabBarNfl.js), trading
// away Research to stay at four stops rather than growing the bar there.
const PRIMARY_KEY_LIST = ['touchdowns', 'boards', 'games', 'picks', 'research', 'storylines']
const PRIMARY_TABS = PRIMARY_KEY_LIST.map((k) => [k, `${NFL_NAV[k].icon} ${NFL_NAV[k].label}`])
const PRIMARY_KEYS = new Set(PRIMARY_KEY_LIST)
// Same exception as MOONSHOT's: This week is reached from the wordmark, so it
// must not make ••• More read as the active section.
const inMore = (key) => !PRIMARY_KEYS.has(key) && key !== 'home'

// The NFL header. Deliberately the same silhouette as the MLB one — logo tile
// left, status strip centre, controls right, tab rail underneath — so the
// switch feels like changing channel, not changing site. Only the accents move.

// Shared box for every ticker chip, tappable or not -- pulled out so the
// tappable branch below doesn't duplicate it with slightly different values
// and drift out of sync the way the two headers themselves used to.
const tileBox = (color) => ({
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '5px 13px', borderRadius: 9,
  background: `linear-gradient(135deg, ${color}1e, ${color}08)`,
  border: `1px solid ${color}4d`,
})

// TAPPABLE NOW (2026-09-17). MOONSHOT's own ticker pill has always been a
// <button> with an onClick -- see components/Header.js's `Pill`. This one was
// a plain <div>, so nothing in TUDDY's strip ever responded to a tap. `onClick`
// is optional: the static slate-projection tiles (Games, Proj TD, Pool, etc.)
// have nowhere to navigate to and stay inert divs, same as before. Only the
// live-score and headline tiles below pass one in.
function Tile({ label, value, color, title, live = false, onClick }) {
  const interactive = typeof onClick === 'function'
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
      <span style={{
        fontSize: 7.5, color: C.text3, textTransform: 'uppercase',
        letterSpacing: '.09em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {/* Reuses the same @keyframes pulse this file already defines for
            the account menu -- one animation, two consumers, not a second
            copy. */}
        {live && <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: color, animation: 'pulse 2s infinite' }} />}
        {label}
      </span>
      <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color }}>{value}</span>
    </div>
  )
  if (interactive) {
    return (
      <button type="button" onClick={onClick} title={title} style={{
        ...tileBox(color), cursor: 'pointer', color: 'inherit', font: 'inherit',
      }}>
        {inner}
      </button>
    )
  }
  return (
    <div title={title} style={tileBox(color)}>
      {inner}
    </div>
  )
}


// Same convention as components/Header.js's SettingsSheet -- one (gear)
// icon instead of the palette + light/dark buttons sitting loose in the
// header at all times. Own copy, own accent (green, not MOONSHOT's
// orange), because this file already keeps its own C rather than sharing
// MOONSHOT's -- same reasoning as this file's local hexToRgba.
function NflSettingsSheet() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        title="View settings — palette, light/dark"
        style={{
          width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: `1px solid ${open ? `${C.green}66` : C.border}`, background: open ? `${C.green}1f` : C.glass,
          color: open ? C.green : C.text2, fontSize: 14, transition: 'transform .12s, background .12s',
          transform: open ? 'rotate(30deg)' : 'none',
        }}>⚙</button>
      {open && (
        <div role="dialog" aria-label="View settings" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 60, minWidth: 200,
          background: hexToRgba(C.bg2, .98), border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: '10px 10px 8px', display: 'grid', gap: 8,
        }}>
          <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '.14em', color: C.text3, textTransform: 'uppercase' }}>View</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <PaletteButton jobs={NFL_JOBS()} accent={C.green} />
            <ThemeModeButton />
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>Palette · light/dark. Sticks on this device.</div>
        </div>
      )}
    </div>
  )
}

export default function NflHeader({ tab, setTab, data, meta, matchup, onPlayerClick }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const go = (next) => { setMoreOpen(false); setTab(next) }
  const games = data?.games?.length ?? 0
  const live = (data?.games || []).filter((g) => g.state === 'in').length
  const isPre = data?.mode === 'preseason'

  // What the header used to say was "3 games, 102 players", which is a
  // description of the file, not of the slate. These two are the output:
  // how many touchdowns the card projects, and how many plays cleared A-.
  const rows = data?.players || []
  const projTd = rows.reduce((a, p) => a + (p.stats?.xTD || 0), 0)
  const aGrade = rows.filter(
    (p) => Math.max(...Object.values(p.scores || { _: 0 })) >= 62).length
  // The four the strip was missing. Home already shows the first two on its
  // hero; the other two are one reduce each and are the questions people
  // actually arrive with -- which game, and when.
  const topTd = rows.reduce(
    (best, p) => ((p?.scores?.TD ?? -1) > (best?.scores?.TD ?? -1) ? p : best), null)

  // TWO MORE HEADLINE PICKS (2026-09-06): the strip had a touchdown threat
  // and a game to circle, and nothing for the two other jobs on the board --
  // who's getting the ball on the ground, and who's getting it in the air.
  // Same reduce-over-rows shape as topTd, same 0-100 grade the board itself
  // ranks by (scores.RUSH_YDS / scores.REC_YDS), so "top rusher" here means
  // the same thing "top rusher" means on the Boards tab.
  const topRush = rows.reduce(
    (best, p) => ((p?.scores?.RUSH_YDS ?? -1) > (best?.scores?.RUSH_YDS ?? -1) ? p : best), null)
  const topRec = rows.reduce(
    (best, p) => ((p?.scores?.REC_YDS ?? -1) > (best?.scores?.REC_YDS ?? -1) ? p : best), null)

  // LIVE SCORES + LEADERS RIDE THE TICKER TOO (2026-09-06; unfiltered
  // 2026-09-17). Same hook MOONSHOT's header ticker uses, and now the same
  // BOTH-SPORTS output -- see the import comment above for why the old
  // `.filter((i) => i.sport === 'nfl')` was actively throwing away data the
  // hook had already fetched. `data.games` above is the slate's own
  // projections payload (has a staleness clock, gets rebuilt on a schedule)
  // -- this is the actual live ESPN/MLB poll, so during a real Sunday these
  // two sources can (correctly) disagree about which games are "live" right
  // now.
  const liveItems = useLiveScores().items

  // REAL HEADLINE STORY-BITES (2026-09-16). Same idea as MOONSHOT's
  // ticker: live scores plus a handful of real, icon-tagged "what does
  // the model actually think" bites, not just aggregate counts.
  const heads = useMemo(
    () => buildNflHeadlines({ players: rows, games: data?.games || [], markets: data?.markets || [], matchup }),
    [rows, data?.games, data?.markets, matchup],
  )

  // WHERE A TAP ON A LIVE/HEADLINE TILE GOES (2026-09-17). Mirrors
  // components/Header.js's own `open()` exactly in spirit -- a player bite
  // opens the player, an item for the other product switches products, an
  // item for this one jumps to the page that shows it -- but the
  // destinations are TUDDY's own, not copied verbatim: `useLiveScores()`
  // items only carry `nav: 'nfl'`/`'scoreboard'` meanings that make sense
  // from MOONSHOT's side (see lib/headlines.js); from inside TUDDY itself,
  // an MLB item's job is "send me to MOONSHOT" and an NFL item's job is
  // "show me TUDDY's own live scores" -- `live` in lib/routes.js's alias
  // table, confirmed to resolve to TUDDY's scoreboard tab. Four of
  // buildNflHeadlines's five bite types (THE BOT'S #1, HIGH-CONFIDENCE,
  // SIGNAL STACK, SOFTEST MATCHUP) carry a real player row on `.p` -- same
  // shape `openPlayer` already takes from every other TUDDY tab (Touchdowns,
  // Boards, Games, ...), so this reuses the same `onPlayerClick` prop rather
  // than inventing a second way to open a player. The fifth (GAME TO CIRCLE)
  // carries `nav: 'games'` instead. A bite with neither renders but does
  // nothing, same honesty rule MOONSHOT's `open()` uses.
  const openTile = (it) => {
    if (it.p) onPlayerClick?.(it.p)
    else if (it.sport === 'mlb') setSport('mlb')
    else if (it.sport === 'nfl') go('live')
    else if (it.nav) go(it.nav)
  }

  // Expected touchdowns summed per team, then per matchup. Same shape as
  // MOONSHOT's "best game" tile, so the two products read alike.
  const bestGame = (() => {
    const byTeam = new Map()
    for (const p of rows) {
      const t = String(p?.team || '').toUpperCase()
      if (!t) continue
      byTeam.set(t, (byTeam.get(t) || 0) + (p?.stats?.xTD || 0))
    }
    let top = null
    for (const g of (data?.games || [])) {
      const total = (byTeam.get(String(g.away || '').toUpperCase()) || 0)
        + (byTeam.get(String(g.home || '').toUpperCase()) || 0)
      if (!top || total > top.total) top = { total, label: `${g.away} @ ${g.home}` }
    }
    return top && top.total > 0 ? top : null
  })()

  const nextKick = (data?.games || [])
    .filter((g) => g?.state === 'pre' && g?.kickoff)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0] || null

  // Formatted in an effect, never during render: a kickoff rendered in the
  // server's timezone and again in the reader's is a hydration mismatch, and
  // this is a sticky header that would flash on every load.
  const [kickLabel, setKickLabel] = useState('—')
  useEffect(() => {
    const t = Date.parse(nextKick?.kickoff || '')
    setKickLabel(Number.isFinite(t)
      ? new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : '—')
  }, [nextKick?.kickoff])

  const builtAt = meta?.built_at || data?.built_at || ''
  const builtAtMs = Date.parse(builtAt)
  const ageHours = Number.isFinite(builtAtMs) ? Math.max(0, (Date.now() - builtAtMs) / 3_600_000) : 0
  const stale = ageHours >= 24
  const ageLabel = ageHours >= 48
    ? `${Math.floor(ageHours / 24)} days`
    : ageHours >= 24
      ? `${Math.floor(ageHours)} hours`
      : ''
  // ── #22: THE BUILD STAMP NEVER SAID HOW OLD IT WAS ───────────────────────
  //
  // The whole NFL pipeline was found ~8 hours stale, with the same timestamp
  // on the lines check and on the last grading, while MLB odds had run 35
  // minutes prior. The question that raised -- "is this a once-daily run, or
  // has it stalled?" -- could not be answered from the page, because the
  // header printed the build time as a bare stamp and only reacted at 24
  // hours. A reader should not have to subtract from a timestamp in another
  // timezone to find out whether what they are looking at is current.
  //
  // The age is always on screen now. It states nothing about the cadence,
  // which this page does not know; it just does the subtraction.
  const freshLabel = !Number.isFinite(builtAtMs) ? ''
    : ageHours < 1 ? `${Math.max(1, Math.round(ageHours * 60))}m ago`
      : ageHours < 48 ? `${Math.round(ageHours)}h ago`
        : `${Math.floor(ageHours / 24)}d ago`
  const freshCol = ageHours >= 24 ? C.orange : ageHours >= 8 ? C.yellow : C.text3

  const tabBtn = (key, label, active, onClick, extra = {}) => (
    <button key={key} onClick={onClick} {...extra} style={{
      padding: '0 10px', height: 44, fontSize: 11.5, fontWeight: active ? 800 : 600, letterSpacing: '.01em',
      cursor: 'pointer', border: 'none', borderRadius: 0, background: 'transparent',
      color: active ? C.green : C.text3, position: 'relative', transition: 'color .12s',
      whiteSpace: 'nowrap', flex: '1 1 0', textAlign: 'center',
    }}>
      {label}
      {active && <div style={{
        position: 'absolute', bottom: 0, left: 8, right: 8, height: 2,
        background: GRADIENT, borderRadius: '2px 2px 0 0',
      }} />}
    </button>
  )

  return (
    // NOT STICKY (2026-09-06) — same rule MOONSHOT's header got the same
    // day: Donovan, "no sticky header. once you scroll don't add that,
    // ever." It scrolls away with the page now; the bottom bar owns
    // navigation once you're down the page, same as MOONSHOT.
    <header className={tab === 'home' ? undefined : 'hdr-slate-on'} style={{
      position: 'relative', zIndex: 50,
      background: hexToRgba(C.bg, 0.92), backdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* ── THREE ROWS, SAME SHAPE AS MOONSHOT'S (2026-09-06) ─────────────
          brand + meta, then the moving ticker at full width, then the tab
          rail splitting the row evenly — instead of one row cramming brand,
          ticker and controls together and a horizontally-scrolling tab
          strip sized to whatever each label happened to need. */}
      <div className="nfl-hdr-row1" style={{
        maxWidth: 1300, margin: '0 auto', padding: '10px 16px 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* The mark is the way home, same as MOONSHOT's (2026-08-31). ⌂ DASH
              HOME lives in the More drawer on both products, and "More" is
              where you look for more of THIS sport, not for the way out of it.
              The top-left logo is the one navigation convention a first-time
              visitor already knows. Only the square mark links; the TUDDY
              wordmark names the product you are already in. */}
          <a href="/" title="DASH Network home — MOONSHOT · TUDDY · FRANCHISE"
            aria-label="DASH Network home"
            style={{ display: 'flex', textDecoration: 'none', borderRadius: 10 }}>
          <div className="nfl-hdr-mark" style={{
            position: 'relative', width: 46, height: 46, borderRadius: 12,
            boxShadow: `0 0 18px ${C.green}75`, cursor: 'pointer',
          }}>
            {/* The DASH Network monogram, identical on MOONSHOT -- same 46px size
                as Header.js's mark (2026-09-16 fix, was 34px and read as a lighter-
                weight brand mark next to MOONSHOT's). One mark, one destination; the
                green TUDDY wordmark beside it says where you are. */}
            <img src="/icon-192.png" alt="" width={46} height={46}
              style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12 }} />
            {live > 0 && (
              <div style={{
                position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                borderRadius: '50%', background: C.cyan, border: '2px solid #09090b',
                animation: 'pulse 2s infinite',
              }} />
            )}
          </div>
          </a>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              {/* THE WORDMARK IS TUDDY'S HOME BUTTON (2026-09-03), exactly as
                  MOONSHOT's is. This week gave up its slot in the rail; this is
                  where it went, and it is also the way back for anyone several
                  sub-views deep, which the rail never had. The square mark
                  beside it still goes to the network. Two marks, two homes. */}
              <button
                type="button"
                onClick={() => go('home')}
                title="TUDDY home — this week in one page"
                aria-label="TUDDY home"
                style={{
                  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1,
                  backgroundImage: GRADIENT, WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >TUDDY</button>
              {/* Tuddy is the NFL product inside DASH Network. */}
              {/* ── TUDDY'S PILLS GET MOONSHOT'S FIX (2026-08-29) ──────────
                  Donovan's screenshot showed the NFL bubble riding above the
                  MLB one on a phone. Same two stacked bugs MOONSHOT fixed on
                  2026-08-23 and this file never got: MLB was a <button> and
                  NFL a plain <span>, so the blanket thumb-target rule hit one
                  and not the other, and the row had no align-items, so the
                  span stretched to match. Now both are buttons with the same
                  explicit capsule geometry, and the row centres instead of
                  stretching. (On a phone the whole strip is hidden anyway —
                  the bottom bar's More sheet owns product switching now — but
                  the desktop pair has to be right, and a shape bug that only
                  hides is still a shape bug.) */}
              {/* ONE BUTTON, NOT TWO (2026-09-06). MOONSHOT's header
                  dropped its own self-referential "MLB" pill the same day,
                  since a product's header already says which product you're
                  in — the pill only needs to name the OTHER one. */}
              <span className="sport-switch" style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 5, alignSelf: 'center' }}>
                <button onClick={() => setSport('mlb')} aria-pressed={false}
                  title="Switch to MOONSHOT · MLB" aria-label="Switch to MOONSHOT · MLB"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: 20, minHeight: 20, padding: '0 9px', lineHeight: 1,
                    fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', borderRadius: 999,
                    cursor: 'pointer',
                    border: `1px solid ${C.orange}70`,
                    background: `${C.orange}10`,
                    color: C.orange,
                  }}>MOONSHOT</button>
              </span>
            </div>
          </div>
        </div>

        {/* ── date/build · account · settings — row 1's right side ────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="nfl-header-built"
            title="When the NFL pipeline last published. Everything on TUDDY — the slate, the picks, the lines check and the grading — comes out of that one run."
            style={{
              fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {/* Same pulsing-dot language the ticker's `live` tiles already
                use -- the freshness readout IS a live signal, item 22 built
                it so a reader never has to do the subtraction themselves,
                so it should look like one instead of sitting as flat text. */}
            <span aria-hidden="true" style={{
              width: 5, height: 5, borderRadius: '50%', background: freshCol,
              animation: 'pulse 2s infinite', flex: 'none',
            }} />
            {meta?.built_at_human || data?.built_at_human || '—'}
            {freshLabel && <b style={{ color: freshCol, fontWeight: 800 }}>{` · ${freshLabel}`}</b>}
          </span>
          {/* THE ACCOUNT IS OPTIONAL NOW (2026-09-06) — see proxy.js. */}
          <SignUpPill accent={C.green} />
          <AlertBell />
          <NflSettingsSheet />
        </div>
      </div>

      {/* ── row 2: THE MOVING TICKER, ABOVE THE TABS (2026-09-06) ────────
          Same move MOONSHOT's header made the same day: the strip gets a
          full-width row of its own instead of splitting space with the
          brand and the account controls, which is what used to squeeze it
          down to three tiles wide on anything but a very wide desktop. */}
      <div className="nfl-header-tiles" style={{
        maxWidth: 1300, margin: '0 auto', padding: '0 16px 8px',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0,
      }}>
          {/* ── TUDDY GETS THE MOVING STRIP (2026-08-29, mechanism replaced 2026-09-16) ──
              Donovan: "we need to add the moving headline thing on top for
              nfl." MOONSHOT has had it since 2026-08-24 (SlateTiles.js); NFL
              had the same numbers sitting still in a wrapped grid.

              TickerStrip used to run its own CSS @keyframes loop (see its
              own header comment for why that broke -- speed rode on tile
              count instead of being fixed). It now calls the exact same
              lib/headlines.js useAutoScroll hook MOONSHOT's own header
              ticker uses, at the same 55px/s, so the two cannot go out of
              sync again just because one of them grows a tile. The set still
              renders twice into one track (that hook's own loop math
              requires it) and the echo is still aria-hidden -- a visual
              repeat, not new content.

              Layout is TUDDY's own (.nfl-tiles-set) because these tiles size
              from their content, not MOONSHOT's fixed 104px cells. The
              PRESEASON chip deliberately stays OUTSIDE the ticker: it is a
              data caveat that must not scroll away, and it is the one thing
              the mobile header diet keeps. */}
          <TickerStrip>
            <Tile label="Games" value={games} color={C.blue} title="Games on this slate" />
            <Tile
              label="Proj TD"
              value={projTd ? projTd.toFixed(1) : '—'}
              color={C.green}
              title={`Expected touchdowns across the ${rows.length} players scored on this slate — the sum of each man's xTD.${
                isPre ? ' Preseason caveat: xTD is last season\'s per-game rate at full usage, and starters play two series. Read it as the ceiling, not the projection.' : ''}`}
            />
            <Tile label="A-grade" value={aGrade} color={C.cyan}
                  title="Players clearing A- (62) in at least one market" />
            <Tile label="Pool" value={rows.length} color={C.text2}
              title="Players this slate scored — the pool every board on TUDDY is drawn from" />
            <Tile label="Top TD" value={topTd?.scores?.TD ? Math.round(topTd.scores.TD) : '—'} color={C.green}
              title={topTd?.name ? `${topTd.name} — the highest anytime-touchdown score on the slate` : 'No scored players yet'} />
            <Tile label="Best game" value={bestGame ? bestGame.label : '—'} color={C.cyan}
              title={bestGame ? `${bestGame.label} — ${bestGame.total.toFixed(1)} expected touchdowns between the two, the most on the slate` : 'No games scored yet'} />
            <Tile label="Top rusher" value={topRush?.scores?.RUSH_YDS ? Math.round(topRush.scores.RUSH_YDS) : '—'} color={C.orange}
              title={topRush?.name ? `${topRush.name} — ${Number(topRush.stats?.RUYD || 0).toFixed(1)} rush yds/game season average` : 'No scored players yet'} />
            <Tile label="Top receiver" value={topRec?.scores?.REC_YDS ? Math.round(topRec.scores.REC_YDS) : '—'} color={C.purple}
              title={topRec?.name ? `${topRec.name} — ${Number(topRec.stats?.RECYD || 0).toFixed(1)} rec yds/game season average` : 'No scored players yet'} />
            <Tile label={live > 0 ? 'Live' : 'Kickoff'} value={live > 0 ? live : kickLabel}
              color={live > 0 ? C.yellow : C.text2}
              title={live > 0 ? 'Games in progress' : (nextKick ? `Next kickoff: ${nextKick.away} @ ${nextKick.home}` : 'Nothing scheduled')} />
            {/* LIVE, FROM ESPN + MLB, NOT FROM THE SLATE PAYLOAD (2026-09-06;
                both sports 2026-09-17). One tile per live/final game, a
                leader tile right after each -- same order MOONSHOT's ticker
                uses (score, then up to two stat-line leaders), same
                useLiveScores() output shape. Every tile here is tappable --
                see `openTile` above. */}
            {liveItems.map((i) => (
              <Tile
                key={i.k}
                label={`${i.icon ? `${i.icon} ` : ''}${i.sub || (i.live ? 'live' : i.pregame ? 'kickoff' : 'final')}`}
                value={i.text}
                color={i.col}
                live={!!i.live}
                onClick={() => openTile(i)}
                title={
                  i.sport === 'mlb'
                    ? (i.kind === 'leader' ? `Leading this game's stat line on MOONSHOT — tap to switch` : `${i.live ? 'Live on MOONSHOT' : i.pregame ? 'Not underway yet' : 'Final'} — tap to switch to MOONSHOT`)
                    : (i.kind === 'leader' ? `Leading this game's stat line` : (i.live ? 'Live now — open TUDDY’s Live tab' : i.pregame ? 'Not underway yet — open TUDDY’s Live tab' : 'Final — open TUDDY’s Live tab'))
                }
              />
            ))}
            {/* REAL STORY-BITES (2026-09-16) -- MOONSHOT's ticker equivalent.
                Icon folded into the label like Header.js's Pill does; `why`
                carries the reasoning as the tooltip, same as MOONSHOT.
                Tappable now too: a `.p` bite opens that player, a `.nav`
                bite (GAME TO CIRCLE) jumps to Games. */}
            {heads.map((h) => (
              <Tile key={`h-${h.k}`} label={`${h.icon} ${h.tag}`} value={h.name} color={h.col} title={h.why}
                onClick={(h.p || h.nav) ? () => openTile(h) : undefined} />
            ))}
          </TickerStrip>
          {isPre && (
            <div
              className="nfl-header-preseason"
              title="Preseason: starters play two series, so weekly form does not exist yet. Every board here is built from last season's per-game baselines and says so on each row."
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                borderRadius: 9, background: `${C.yellow}24`, border: `1px solid ${C.yellow}5c`,
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 900, color: C.yellow, letterSpacing: '.08em',
              }}>PRESEASON · CARRYOVER</span>
            </div>
          )}
      </div>

      {stale && (
        <div
          role="status"
          aria-live="polite"
          style={{
            maxWidth: 1300, margin: '0 auto 6px', padding: '7px 16px',
            borderTop: `1px solid ${C.yellow}35`, borderBottom: `1px solid ${C.yellow}35`,
            background: `${C.yellow}20`, color: C.yellow, fontSize: 10.5,
            fontWeight: 800, lineHeight: 1.45,
          }}
        >
          ⚠ NFL data is {ageLabel} old · last built {meta?.built_at_human || data?.built_at_human || builtAt}. Verify the slate before using picks or odds.
        </div>
      )}

      {/* ── row 3: the rail, equal and precise, same fix MOONSHOT's got
          the same day. Was content-sized and horizontally scrolling, so
          "Research" sat narrower than "Boards" and the row read as a strip
          you had to swipe rather than a bar. tabBtn's flex is '1 1 0' now —
          every tab, including More, splits the row evenly. */}
      <nav className="rail nfl-header-rail" aria-label="TUDDY sections" style={{
        maxWidth: 1300, margin: '0 auto', padding: '0 16px 6px',
        display: 'flex', alignItems: 'stretch', width: '100%',
      }}>
        {PRIMARY_TABS.map(([key, label]) => tabBtn(key, label, tab === key, () => go(key)))}
        {tabBtn('more', 'More', inMore(tab), () => setMoreOpen((open) => !open), { 'aria-expanded': moreOpen })}
      </nav>

      {moreOpen && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:hexToRgba(C.bg2, .98) }}>
          <div className="nfl-simple-more" style={{
            maxWidth:1300, margin:'0 auto', padding:'9px 16px 11px',
            display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:6,
          }}>
            {/* The front door, same placement as MOONSHOT's More drawer. */}
            <a href="/" style={{
              gridColumn:'1/-1', display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'9px 10px', border:`1px solid ${C.border}`, borderRadius:8,
              background:C.glass, color:C.text2, fontSize:10, fontWeight:750, textDecoration:'none',
            }}>
              <span style={{ color:C.green }}>⌂ DASH HOME</span>
              <span style={{ color:C.text3, fontWeight:600 }}>This week across MOONSHOT · TUDDY · FRANCHISE →</span>
            </a>
            {/* Grouped, same as MOONSHOT's (2026-09-03). TUDDY has no orphan
                pages to rescue -- every key was already named somewhere -- so
                this is about saying what KIND of thing each one is, which is
                the half of the MLB fix that applies here. */}
            {NFL_MORE_GROUPS.map(([group, keys]) => (
              <div key={group} style={{ gridColumn:'1/-1' }}>
                <div style={{
                  fontSize:8, fontWeight:900, letterSpacing:'.14em', color:C.text3,
                  textTransform:'uppercase', margin:'8px 2px 5px',
                }}>{group}</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(118px,1fr))', gap:6 }}>
                  {keys.map((key) => (
                    <button key={key} onClick={() => go(key)} title={NFL_NAV[key].blurb} style={{
                      padding:'9px 10px', border:`1px solid ${tab === key ? C.green + '66' : C.border}`,
                      borderRadius:8, background:tab === key ? `${C.green}20` : C.glass,
                      color:tab === key ? C.green : C.text2, fontSize:10, fontWeight:750,
                      textAlign:'left', cursor:'pointer',
                    }}>{NFL_NAV[key].icon} {NFL_NAV[key].label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        header div::-webkit-scrollbar { display: none; }
        @media (max-width: 700px) {
          .nfl-simple-more { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
        /* Mobile header diet (2026-08-29 review): logo + 4 stat chips +
           preseason banner + timestamp + tab rail was ~195px of fixed chrome,
           and with the bottom bar the phone gave ~30% of its height to
           navigation before content. At the bottom bar's own breakpoint
           (760px, components/MobileTabBar.js) the bar owns tab switching, so
           the rail goes; the stat chips and timestamp go too (Home's hero
           repeats the slate context); the PRESEASON chip stays because it is
           a data caveat, not furniture. Desktop is untouched. */
        .nfl-tiles-set {
          display: flex; align-items: stretch; gap: 6px;
          padding-right: 6px; flex: none; min-width: max-content;
        }
        @media (max-width: 760px) {
          .nfl-header-rail { display: none !important; }
          /* Same mobile size as Header.js's .hdr-mark (40px). */
          .nfl-hdr-mark { width: 40px !important; height: 40px !important; }
          /* THE TICKER COMES BACK, EXCEPT ON HOME (2026-08-31). It went
             with the rest of the diet on the grounds that "Home's hero
             repeats the slate context" -- true of Home and of no other tab,
             which left a phone with no slate context at all on Boards, Live,
             Matchups or Players. Scoped to the tab now rather than the
             width: Home keeps its short header, every other tab gets the
             strip back. The PRESEASON chip was never hidden either way,
             because it is a caveat about the data and not furniture. */
          header:not(.hdr-slate-on) .nfl-header-tiles > *:not(.nfl-header-preseason) { display: none !important; }
          header:not(.hdr-slate-on) .nfl-header-tiles { flex: 0 1 auto !important; }
          .hdr-slate-on .nfl-header-tiles { flex: 1 1 100% !important; }
          /* #24 FIX (2026-09-11): the ticker got the Home-only exception
             above on 2026-08-31; the freshness clock right next to it
             (.nfl-header-built -- built_at_human + the "Xh ago" readout
             item 22 added specifically so a reader never has to subtract a
             timestamp themselves) never did, and sat unconditionally
             display:none on every tab at this width ever since -- found via
             a live offsetParent:null check on the Phase 0 scan. Home has no
             freshness readout of its own (checked: Home.js has nothing that
             reads built_at), so unlike the ticker there was never a reason
             for it to disappear anywhere -- it was just caught in the same
             blanket rule the ticker got carved out of. Same Home-only scope
             now applies to both; the yellow 24h+ stale banner below is a
             separate, rarer alert and was never affected by this. */
          header:not(.hdr-slate-on) .nfl-header-built { display: none !important; }
        }
      `}</style>
    </header>
  )
}
