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
  home: {
    what: 'The front porch. A greeting, tonight in four numbers (games on the slate, the bot’s own projected HR range, first pitch, and its graded base-hit record), then a rotating line of real facts about tonight, the best air and weakest arms, and top-10 HR/hit boards. Nothing here is a new number — it’s the same data as every other tab, gathered up front. Pick a door below, or just start scrolling.',
  },
  scoreboard: {
    what: 'This is tonight at a glance. The Four are the bot’s headline picks — one hitter per bet type (going deep, getting a hit, runs+RBI, total bases). During games the green Live wire at the top grades those picks in real time. Start here, click any name to open their full page.',
  },
  board: {
    what: 'Ranked lists of tonight’s hitters, one board per bet type. The score is the bot’s confidence on THAT bet — a 70 on the HR board and a 70 on the Hits board are different scales. 🤖 marks the bot’s official pick for that category, ★ means the pitcher is weak against this lineup spot, and “When picked” shows how this hitter has actually delivered before.',
  },
  longest: {
    what: 'Power, two ways. Longest HR asks “who hits the FARTHEST ball tonight” — a distance question, not a probability one. Due asks who’s been crushing the ball without homers to show for it. The Luck report at the bottom is the honest layer: who’s been better than their results, and who’s been luckier than they look.',
  },
  games: {
    what: 'Tonight’s slate, game by game. The cards up top are heat-sized — the bigger and warmer a card, the more dangerous that game’s lineups. Click one to open it in depth. The Lineups button shows every batting order at once with the bot’s pick chips underneath; click a game there and you get slot-by-slot — what the pitcher gives up to each lineup spot vs what the hitter standing there does.',
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

export default function TabExplainer({ tab }) {
  const info = TEXTS[tab === 'due' ? 'longest' : tab === 'hitshrr' ? 'board' : tab]
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!info) return
    // Auto-open on the FIRST visit to each tab, pill afterward.
    try {
      const seen = JSON.parse(localStorage.getItem('tab_explained') || '{}')
      if (!seen[tab]) {
        setOpen(true)
        seen[tab] = 1
        localStorage.setItem('tab_explained', JSON.stringify(seen))
      } else {
        setOpen(false)
      }
    } catch { setOpen(false) }
  }, [tab])

  if (!info) return null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        fontSize: 9.5, fontWeight: 700, color: C.text3, cursor: 'pointer',
        background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 999,
        padding: '2px 10px', marginBottom: 8,
      }}>❓ what am I looking at</button>
    )
  }
  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}`,
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
