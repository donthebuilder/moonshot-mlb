'use client'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { appHref } from '../../../lib/routes'
import HowItWorks from '../../HowItWorks'
import { NHL_NAV } from '../../../lib/nhl/routes'
import { GuideTheme, Section, P, Term, StartHere, GuideTitle, PlaybookLink } from '../../guide/GuideParts'

// 🏒 HOW THIS WORKS — LAMP explained to somebody who has never seen it
// (spec §32, "test NHL as a stranger"). Says what is here, where it comes
// from, and what is NOT here yet, in that order. Nothing promised as if it
// existed.
//
// MOONSHOT'S GUIDE, LAMP'S WORDS (2026-09-29, Donovan: "all pages take from
// MLB components ... even the guide page"): the plain title, the numbered
// START HERE path, accordion sections and one-line Term rows from
// components/guide/GuideParts.js. The tab map covers every LAMP page now --
// the rows written for this page keep their words, the rest read the
// registry's own blurb (lib/nhl/routes.js), so a page can't be described two
// ways. "What LAMP does not do yet" said no matchups, shot maps or alerts and
// nothing priced; all four exist now, so it says only what is still true.
const ROWS = [
  ['board', 'The goal board: one skater called per team in every game, locked before puck drop, graded after. Tap a called man for the three percentiles behind his score.'],
  ['fullboard', 'Every skater the model scored tonight, all games together, ranked #1 to the bottom by score, with the numbers behind it. CALLED still means top three in his own game.'],
  ['shots', null],
  ['games', null],
  ['scores', 'Every game on one day: score, period and clock, shots on goal, and who scored (tap the goals count). Tap a row for the game.'],
  ['results', 'Every graded night: of the skaters who scored, how many the board called and how many it had on the board. The base rate to beat is the share of every dressed skater who scored on the same nights, measured, not assumed.'],
  ['ledger', null],
  ['lampledger', null],
  ['matchups', null],
  ['shotmap', null],
  ['power', null],
  ['hotsticks', null],
  ['specialteams', null],
  ['storylines', null],
  ['longshots', null],
  ['schedule', 'The league week, day by day, with puck-drop times in your zone. Games already played show their score.'],
  ['standings', 'Division, wild card, conference and league tables, in the league’s own order. Tap a column’s ⓘ for what it means.'],
  ['players', 'Every player on a current roster. Type a name or a club, tap for the file: the season line, career, last five, the game log, season by season.'],
  ['goalies', 'Every goalie, and a goalie’s file is its own page — starts, record, GAA, save percentage, shutouts — not a skater’s with different labels.'],
  ['teams', 'The 32 clubs by division. Tap one for its record and place, next up, last five, the roster with season lines, team leaders, the whole schedule.'],
  ['leaders', 'Who leads: tonight\'s leaders with who they face, the league top 10s, and every skater\'s and goalie\'s season line in one sortable table. Regular season, straight from the league. Measured, not modelled.'],
  ['watchlist', null],
  ['numerology', null],
]

export default function Guide({ onNavigate }) {
  return (
    <GuideTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <GuideTitle title="What LAMP is">
        LAMP is the NHL desk inside DASH Network, next to MOONSHOT (MLB) and TUDDY (NFL). It reads
        the league’s own feed and shows you the game, in hockey’s own words — and a goal board it
        grades on itself every morning.
      </GuideTitle>
      <PlaybookLink market="goal" label="How to research a goal" />
      {/* LOOK -> PICK -> TRACK (2026-10-01): the same three drawings as /start. */}
      <div style={{ margin: '14px 0 18px' }}>
        <HowItWorks sport="nhl" hrefs={{ look: appHref('nhl', 'board'), pick: appHref('nhl', 'board'), track: '/called?sport=nhl' }}
          colors={{ accent: C.ice, ink: C.text, dim: C.text2, line: C.border, bg: C.bg }} />
      </div>

      <StartHere heading="Three steps, in order" onNavigate={onNavigate} steps={[
        { n: 1, tab: 'board', title: `Open the ${NHL_NAV.board.label}`, body: 'One skater called per team in every game, locked before puck drop, graded after.' },
        { n: 2, tab: 'board', title: 'Tap a called skater', body: 'His file opens on the three percentiles behind his score: shots, goals and ice time per game.' },
        { n: 3, tab: 'results', title: `The next morning, open ${NHL_NAV.results.label}`, body: 'Of the skaters who scored, how many the board called and how many it had on the board — the receipts for everything above.' },
      ]} footer={<>
        That&apos;s the whole path. Everything below is reference — open a section when a word or a
        colour on screen doesn&apos;t make sense.
      </>} />

      <Section title="The three words" emoji="🔖" defaultOpen={true}>
        <P><b style={{ color: C.ice }}>CALLED</b> — one of the three the board picked in his game. <b style={{ color: C.text }}>ON THE BOARD</b> — scored and ranked, but fourth or worse. <b style={{ color: C.text3 }}>NOT ON THE BOARD</b> — on the roster, not scored, and the reason is printed (usually fewer than ten NHL games on file). Same words, same meaning, on MOONSHOT and TUDDY.</P>
        <P>The score is the average of three percentile ranks among the night’s scored skaters: shots per game, goals per game, ice time per game, each over his last 82 NHL games (this season first, last season for the rest). A board is <b style={{ color: C.amber }}>PREVIEW</b> until 100 minutes before puck drop, <b style={{ color: C.teal }}>LOCKED</b> from the last write before the puck drops, <b style={{ color: C.cream }}>GRADED</b> after the final. A locked row is never rewritten.</P>
      </Section>

      <Section title="Reading a score row" emoji="🚨">
        <P><b style={{ color: C.lamp }}>Red</b> means the lamp is lit — a goal, or a game that is on right now. It never means a miss. <b style={{ color: C.text }}>STR</b> on a goal is the strength: EV even strength, PP power play, SH short-handed, EN empty net, PS penalty shot. The number in brackets after a scorer is his goals this season including that one.</P>
      </Section>

      <Section title="What each page is for" emoji="🧭">
        {ROWS.map(([key, what]) => (
          <Term key={key} tab={key} go={onNavigate} icon={NHL_NAV[key].icon} term={NHL_NAV[key].label}
            def={what || `${NHL_NAV[key].blurb.charAt(0).toLowerCase()}${NHL_NAV[key].blurb.slice(1)}.`} />
        ))}
      </Section>

      <Section title="Where the numbers come from" emoji="📦">
        <P>Every number on LAMP is a field from the NHL’s public feed (api-web.nhle.com), read once on our server and cached for a few seconds, then shown to you. Scores refresh every 30 seconds while a game is on. Each page says at its foot exactly which feed it read and when.</P>
        <P>The day is the league’s Eastern calendar day. The times are yours. The season on every page comes from the feed itself, which is why, before opening night, the standings page says plainly that it is showing last season’s final table.</P>
      </Section>

      <Section title="What LAMP does not do yet" emoji="🚧">
        <P>No goalie in the score — the league feed names no starter before a game, so the board makes no claim about the net until the game is over, then records who actually started and his line beside the graded board. That archive is what a later version fits on. The score never reads a price: {NHL_NAV.longshots.label} shows what the books offer beside it, and nothing more.</P>
      </Section>
    </div>
    </GuideTheme>
  )
}
