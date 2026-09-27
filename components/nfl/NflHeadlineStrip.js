'use client'
import NflFace from './NflFace'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import HeadlineStrip from '../HeadlineStrip'
import HistoryWatch from '../HistoryWatch'
import LongshotsPreview from '../LongshotsPreview'
import { buildNflHeadlines, buildNflLeaderRows } from '../../lib/nfl/headlines'

// ── THE HEADLINE STRIP (moved out of tabs/Home.js 2026-09-25) ───────────────
// Donovan's 09-25 pass: Live before kickoff opens the way MOONSHOT's Morning
// Edition does -- headline cards first. The strip and its CSS lived inside
// Home.js; Live needed it too, so it is its own component now and Home
// imports it back. The original note follows.
// ── THE ROTATING HEADLINE STRIP (parity pass, 2026-09-16) ─────────────────
// Donovan, side by side with MOONSHOT: TUDDY's home page needs "the same
// exact build as moonshot home page look wise and everything with the
// rotating headliner." MOONSHOT's Home leads with a self-scrolling row of
// headline cards (components/tabs/Home.js's own <Headlines>, built from
// lib/headlines.js's buildHeadlines()) that rolls right-to-left on its own,
// pauses under the pointer, and where every card is a tap. The Six's own
// "headliner" treatment (below) is a different pattern -- one card pulled
// out of a fixed six-up grid, not a rolling strip of several -- so it stays
// exactly as it is; this is the strip MOONSHOT's Home actually has and
// TUDDY's didn't. Same card shape (icon + tag + name + why + stat, 232px,
// two copies back to back for a seamless loop), built from
// lib/nfl/headlines.js's buildNflHeadlines() -- the bot's #1, the
// high-confidence flag, the aligned-signal stack, the softest matchup, the
// game to circle.
// 2026-09-26: the strip itself is shared (components/HeadlineStrip.js) --
// MOONSHOT's render, which is the reference; this file keeps TUDDY's cards
// (buildNflHeadlines) and what a tap opens. The card now draws exactly as
// MOONSHOT's (glass fill, 232px on a phone too) where the old private CSS
// used bg2 and a 200px phone width.
export default function NflHeadlineStrip({ players, games, markets, matchup, logs = null, onPlayerClick, setTab }) {
  // 📜 HISTORY WATCH (milestones plan step 4): the rarest claim within reach
  // this week leads the strip, and the group sits under it.
  const [hist, setHist] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/history/watch?sport=nfl').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHist(j?.items?.[0] || null) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const cards = useMemo(() => {
    // Around the League (TUDDY depth step 3): each page's own #1, after the bot's bites.
    const base = [...buildNflHeadlines({ players, games, markets, matchup }), ...buildNflLeaderRows({ players, games, markets, matchup, logs })]
    if (!hist) return base
    const p = (players || []).find((x) => String(x?.player_id) === String(hist.player_id)) || null
    return [{ k: `hist-${hist.player_id}-${hist.unit}`, tag: 'HISTORY WATCH', icon: '📜', name: hist.name, why: `Next: ${hist.claim}.`, stat: `${hist.hr} ${hist.unit}`, col: C.yellow, p }, ...base]
  }, [players, games, markets, matchup, logs, hist])
  const open = (c) => (c.p ? onPlayerClick?.(c.p, 'TD') : c.nav ? setTab?.(c.nav) : null)
  const byId = (id) => (players || []).find((x) => String(x?.player_id) === String(id))
  return (
    <>
      <HeadlineStrip cards={cards} onOpen={open} theme={C} numFont={NUM_FONT} accent={C.green} speed={30} faceOf={(c) => (c.p ? <NflFace player={c.p} size={22} /> : null)} />
      <HistoryWatch sport="nfl" unit="TD" reach="within reach this week" step="next" theme={C} numFont={NUM_FONT} onPlayerClick={(p) => { const row = byId(p.player_id); if (row) onPlayerClick?.(row, 'TD') }} />
      <LongshotsPreview sport="nfl" theme={C} numFont={NUM_FONT} accent={C.green} onSeeAll={() => setTab?.('longshots')}
        onOpenPlayer={(id) => { const row = byId(id); if (row) onPlayerClick?.(row, 'TD') }} />
    </>
  )
}
