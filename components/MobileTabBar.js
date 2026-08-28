'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

const MAIN = [
  ['home', '⌂', 'Home'],
  ['board', '▥', 'Boards'],
  ['scoreboard', '◉', 'Rundown'],
  ['bot', '✦', 'Picks'],
]

const MORE = [
  ['props', 'Props', 'Player lines and quick cards'],
  ['games', 'Slate', 'Every game and live context'],
  ['pitchers', 'Pitchers', 'Starting arms and matchup pressure'],
  ['combos', 'Combos', 'Pairs, alignments, pools, and builder'],
  ['odds', 'Odds', 'Prices, movement, and true price'],
  ['you', 'You', 'Watchlist and your saved picks'],
  ['results', 'Results', 'Receipts and settled outcomes'],
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
          .mobileMoreGrid span{display:block;font-size:11px;font-weight:900}
          .mobileMoreGrid small{display:block;margin-top:4px;color:${C.text3};font-size:8px;line-height:1.25}
        }
      `}</style>
    </>
  )
}
