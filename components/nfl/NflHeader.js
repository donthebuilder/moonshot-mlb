'use client'
import { useEffect, useRef, useState } from 'react'
import { NFL_NAV, NFL_MORE_GROUPS } from '../../lib/routes'
import { C, NUM_FONT, GRADIENT } from '../../lib/nfl/theme'
import { setSport } from '../../lib/sport'
import PaletteButton from '../PaletteButton'
import ThemeModeButton from '../ThemeModeButton'
import AlertBell from './AlertBell'
import SignUpPill from '../SignUpPill'

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
// ── THE TICKER SHELL ────────────────────────────────────────────────────────
// Renders its children twice inside one clipped track and lets MobileCSS's
// .slate-tiles animation move it (see the note at the call site). Paused, the
// echo is hidden and the real row becomes a normal sideways scroll — the same
// contract MOONSHOT's SlateTiles.js offers, so the two products behave
// identically for anyone who uses both.
function TickerStrip({ children }) {
  const [paused, setPaused] = useState(false)
  // HOW MANY COPIES (2026-08-29). MOONSHOT's ticker hardcodes two copies and a
  // 0 -> -50% slide, which is only seamless while ONE copy is at least as wide
  // as the strip that clips it. MOONSHOT runs seven tiles, so it always is.
  // TUDDY runs four, and on a 1280px header one copy is about a third of the
  // width — with two copies the track runs out mid-slide and the row scrolls
  // into an empty gap. So the set is repeated until the track is at least
  // twice the viewport, and the slide is 100/copies% (exactly one copy's
  // width) instead of a fixed 50%. Measured after layout, remeasured on
  // resize, and it degrades to the plain two-copy case if measurement is
  // unavailable.
  const [copies, setCopies] = useState(2)
  const viewportRef = useRef(null)
  const setRef = useRef(null)
  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current?.clientWidth || 0
      const one = setRef.current?.scrollWidth || 0
      if (!viewport || !one) return
      // Capped at 6: a set narrow enough to need more than that is a set
      // with nothing in it (an unpublished slate renders three empty tiles),
      // and repeating that twelve times is DOM for no one.
      setCopies(Math.min(6, Math.max(2, Math.ceil((2 * viewport) / one))))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [children])

  const shift = (100 / copies).toFixed(4)
  const name = `nflTicker${copies}`
  return (
    <div
      className={`nfl-ticker-shell slate-tiles-shell${paused ? ' ticker-paused' : ''}`}
      style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}
    >
      <div ref={viewportRef} className="slate-tiles-viewport" style={{ width: '100%', minWidth: 0, overflow: 'hidden', paddingRight: 38 }}>
        {/* The animation is applied through a CLASS, not an inline style:
            MobileCSS's own `.ticker-paused .slate-tiles { animation: none }`
            and its reduced-motion rule are class rules, and an inline
            animation would outrank both — the pause button and the OS
            motion setting would stop working. */}
        <div
          className="slate-tiles nfl-ticker-track"
          style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'stretch', width: 'max-content' }}
        >
          {Array.from({ length: copies }, (_, index) => (
            <div
              key={index}
              ref={index === 0 ? setRef : undefined}
              className={index === 0 ? 'nfl-tiles-set' : 'nfl-tiles-set slate-tiles-echo'}
              aria-hidden={index === 0 ? undefined : 'true'}
            >{children}</div>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="slate-ticker-toggle"
        aria-pressed={paused}
        aria-label={paused ? 'Resume moving slate ticker' : 'Pause moving slate ticker'}
        title={paused ? 'Resume ticker' : 'Pause ticker'}
        onClick={() => setPaused((value) => !value)}
        style={{
          position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
          zIndex: 2, width: 32, height: 32, minHeight: 32, padding: 0,
          display: 'grid', placeItems: 'center', borderRadius: 999,
          border: `1px solid ${C.border}`, background: C.bg2, color: C.text2,
          cursor: 'pointer', fontSize: 11, fontWeight: 900,
        }}
      >{paused ? '\u25B6' : '\u2161'}</button>
      <style jsx global>{`
        @keyframes ${name} { from { transform: translateX(0); } to { transform: translateX(-${shift}%); } }
        .nfl-ticker-track { animation-name: ${name}; animation-duration: ${8 * copies}s; }
        .ticker-paused .nfl-ticker-track { animation: none; }
        @media (prefers-reduced-motion: reduce) { .nfl-ticker-track { animation: none; } }
      `}</style>
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
// only the tab rail hides below 760px, not the brand row. Desktop and the
// phone bar carry the same four stops now -- the phone used to drop Research
// to make room, so the two navigations of one product disagreed about what
// mattered.
const PRIMARY_KEY_LIST = ['boards', 'games', 'picks', 'research']
const PRIMARY_TABS = PRIMARY_KEY_LIST.map((k) => [k, NFL_NAV[k].label])
const PRIMARY_KEYS = new Set(PRIMARY_KEY_LIST)
// Same exception as MOONSHOT's: This week is reached from the wordmark, so it
// must not make ••• More read as the active section.
const inMore = (key) => !PRIMARY_KEYS.has(key) && key !== 'home'

// The NFL header. Deliberately the same silhouette as the MLB one — logo tile
// left, status strip centre, controls right, tab rail underneath — so the
// switch feels like changing channel, not changing site. Only the accents move.

function Tile({ label, value, color, title }) {
  return (
    <div
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 13px', borderRadius: 9,
        background: `linear-gradient(135deg, ${color}1e, ${color}08)`,
        border: `1px solid ${color}4d`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{
          fontSize: 8.5, color: C.text3, textTransform: 'uppercase',
          letterSpacing: '.09em', fontWeight: 800,
        }}>{label}</span>
        <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, color }}>{value}</span>
      </div>
    </div>
  )
}

