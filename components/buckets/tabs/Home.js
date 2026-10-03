'use client'
import DayHero from '../../DayHero'
import HeroStat from '../../HeroStat'
import StorylinesStrip from '../../StorylinesStrip'
import { dayLine } from '../../../lib/dayLine'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_NAV } from '../../../lib/nba/routes'
import { useBucketsBoard, useBucketsLeaders } from '../../../lib/nba/useBuckets'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import GameList, { sortGames } from '../GameList'
import BucketsTable from '../BucketsTable'
import BucketsHeadline from '../BucketsHeadline'
import BucketWatch from '../BucketWatch'
import { EmptyState, DelayedBanner, Loading, Kicker, NavBtn, LastSeasonNote, fmtDay, fmtTip } from '../ui'

// 🌙 TONIGHT -- the NBA night in one page, rebuilt 2026-10-03 on the shared
// opener (Donovan: "the nba home seems to be missing a lot of components"):
// MOONSHOT / TUDDY / LAMP's DayHero + HeroStats, the people one tap in, the
// calls as HeadlinePicks cards (BucketsHeadline), Bucket Watch, the story
// engine's strip, then the games and who leads. Every section is a door to
// its page; a long list previews a few rows.
export default function Home({ today, date, setTab, onOpenPlayer, onOpenGame, onOpenTeam }) {
  const day = today?.data
  const games = sortGames(day?.games || [])
  const prev = usePreview(games, 6)
  const pts = useBucketsBoard(date, 'pts')
  const reb = useBucketsBoard(date, 'reb')
  const ast = useBucketsBoard(date, 'ast')
  const leaders = useBucketsLeaders()
  const top = (leaders.data?.categories || []).map((c) => ({ ...c.leaders?.[0], cat: c.label, _id: c.key })).filter((r) => r.id)

  const boardGames = pts.data?.games || []
  const lockedN = boardGames.filter((g) => g.locked).length
  const allLocked = boardGames.length > 0 && lockedN === boardGames.length
  const firstTip = games.map((g) => g.start).filter(Boolean).sort()[0] || null
  const heroGames = games.map((g) => ({ away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.start || ''), state: g.state === 'live' ? 'live' : g.state === 'final' ? 'final' : 'pre' }))
  const hero = dayLine(heroGames, { sport: 'nba', date: day?.date || date || undefined })
  const link = { background: 'none', border: 0, padding: '6px 0', minHeight: 44, cursor: 'pointer', color: C.purple, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.04em' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <DayHero icon="🏀" eyebrow={hero.eyebrow} live={Boolean(day?.live)}
        lead={!day ? 'Tonight on BUCKETS.' : hero.lead}
        accentText={!day ? '' : games.length ? (allLocked ? 'Grading as they land.' : 'Two called per game.') : hero.accent}
        chip={games.length ? '🏀 GAME NIGHT' : null}
        sub={games.length ? (boardGames.length ? `${lockedN} of ${boardGames.length} boards locked before tip-off` : 'boards lock before tip-off') : null}
        accent={C.purple} grad={[C.purple, C.cream]} headingLevel="h2" theme={C}>
        {games.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <HeroStat theme={C} numFont={NUM_FONT} label="GAMES" value={games.length} />
            {firstTip && <HeroStat theme={C} numFont={NUM_FONT} label="FIRST TIP" value={fmtTip(firstTip)} />}
            {boardGames.length > 0 && <HeroStat theme={C} numFont={NUM_FONT} label="LOCKED" value={`${lockedN}/${boardGames.length}`} col={allLocked ? C.teal : C.text} />}
            {day?.live ? <HeroStat theme={C} numFont={NUM_FONT} label="LIVE" value={day.live} col={C.rim} /> : null}
          </div>
        )}
      </DayHero>
      <DelayedBanner error={today?.error} what="the league’s score feed" />
      {!day && today?.loading ? <Loading what="tonight" /> : null}

      <nav aria-label="Players, teams and leaders" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: -6 }}>
        {['players', 'teams', 'leaders'].map((k) => (
          <button key={k} type="button" onClick={() => setTab?.(k)} style={link}>{NBA_NAV[k]?.icon} {NBA_NAV[k]?.label} ›</button>
        ))}
      </nav>

      <BucketsHeadline theme={C} numFont={NUM_FONT} boards={{ pts: pts.data, reb: reb.data, ast: ast.data }} onOpenPlayer={onOpenPlayer} />
      {(pts.data?.rows || []).length > 0 && <BucketWatch rows={pts.data.rows} date={pts.data.date} onOpenPlayer={onOpenPlayer} />}
      <StorylinesStrip sport="nba" theme={C} numFont={NUM_FONT} accent={C.purple} max={5} onOpenTeam={onOpenTeam} onSeeAll={() => setTab?.('storylines')} onOpenPlayer={(id) => onOpenPlayer?.(String(id))} />

      <section aria-label="Tonight's games">
        <Kicker>THE GAMES{day?.date ? ` · ${fmtDay(day.date)}` : ''}</Kicker>
        {day && !games.length ? <EmptyState title="NO GAMES TODAY" note="Nothing on the league’s calendar today. Page a day on Live, or open a club’s schedule."><NavBtn onClick={() => setTab('scores')} strong>Open Live</NavBtn></EmptyState> : null}
        {games.length > 0 && <GameList games={prev.shown} onOpenGame={onOpenGame} />}
        {prev.restN > 0 && <ShowMoreButton open={prev.open} restN={prev.restN} toggle={prev.toggle} itemWord="games" />}
      </section>

      <section>
        <Kicker>WHO LEADS{leaders.data?.seasonLabel ? ` · ${leaders.data.seasonLabel}` : ''}</Kicker>
        {leaders.data?.stale && <LastSeasonNote label={leaders.data.seasonLabel} what="leaders" />}
        {top.length > 0 && (
          <BucketsTable rows={top.map((r) => ({ ...r, playerId: r.id }))} columns={[
            { key: 'cat', label: 'Per game', group: 'Leader', w: 90, heat: false, mono: true },
            { key: 'name', label: 'Player', group: 'Leader', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', label: 'Tm', group: 'Leader', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
            { key: 'value', label: 'Value', group: 'Line', w: 56, heat: false, mono: true, dp: 1 },
          ]} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
            heatMode="none" maxHeight={9999} maxRows={top.length} caption="The league leader in each category. Each row opens that player." />
        )}
        <div style={{ marginTop: 8 }}><NavBtn onClick={() => setTab('leaders')}>Every leader →</NavBtn></div>
      </section>
    </div>
  )
}
