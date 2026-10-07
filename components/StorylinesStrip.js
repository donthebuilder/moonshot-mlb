'use client'
import { useEffect, useState } from 'react'
import StoryRow, { StoryParts, BoardBadge } from './StoryRow'
import TeamMark from './TeamMark'
import { gameHref } from '../lib/routes'
import { localDayTime } from '../lib/localTime'

// 📰 THE HOME PAGE'S STORYLINES (BATCH-STORYLINES-PAGE step 4, 2026-09-27;
// grouped into GAMES WORTH WATCHING 2026-10-04, see below).
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
  // GAMES WORTH WATCHING (2026-10-04, Donovan's user review: "lead the casual
  // home with a Storylines 'games worth watching' card ... stories are about
  // players, not a plain why-watch-this-game line"). The same stories, grouped
  // by game: the matchup in names, its start in the viewer's zone, how many stories, and the
  // rarest one as the reason to watch. Most-storied games first.
  const byGame = new Map()
  for (const st of pool) { if (!byGame.has(st.game_id)) byGame.set(st.game_id, []); byGame.get(st.game_id).push(st) }   // pool is rarest first
  const gameOf = new Map(games.map((g) => [g.game_id, g]))
  const rows = [...byGame.entries()].map(([id, list]) => ({ id, g: gameOf.get(id) || {}, list }))
    .sort((a, b) => b.list.length - a.list.length || String(a.g.start || '').localeCompare(String(b.g.start || '')))
  const top = rows.slice(0, max)
  const when = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? localDayTime(t) : '' }
  const storyClick = (s) => (String(s.player_id).startsWith('team:') ? (onOpenTeam ? () => onOpenTeam(s.team) : null) : onOpenPlayer && s.board ? () => onOpenPlayer(s.player_id, s) : null)
  return (
    <section aria-label="Games worth watching" style={{ margin: '6px 0 12px', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>📰 Games worth watching</span>
        <span style={{ fontSize: 11, color: C.text3, fontFamily: numFont, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{byGame.size} {byGame.size === 1 ? 'game' : 'games'}</span>
        {onSeeAll ? (
          <button type="button" onClick={onSeeAll} aria-label="See every storyline, game by game" style={{ marginLeft: 'auto', flexShrink: 0, minHeight: 44, padding: '0 2px', border: 'none', background: 'transparent', color: accent, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            See all →
          </button>
        ) : null}
      </div>
      {top.map(({ id, g, list }) => {
        const s = list[0]
        return (
          <div key={id} style={{ borderTop: `1px solid ${C.border}`, padding: '7px 0 4px' }}>
            {/* the game is a link to that game (the clickable rule), 44px tall */}
            <a href={gameHref(sport, id)} aria-label={`Open ${g.away && g.home ? `${g.away} at ${g.home}` : 'this game'}`} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 44, fontFamily: numFont, fontSize: 12, color: 'inherit', textDecoration: 'none' }}>
              {g.away ? <TeamMark sport={sport} abbr={g.away} variant="logo" px={16} /> : null}
              <b style={{ color: C.text }}>{g.away && g.home ? `${g.away} @ ${g.home}` : s.team}</b>
              {g.home ? <TeamMark sport={sport} abbr={g.home} variant="logo" px={16} /> : null}
              <span style={{ color: C.text3 }}>{[when(g.start), `${list.length} ${list.length === 1 ? 'story' : 'stories'}`].filter(Boolean).join(' · ')}</span>
              <span style={{ marginLeft: 'auto', color: accent, fontWeight: 800 }}>›</span>
            </a>
            <StoryRow icon={s.icon} theme={C} title={`Source: ${s.source}`} onClick={storyClick(s)} style={{ fontSize: 12 }}>
              <StoryParts parts={s.parts} theme={C} numFont={numFont} />{s.board ? <> · <BoardBadge b={s.board} theme={C} numFont={numFont} accent={accent} /></> : null}
            </StoryRow>
          </div>
        )
      })}
    </section>
  )
}
