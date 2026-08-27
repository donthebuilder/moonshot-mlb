'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { C, NUM_FONT, TABS } from '../lib/theme'
import { logUrl } from '../lib/dataSource'
import { setSport } from '../lib/sport'
import SlateTiles from './SlateTiles'
import PaletteButton from './PaletteButton'
import ThemeModeButton from './ThemeModeButton'
import QuietButton from './QuietButton'
import { slateProjHr } from './ProjectedOutput'

// The header's own translucent bar was hardcoded to rgba(9,9,11,...) — a
// literal copy of ember's C.bg — so even the four EXISTING dark palettes
// (mono/steel/regal) never actually changed the one bar that's on screen
// every tab, every scroll position. Not caught before because all four are
// dark enough that the mismatch reads as "fine." Light mode made it a dark
// bar sitting above a white page. Fixed generically: derive the translucent
// background from whichever C.bg is actually active, for every theme, not
// just this one. (2026-08-18)
const hexToRgba = (hex, a) => {
  const h = String(hex).replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}


// ── live capture ticker ───────────────────────────────────────────────────────

function CaptureStat({ results }) {
  if (!results?.hr_capture_report) return null
  const report = results.hr_capture_report
  const pct = Number(report.hr_capture_pct || 0)
  const caught = Number(report.caught_hrs_on_sheet || 0)
  const total = Number(report.total_hrs_on_slate || 0)

  // PREGAME: before the first homer lands anywhere, this pill used to read
  // "0.0%" in red with "0/0 HR" beside it — a failing grade for a test that
  // hasn't started. 0-for-0 is not a rate. Until there's a homer to capture,
  // show a calm neutral "tracking" state instead of a score, and style it to
  // match the tile family (gradient + border) rather than the old flat chip.
  if (total === 0) {
    const col = '#38bdf8'
    return (
      <div
        title="Live HR capture — how many of tonight's home runs were on the sheet. Starts scoring when the first homer lands."
        style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'5px 13px', borderRadius:9,
          background:`linear-gradient(135deg, ${col}18, ${col}06)`,
          border:`1px solid ${col}40`,
        }}
      >
        <div style={{ width:6, height:6, borderRadius:'50%', background:col, animation:'pulse 2s infinite' }} />
        <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
          <span style={{ fontSize:8.5, color:C.text3, textTransform:'uppercase', letterSpacing:'.09em', fontWeight:800 }}>HR capture</span>
          <span style={{ fontFamily:NUM_FONT, fontSize:11, fontWeight:800, color:col }}>tracking…</span>
        </div>
      </div>
    )
  }

  // The PILL is blue — its slot in the strip's fixed colour order — while the
  // percentage inside keeps its performance colour, so "how are we doing" is
  // still answered by the number without the whole strip changing shape by
  // score.
  const col = '#38bdf8'
  const scoreCol = pct >= 70 ? '#4ade80' : pct >= 50 ? '#f59e0b' : '#f87171'
  return (
    <div
      title={`${caught} of the slate's ${total} home runs were on the sheet tonight.`}
      style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'5px 13px', borderRadius:9,
        background:`linear-gradient(135deg, ${col}1e, ${col}08)`,
        border:`1px solid ${col}4d`,
        boxShadow:`0 0 16px ${col}14`,
      }}
    >
      <div style={{ width:6, height:6, borderRadius:'50%', background:col, animation:'pulse 2s infinite' }} />
      <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
        <span style={{ fontSize:8.5, color:C.text3, textTransform:'uppercase', letterSpacing:'.09em', fontWeight:800 }}>HR capture</span>
        <span style={{ display:'flex', alignItems:'baseline', gap:5 }}>
          <span style={{ fontFamily:NUM_FONT, fontSize:14, fontWeight:900, color:scoreCol }}>{pct.toFixed(0)}%</span>
          <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT }}>{caught}/{total}</span>
        </span>
      </div>
    </div>
  )
}

// ── projected HR total ────────────────────────────────────────────────────────

