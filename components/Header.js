'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { logUrl } from '../lib/dataSource'
import { setSport } from '../lib/sport'
import { computeSlateStats } from './SlateTiles'
import PaletteButton from './PaletteButton'
import ThemeModeButton from './ThemeModeButton'
import QuietButton from './QuietButton'
import { slateProjHr } from './ProjectedOutput'
import { easternToday } from '../lib/data'
import SignUpPill from './SignUpPill'

// The header's own translucent bar was hardcoded to rgba(9,9,11,...) — a
// literal copy of ember's C.bg — so even the four EXISTING dark palettes
// (mono/steel/regal) never actually changed the one bar that's on screen
// every tab, every scroll position. Not caught before because all four are
// dark enough that the mismatch reads as "fine." Light mode made it a dark
// bar sitting above a white page. Fixed generically: derive the translucent
// background from whichever C.bg is actually active, for every theme, not
// just this one. (2026-08-18)
import { MLB_NAV, MLB_MORE_GROUPS } from '../lib/routes'

const hexToRgba = (hex, a) => {
  const h = String(hex).replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Keep the existing Moonshot look, but make the top rail answer only the
// questions people arrive with most often. The deeper tools stay one tap
// away in More instead of competing with the picks on every screen.
//
// ── LABELS COME FROM lib/routes.js NOW (2026-09-03) ─────────────────────────
//
// This file used to carry its own label list, MobileTabBar.js carried a second
// one, and routes.js a third. They disagreed: `board` was "Boards" here and
// "Charts" in the route table, `home` was "Home" here and "Tonight" on the
// phone. One table, three readers -- see the note above MLB_NAV.
//
// ── TONIGHT LEFT THE RAIL (2026-09-03) ──────────────────────────────────────
//
// Donovan: "Tonight -- but I'm wondering if that even needs a button, since
// it's the MOONSHOT home page. Maybe we just get a home button working for
// MOONSHOT specifically. Props needs a lane."
//
// He is right, and it frees the slot Props needed. The MOONSHOT WORDMARK is
// the home button now (see the note where it renders), which is where every
// site on the internet has put it for twenty-five years, so a whole tab was
// being spent on a job the header already had a place for.
//
// The 2026-08-28 note beside the logo said the wordmark must NOT be a link.
// That note was about linking it to the DASH front door -- "making the
// product's own name navigate away from the product". This does the opposite:
// it navigates to the product's own front page and never leaves MOONSHOT. The
// square mark still goes to the network. Two marks, two homes, neither
// pretending to be the other.
const PRIMARY_KEY_LIST = ['props', 'board', 'scoreboard', 'games', 'bot']
const PRIMARY_TABS = PRIMARY_KEY_LIST.map((k) => [k, `${MLB_NAV[k].icon} ${MLB_NAV[k].label}`])
const PRIMARY_KEYS = new Set(PRIMARY_KEY_LIST)
// Same exception as MobileTabBar's: Tonight is reached from the wordmark, so
// it must not make ••• More read as the active section.
const inMore = (key) => !PRIMARY_KEYS.has(key) && key !== 'home'


// ── THE ONE BAR (2026-09-06) ─────────────────────────────────────────────────
//
// Donovan picked "broadcast bar, with the instrument styling": the moving
// ticker is gone from the header and its six numbers became ONE LINE OF TEXT
// under the wordmark -- a scorebug -- so the centre of the bar is free for the
// tab rail. What used to be two rows (brand + tiles, then tabs) is one bar of
// ~56px, and the second row is gone on every page. On a phone the rail is
// hidden as before (the bottom bar owns tabs under 760px) and the scorebug is
// the slate context, one line, no swipe.
//
// The right cluster shrank to three things: the date with Today/Tmrw as a
// segmented control, the account pill, and one ⚙ that opens palette, theme
// and quiet in a small sheet. Three view settings did not each need a slot
// on a bar you look past a hundred times a night.
//
// SlateTiles.js still exists and is unchanged -- Home's hero row and anything
// else that wants the tiles keep them; only the header stopped mounting it.
// The `condensed` scroll logic went with the tiles: the bar no longer has a
// tall state to condense from. --hdr-h is still written for the jump strip.

function useProjection(mode) {
  const [projection, setProjection] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setProjection(null)
      try {
        const response = await fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache:'no-store' })
        if (!response.ok) return
        const text = await response.text()
        // Matches what the bot writes in today.txt ("projected HRs 36–45 ·
        // power grade Strong"); the old colon/capital form is kept as an alt.
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        if (!cancelled && range) {
          setProjection({ low: Number(range[1]), high: Number(range[2]), grade: (grade?.[1] || '').trim() })
        }
      } catch {
        if (!cancelled) setProjection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mode])
  return projection
}

