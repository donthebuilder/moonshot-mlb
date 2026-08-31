'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import NetworkSwitch from './NetworkSwitch'

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
const MAIN = [
  ['home', '◎', 'Tonight'],
  ['board', '▥', 'Boards'],
  ['scoreboard', '◉', 'Rundown'],
  ['games', '▤', 'Slate'],
]

// 2026-08-30, Donovan: "the results need to be organized better...to
// flow." Regrouped from an arbitrary list into build-your-card, then
// review, then reference -- so the sheet reads top to bottom the way you'd
// actually use it on a slate night instead of alphabetical-ish clutter.
const MORE = [
  // 1) what to back tonight
  ['bot', 'Picks', 'What the bot says to back tonight'],
  ['props', 'Props', 'Player lines and quick cards'],
  ['pitchers', 'Pitchers', 'Starting arms and matchup pressure'],
  ['combos', 'Combos', 'Pairs, alignments, pools, and builder'],
  ['odds', 'Odds', 'Prices, movement, and true price'],
  // 2) yours / how it went
  ['you', 'You', 'Watchlist and your saved picks'],
  ['results', 'Results', 'Receipts and settled outcomes'],
  // 3) reference, last because it's the least-used stop
  ['guide', 'Guide', 'How every part of MOONSHOT works'],
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
export default function MobileTabBar({ tab, setTab, main = MAIN, more = MORE, brand = 'MOONSHOT' }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [tab])
  const go = (key) => { setOpen(false); setTab(key); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const mainKeys = new Set(main.map(([key]) => key))
  const moreActive = !mainKeys.has(tab)

  return (
    <>
      {open && <button className="mobileTabScrim" aria-label="Close More menu" onClick={() => setOpen(false)} />}
      <aside className={`mobileMore ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="mobileMoreHead"><div><small>{brand}</small><strong>More tools</strong></div><button onClick={() => setOpen(false)} aria-label="Close More menu">×</button></div>
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
            <button key={key} onClick={() => go(key)} className={tab === key ? 'active' : ''}>
              <span>{label}</span><small>{detail}</small>
            </button>
          ))}
        </div>
      </aside>

      <nav className="mobileTabBar" aria-label={`${brand} primary navigation`}>
        {main.map(([key, icon, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}>
            <i>{icon}</i><span>{label}</span>
          </button>
        ))}
        <button className={moreActive || open ? 'active' : ''} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <i>•••</i><span>More</span>
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
          .mobileMoreHead button{width:32px;height:32px;border:1px solid ${C.border};border-radius:9px;background:${C.bg};color:${C.text2};cursor:pointer;font-size:20px}
          .mobileMoreGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
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
          .mobileMoreHead button{width:32px;height:32px;border:1px solid ${C.border};border-radius:9px;background:${C.bg};color:${C.text2};font-size:20px}
          .mobileMoreGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
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
