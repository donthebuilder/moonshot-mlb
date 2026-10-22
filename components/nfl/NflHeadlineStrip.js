'use client'
import PlayerFace from '../PlayerFace'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { useGameNav } from '../../lib/teamNav'
import HeadlineStrip from '../HeadlineStrip'
import HistoryWatch from '../HistoryWatch'
import LongshotsPreview from '../LongshotsPreview'
import { buildNflHeadlines, buildNflLeaderRows } from '../../lib/nfl/headlines'
import { slateTotals } from '../../lib/nfl/teamTdModel'
import { sharedJSON } from '../../lib/sharedRead'
import { TYPE_WORD } from '../StoryTape'

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
// stories (2026-10-22, Donovan: "the headlines and the tape can be ... merged into the same thing, with the look of the headlines"):
// the week's storylines (/api/stories, one per player, rarest first) ride in the same strip as headline cards, interleaved.
// extras: the History Watch group and the Longshots preview under the strip (Home leaves them off; Live keeps them).
const STORY_CARDS = 8
export default function NflHeadlineStrip({ players, games, markets, matchup, logs = null, week = null, onPlayerClick, setTab, stories = false, extras = true }) {
  // 📜 HISTORY WATCH (milestones plan step 4): the rarest claim within reach
  // this week leads the strip, and the group sits under it.
  const [hist, setHist] = useState(null)
  useEffect(() => {
    let alive = true
    sharedJSON('/api/history/watch?sport=nfl').then((j) => { if (alive) setHist(j?.items?.[0] || null) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const [tape, setTape] = useState(null)
  useEffect(() => {
    if (!stories) return undefined
    let alive = true
    sharedJSON('/api/stories?sport=nfl').then((j) => { if (alive) setTape(j || null) }).catch(() => {})
    return () => { alive = false }
  }, [stories])
  const storyCards = useMemo(() => {
    const rec = new Map((tape?.summary || []).map((x) => [x.type, x]))
    const seen = new Set(), out = []
    for (const st of tape?.stories || []) {
      if (st.type === 'model' || seen.has(st.player_id || st.text)) continue
      seen.add(st.player_id || st.text)
      const p = (players || []).find((x) => String(x?.player_id) === String(st.player_id)) || null
      const r = rec.get(st.type)
      // the line without the leading name (the card's name line says it)
      const why = (st.parts || []).filter((x, i) => !(i === 0 && x.t === 'name')).map((x) => x.v).join('').trim().replace(/^[—,-]\s*/, '')
      out.push({ k: `st-${st.type}-${st.player_id || out.length}`, tag: TYPE_WORD[st.type] || String(st.type || '').toUpperCase(), icon: st.icon, name: st.name, why: why || st.text,
        stat: r?.n ? `${r.hit}/${r.n} hit` : st.board?.score != null ? `${st.board.score}` : '', col: C.green, p })
      if (out.length >= STORY_CARDS) break
    }
    return out
  }, [tape, players])
  const cards = useMemo(() => {
    // Around the League (TUDDY depth step 3): each page's own #1, after the bot's bites.
    const totals = slateTotals(week, logs)   // the team model's number for GAME TO CIRCLE
    const base = [...buildNflHeadlines({ players, games, markets, matchup, totals }), ...buildNflLeaderRows({ players, games, markets, matchup, logs })]
    // the storylines interleave with the headlines: headline, story, headline, story ...
    const mixed = []
    for (let i = 0; i < Math.max(base.length, storyCards.length); i++) { if (base[i]) mixed.push(base[i]); if (storyCards[i]) mixed.push(storyCards[i]) }
    if (!hist) return mixed
    const p = (players || []).find((x) => String(x?.player_id) === String(hist.player_id)) || null
    return [{ k: `hist-${hist.player_id}-${hist.unit}`, tag: 'HISTORY WATCH', icon: '📜', name: hist.name, why: `Next: ${hist.claim}.`, stat: `${hist.hr} ${hist.unit}`, col: C.yellow, p }, ...mixed]
  }, [players, games, markets, matchup, logs, week, hist, storyCards])
  const openGame = useGameNav()
  // a game card opens THAT game (game=<id> in the address), not just the Games tab
  const open = (c) => (c.p ? onPlayerClick?.(c.p, 'TD') : c.gameId && openGame ? openGame(c.gameId) : c.nav ? setTab?.(c.nav) : null)
  const byId = (id) => (players || []).find((x) => String(x?.player_id) === String(id))
  return (
    <>
      <HeadlineStrip sport="nfl" cards={cards} {...(stories ? { title: 'HEADLINES + STORIES', countWord: 'in the strip' } : null)} onOpen={open} theme={C} numFont={NUM_FONT} accent={C.green} speed={30} onOpenGame={openGame} faceOf={(c) => (c.p ? <PlayerFace sport="nfl" espnId={c.p?.espn_id} team={c.p?.team} name={c.p?.name} size={22} /> : null)} />
      {extras ? <HistoryWatch sport="nfl" unit="TD" reach="within reach this week" step="next" theme={C} numFont={NUM_FONT} onPlayerClick={(p) => { const row = byId(p.player_id); if (row) onPlayerClick?.(row, 'TD') }} /> : null}
      {extras ? <LongshotsPreview plain sport="nfl" theme={C} numFont={NUM_FONT} accent={C.green} onSeeAll={() => setTab?.('longshots')}
        onOpenPlayer={(id) => { const row = byId(id); if (row) onPlayerClick?.(row, 'TD') }} /> : null}
    </>
  )
}
