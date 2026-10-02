'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import NetworkSwitch from './NetworkSwitch'
import { MLB_NAV, MLB_MORE_GROUPS } from '../lib/routes'

// 2026-08-30, Donovan: "i want slate as a selection on the navigator at the
// bottom... slate replaces picks on the bar." Picks (bot) moves into the More
// sheet in its old Slate slot; Slate (games) takes the bar spot Picks had.
// 2026-08-31, Donovan: "i think we need a true home button too."
// This slot used to be a HOUSE labelled Home, and it goes to MOONSHOT's own
// overview tab -- not to the network front door. Two different places were
// wearing the same glyph and the same word, and the one people actually
// reach for when they want out is the other one. The tab is unchanged and
// still first; it is just called what it is. The house is now spoken for by
// exactly one thing on the whole site, and that thing is the front door.
//
// ── 2026-09-03: PROPS GETS A LANE, AND THE LABELS COME FROM ONE TABLE ───────
//
// Donovan: "Props needs a lane on there." It did not have one -- it was
// PRIMARY on the desktop rail and buried in this sheet on a phone, so the two
// navigations of the same product disagreed about what mattered. They are the
// same five stops now.
//
// The slot came from Tonight, which left both bars: the MOONSHOT wordmark in
// the header is the home button now (components/Header.js), which is where a
// home button belongs and is visible on a phone -- only .hdr-rail is hidden
// below 760px, not the brand row.
//
// Labels and blurbs are read from lib/routes.js rather than written here.
// This file used to spell them out, Header.js spelled them out differently,
// and routes.js had a third set; `board` was "Boards" here and "Charts" there.
const MAIN_KEYS = ['props', 'board', 'scoreboard', 'games']
const MAIN = MAIN_KEYS.map((k) => [k, MLB_NAV[k].icon, MLB_NAV[k].label])

// 2026-08-30, Donovan: "the results need to be organized better...to
// flow." Regrouped from an arbitrary list into build-your-card, then
// review, then reference -- so the sheet reads top to bottom the way you'd
// actually use it on a slate night instead of alphabetical-ish clutter.
//
// The sheet is grouped now and carries EVERY page, not eight of them. Seven
// had no way in at all before this -- Derby, Leaders, Runs, Spray board,
// Player board, True Price and the Guide were URL-only. A group heading is an
// entry whose key starts with '@'.
//
// Tonight leads the list even though it is no longer on the bar: this sheet
// calls itself "everything on this site", and the front page is part of
// everything. Picks leads the pages because on a slate night it is what the
// sheet gets opened for.
const MORE = [
  ['@Tonight', ''],
  ['home', MLB_NAV.home.label, MLB_NAV.home.blurb],
  ['bot', MLB_NAV.bot.label, MLB_NAV.bot.blurb],
  ...MLB_MORE_GROUPS.flatMap(([group, keys]) => [
    [`@${group}`, ''],
    ...keys.map((k) => [k, MLB_NAV[k].label, MLB_NAV[k].blurb]),
  ]),
]

// C3 (dash-network-master-plan-2026-08-28.md): "Pilot: mobile-only bottom
// bar for MOONSHOT with five slots (Home · Boards · Rundown · Picks ·
// More)... If it feels right, NFL copies it." This component was hardcoded
// to MOONSHOT's own tab list and brand name. Generalized here (2026-08-28)
// via optional props, defaulting to the exact original MAIN/MORE/brand
// values -- MOONSHOT's existing <MobileTabBar tab={tab} setTab={setTab} />
// call site in Dashboard.js is untouched and renders identically. NFL's own
// arrays live in components/nfl/MobileTabBarNfl.js, which imports this file
// and supplies its own main/more/brand.
// ── #5: NOBODY IS TOLD THE MAP IS BEHIND THE ELLIPSIS ──────────────────────
//
// This sheet is the best explanation of the site anywhere in the product --
// every tab, one line each on what it is for, plus the way out to the other
// two sites -- and it was headed "More tools" behind a •••. A first-timer has
// no reason to tap that, and nothing anywhere else says it is there.
//
// Two changes, neither of them a tour: the sheet says what it is, and the
// button carries a dot until it has been opened once. The dot is stored per
// device and is the smallest possible nudge -- it goes away the first time
// someone looks, and it never comes back.
const SEEN_KEY = 'moonshot_more_seen_v1'

