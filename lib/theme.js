export const C = {
  bg: '#09090b',
  bg2: '#111113',
  bg3: '#18181b',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.09)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#f4f4f5',
  // READABILITY PASS (2026-08-08, "easier to read for older/younger eyes
  // while keeping it futuristic"): both grey tiers stepped up one notch —
  // text2 was ~7:1 on the darkest cards, text3 ran ~4.2:1 at 9px, which is
  // squint territory. Hierarchy (three tiers) is preserved; each tier just
  // clears more contrast. Style untouched, strain reduced.
  text2: '#b4b4bc',
  text3: '#8b8b95',
  orange: '#f97316',
  yellow: '#f59e0b',
  cyan: '#22d3ee',
  green: '#4ade80',
  red: '#f87171',
  purple: '#a78bfa',
  blue: '#60a5fa',
  // ── TWO SURFACE TOKENS (2026-09-02, findings-log #24) ──────────────────
  // Overlays that sit ON TOP of the page -- the live toast stack, the spray
  // and zone tooltips, the pair tray, Franchise's phone dock -- were each
  // written as a literal `rgba(9,9,11,.9x)`. That is the ember ground with an
  // alpha, and it does not move when the palette does: in light mode the live
  // at-the-plate toasts rendered near-black text on a near-black card and
  // showed as four empty boxes with a 🎤 in them. `scrim` is that surface as a
  // token, `shadow` the drop shadow that goes with it -- a heavy black glow is
  // right over a dark ground and wrong over a pale one.
  scrim: 'rgba(9,9,11,.96)',
  shadow: 'rgba(0,0,0,.5)',
}
// CHROME PALETTE, APPLIED ON DEMAND. C is imported as a plain object by ~80
// components, so swapping palettes by prop would mean touching all of them —
// mutating the object once swaps the whole chrome with no component changes.
//
// ── NOT AT MODULE LOAD ANYMORE (2026-08-18) ─────────────────────────────
// The comment that used to sit here said mutating C at import time, before
// React renders, means "no flash." True for a client-only repaint — false,
// and worse than false, for the FIRST load: the server has no `window`, so
// it always renders the SSR'd HTML with the shipped (ember) palette baked
// into every inline style attribute. Mutating C at module load meant the
// CLIENT's very first render — the one React uses to hydrate against that
// server HTML — computed DIFFERENT style strings for potentially dozens of
// nodes simultaneously. Caught this by actually loading the light theme in a
// real browser (not from reading the code): it didn't just flash or mispaint
// a few things, it sometimes hit React error #423 — "the whole root gives up
// on hydrating and re-renders client-only" — which on this app (nothing
// meaningful in the fallback) shows as a blank crash screen. The four
// existing dark palettes had this exact same defect the whole time; nobody
// noticed because dark-on-dark mismatches don't produce a visible artifact
// and apparently never pushed React into the worst-case path.
//
// Fix: don't mutate until AFTER hydration has already committed once cleanly
// against the SSR'd (always-ember) HTML — see applyTheme() below, called
// from SportRoot's effect. A plain post-mount re-render can never trigger a
// hydration error; it's not hydration, it's just React re-rendering. The
// cost is a one-frame flash of ember before a non-default theme swaps in —
// smaller and safer than a crash, and it only touches sessions that picked a
// non-default theme in the first place.
export function applyTheme(key) {
  if (typeof window === 'undefined' || !key || key === 'ember') return false
  try {
    // Imported lazily to keep this module free of a load-order cycle:
    // themes.js must not import theme.js.
    const mod = require('./themes')
    const theme = mod.THEMES[key]
    if (!theme) return false
    Object.assign(C, theme.C)
    // LIGHT MODE also exposed the one thing this trick never covered:
    // app/globals.css hard-codes `html, body { background: #09090b }` — a
    // real CSS rule, not just a default, and BODY is what's actually
    // painted behind every pixel of the app (html's own background rarely
    // shows through at all). mono/steel/regal never noticed because they're
    // all dark too, close enough to that hardcoded value that nothing
    // looked wrong. Light mode made it obvious in the worst possible way:
    // every card that fades to a translucent accent colour (the hero, the
    // stale-slate banner, the ledger bar — anywhere a gradient runs from an
    // opaque colour to something like rgba(orange,.07)) was compositing
    // against that still-dark BODY, so the translucent end of the gradient
    // showed dark bleeding through instead of the intended pale tint —
    // looked exactly like a broken/dead card even though every C value and
    // every computed style was already correct. Original fix only patched
    // `documentElement` (the <html> tag); body has its OWN background rule
    // and sits on top, so it has to be set too.
    if (document.documentElement) {
      document.documentElement.style.background = C.bg
      document.documentElement.style.color = C.text
      document.documentElement.dataset.theme = key
      // Published as custom properties too, so app/globals.css can express
      // the ground and the phone dock in terms of the palette rather than
      // repeating ember's hex -- a plain CSS rule is not reachable from an
      // inline style, which is how the Franchise dock stayed near-black in
      // light mode while everything around it went pale.
      const root = document.documentElement.style
      root.setProperty('--dash-bg', C.bg)
      root.setProperty('--dash-text', C.text)
      root.setProperty('--dash-scrim', C.scrim)
    }
    if (document.body) {
      document.body.style.background = C.bg
      document.body.style.color = C.text
    }
    return true
  } catch { return false }
}