// One fact of the scorebug: label in caps, number in the mono face, the one
// accent for anything live (HR capture once the first homer lands).
function Bug({ label, value, color, title, live = false }) {
  return (
    <span title={title} style={{ display:'inline-flex', alignItems:'baseline', gap:4, whiteSpace:'nowrap', cursor: title ? 'default' : undefined }}>
      {live && <span aria-hidden="true" style={{ width:5, height:5, borderRadius:'50%', background:color, alignSelf:'center', animation:'pulse 2s infinite' }} />}
      <span style={{ fontFamily:NUM_FONT, fontSize:11, fontWeight:900, color: color || C.text, letterSpacing:'-.01em' }}>{value}</span>
      <span style={{ fontSize:8.5, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:C.text3 }}>{label}</span>
    </span>
  )
}

function Scorebug({ players, results, games, mode, slateDate }) {
  const stats = useMemo(() => computeSlateStats(players, results, games), [players, results, games])
  const modelHr = useMemo(() => slateProjHr(players), [players])
  const projection = useProjection(mode)
  if (!stats) return <span style={{ fontSize:9.5, color:C.text3, fontFamily:NUM_FONT }}>loading the slate…</span>

  const expectedDate = mode === 'tomorrow'
    ? new Date(new Date(`${easternToday()}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)
    : easternToday()
  const staleSlate = !!slateDate && slateDate < expectedDate
  const proj = modelHr != null ? modelHr.toFixed(1) : projection ? ((projection.low + projection.high) / 2).toFixed(1) : null
  const captured = stats.actual != null && stats.actual > 0
  const pct = captured ? (100 * (stats.onSheet || 0)) / stats.actual : null
  const capCol = pct == null ? '#38bdf8' : pct >= 70 ? '#4ade80' : pct >= 50 ? '#f59e0b' : '#f87171'
  const sep = <span aria-hidden="true" style={{ color:C.text3, opacity:.55, margin:'0 6px', fontSize:9 }}>·</span>

  return (
    <div className="hdr-scorebug" style={{ display:'flex', alignItems:'center', flexWrap:'nowrap', overflowX:'auto', scrollbarWidth:'none', lineHeight:1, marginTop:3, maxWidth:'100%' }}>
      <Bug label="games" value={stats.gameCount} title="Games on this slate" />
      {proj != null && <>{sep}<Bug label="HR proj" value={proj} color="#f97316"
        title={`${modelHr != null ? `The site's own model projects ${modelHr.toFixed(1)} home runs across this slate. ` : ''}${projection ? `The bot's sheet says ${projection.low}–${projection.high}, power grade ${projection.grade || 'n/a'}.` : ''}`} /></>}
      {sep}
      <Bug label={captured ? 'HR on sheet' : 'HR capture'} value={captured ? `${stats.onSheet}/${stats.actual}` : 'tracking'} color={capCol} live
        title={captured ? `${stats.onSheet} of the slate's ${stats.actual} home runs were on the sheet tonight (${pct.toFixed(0)}%).` : 'Live HR capture — starts scoring when the first homer lands.'} />
      {sep}
      <Bug label={staleSlate ? 'prev lineups' : 'lineups'} value={`${stats.confirmedTeams}/${stats.lineupTeams}`} color={staleSlate ? C.text3 : '#4ade80'}
        title="Teams with a confirmed lineup — every score on the site is softer for a hitter who might not start" />
      {sep}
      <Bug label="weak" value={`★${stats.weak}`} color="#FCD34D" title="Weak-spot matchups on the slate — a lineup spot this starter has been hurt by" />
      {stats.best && <>{sep}<Bug label="best game" value={stats.best.label} title={`Highest game score on the slate: ${stats.best.gs.toFixed(1)}`} /></>}
      {stats.settled > 0 && <>{sep}<Bug label="graded" value={stats.settled} color={C.green} title="Hitters already graded tonight" /></>}
    </div>
  )
}

// ── date + mode, as one control ───────────────────────────────────────────────

function DateMode({ label, mode, setMode }) {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])
  const seg = (key, text, col) => {
    const on = mode === key
    return (
      <button key={key} onClick={() => setMode(key)} aria-pressed={on} style={{
        padding:'4px 10px', fontSize:10.5, fontWeight:800, cursor:'pointer', border:'none',
        background: on ? col : 'transparent', color: on ? C.bg : C.text3, transition:'background .12s, color .12s',
        borderRadius: 999,
      }}>{text}</button>
    )
  }
  return (
    <div className="date-mode-switch" style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div className="date-badge" style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
        <span style={{ fontSize:11.5, color:C.text2, fontFamily:NUM_FONT, fontWeight:800 }}>{label}</span>
        <span style={{ fontSize:9.5, color:C.text3, fontFamily:NUM_FONT }}>{time}</span>
      </div>
      <div style={{ display:'flex', padding:2, borderRadius:999, border:`1px solid ${C.border}`, background:C.glass, gap:2 }}>
        {seg('today', 'Today', '#f97316')}
        {seg('tomorrow', 'Tmrw', '#22d3ee')}
      </div>
    </div>
  )
}

