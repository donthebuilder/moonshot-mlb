'use client'
import { useEffect, useState } from 'react'
import { C } from '../lib/theme'

// ❓ WHAT AM I LOOKING AT — the answer to the most common piece of feedback
// the site gets: "looks nice, but I don't know what I'm looking at."
//
// One short plain-language paragraph per tab, written for someone who has
// never seen the site: what this page IS, what the main number MEANS, and
// the one thing to actually do here. Auto-open the first time you visit each
// tab, then collapses to a small pill forever (localStorage). One voice,
// beginner-first — the dense stuff stays untouched underneath.

const TEXTS = {
  // ── 2026-08-16 consolidation: the two new host tabs. Old keys below are
  // kept — alias routes still land on them and the explainer follows the
  // route key, so a #tab=scoreboard visitor still gets the right paragraph.
  combos: {
    what: 'Parlays, all in one place. Pairs and Pools are the bot\u2019s own published combinations; History is how past ones actually graded. The ticket builder underneath lets you build your own from the five pick groups, with each leg\u2019s bar and measured rate stated \u2014 and it never multiplies two legs into one percentage, because same-game legs share a park, an arm and a game state.',
  },
  you: {
    what: 'Your side of the site. My Picks is the game \u2014 you against the bot, same slots, same bars, graded overnight, with a running record of where your judgement actually beats it. Watchlist is your saved hitters with their record while you\u2019ve watched them. Both live on this device only \u2014 export from either panel to back them up.',
  },
  home: {
    what: 'The front porch. A greeting, tonight in four numbers (games on the slate, the bot’s own projected HR range, first pitch, and its graded base-hit record), then a rotating line of real facts about tonight, the best air and weakest arms, and top-10 HR/hit boards. Nothing here is a new number — it’s the same data as every other tab, gathered up front. Pick a door below, or just start scrolling.',
  },
  scoreboard: {
    // ── REWRITTEN 2026-08-18 alongside the Rundown/Slate rename ─────────────
    // The old text described only the top of the page (The Four + the live
    // wire) as if that were the whole tab. It's the entry point into a full
    // sortable every-hitter table — the thing the rename is trying to name —
    // plus gone yard, near misses and projected output now live here too.
    what: 'Every hitter on tonight’s slate, one sortable table — this is Live. The Four (the bot’s headline pick per bet type) lead, then what’s already happened: the live wire, home runs already hit matched back to where the board had that hitter ranked, and the near misses that almost joined them. Projected output gives the slate’s expected home run count. Sort any column to ask a different question — Hit for contact plays, Park for launch pads — and click any name to open their full page.',
  },
  board: {
    what: 'Ranked lists of tonight’s hitters, one board per bet type, plus two lenses that sit alongside them: Power (distance, due bats and the luck report) and Patterns (the repeatable shapes — streaks, splits, after-a-blank). The score is the bot’s confidence on THAT bet — a 70 on the HR board and a 70 on the Hits board are different scales. 🤖 marks the bot’s official pick for that category, ★ means the pitcher is weak against this lineup spot, and “When picked” shows how this hitter has actually delivered before.',
  },
  longest: {
    what: 'Power, now a group inside Boards rather than its own tab. Longest HR asks “who hits the FARTHEST ball tonight” — a distance question, not a probability one. Due asks who’s been crushing the ball without homers to show for it. Parks ranks tonight’s launch pads by park factor plus the published weather. The Luck report is the honest layer: who’s been better than their results, and who’s been luckier than they look.',
  },
  games: {
    what: 'Tonight’s slate, game by game, in first-pitch order. Every card is the same size on the same flat surface — the heat is written, not painted: the band glyph (🌋 / 🔥 / 🧊) and the #rank beside it say where the board stacks highest, and the sort row reorders the grid by score, air, worst HR/9, worst WHIP or lowest K. Tap a card to open it in place and flip between its read, its lineups, the head-to-head and its picks. The Lineups mode shows every batting order at once with the bot’s pick chips underneath; click a game there and you get slot-by-slot — what the pitcher gives up to each lineup spot vs what the hitter standing there does. ⚾ Live is the At the Plate room, in place, once first pitch has gone.',
  },
  // PROPS (2026-08-23) — the page had no entry, so the redesign carried its
  // own paragraph inline, above the cards, on every visit. That is what this
  // component exists to stop: one paragraph, first visit, then a pill.
  props: {
    what: 'The decision page, built for a phone: one card per bat the bot designated tonight, and the verdict comes first. The ring is that pick’s score in ITS OWN market — a home-run card shows the home-run score, a 1+ hit card shows the hit score — so nothing is ever ranked against a number measured a different way. Under it, one plain sentence saying why this one, then the L5 / L10 / season tiles, which double as the streak. Cards are grouped by market with the market’s name in English above each block. Tap any card for the full read: props grid, splits, zone map, everything. 👀 WATCH is coverage, not a pick — the next power bats in each game, there so the slate is covered, never there to be backed.',
  },
  atplate: {
    what: 'Whoever is at the plate, right now, live. The count and every pitch of the at-bat build from tonight’s feed as it happens, with the batter’s zone map and spray chart switching to tonight-only dots — no season data mixed in. Tap anyone in the lineup or box score below to point the charts at them without leaving the page. Only live during games; it wakes up at first pitch.',
  },
  pitchers: {
    what: 'Tonight’s starting pitchers from the hitter’s point of view. High HR/9 means he gives up homers; the HR luck column flags arms who’ve allowed loud contact without paying for it yet — regression says target them. ★ Spots are the lineup positions he historically bleeds against.',
  },
  pairs: {
    what: 'Two-man home run tickets: both hitters need to go deep for the pair to cash. The bot builds these from tonight’s strongest combinations, and the history columns show how often each duo has connected before. Long odds by nature — that’s the shape of the bet, not a flaw.',
  },
  pools: {
    what: 'Group tickets: 3, 4, or 6 hitters where EVERY member must homer to cash. During games each pool grades live — 💥 marks who’s already gone deep. Most pools die unfinished on purpose; the payoff shape is lottery-like. The pair builder below lets you construct your own two-man around any anchor.',
  },
  bot: {
    // 2026-08-12: this used to invite a comparison against the Boards tab
    // to spot a "site calibration" — that ISO adjustment was retired
    // 2026-08-09 (see Bot.js's own header comment and TheRead.js, which
    // found and fixed the same stale claim on the Boards tab itself).
    // Every board ranks on the bot's raw numbers now; there's no gap left
    // to see between them.
    what: 'The bot’s raw output, untouched — the same sheet it publishes every day, plus a board ranked on its own overall score. Every board on the site ranks on the bot’s own numbers now, so this isn’t a different calibration to compare — it’s the bot’s own words, unformatted, and its own overall ranking instead of the HR-specific one.',
  },
  runs: {
    what: 'Every hitter on tonight’s card sorted by how many games running he has cleared the bar you pick — market and number are both chips, so 1+ Hit and 2+ Hits are different boards. The strip is his last games with the newest on the right and the active run lit up. Cold flips it to the drought board, because nine misses in a row is a position too. Each card also says how ordinary the streak is at his own rate: five in a row for a 60% hitter comes up about one stretch in thirteen.',
  },
  // ── ADDED 2026-08-18 ──────────────────────────────────────────────────
  // Donovan: "still don't really know how to use the true price page kinda
  // same with tonight's board the odds page — i like them both just don't
  // know what to do on them." Root cause: this tab's route key is 'odds'
  // (see lib/theme.js's TABS), and TEXTS had no 'odds' entry — only the old
  // pre-consolidation 'trueprice' key below, which describes just its ONE
  // sub-view. So the explainer silently rendered NOTHING (`if (!info) return
  // null`) on the tab as everyone actually reaches it from the nav bar. Not
  // a vague "make it clearer" ask — the explainer was never showing up.
  odds: {
    what: 'What the book is actually paying, tonight — two views. 💵 Tonight’s board is every live quote: the line, whether it’s plus money (the book thinks it’s unlikely — if your own read disagrees, that’s where the value is), and whether the book moved off the standard bar (1+ hit, 1+ homer) so you’re not reading a hit rate against a bet nobody’s offering. Home run is the only market with a real edge number, because hr_per_pa is the only per-game rate the slate publishes — everywhere else the price and the score sit side by side and you draw the line yourself. 🏷 True Price settles those same prices against the season: TRUE is what a hitter’s own rate says the bet is worth, GOES AT is what the book actually pays him, and the gap between them is the point — once it clears its own error bar. Start on the board for tonight’s live numbers; switch to True Price to see which gaps are backed by a real sample.',
  },
  trueprice: {
    what: 'Every price the bot fetched before first pitch, settled against that night’s box score. Two prices per row: TRUE is what a hitter’s own rate says the bet is worth, GOES AT is what the book has actually been paying him. The gap between them is the whole point — but a gap is not an edge until it beats its own error bar, so each row says how much the sample actually backs it. Click any row for the nights behind the numbers.',
  },
  leaders: {
    what: 'Plain season stats for tonight’s hitters — batting average, homers, OPS, the real baseball card numbers. Nothing here is modeled or scored; it’s the one page where the site has no opinion. Use it to sanity-check a pick against what a player has actually done all year.',
  },
  player: {
    what: 'Every hitter on tonight’s slate in one sortable table. Click any column header to re-sort, shift-click to add a tiebreaker, and click a row to open that player’s full page with props history, splits, and spray charts.',
  },
  watch: {
    what: 'Your saved hitters. Star anyone anywhere on the site and they collect here, with live “went deep / got a hit” tiles during games. Paste a list of names into the cross-reference box and the site matches them against tonight’s slate with full stats — built for checking someone else’s card against the bot’s.',
  },
  pairhist: {
    what: 'The season-long memory of which two hitters have homered on the SAME night before, and how often. Feeds the pair builder — a duo that’s connected five times is a different bet than one that never has.',
  },
  results: {
    what: 'The receipts. Every night the bot’s picks get graded against what actually happened, and it’s all here: nightly results, each player’s track record when picked, and the Report card — letter grades per category against their own season baselines. Picks lock at first pitch, so none of this can be quietly rewritten. This page is why you can trust the rest.',
  },
  guide: {
    what: 'The full manual — every score, flag, and emoji on the site explained in one place. If a number anywhere confuses you, its definition lives here.',
  },
}