function ProjectedHRStat({ mode, players = [] }) {
  // the model's own number, to one decimal — see slateProjHr
  const modelHr = useMemo(() => slateProjHr(players), [players])
  const [projection, setProjection] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setProjection(null)
      try {
        const response = await fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache:'no-store' })
        if (!response.ok) return
        const text = await response.text()
        // THE OLD PATTERNS NEVER MATCHED, so this pill has never once rendered.
        // They looked for "Model Projected HRs: 36-45" and "Slate Power Grade:
        // Strong" — colons, capitals, the word "Model". What the bot actually
        // writes in today.txt is:
        //
        //     projected HRs 36–45 · power grade Strong
        //     top HR profiles 117 · weak pitcher spots 14
        //
        // No colons, lower case, en-dash. Matched loosely now, with the old
        // wording kept as an alternative in case the bot's format moves back.
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        const profiles = text.match(/top\s+HR\s+profiles\s*[:\s]\s*(\d+)/i)
        const weakSpots = text.match(/weak\s+pitcher\s+spots\s*[:\s]\s*(\d+)/i)
        if (!cancelled && range) {
          setProjection({
            low: Number(range[1]),
            high: Number(range[2]),
            grade: (grade?.[1] || '').trim(),
            profiles: profiles ? Number(profiles[1]) : null,
            weakSpots: weakSpots ? Number(weakSpots[1]) : null,
          })
        }
      } catch {
        if (!cancelled) setProjection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mode])

  if (!projection && modelHr == null) return null
  // ORANGE, always. The pill used to shift hue with the power grade, but the
  // strip now has a fixed colour order (blue-orange-blue-orange-gold-green)
  // and a grade-coloured pill broke it on medium/weak slates. The grade is
  // still in the tooltip.
  const col = '#f97316'

  return (
    <div
      title={`${modelHr != null ? `The site's own model projects ${modelHr.toFixed(1)} home runs across this slate — each hitter's score-band and ISO-band rate, weighted by his expected plate appearances, his last-5 form, the park and tonight's air, and the arm he faces. ` : ''}${projection ? `The bot's own sheet says ${projection.low}–${projection.high}, power grade ${projection.grade || 'n/a'}${projection.profiles != null ? `; ${projection.profiles} hitters clear its top-HR profile` : ''}${projection.weakSpots != null ? `, ${projection.weakSpots} weak pitcher spots` : ''}.` : ''}`}
      style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'5px 13px', borderRadius:9,
        background:`linear-gradient(135deg, ${col}22, ${col}0a)`,
        border:`1px solid ${col}55`,
        boxShadow:`0 0 18px ${col}14`,
      }}
    >
      <span style={{ fontSize:12 }}>💣</span>
      <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
        <span style={{
          fontSize:8.5, color:C.text3, textTransform:'uppercase',
          letterSpacing:'.09em', fontWeight:800,
        }}>Projected</span>
        {/* One figure, the midpoint to a decimal. The bot publishes a range and
            that range is still in the tooltip — it's off the face because a
            strip this dense reads better with one number per pill, and the
            interval is a detail you want on demand rather than always. */}
        <span style={{ display:'flex', alignItems:'baseline', gap:5 }}>
          <span style={{ fontFamily:NUM_FONT, fontSize:14, fontWeight:900, color:col }}>
            {modelHr != null ? modelHr.toFixed(1)
              : ((projection.low + projection.high) / 2).toFixed(1)}
          </span>
          <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT }}>HR</span>
        </span>
      </div>
    </div>
  )
}

// ── date display ──────────────────────────────────────────────────────────────