export default function MobileTabBar({ tab, setTab, main = MAIN, more = MORE, brand = 'MOONSHOT', accent = null }) {
  // EACH PRODUCT ITS OWN ACCENT (0g C1, 2026-10-01). The active tab, its
  // underline, the More dot and the active More row were MOONSHOT orange on
  // TUDDY's and LAMP's bars. `accent` (TUDDY jade, LAMP ice) replaces them;
  // MOONSHOT passes none and keeps exactly the orange / amber it had.
  const AC = accent || '#f97316'
  const AC_TEXT = accent || '#fbbf24'
  const AC_ICON = accent || '#fb923c'
  const AC_FADE = accent ? `${accent}0b` : '#fcd34d0b'
  const [open, setOpen] = useState(false)
  const sheetRef = useRef(null)
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    if (open) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [open])
  const [seen, setSeen] = useState(true)   // assume seen until the client says otherwise
  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY) === '1') } catch { setSeen(true) }
  }, [])
  const markSeen = () => {
    if (seen) return
    setSeen(true)
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* a full store is not a reason to nag */ }
  }
  useEffect(() => setOpen(false), [tab])
  // Escape closes the drawer; a swipe to the right (60px, mostly sideways)
  // closes it the way it came in.
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  const touch = useRef(null)
  const swipeStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }
  const swipeEnd = (e) => {
    const from = touch.current; touch.current = null
    const t = e.changedTouches[0]
    if (!from || !t) return
    const dx = t.clientX - from.x, dy = Math.abs(t.clientY - from.y)
    if (dx > 60 && dx > dy * 1.5) setOpen(false)
  }

  // ── OUT OF THE WAY WHILE YOU READ (2026-09-28, Donovan) ──────────────────
  // Hide on scroll down, back on scroll up, every sport, phone and desktop.
  // Back as well near the top and at the very bottom of a page, and never
  // tucked while the More sheet is open or a key has focus in the bar (CSS
  // :focus-within). 12px of travel before it moves, so a thumb resting on
  // the glass doesn't flicker it. A jump bigger than a screen in one frame is
  // the page moving itself (a modal's scroll lock giving the page back, a
  // tab change) rather than someone reading, so it doesn't count either way.
  const [tucked, setTucked] = useState(false)
  useEffect(() => {
    let last = window.scrollY || 0
    let queued = false
    const read = () => {
      queued = false
      const y = Math.max(0, window.scrollY || 0)
      const dy = y - last
      const bottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4
      if (y < 80 || bottom) { setTucked(false); last = y; return }
      if (Math.abs(dy) < 12) return
      if (Math.abs(dy) < window.innerHeight) setTucked(dy > 0)
      last = y
    }
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(read) } }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const go = (key) => { setOpen(false); setTab(key); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const mainKeys = new Set(main.map(([key]) => key))
  // 'home' is in neither the bar nor `mainKeys` any more -- the MOONSHOT
  // wordmark in the header owns it (2026-09-03). Without this exception the
  // More button would light up on the front page, telling you that where you
  // are is behind a menu you have not opened.
  const moreActive = !mainKeys.has(tab) && tab !== 'home'

  return (
    <>
      {open && <button className="mobileTabScrim" aria-label="Close More menu" onClick={() => setOpen(false)} />}
      {/* ── A HIDDEN SHEET THAT COULD STILL BE TABBED INTO ────────────────
          aria-hidden told a screen reader this was not here; nothing told the
          keyboard. So every link in the closed More sheet stayed in the tab
          order, and a keyboard user tabbing off the last visible control fell
          into a panel they could not see and could not read — announced as
          nothing, because aria-hidden had removed the names.

          `inert` is the attribute that means both at once, and it is set on
          the node in an effect rather than passed as a prop: React 18 does not
          know `inert`, drops it silently, and the first version of this fix
          therefore rendered nothing at all while reading as correct in the
          source. Verified with axe, not by looking at it.

          The per-child tabIndex={-1} stays as well. `inert` alone would be
          enough in a current browser, but a browser that ignores it would
          leave the entire bug in place behind a fix that looks done. */}
      <aside
        ref={sheetRef}
        className={`mobileMore ${open ? 'open' : ''}`}
        aria-hidden={!open}
        aria-label={`${brand} · every page`}
        onTouchStart={swipeStart}
        onTouchEnd={swipeEnd}
      >
        <div className="mobileMoreHead"><div><small>{brand} · THE MAP</small><strong>Everything on this site</strong></div><button tabIndex={open ? undefined : -1} onClick={() => setOpen(false)} aria-label="Close More menu">×</button></div>
        <p className="mobileMoreLede">Every page, what each one is for, and the way across to the other two sites.</p>
        <div className="mobileMoreList">
          {/* THE NETWORK SWITCH LIVES HERE NOW (2026-08-29). Donovan: "remove
              the little floating ico, its redundant now — just make it so we
              can navigate the different sites from the nav thing at the
              bottom." The draggable launcher that used to float over every
              page is deleted; this row is its replacement, and it is first in
              the sheet because on a phone the switcher is the hardest thing
              to find. Leaving the sport is a link, not a tab, so it sits
              outside the grid of tabs below. */}
          <NetworkSwitch onNavigate={() => setOpen(false)} />
          {more.map(([key, label, detail]) => (
            key.startsWith('@') ? (
              <div key={key} className="mobileMoreGroup">{key.slice(1)}</div>
            ) : (
              <button key={key} tabIndex={open ? undefined : -1} onClick={() => go(key)} className={`mobileMoreRow${tab === key ? ' active' : ''}`} aria-current={tab === key ? 'page' : undefined}>
                <span>{label}</span><small>{detail}</small><em aria-hidden="true">›</em>
              </button>
            )
          ))}
        </div>
      </aside>

      <nav className={`mobileTabBar${tucked && !open ? ' tucked' : ''}`} aria-label={`${brand} primary navigation`} style={{ '--tab-count': main.length + 1 }}>
        {main.map(([key, icon, label]) => (
          <button key={key} tabIndex={open ? undefined : -1} className={tab === key ? 'active' : ''} onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}>
            <i>{icon}</i><span>{label}</span>
          </button>
        ))}
        <button
          className={moreActive || open ? 'active' : ''}
          onClick={() => { markSeen(); setOpen((value) => !value) }}
          aria-expanded={open}
          aria-label={seen ? 'More' : 'More — every page on this site and what each one is for'}
        >
          <i>•••</i><span>More</span>
          {!seen && <b className="mobileMoreDot" aria-hidden="true" />}
        </button>
      </nav>

      <style jsx>{`
        .mobileTabBar,.mobileMore,.mobileTabScrim{display:none}
        .mobileTabBar{transition:transform .22s ease}
        @media(prefers-reduced-motion:reduce){.mobileTabBar{transition:none}}
        /* ── MORE IS A SIDE DRAWER (Batch 2, 2026-09-28, Donovan picked it) ──
           It was a card floating above the bar, 68% of the screen at most,
           two columns of tiles. Now it comes in from the right edge at full
           height, one plain list (name, one line, ›), and scrolls on its own
           without dragging the page. Same on a phone and a desktop. The bar
           stays on top of it (z 390 > 385), so the list pads its end clear of
           the bar. Tap the dimmed page, the ×, Escape, or swipe it right to
           close. Closed, it is off-screen AND hidden, so it can't widen the
           page or be reached. */
        .mobileTabScrim{position:fixed;z-index:380;inset:0;display:block;border:0;background:#0009;backdrop-filter:blur(2px)}
        .mobileMore{position:fixed;z-index:385;top:0;right:0;bottom:0;display:flex;flex-direction:column;width:min(380px,86vw);padding:calc(14px + env(safe-area-inset-top)) 14px 0;border-left:1px solid ${C.border2};background:${C.bg2};box-shadow:-25px 0 80px #000d;transform:translateX(100%);visibility:hidden;transition:transform .22s ease,visibility 0s linear .22s;overscroll-behavior:contain}
        .mobileMore.open{transform:none;visibility:visible;transition:transform .22s ease}
        @media(prefers-reduced-motion:reduce){.mobileMore,.mobileMore.open{transition:none}}
        .mobileMoreHead{display:flex;align-items:center;justify-content:space-between;padding:2px 3px 11px}
        .mobileMoreHead small{display:block;color:${AC};font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.14em}
        .mobileMoreHead strong{display:block;margin-top:3px;font-size:18px;color:${C.text}}
        .mobileMoreHead button{width:44px;height:44px;border:1px solid ${C.border};border-radius:11px;background:${C.bg};color:${C.text2};cursor:pointer;font-size:22px}
        .mobileMoreLede{margin:0 3px 10px;color:${C.text3};font-size:12px;line-height:1.5}
        .mobileMoreDot{position:absolute;top:6px;right:calc(50% - 17px);width:7px;height:7px;border-radius:50%;background:${AC};box-shadow:0 0 0 2px ${C.bg2}}
        .mobileMoreList{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;margin:0 -14px;padding:0 14px calc(96px + env(safe-area-inset-bottom))}
        .mobileMoreGroup{margin:16px 3px 4px;font-family:${NUM_FONT};font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:${C.text3}}
        .mobileMoreRow{display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:10px;width:100%;min-height:48px;padding:8px 10px;border:0;border-bottom:1px solid ${C.border};border-radius:0;background:transparent;color:${C.text2};text-align:left;cursor:pointer}
        .mobileMoreRow span{font-size:13px;font-weight:800;color:${C.text}}
        .mobileMoreRow small{grid-column:1;margin-top:2px;color:${C.text3};font-size:11px;line-height:1.3}
        .mobileMoreRow em{grid-column:2;grid-row:1/span 2;color:${C.text3};font-style:normal;font-size:18px}
        .mobileMoreRow:hover{background:${C.bg}}
        .mobileMoreRow.active{border-radius:10px;border-bottom-color:transparent;background:${AC}14}
        .mobileMoreRow.active span,.mobileMoreRow.active em{color:${accent || C.orange}}
        @media(min-width:761px){.mobileMoreList{padding-bottom:76px}}
        /* ── THE BAR, ON DESKTOP TOO (2026-08-29) ──────────────────────────
           Donovan picked it from three mocked options: "the nav going
           horizontal across the bottom screen like on the phone — just make
           it slim." Same component, same five stops, same More sheet — one
           nav grammar on every screen, which is the whole point. Desktop gets
           the SLIM skin: 46px, icon and label side by side instead of
           stacked, centered, so it reads as a dock rather than a phone bar
           blown up. Nothing else moves; the top header keeps identity and
           status exactly as it is. */
        @media(min-width:761px){
          :global(.dashboard-main){padding-bottom:66px!important}
          .mobileTabBar{position:fixed;z-index:390;left:50%;transform:translateX(-50%);bottom:10px;display:flex;gap:2px;height:46px;padding:5px 8px;border:1px solid ${C.border2};border-radius:14px;background:color-mix(in srgb,${C.bg2} 90%,transparent);box-shadow:0 14px 45px #000b,inset 0 1px 0 #ffffff0a;backdrop-filter:blur(18px) saturate(140%)}
          .mobileTabBar.tucked:not(:focus-within){transform:translate(-50%,calc(100% + 24px))}
          .mobileTabBar button{position:relative;display:flex;flex-direction:row;align-items:center;gap:7px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:${C.text3};font-family:${NUM_FONT};font-size:10px;font-weight:800;letter-spacing:.03em;cursor:pointer}
          .mobileTabBar button i{color:${C.text2};font-family:system-ui;font-size:15px;font-style:normal;line-height:1}
          .mobileTabBar button:hover{color:${C.text2}}
          .mobileTabBar button.active{background:linear-gradient(145deg,${AC}28,${AC_FADE});color:${AC_TEXT}}
          .mobileTabBar button.active i{color:${AC_ICON};text-shadow:0 0 14px ${AC}88}
        }
        @media(max-width:760px){
          :global(.dashboard-main){padding-bottom:102px!important}
          .mobileTabBar{position:fixed;z-index:390;left:10px;right:10px;bottom:max(9px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(var(--tab-count,5),1fr);height:62px;padding:5px;border:1px solid ${C.border2};border-radius:17px;background:color-mix(in srgb,${C.bg2} 92%,transparent);box-shadow:0 18px 55px #000b,inset 0 1px 0 #ffffff0a;backdrop-filter:blur(18px) saturate(140%)}
          .mobileTabBar.tucked:not(:focus-within){transform:translateY(calc(100% + 24px + env(safe-area-inset-bottom)))}
          .mobileTabBar button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;border:0;border-radius:12px;background:transparent;color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.02em}
          .mobileTabBar button i{height:20px;color:${C.text2};font-family:system-ui;font-size:16px;font-style:normal;line-height:20px}
          .mobileTabBar button.active{background:linear-gradient(145deg,${AC}28,${AC_FADE});color:${AC_TEXT}}
          .mobileTabBar button.active i{color:${AC_ICON};text-shadow:0 0 14px ${AC}88}
          .mobileTabBar button.active:after{content:'';position:absolute;left:28%;right:28%;bottom:2px;height:2px;border-radius:9px;background:${AC}}
        }
      `}</style>
    </>
  )
}