export default function NflHeader({ tab, setTab, data, meta }) {
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
  const [kickLabel, setKickLabel] = useState('\u2014')
  useEffect(() => {
    const t = Date.parse(nextKick?.kickoff || '')
    setKickLabel(Number.isFinite(t)
      ? new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : '\u2014')
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

  return (
    <header className={tab === 'home' ? undefined : 'hdr-slate-on'} style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'rgba(9,9,11,0.86)', backdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
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
          <div style={{
            position: 'relative', width: 34, height: 34, borderRadius: 10,
            boxShadow: `0 0 18px ${C.green}59`, cursor: 'pointer',
          }}>
            {/* The DASH Network monogram, identical on MOONSHOT. One mark, one
                destination; the green TUDDY wordmark beside it says where you are. */}
            <img src="/icon-192.png" alt="" width={34} height={34}
              style={{ display: 'block', width: '100%', height: '100%', borderRadius: 10 }} />
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
              <span className="sport-switch" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 5, alignSelf: 'center' }}>
                {[['mlb', 'MLB'], ['nfl', 'NFL']].map(([key, label]) => {
                  const on = key === 'nfl'
                  return (
                    <button
                      key={key}
                      onClick={on ? undefined : () => setSport(key)}
                      aria-pressed={on}
                      aria-label={on ? 'TUDDY · NFL (current)' : 'Switch to MOONSHOT · MLB'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        height: 22, minHeight: 22, padding: '0 10px', lineHeight: 1,
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                        borderRadius: 999, cursor: on ? 'default' : 'pointer',
                        border: `1px solid ${on ? `${C.green}73` : C.border2}`,
                        background: on ? `${C.green}26` : 'transparent',
                        color: on ? C.green : C.text3,
                      }}
                    >{label}</button>
                  )
                })}
              </span>
            </div>
            <div style={{
              height: 2, background: `linear-gradient(90deg, ${C.green}, transparent)`,
              borderRadius: 1, marginTop: 1, width: 80,
            }} />
          </div>
        </div>

        <div className="nfl-header-tiles" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, flexWrap: 'wrap', flex: '1 1 420px', minWidth: 0,
        }}>
          {/* ── TUDDY GETS THE MOVING STRIP (2026-08-29) ────────────────────
              Donovan: "we need to add the moving headline thing on top for
              nfl." MOONSHOT has had it since 2026-08-24 (SlateTiles.js); NFL
              had the same numbers sitting still in a wrapped grid.

              The animation, the seamless-loop trick and the pause control all
              already exist as CSS in components/MobileCSS.js, which
              NflDashboard.js already mounts — so this reuses those classes
              rather than shipping a second ticker: the set renders twice into
              one track, the track runs 0 -> -50%, and because the halves are
              byte-identical the restart is invisible. The echo is aria-hidden
              (a visual repeat, not new content) and nothing in the strip is
              clickable, so an animated row can't steal a tap.

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
            <Tile label="Top TD" value={topTd?.scores?.TD ? Math.round(topTd.scores.TD) : '\u2014'} color={C.green}
              title={topTd?.name ? `${topTd.name} — the highest anytime-touchdown score on the slate` : 'No scored players yet'} />
            <Tile label="Best game" value={bestGame ? bestGame.label : '\u2014'} color={C.cyan}
              title={bestGame ? `${bestGame.label} — ${bestGame.total.toFixed(1)} expected touchdowns between the two, the most on the slate` : 'No games scored yet'} />
            <Tile label={live > 0 ? 'Live' : 'Kickoff'} value={live > 0 ? live : kickLabel}
              color={live > 0 ? C.yellow : C.text2}
              title={live > 0 ? 'Games in progress' : (nextKick ? `Next kickoff: ${nextKick.away} @ ${nextKick.home}` : 'Nothing scheduled')} />
          </TickerStrip>
          {isPre && (
            <div
              className="nfl-header-preseason"
              title="Preseason: starters play two series, so weekly form does not exist yet. Every board here is built from last season's per-game baselines and says so on each row."
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                borderRadius: 9, background: `${C.yellow}14`, border: `1px solid ${C.yellow}45`,
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 900, color: C.yellow, letterSpacing: '.08em',
              }}>PRESEASON · CARRYOVER</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="nfl-header-built"
            title="When the NFL pipeline last published. Everything on TUDDY — the slate, the picks, the lines check and the grading — comes out of that one run."
            style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}
          >
            {meta?.built_at_human || data?.built_at_human || '—'}
            {freshLabel && <b style={{ color: freshCol, fontWeight: 800 }}>{` · ${freshLabel}`}</b>}
          </span>
          {/* THE ACCOUNT IS OPTIONAL NOW (2026-09-06) — see proxy.js. */}
          <SignUpPill accent={C.green} />
          <AlertBell />
          <ThemeModeButton />
          <PaletteButton jobs={NFL_JOBS()} accent={C.green} />
        </div>
      </div>

      {stale && (
        <div
          role="status"
          aria-live="polite"
          style={{
            maxWidth: 1300, margin: '0 auto 6px', padding: '7px 16px',
            borderTop: `1px solid ${C.yellow}35`, borderBottom: `1px solid ${C.yellow}35`,
            background: `${C.yellow}12`, color: C.yellow, fontSize: 10.5,
            fontWeight: 800, lineHeight: 1.45,
          }}
        >
          ⚠ NFL data is {ageLabel} old · last built {meta?.built_at_human || data?.built_at_human || builtAt}. Verify the slate before using picks or odds.
        </div>
      )}

      <div className="rail nfl-header-rail" style={{
        maxWidth: 1300, margin: '0 auto', padding: '0 16px',
        overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', gap: 2, minWidth: 'max-content' }}>
          {PRIMARY_TABS.map(([key, label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => go(key)}
                style={{
                  padding: '8px 13px', fontSize: 11, fontWeight: active ? 800 : 500,
                  cursor: 'pointer', border: 'none', borderRadius: 0,
                  background: 'transparent', color: active ? C.green : C.text3,
                  position: 'relative', transition: 'color .12s', whiteSpace: 'nowrap',
                }}
              >
                {label}
                {active && <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                  background: GRADIENT, borderRadius: '2px 2px 0 0',
                }} />}
              </button>
            )
          })}
          <button
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            style={{
              padding:'8px 13px', fontSize:11,
              fontWeight:inMore(tab) ? 800 : 500,
              cursor:'pointer', border:'none', borderRadius:0,
              background:'transparent', color:inMore(tab) ? C.green : C.text3,
              position:'relative', transition:'color .12s', whiteSpace:'nowrap',
            }}
          >
            More
            {inMore(tab) && <div style={{
              position:'absolute', bottom:0, left:0, right:0, height:2,
              background:GRADIENT, borderRadius:'2px 2px 0 0',
            }} />}
          </button>
        </div>
      </div>

      {moreOpen && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:'rgba(17,17,19,.98)' }}>
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
                      borderRadius:8, background:tab === key ? `${C.green}12` : C.glass,
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
          .nfl-header-built { display: none !important; }
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
        }
      `}</style>
    </header>
  )
}
