'use client'
// SCORES (2026-09-21) — the plain page. Donovan's page-by-page pass that
// day: Slate already does the deep, per-game analysis (THE SIX, matchup
// panels, environment cards) and Live already does the live rung-tracking;
// neither one is "just tell me the score," and asking for that shouldn't
// mean wading through either. This page has exactly one job and no others:
// every game this week, its kickoff or score, nothing scored or ranked.
// Same GameScoreboard component Live uses above its own card section — one
// real grid, two doors into it — never a second copy of the same logic.
import PageHeader from '../../PageHeader'
import GameScoreboard from '../GameScoreboard'
import { C, NUM_FONT } from '../../../lib/nfl/theme'

export default function Scores({ data }) {
  const games = data?.games || []
  const live = games.filter((g) => g.state === 'in').length
  const done = games.filter((g) => g.completed || g.state === 'post').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="TUDDY · SCORES"
        title="Just the score"
        note="Every game on this week's slate, kickoff or score, nothing ranked or graded. The deeper read on any of it is on Slate; live rung tracking is on Live."
        theme={C}
        numFont={NUM_FONT}
        accent={C.cyan}
        stats={[
          { value: live, label: 'LIVE', tone: C.cyan },
          { value: done, label: 'FINAL', tone: C.text2 },
          { value: games.length, label: 'GAMES', tone: C.text2 },
        ]}
      />
      {games.length
        ? <GameScoreboard games={games} />
        : <div style={{ padding: 22, border: `1px dashed ${C.border2}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: 10.5 }}>No games on the slate yet.</div>}
    </div>
  )
}
