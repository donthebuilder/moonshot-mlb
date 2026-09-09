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

export default function MobileTabBar({ tab, setTab, main = MAIN, more = MORE, brand = 'MOONSHOT' }) {
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
      >
        <div className="mobileMoreHead"><div><small>{brand} · THE MAP</small><strong>Everything on this site</strong></div><button tabIndex={open ? undefined : -1} onClick={() => setOpen(false)} aria-label="Close More menu">×</button></div>
        <p className="mobileMoreLede">Every page, what each one is for, and the way across to the other two sites.</p>
        <div className="mobileMoreGrid">
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
              <button key={key} tabIndex={open ? undefined : -1} onClick={() => go(key)} className={tab === key ? 'active' : ''}>
                <span>{label}</span><small>{detail}</small>
              </button>
            )
          ))}
        </div>
      </aside>

      <nav className="mobileTabBar" aria-label={`${brand} primary navigation`}>
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
          .mobileTabBar button{position:relative;display:flex;flex-direction:row;align-items:center;gap:7px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:${C.text3};font-family:${NUM_FONT};font-size:10px;font-weight:800;letter-spacing:.03em;cursor:pointer}
          .mobileTabBar button i{color:${C.text2};font-family:system-ui;font-size:15px;font-style:normal;line-height:1}
          .mobileTabBar button:hover{color:${C.text2}}
          .mobileTabBar button.active{background:linear-gradient(145deg,#f9731628,#fcd34d0b);color:#fbbf24}
          .mobileTabBar button.active i{color:#fb923c;text-shadow:0 0 14px #f9731688}
          .mobileTabScrim{position:fixed;z-index:380;inset:0;display:block;border:0;background:#0009;backdrop-filter:blur(2px)}
          .mobileMore{position:fixed;z-index:385;left:50%;transform:translate(-50%,18px);bottom:66px;width:min(520px,92vw);display:block;max-height:min(68vh,520px);overflow:auto;padding:13px;border:1px solid ${C.border2};border-radius:17px;background:${C.bg2};box-shadow:0 25px 80px #000d;opacity:0;pointer-events:none;transition:transform .18s ease,opacity .18s ease}
          .mobileMore.open{transform:translate(-50%,0);opacity:1;pointer-events:auto}
          .mobileMoreHead{display:flex;align-items:center;justify-content:space-between;padding:2px 3px 11px}
          .mobileMoreHead small{display:block;color:#f97316;font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.14em}
          .mobileMoreHead strong{display:block;margin-top:3px;font-size:18px;color:${C.text}}
          .mobileMoreLede{margin:0 3px 10px;color:${C.text3};font-size:10.5px;line-height:1.5}
          .mobileMoreDot{position:absolute;top:6px;right:calc(50% - 17px);width:7px;height:7px;border-radius:50%;background:#f97316;box-shadow:0 0 0 2px ${C.bg2}}
          .mobileMoreHead button{width:32px;height:32px;border:1px solid ${C.border};border-radius:9px;background:${C.bg};color:${C.text2};cursor:pointer;font-size:20px}
          .mobileMoreGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
          /* A group heading spans the pair of columns and gets its air
             above rather than below, so it reads as a lid on the block
             beneath it rather than a floating label. */
          .mobileMoreGroup{grid-column:1/-1;margin:9px 2px 1px;font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:${C.text3}}
          .mobileMoreGroup:first-child{margin-top:0}
          .mobileMoreGrid button{text-align:left;min-height:59px;padding:9px 10px;border:1px solid ${C.border};border-radius:10px;background:${C.bg};color:${C.text2};cursor:pointer}
          .mobileMoreGrid button.active{border-color:#f9731670;background:#f9731614}
          .mobileMoreHome{grid-column:1/-1;display:block;min-height:0;padding:10px;border:1px solid #f9731640;border-radius:10px;background:#f9731610;color:${C.text2};text-decoration:none}
          .mobileMoreHome span{display:block;color:${C.orange};font-size:11px;font-weight:900}
          .mobileMoreHome small{display:block;margin-top:4px;color:${C.text3};font-size:8px;line-height:1.25}
          .mobileMoreGrid span{display:block;font-size:11px;font-weight:900}
          .mobileMoreGrid small{display:block;margin-top:4px;color:${C.text3};font-size:8px;line-height:1.25}
        }
        @media(max-width:760px){
          :global(.dashboard-main){padding-bottom:102px!important}
          .mobileTabBar{position:fixed;z-index:390;left:10px;right:10px;bottom:max(9px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(5,1fr);height:62px;padding:5px;border:1px solid ${C.border2};border-radius:17px;background:color-mix(in srgb,${C.bg2} 92%,transparent);box-shadow:0 18px 55px #000b,inset 0 1px 0 #ffffff0a;backdrop-filter:blur(18px) saturate(140%)}
          .mobileTabBar button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;border:0;border-radius:12px;background:transparent;color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.02em}
          .mobileTabBar button i{height:20px;color:${C.text2};font-family:system-ui;font-size:16px;font-style:normal;line-height:20px}
          .mobileTabBar button.active{background:linear-gradient(145deg,#f9731628,#fcd34d0b);color:#fbbf24}
          .mobileTabBar button.active i{color:#fb923c;text-shadow:0 0 14px #f9731688}
          .mobileTabBar button.active:after{content:'';position:absolute;left:28%;right:28%;bottom:2px;height:2px;border-radius:9px;background:#f97316}
          .mobileTabScrim{position:fixed;z-index:380;inset:0;display:block;border:0;background:#0009;backdrop-filter:blur(2px)}
          .mobileMore{position:fixed;z-index:385;left:10px;right:10px;bottom:78px;display:block;max-height:min(68vh,520px);overflow:auto;padding:13px;border:1px solid ${C.border2};border-radius:17px;background:${C.bg2};box-shadow:0 25px 80px #000d;transform:translateY(18px);opacity:0;pointer-events:none;transition:transform .18s ease,opacity .18s ease}
          .mobileMore.open{transform:none;opacity:1;pointer-events:auto}
          .mobileMoreHead{display:flex;align-items:center;justify-content:space-between;padding:2px 3px 11px}
          .mobileMoreHead small{display:block;color:#f97316;font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.14em}
          .mobileMoreHead strong{display:block;margin-top:3px;font-size:18px;color:${C.text}}
          .mobileMoreLede{margin:0 3px 10px;color:${C.text3};font-size:10.5px;line-height:1.5}
          .mobileMoreDot{position:absolute;top:6px;right:calc(50% - 17px);width:7px;height:7px;border-radius:50%;background:#f97316;box-shadow:0 0 0 2px ${C.bg2}}
          .mobileMoreHead button{width:32px;height:32px;border:1px solid ${C.border};border-radius:9px;background:${C.bg};color:${C.text2};font-size:20px}
          .mobileMoreGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
          /* A group heading spans the pair of columns and gets its air
             above rather than below, so it reads as a lid on the block
             beneath it rather than a floating label. */
          .mobileMoreGroup{grid-column:1/-1;margin:9px 2px 1px;font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:${C.text3}}
          .mobileMoreGroup:first-child{margin-top:0}
          .mobileMoreGrid button{text-align:left;min-height:59px;padding:9px 10px;border:1px solid ${C.border};border-radius:10px;background:${C.bg};color:${C.text2}}
          .mobileMoreGrid button.active{border-color:#f9731670;background:#f9731614}
          .mobileMoreHome{grid-column:1/-1;display:block;min-height:0;padding:10px;border:1px solid #f9731640;border-radius:10px;background:#f9731610;color:${C.text2};text-decoration:none}
          .mobileMoreHome span{display:block;color:${C.orange};font-size:11px;font-weight:900}
          .mobileMoreHome small{display:block;margin-top:4px;color:${C.text3};font-size:8px;line-height:1.25}
          .mobileMoreGrid span{display:block;font-size:11px;font-weight:900}
          .mobileMoreGrid small{display:block;margin-top:4px;color:${C.text3};font-size:8px;line-height:1.25}
        }
      `}</style>
    </>
  )
}