export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"
// All seventeen boards from the Streamlit build, in its order. Longest, Due,
// Pair History and Player are new here -- the Next.js app predates them.
// Order is deliberate: the boards you scan first, then the tools you reach for
// once you have names, then the archive. Scoreboard leads because it's the one
// view with every hitter and every column — you start wide and narrow down.
// Games moved down: it's a per-game read, which is where you go AFTER you know
// who you're interested in, not before.
// ── NINE TABS (2026-08-16, the approved consolidation) ──────────────────────
//
// Donovan: "honestly the site needs to be cleaned up and if merging tabs is
// what will do it but yeah" → a written plan → "yes do your thing get
// started." The rule the plan runs on: A TAB IS A QUESTION YOU ARRIVE WITH; A
// VIEW IS AN ANSWER you switch between once you're there. Before this pass
// the site was really 25 surfaces — 17 tabs plus 8 orphan routes reachable
// only by URL — because there was no rule for what deserved a tab.
//
// The nine questions, and what each tab absorbed:
//   Home      what's happening right now        (+ Scoreboard, + boxes)
//   Boards    who should I back, ranked         (+ Power, + due/longest/spray
//                                                 orphans, Patterns already in)
//   Games     what does one game look like      (+ At the Plate as Live mode)
//   Pitchers  what are the arms doing           (unchanged — earns its slot)
//   Picks     what does the bot actually say    (unchanged)
//   Combos    what combination bet do I build   (Pairs + Pools + pairhist)
//   Odds      what does the book charge         (+ True Price, its one home)
//   You       how am I doing, who am I watching (My Picks + Watchlist)
//   Results   has any of this been right        (+ Leaders)
//
// EVERY OLD KEY STILL ROUTES. Dashboard keeps alias routes for scoreboard,
// boxes, atplate, longest, due, hitshrr, pairs, pools, pairhist, mypicks,
// watch, trueprice, leaders, player, guide, spray, derby, runs — each opens
// the new host on the right view (or the standalone component where that is
// the safer render). Nothing was deleted; keys left this ROW, not the site.
// Guide is reachable from Home's "New here?" card and the Boards "how to
// read this site" pill, plus #tab=guide directly.
export const TABS = [
  ['home',        '🏠 Home'],
  // 'Charts', was 'Boards' (2026-08-17, "boards should be called like charts
  // or something else"). Key unchanged — every deep link holds.
  ['board',       '📊 Charts'],
  // ── SLATE IS BACK IN THE BAR (2026-08-17) ─────────────────────────────────
  // Donovan: "i dont like how the scoreboard is not easily accessible." The
  // consolidation folded the full-slate table into the Boards group as a link,
  // which made the single most-used table on the site two hops deep. A tab is a
  // question you arrive with — "show me every hitter tonight" is one — so it
  // earns the slot back. The route already existed; only this entry was gone.
  //
  // ── RENAMED 2026-08-18: "Slate" MOVES TO GAMES ────────────────────────────
  // Donovan: "change the name games to slate and fix the slate page to
  // another name for what's on it." This tab's page (components/tabs/
  // Scoreboard.js) is a flat, sortable, every-hitter-tonight table — a
  // rundown, not a slate of games — while Games.js is the actual per-game
  // browsing tool people mean when they say "the slate" (every matchup
  // tonight, first-pitch order). Keys are UNCHANGED — 'scoreboard' still
  // routes here, 'games' still routes there — every existing deep link and
  // #tab= URL still lands correctly. Only the label moved.
  // PROPS GRID (2026-08-23) — the mobile rebuild's pilot page (ideas doc
  // item 2): one card per decision, verdict first, depth behind a tap. A
  // tab is a question you arrive with — "who looks good to pick tonight" is
  // THE question three separate mobile complaints said the site wasn't
  // answering, so it earns the slot.
  ['props',       '🃏 Props'],
  ['scoreboard',  '🧮 Rundown'],
  ['games',       '🎮 Slate'],
  ['pitchers',    '⚾ Pitchers'],
  // Renamed 2026-08-10: the tab's job is the picks, and "Bot" named the
  // author rather than the contents. Key unchanged — every deep link holds.
  ['bot',         '🎯 Picks'],
  ['combos',      '🎟 Combos'],
  ['odds',        '💵 Odds'],
  ['you',         '⭐ You'],
  ['results',     '🧾 Results'],
]