// 2026-09-05: generalised for TUDDY -- pass `texts` (its own map), a
// `storageKey` (the two products share tab names, so 'home' seen on one must
// not silence the other) and an `accent`.
export default function TabExplainer({ tab, texts = TEXTS, storageKey = 'tab_explained', accent = C.orange }) {
  const info = texts[tab === 'due' ? 'longest' : tab === 'hitshrr' ? 'board' : tab]
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!info) return
    // Auto-open on the FIRST visit to each tab, pill afterward.
    try {
      const seen = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (!seen[tab]) {
        setOpen(true)
        seen[tab] = 1
        localStorage.setItem(storageKey, JSON.stringify(seen))
      } else {
        setOpen(false)
      }
    } catch { setOpen(false) }
  }, [tab])

  if (!info) return null

  if (!open) {
    return (
      <button className="tab-explainer" onClick={() => setOpen(true)} style={{
        fontSize: 9.5, fontWeight: 700, color: C.text3, cursor: 'pointer',
        background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 999,
        padding: '2px 10px', marginBottom: 8,
      }}>❓ what am I looking at</button>
    )
  }
  return (
    // .tab-explainer is what Quiet mode hides — see lib/quiet.js. The pill
    // above wears it too, so quiet means gone rather than collapsed to a
    // control you now have to ignore instead of read.
    <div className="tab-explainer" style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${accent}0a)`,
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 10, padding: '9px 13px', marginBottom: 12,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>❓</span>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, minWidth: 0 }}>{info.what}</div>
      <button onClick={() => setOpen(false)} style={{
        background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
        fontSize: 13, lineHeight: 1, flexShrink: 0, padding: 0,
      }}>✕</button>
    </div>
  )
}