// ── ⚙ the view settings, in one sheet ─────────────────────────────────────────

function SettingsSheet() {
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
    <div ref={ref} style={{ position:'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        title="View settings — palette, light/dark, quiet mode"
        style={{
          width:30, height:30, borderRadius:999, display:'grid', placeItems:'center', cursor:'pointer',
          border:`1px solid ${open ? '#f9731666' : C.border}`, background: open ? 'rgba(249,115,22,.12)' : C.glass,
          color: open ? C.orange : C.text2, fontSize:14, transition:'transform .12s, background .12s',
          transform: open ? 'rotate(30deg)' : 'none',
        }}>⚙</button>
      {open && (
        <div role="dialog" aria-label="View settings" style={{
          position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:60, minWidth:200,
          background:hexToRgba(C.bg2, .98), border:`1px solid ${C.border}`, borderRadius:12,
          boxShadow:'0 12px 32px rgba(0,0,0,.45)', padding:'10px 10px 8px', display:'grid', gap:8,
        }}>
          <div style={{ fontSize:8.5, fontWeight:900, letterSpacing:'.14em', color:C.text3, textTransform:'uppercase' }}>View</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <PaletteButton />
            <ThemeModeButton />
            <QuietButton />
          </div>
          <div style={{ fontSize:9.5, color:C.text3, lineHeight:1.5 }}>Palette · light/dark · quiet mode. These stick on this device.</div>
        </div>
      )}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Header({ tab, setTab, mode, setMode, dateLabel, slateDate = '', results, players = [], games = [] }) {
  // ── THE HEADER PUBLISHES ITS OWN HEIGHT (2026-08-16) ───────────────────
  // Anything else that wants to stick (the Games lineup jump strip) sits
  // below this bar via `top: var(--hdr-h)`. Measured, not a constant.
  const hdrRef = useRef(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const go = (next) => { setMoreOpen(false); setTab(next) }

  useEffect(() => {
    const el = hdrRef.current
    if (!el) return
    // --hdr-h is what the Games jump strip sticks under. A header that
    // scrolls away occupies no fixed space, so the strip pins to the top.
    const write = () => { document.documentElement.style.setProperty('--hdr-h', '0px') }
    write()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(write) : null
    if (ro) ro.observe(el)
    return () => { if (ro) ro.disconnect() }
  }, [])

  const tabBtn = (key, label, active, onClick, extra = {}) => (
    <button key={key} onClick={onClick} {...extra} style={{
      padding:'0 12px', height:36, fontSize:11, fontWeight:active ? 800 : 600,
      cursor:'pointer', border:'none', borderRadius:0, background:'transparent',
      color:active ? '#f97316' : C.text3, position:'relative', transition:'color .12s',
      whiteSpace:'nowrap', flex:'1 0 auto', textAlign:'center',
    }}>
      {label}
      {active && <div style={{
        position:'absolute', bottom:0, left:8, right:8, height:2,
        background:'linear-gradient(90deg, #f97316, #ef4444)', borderRadius:'2px 2px 0 0',
      }} />}
    </button>
  )

  return (
    <header ref={hdrRef} className="hdr-one-bar" style={{
      // NOT STICKY (2026-09-06). Donovan: "no sticky header. once you scroll
      // don't add that, ever." The bar scrolls away with the page; the phone
      // bottom bar owns navigation while you are down the page.
      position:'relative', zIndex:50,
      background: hexToRgba(C.bg, 0.92),
      backdropFilter:'blur(14px)',
      borderBottom:`1px solid ${C.border}`,
    }}>
      <div className="hdr-bar" style={{
        maxWidth:1300, margin:'0 auto', padding:'8px 16px 0',
        display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
      }}>
        {/* ── brand + scorebug ───────────────────────────────────────────── */}
        <div className="hdr-brand" style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, paddingBottom:8 }}>
          {/* THE MARK IS THE WAY HOME (2026-08-31): the square mark goes to the
              DASH front door; the wordmark is MOONSHOT's own home button. */}
          <a href="/" title="DASH Network home — MOONSHOT · TUDDY · FRANCHISE" aria-label="DASH Network home"
            style={{ display:'flex', textDecoration:'none', borderRadius:10, flexShrink:0 }}>
            <div style={{ position:'relative', width:36, height:36, borderRadius:10, boxShadow:'0 0 18px rgba(249,115,22,0.35)' }}>
              <img src="/icon-192.png" alt="" width={36} height={36} style={{ display:'block', width:'100%', height:'100%', borderRadius:10 }} />
              <div style={{ position:'absolute', top:-2, right:-2, width:8, height:8, borderRadius:'50%', background:C.green, border:`2px solid ${C.bg}`, animation:'pulse 2s infinite' }} />
            </div>
          </a>
          <div style={{ minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button type="button" onClick={() => go('home')} title="MOONSHOT home — tonight in one page" aria-label="MOONSHOT home"
                style={{
                  padding:0, border:'none', background:'transparent', cursor:'pointer',
                  fontSize:17, fontWeight:900, letterSpacing:'-0.02em', lineHeight:1.1,
                  backgroundImage:'linear-gradient(90deg, #f97316, #ef4444)',
                  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                }}>MOONSHOT</button>
              <span className="sport-switch" style={{ display:'flex', alignItems:'center', gap:3 }}>
                {[['mlb', 'MLB'], ['nfl', 'NFL']].map(([key, label]) => {
                  const on = key === 'mlb'
                  return (
                    <button key={key} onClick={on ? undefined : () => setSport(key)} aria-pressed={on}
                      aria-label={on ? 'MOONSHOT · MLB (current)' : 'Switch to TUDDY · NFL'}
                      style={{
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        height:18, minHeight:18, padding:'0 8px', lineHeight:1,
                        fontSize:9, fontWeight:800, letterSpacing:'0.06em', borderRadius:999,
                        cursor: on ? 'default' : 'pointer',
                        border:`1px solid ${on ? 'rgba(249,115,22,.45)' : C.border2}`,
                        background: on ? 'rgba(249,115,22,.15)' : 'transparent',
                        color: on ? C.orange : C.text3,
                      }}>{label}</button>
                  )
                })}
              </span>
            </div>
            <Scorebug players={players} results={results} games={games} mode={mode} slateDate={slateDate} />
          </div>
        </div>

        {/* ── the rail, in the bar ───────────────────────────────────────── */}
        <nav className="rail hdr-rail" aria-label="MOONSHOT sections" style={{
          flex:'1 1 420px', minWidth:0, alignSelf:'stretch',
          overflowX:'auto', scrollbarWidth:'none', WebkitOverflowScrolling:'touch',
          display:'flex', alignItems:'flex-end',
        }}>
          <div style={{ display:'flex', gap:0, minWidth:'max-content', width:'100%' }}>
            {PRIMARY_TABS.map(([key, label]) => tabBtn(key, label, tab === key, () => go(key)))}
            {tabBtn('more', '••• More', inMore(tab), () => setMoreOpen((open) => !open), { 'aria-expanded': moreOpen })}
          </div>
        </nav>

        {/* ── date · mode · account · settings ──────────────────────────── */}
        <div className="hdr-meta" style={{ display:'flex', alignItems:'center', gap:10, paddingBottom:8, marginLeft:'auto' }}>
          <DateMode label={dateLabel || 'Loading…'} mode={mode} setMode={setMode} />
          <SignUpPill onWatchlist={() => go('you')} />
          <SettingsSheet />
        </div>
      </div>

      {moreOpen && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:hexToRgba(C.bg2, .98) }}>
          <div className="simple-more-grid" style={{
            maxWidth:1300, margin:'0 auto', padding:'9px 16px 11px',
            display:'grid', gridTemplateColumns:'repeat(6,minmax(0,1fr))', gap:6,
          }}>
            <a href="/" style={{
              gridColumn:'1/-1', display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'9px 10px', border:`1px solid ${C.border}`, borderRadius:8,
              background:C.glass, color:C.text2, fontSize:10, fontWeight:750, textDecoration:'none',
            }}>
              <span style={{ color:C.orange }}>⌂ DASH HOME</span>
              <span style={{ color:C.text3, fontWeight:600 }}>Tonight across MOONSHOT · TUDDY · FRANCHISE →</span>
            </a>
            {MLB_MORE_GROUPS.map(([group, keys]) => (
              <div key={group} style={{ gridColumn:'1/-1' }}>
                <div style={{ fontSize:8, fontWeight:900, letterSpacing:'.14em', color:C.text3, textTransform:'uppercase', margin:'8px 2px 5px' }}>{group}</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(118px,1fr))', gap:6 }}>
                  {keys.map((key) => (
                    <button key={key} onClick={() => go(key)} title={MLB_NAV[key].blurb} style={{
                      padding:'9px 10px', border:`1px solid ${tab === key ? '#f9731666' : C.border}`,
                      borderRadius:8, background:tab === key ? 'rgba(249,115,22,.10)' : C.glass,
                      color:tab === key ? '#f97316' : C.text2, fontSize:10, fontWeight:750,
                      textAlign:'left', cursor:'pointer',
                    }}>{MLB_NAV[key].icon} {MLB_NAV[key].label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        header div::-webkit-scrollbar { display: none; }
        .hdr-scorebug::-webkit-scrollbar { display: none; }
        @media (max-width: 700px) {
          .simple-more-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
        /* Under the bottom bar's breakpoint (760px, components/MobileTabBar.js)
           the bar owns tab switching, so the in-bar rail goes; the scorebug
           stays as the one line of slate context; the account pill and ⚙
           stay; the date badge drops to keep the row on one line. Only
           hdr-rail is hidden -- .rail is a shared scroll utility. */
        @media (max-width: 760px) {
          .hdr-rail { display: none !important; }
          .hdr-bar { gap: 6px !important; }
          /* Centred, both rows (Donovan: "the MOONSHOT button should be
             centre on the page; header and the button under it seem off"). */
          .hdr-brand { flex: 1 1 100%; justify-content: center; text-align: center; }
          .hdr-brand > div > div:first-child { justify-content: center; }
          .hdr-scorebug { justify-content: center; margin-left: auto; margin-right: auto; }
          .hdr-meta { padding-bottom: 8px; margin-left: auto !important; margin-right: auto !important; width: auto; justify-content: center; gap: 12px; }
          .hdr-meta .date-badge { display: none !important; }
        }
      `}</style>
    </header>
  )
}
