'use client'
// GAMES: SCORES AND BOX SCORES, ONE PAGE (2026-09-29, queue batch 8).
// Scores (2026-09-21, "just tell me the score") and Box Scores (2026-09-15,
// B10m) were two drawer rows showing the same games twice. Now it is
// MOONSHOT's Boxes shape: one row per game (components/GameRow.js, the row
// Boxes.js draws), tap it to open that game's box. #tab=boxscores and
// #tab=boxes still land here (lib/routes.js NFL_ALIASES).
//
// THE WEEK SWITCH. Two weeks exist in the published data and no more: the
// slate's week (nfl_week.json, the default) and the week in the bot's live
// scoring feed (nfl_fantasy_stats.json), which is the latest one played or
// playing. Mid-week those differ -- the slate has moved on to next Sunday
// while the feed still holds last week's finals -- so the switch offers the
// feed's week as the second option. No per-week archive of scores or boxes is
// published, so older weeks are not offered rather than guessed at.
//
// COST: the feed is fetched only when you open a game or pick its week, never
// on arrival (lib: useNflBoxFeed in components/nfl/NflBox.js).
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import GameRow from '../../GameRow'
import { Segmented } from '../../Filters'
import { Empty } from '../../ui'
import { NflBox, useNflBoxFeed } from '../NflBox'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { NFL_NAV } from '../../../lib/routes'
import TeamMark from '../../TeamMark'

function statusOf(g) {
  if (g.completed || g.state === 'post') return { text: 'FINAL', tone: C.text3 }
  if (g.state === 'in') return { text: 'LIVE', tone: C.green }
  const at = g.kickoff ? Date.parse(g.kickoff) : NaN
  if (!Number.isFinite(at)) return { text: 'Scheduled', tone: C.text3 }
  return { text: new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }), tone: C.text3 }
}

const byKickoff = (a, b) => (Date.parse(a.kickoff || 0) || 0) - (Date.parse(b.kickoff || 0) || 0)

export default function Scores({ data, onPlayerClick, onOpenGame = null }) {
  const watchlist = useNflWatchlist(data)
  const slateGames = useMemo(() => (data?.games || []).slice().sort(byKickoff), [data])
  // The feed carries abbreviations only; the slate knows every club's name.
  const clubName = useMemo(() => {
    const m = new Map()
    for (const g of slateGames) { m.set(g.away, g.away_name); m.set(g.home, g.home_name) }
    return m
  }, [slateGames])
  const slateWeek = slateGames.find((g) => Number.isFinite(g.week))?.week ?? null
  const [week, setWeek] = useState('slate')
  const [open, setOpen] = useState(() => new Set())
  const { stats, byTeam } = useNflBoxFeed(data, week === 'feed' || open.size > 0)

  const feedWeek = stats?.week ?? null
  // Offered before the feed is fetched (it is asked for on tap): the slate's
  // previous week is where the feed sits mid-week. If the feed turns out to be
  // on the slate's own week, the switch goes away -- there is nothing else.
  const prevWeek = slateWeek && slateWeek > 1 ? slateWeek - 1 : null
  const feedIsOther = stats === undefined ? prevWeek != null : feedWeek != null && feedWeek !== slateWeek
  const showingFeed = week === 'feed' && feedIsOther
  const games = showingFeed ? (stats?.games || []).slice().sort(byKickoff) : slateGames

  const live = games.filter((g) => g.state === 'in').length
  const done = games.filter((g) => g.completed || g.state === 'post').length
  const toggle = (id) => setOpen((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // The feed's box belongs to the feed's week. On the slate's week it only
  // applies when the feed is on that same week (Sunday itself).
  const boxFor = (g) => {
    if (stats === undefined) return <div style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT, padding: '10px 0' }}>Loading the box…</div>
    if (stats === null) return <div style={{ fontSize: 10.5, color: C.orange, padding: '10px 0' }}>Couldn&apos;t reach the box score feed.</div>
    const sameWeek = showingFeed || feedWeek === slateWeek
    if (!sameWeek) {
      return (
        <div style={{ fontSize: 11, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
          {g.state === 'pre' ? "Hasn't kicked off yet. " : ''}
          The box feed is on Week {feedWeek ?? '—'} — this game&apos;s box shows here once it kicks off.
        </div>
      )
    }
    return <NflBox game={g} byTeam={byTeam} defense={stats.defense} onPlayerClick={onPlayerClick} watchlist={watchlist} />
  }

  // In the header's own control slot, not a row of its own: a row of its
  // own pushed the first game down 8-24px on a phone.
  const weekSwitch = feedIsOther && slateWeek ? (
    <Segmented
      value={showingFeed ? 'feed' : 'slate'}
      onChange={(k) => { setWeek(k); setOpen(new Set()) }}
      options={[
        { key: 'slate', label: `This week · Wk ${slateWeek}`, title: "The slate's week" },
        { key: 'feed', label: `${stats === undefined && week === 'feed' ? '… ' : ''}Wk ${feedWeek ?? prevWeek}`, title: 'The latest week in the box score feed' },
      ]}
    />
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="TUDDY · SCORES"
        title="Every game"
        note={`Tap a game for its box. The deeper read is on ${NFL_NAV.games.label}.`}
        theme={C}
        numFont={NUM_FONT}
        accent={C.cyan}
        right={weekSwitch}
        stats={[
          { value: live, label: 'LIVE', tone: C.cyan },
          { value: done, label: 'FINAL', tone: C.text2 },
          { value: games.length, label: 'GAMES', tone: C.text2 },
        ]}
      />
      <div>
        {week === 'feed' && stats === undefined ? (
          <Empty text="Loading that week's games…" />
        ) : week === 'feed' && stats === null ? (
          <Empty text="LIVE DATA DELAYED — couldn't reach the box score feed." />
        ) : !games.length ? (
          <Empty text="No games on the slate yet." />
        ) : games.map((g) => {
          const done2 = g.completed || g.state === 'post'
          const winner = done2 && g.away_score != null && g.home_score != null
            ? (g.away_score > g.home_score ? 'away' : g.home_score > g.away_score ? 'home' : null) : null
          const started = done2 || g.state === 'in'
          return (
            <GameRow
              key={g.game_id} id={g.game_id} open={open.has(g.game_id)} onToggle={toggle}
              theme={C} numFont={NUM_FONT} accent={C.cyan} openBg={`color-mix(in srgb, ${C.cyan} 3%, transparent)`}
              winner={winner} status={statusOf(g)}
              sides={[['away', g.away, g.away_name, g.away_score], ['home', g.home, g.home_name, g.home_score]].map(([key, abbr, name, score]) => ({
                key, label: name || clubName.get(abbr) || abbr, score: started ? (score ?? 0) : null,
                mark: <TeamMark sport="nfl" abbr={abbr} variant="logo" px={28} dim={Boolean(winner) && winner !== key} />,
              }))}
            >
              {boxFor(g)}
              {/* the game's own read on the Slate, as Ledger / Storylines open it (0g A10);
                  only a game on this week's slate has one */}
              {onOpenGame && slateGames.some((s) => String(s.game_id) === String(g.game_id)) && (
                <button type="button" onClick={() => onOpenGame(g.game_id)}
                  style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 6, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.cyan, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
                  The read on {NFL_NAV.games.label} →
                </button>
              )}
            </GameRow>
          )
        })}
      </div>
    </div>
  )
}
