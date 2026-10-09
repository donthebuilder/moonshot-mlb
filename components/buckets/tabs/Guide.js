'use client'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_NAV } from '../../../lib/nba/routes'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import { GuideTheme, Section, P, Term, StartHere, GuideTitle } from '../../guide/GuideParts'

// ❓ HOW THIS WORKS -- BUCKETS explained to somebody who has never seen it, on
// MOONSHOT's guide parts (components/guide/GuideParts.js). What is here, where
// it comes from, and what is NOT here yet. Nothing promised as if it existed.
// The page rows read the registry's own blurbs (lib/nba/routes.js), so a page
// can't be described two ways.
const PAGES = ['board', 'fullboard', 'odds', 'ledger', 'scores', 'games', 'schedule', 'standings', 'teams', 'players', 'leaders', 'hot', 'matchups', 'storylines', 'shotmap', 'watchlist']

export default function Guide({ onNavigate }) {
  return (
    <GuideTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <GuideTitle title="What BUCKETS is">
        BUCKETS is the NBA desk inside DASH Network, next to MOONSHOT (MLB), TUDDY (NFL) and LAMP (NHL).
        It reads the league’s own stats, ranks the night’s players for six markets, and grades itself on
        every call after the final.
      </GuideTitle>
      <StartHere heading="Three steps, in order" onNavigate={onNavigate} steps={[
        { n: 1, tab: 'board', title: `Open ${NBA_NAV.board.label}`, body: 'Pick a market. One player is called per team in every game, locked before tip.' },
        { n: 2, tab: 'board', title: 'Tap a called player', body: 'His file opens: the season line, the game log, every shot on the floor, the board on him.' },
        { n: 3, tab: 'results', title: `The next morning, open ${NBA_NAV.results.label}`, body: 'Of the calls, how many hit, per market — the receipts for everything above.' },
      ]} footer={<>That&apos;s the whole path. Everything below is reference.</>} />

      <Section title="The three words" emoji="🔖" defaultOpen={true}>
        <P><b style={{ color: C.purple }}>CALLED</b> — the top-scored player on his team in his game, for that market (the game’s higher one is TOP, the other BUCKET). <b style={{ color: C.text }}>ON THE BOARD</b> — in the top third of the night, not called. <b style={{ color: C.text3 }}>NOT ON THE BOARD</b> — playing, but outside the top third or not scored, and the reason is printed. Same words, same meaning, on every DASH product.</P>
        <P>A board is <b style={{ color: C.text }}>PREVIEW</b> until its game locks before tip; a locked row is never rewritten. After the final it is graded; a player who didn’t play is void, not a miss.</P>
      </Section>

      <Section title="The eight markets" emoji="🎯">
        {Object.entries(NBA_MARKETS).map(([k, d]) => (
          <P key={k}><b style={{ color: C.text }}>{d.label}</b>{d.barWord ? ` — a hit is ${d.barWord} (ten or more in ${d.bar} of points, rebounds, assists, steals and blocks), judged from the final box score; ranked on each player’s own game log, not a season average.` : d.bar ? ` — a hit is ${d.bar} or more.` : ' — a hit is scoring the game’s first basket.'} Ranked on {d.legs.length} legs, pooled from this season and last by games played{d.startersOnly ? '; the ten starters only, once the pre-tip box score lists them' : ''}.</P>
        ))}
      </Section>

      <Section title="What each page is for" emoji="🧭">
        {PAGES.map((key) => <Term key={key} tab={key} go={onNavigate} icon={NBA_NAV[key].icon} term={NBA_NAV[key].label} def={`${NBA_NAV[key].blurb.charAt(0).toLowerCase()}${NBA_NAV[key].blurb.slice(1)}.`} />)}
      </Section>

      <Section title="Where the numbers come from" emoji="📦">
        <P>Every number comes from ESPN’s public NBA data: scoreboard, box scores, play-by-play, rosters, injuries, standings and league stats, refreshed every few minutes. Shot spots are the play-by-play’s own.</P>
        <P>The day is the league’s Eastern calendar day; the times are yours. Before the regular season the season lines, leaders and standings are last season’s, and each page says so.</P>
      </Section>

      <Section title="What BUCKETS does not do yet" emoji="🚧">
        <P>No price: the board never reads a sportsbook line. No first-basket line exists yet, so that market has no price to compare. No alerts or posts until BUCKETS opens to everyone.</P>
      </Section>
    </div>
    </GuideTheme>
  )
}