function DateBadge({ label }) {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
      <span style={{ fontSize:11, color:C.text3, fontFamily:NUM_FONT, lineHeight:1 }}>{time}</span>
      <span style={{ fontSize:12, color:C.text2, fontFamily:NUM_FONT, fontWeight:700, lineHeight:1.3 }}>{label}</span>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Header({ tab, setTab, mode, setMode, dateLabel, slateDate = '', results, players = [], games = [] }) {
  // TAP TARGET (2026-08-12): the NFL "coming soon" pill carried its note in a
  // bare title= — invisible on a phone, the same gap fixed elsewhere via the
  // InfoDot pattern (see Explain.js's header comment).

  // ── THE HEADER PUBLISHES ITS OWN HEIGHT (2026-08-16) ───────────────────
  // Anything else on the site that wants to stick — the Games lineup jump
  // strip is the first — has to sit BELOW this bar or it pins underneath it
  // and is never seen. Its height is not a constant: 85px at desktop width,
  // 133px at 390px where the tab row wraps to its own line, and it changes
  // again whenever a slate tile is added. So the header measures itself and
  // writes --hdr-h on <html>; everyone else styles `top: var(--hdr-h, 86px)`
  // and is correct at every width without a matching media query.
  const hdrRef = useRef(null)

  // ── AND IT CONDENSES ONCE YOU SCROLL (2026-08-16, same pass) ───────────
  // Fixing the sticky bug above had an immediate consequence: a bar that
  // correctly never leaves is a bar you are paying for on every screen. At
  // 390px this one is 232px tall — the slate tiles wrap to two rows and the
  // tab rail to a third — which is 27% of an iPhone viewport permanently
  // spent on chrome. Sticky was right; sticky AND 232px was not.
  //
  // So past 150px of scroll the header drops to its identity and its
  // navigation: logo, brand, date, mode, tabs. The slate strip is HIDDEN,
  // NOT UNMOUNTED (display:none) — SlateTiles owns polling state and a
  // remount would re-derive it on every scroll reversal, and hiding is the
  // form changing while every fact stays one scroll-up away.
  //
  // Two guards worth keeping:
  //   · It only engages if the EXPANDED bar is actually tall (>130px). At
  //     desktop width the header is 85px and the tiles are the reason you
  //     glance up, so nothing is taken away there. The threshold is measured
  //     rather than a media query, so it tracks whatever the bar grows into.
  //   · Hysteresis — condense at 150, expand at 90. Condensing changes the
  //     height, which on a short page can move the scroll position, which
  //     without a gap between the thresholds oscillates.
  const TALL = 130
  const [condensed, setCondensed] = useState(false)
  const expandedH = useRef(0)

  useEffect(() => {
    const el = hdrRef.current
    if (!el) return
    const write = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--hdr-h', `${h}px`)
    }
    write()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(write) : null
    if (ro) ro.observe(el)

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY || window.pageYOffset || 0
        setCondensed((was) => (was ? y > 90 : expandedH.current > TALL && y > 150))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Record the full height whenever we are showing it, so the guard above is
  // comparing against the real expanded bar at the CURRENT width rather than
  // a value captured once at mount and stale after a rotation.
  useEffect(() => {
    if (!condensed && hdrRef.current) {
      const h = Math.round(hdrRef.current.getBoundingClientRect().height)
      if (h > 0) expandedH.current = h
    }
  })

  return (
    <header ref={hdrRef} style={{
      position:'sticky', top:0, zIndex:50,
      background: hexToRgba(C.bg, 0.92),
      backdropFilter:'blur(14px)',
      borderBottom:`1px solid ${C.border}`,
    }}>
      <div style={{
        maxWidth:1300, margin:'0 auto',
        padding: condensed ? '5px 16px 3px' : '10px 16px 8px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
        flexWrap:'wrap',
        transition:'padding .14s ease',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            position:'relative',
            width: condensed ? 28 : 38, height: condensed ? 28 : 38,
            borderRadius:10, flexShrink:0, transition:'width .14s ease, height .14s ease',
            background:'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 18px rgba(249,115,22,0.35)',
          }}>
            <span style={{ fontSize: condensed ? 11 : 14, fontWeight:900, color:'#fff', letterSpacing:'-0.05em', fontFamily:NUM_FONT }}>HR</span>
            <div style={{
              position:'absolute', top:-2, right:-2,
              width:8, height:8, borderRadius:'50%',
              background:'#4ade80', border:'2px solid #09090b',
              animation:'pulse 2s infinite',
            }} />
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
              {/* MOONSHOT · MLB (2026-08-07): the receipts card, the Discord
                  posts, and the URL all said MOONSHOT while the header still
                  wore the pre-migration Streamlit name. The sport tag stays
                  so an NFL sibling can slot in later as MOONSHOT · NFL. */}
              <span style={{ fontSize: condensed ? 15 : 18, fontWeight:900, letterSpacing:'-0.02em', background:'linear-gradient(90deg, #f97316, #ef4444)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>MOONSHOT</span>
              {/* SPORT SWITCHER (2026-08-08, rewired 2026-08-14). It was going
                  to be a link to a SECOND deployed site — that's off. The asset
                  here is the eighty components in this folder, and forking them
                  means maintaining two copies of every fix for the rest of the
                  season. NFL lives in this app now; the pill is a real toggle
                  and lib/sport.js holds the state. */}
              {/* ── THE SPORT PILLS, FIXED (2026-08-23) ─────────────────────
                  Donovan: "the mlb bubble and nfl buble is off off."
                  They were, and the cause was two bugs stacked. MLB was a
                  <span> and NFL a <button>, so MobileCSS's blanket thumb-target
                  rule (button { min-height: 32px } under 700px) applied to one
                  of them and not the other; the row's default align-items then
                  STRETCHED the span to match. Result on a phone: two 10px
                  labels inside 39×32 boxes at borderRadius 999 — perfect
                  ellipses, not pills, and visibly different from each other.
                  Now: both are buttons, both carry the same explicit capsule
                  geometry, and the row centres rather than stretches, so the
                  shape is the same at every width and on every pointer.
                  MLB is a real button too, with aria-pressed, so the pair reads
                  as one toggle to a screen reader instead of a label beside a
                  control. */}
              <span className="sport-switch" style={{ display:'flex', alignItems:'center', gap:4, marginLeft:5, alignSelf:'center' }}>
                {[['mlb', 'MLB'], ['nfl', 'NFL']].map(([key, label]) => {
                  const on = key === 'mlb'
                  return (
                    <button
                      key={key}
                      onClick={on ? undefined : () => setSport(key)}
                      aria-pressed={on}
                      aria-label={on ? 'MOONSHOT · MLB (current)' : 'Switch to TUDDY · NFL'}
                      style={{
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        height:22, minHeight:22, padding:'0 10px', lineHeight:1,
                        fontSize:10, fontWeight:800, letterSpacing:'0.06em',
                        borderRadius:999, cursor: on ? 'default' : 'pointer',
                        border:`1px solid ${on ? 'rgba(249,115,22,.45)' : C.border2}`,
                        background: on ? 'rgba(249,115,22,.15)' : 'transparent',
                        color: on ? C.orange : C.text3,
                      }}
                    >{label}</button>
                  )
                })}
              </span>
            </div>
            {!condensed && <div style={{ height:2, background:'linear-gradient(90deg, #f97316, transparent)', borderRadius:1, marginTop:1, width:80 }} />}
          </div>
        </div>

        {/* The HR tracker plus the merged slate strip. Streamlit carried these
            tiles twice -- once at the top, once on Games -- overlapping on
            three of them. One row in the header, visible from every tab.
            ORDER AND HUES ARE FIXED, left to right:
              Games blue · Projected orange · HR tracking blue ·
              Best game orange · Weak gold · Lineups green
            The two pills that live in this file are threaded into SlateTiles
            as elements so the whole strip renders as one ordered row instead
            of two groups that wrap independently on narrow screens. */}
        {/* ── THE "PAGE BREAK" — DIAGNOSED 2026-08-18, FIXED AT THE CONSUMER ──
            Donovan, on the Lineups page: "when scroll down it does the dumb
            page break thing." Traced it: this block toggling `display:
            condensed ? 'none' : 'flex'` shrinks the header's real in-flow
            height by ~110px in one frame, --hdr-h (written from this block's
            measured height, see the top of this file) drops the same amount
            the next frame, and the Games/Lineups jump strip — the only thing
            on the site that reads --hdr-h — teleports upward by however much
            you'd scrolled PLUS that whole block's height, all at once.
            Confirmed on a 390px viewport: scrolling 30px (y 170→200) moved
            the jump strip's screen position by 127px.
            An EARLIER version of this fix tried animating this block's own
            height (max-height transition instead of display:none). That
            traded one bug for a worse one: shrinking the header's real
            layout height, even gradually, shrinks the page's total
            scrollHeight while it happens, which can force the browser to
            clamp window.scrollY down mid-animation on a page that isn't much
            taller than the viewport — which flipped `condensed` back to
            false mid-collapse, which let the "record the expanded height"
            effect below capture a mid-transition (small) height into
            expandedH.current, which permanently failed the `> TALL` guard
            and disabled condensing for the rest of the session. Reproduced
            with real wheel-scroll events, not just programmatic jumps.
            So this block is back to the original instant toggle — the
            header's own layout is not a safe thing to animate — and the fix
            lives where the actual jump is felt: the jump strip itself
            (components/tabs/Games.js) now transitions its `top` property, so
            IT glides to the new offset instead of snapping, without the
            header's own height ever changing gradually. display:none, NOT
            unmounted — SlateTiles owns polling state and a remount would
            re-derive it; the facts are one scroll-up away. */}
        <div className="hdr-vitals" style={{
          display: condensed ? 'none' : 'flex',
          alignItems:'center', justifyContent:'center',
          gap:6, flexWrap:'wrap', flex:'1 1 480px', minWidth:0,
        }}>
          <SlateTiles
            players={players}
            results={results}
            games={games}
            slateDate={slateDate}
            mode={mode}
            projected={<ProjectedHRStat mode={mode} players={players} />}
            capture={<CaptureStat results={results} />}
          />
        </div>

        <div className="hdr-meta" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div className="date-badge"><DateBadge label={dateLabel || 'Loading…'} /></div>
          {/* PALETTE, GLOBAL (2026-08-10). It used to live in the Guide tab and
              on the heat map legend only — two clicks away from the board you
              are squinting at. It is a view setting, so it sits with the other
              one. */}
          <PaletteButton />
          <ThemeModeButton />
          {/* 🔕 2026-08-23: "we need a notifications setting somewhere to
              minimze the notis on screen for user." Same group as the other
              two view settings. See lib/quiet.js. */}
          <QuietButton />
          <div className="date-mode-switch" style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1px solid ${C.border}` }}>
            <button
              onClick={() => setMode('today')}
              style={{
                padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                background:mode === 'today' ? '#f97316' : 'transparent',
                color:mode === 'today' ? '#fff' : C.text3,
                transition:'all .12s',
              }}
            >Today</button>
            <button
              onClick={() => setMode('tomorrow')}
              style={{
                padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                borderLeft:`1px solid ${C.border}`,
                background:mode === 'tomorrow' ? '#22d3ee' : 'transparent',
                color:mode === 'tomorrow' ? '#09090b' : C.text3,
                transition:'all .12s',
              }}
            >Tmrw</button>
          </div>
        </div>
      </div>

      <div className="rail" style={{
        maxWidth:1300, margin:'0 auto', padding:'0 16px',
        overflowX:'auto', scrollbarWidth:'none', WebkitOverflowScrolling:'touch',
      }}>
        {/* EVEN TABS (2026-08-17, "i dont like how the tabs arent evenly
            aligned"). Each button flexes to an equal share of the rail and
            centres its label, so the row reads as one measured strip instead
            of ragged word-width chips. minWidth keeps the horizontal scroll
            working on phones, where equal shares would crush the labels. */}
        <div style={{ display:'flex', gap:0, paddingBottom:0, minWidth:'max-content', width:'100%' }}>
          {TABS.map(([key,label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding: condensed ? '6px 13px' : '8px 13px',
                  fontSize:11, fontWeight:active ? 800 : 500,
                  cursor:'pointer', border:'none', borderRadius:0,
                  background:'transparent', color:active ? '#f97316' : C.text3,
                  position:'relative', transition:'color .12s', whiteSpace:'nowrap',
                  flex:'1 0 auto', textAlign:'center',
                }}
              >
                {label}
                {active && <div style={{
                  position:'absolute', bottom:0, left:0, right:0, height:2,
                  background:'linear-gradient(90deg, #f97316, #ef4444)',
                  borderRadius:'2px 2px 0 0',
                }} />}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        header div::-webkit-scrollbar { display: none; }
      `}</style>
    </header>
  )
}
