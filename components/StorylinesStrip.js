'use client'
import { useEffect, useState } from 'react'
import StoryRow, { StoryParts, BoardBadge } from './StoryRow'

// 📰 THE HOME PAGE'S STORYLINES (BATCH-STORYLINES-PAGE step 4, 2026-09-27).
// The same engine and the same rows as the Storylines page
// (/api/stories -> lib/stories), cut to the rarest few across tonight's games
// still to start (every game, once they all have), each with the player's
// board chip -- then "See all storylines →" into the tab. It replaces what
// each home showed before (MOONSHOT's collapsed panel + History Watch, TUDDY's
// whole Storylines view, LAMP's History Watch), in the same place, no taller.
// Renders nothing when there is no story: an empty box is not a section.
export default function StorylinesStrip({ sport, theme: C, numFont, accent, max = 5, onSeeAll = null, onOpenPlayer = null, onOpenTeam = null }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/stories?sport=${encodeURIComponent(sport)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const games = data?.games || []
  const pre = new Set(games.filter((g) => g.state === 'pre').map((g) => g.game_id))
  const pool = (data?.stories || []).filter((s) => (pre.size ? pre.has(s.game_id) : true))
  if (!pool.length) return null
  const top = pool.slice(0, max)   // already rarest first (lib/stories/shape.js byRarity)
  return (
    <section aria-label="Storylines tonight" style={{ margin: '6px 0 12px', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      {/* One header line: the count and "See all" (44px) -- no footer line,
          so the section is no taller than what it replaced. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>📰 Storylines</span>
        <span style={{ fontSize: 11, color: C.text3, fontFamily: numFont, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pool.length} · rarest first</span>
        {onSeeAll ? (
          <button type="button" onClick={onSeeAll} aria-label="See all storylines, game by game" style={{ marginLeft: 'auto', flexShrink: 0, minHeight: 44, padding: '0 2px', border: 'none', background: 'transparent', color: accent, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            See all →
          </button>
        ) : null}
      </div>
      <div style={{ marginTop: 2 }}>
        {top.map((s) => (
          <StoryRow key={`${s.game_id}|${s.type}|${s.player_id}`} icon={s.icon} theme={C} title={`Source: ${s.source}`}
            // A team story (player_id "team:VAN") opens the team, so its club
            // name is a link like every other name (the clickable rule).
            onClick={String(s.player_id).startsWith('team:') ? (onOpenTeam ? () => onOpenTeam(s.team) : null)
              : onOpenPlayer && s.board ? () => onOpenPlayer(s.player_id, s) : null}
            style={{ fontSize: 12 }}>
            {/* the chip rides at the end of the sentence, not in a right column that squeezes it */}
            <StoryParts parts={s.parts} theme={C} numFont={numFont} />{s.board ? <> · <BoardBadge b={s.board} theme={C} numFont={numFont} accent={accent} /></> : null}
          </StoryRow>
        ))}
      </div>
    </section>
  )
}
