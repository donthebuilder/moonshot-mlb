'use client'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'
import HowItWorks from '../../HowItWorks'
import { NFL_NAV, appHref } from '../../../lib/routes'
import { GuideTheme, Section, P, Note, Term, Stat, StartHere, GuideTitle, PlaybookLink } from '../../guide/GuideParts'

// Guide — what every number means, and what it doesn't.
//
// MOONSHOT'S GUIDE, TUDDY'S WORDS (2026-09-29, Donovan: "all pages take from
// MLB components ... even the guide page"). Same pieces as components/tabs/
// Guide.js (components/guide/GuideParts.js): a plain title, the numbered START
// HERE path, accordion sections, one-line Term / Stat rows where every page
// named is a link. Every sentence below is the one this page already said; the
// page-card grid became MOONSHOT's tab-map rows.

export default function Guide({ onNavigate, data }) {
  // The Guide is the one page that makes claims about what the numbers ARE,
  // so it is the one page that goes wrong the moment the bot flips modes.
  const isPre = data?.mode !== 'week'
  const statSeason = data?.stat_season
  const go = onNavigate
  return (
    <GuideTheme theme={C} accent={C.green} numFont={NUM_FONT}>
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <GuideTitle>
        What every page is for, in plain words — and what the numbers on them do and don&apos;t claim.
      </GuideTitle>
      <PlaybookLink market="td" label="How to research a touchdown" />
      {/* LOOK -> PICK -> TRACK (2026-10-01): the same three drawings as /start. */}
      <div style={{ margin: '14px 0 18px' }}>
        <HowItWorks sport="nfl" hrefs={{ look: appHref('nfl', 'board'), pick: appHref('nfl', 'board'), track: '/called?sport=nfl' }}
          colors={{ accent: C.green, ink: C.text, dim: C.text2, line: C.border, bg: C.bg }} />
      </div>

      <StartHere heading="Three taps, in order" onNavigate={onNavigate} steps={[
        { n: 1, tab: 'home', title: 'Read the slate', body: 'Home shows the live ledger, The Six, lookout spots and the strongest boards.' },
        { n: 2, tab: 'research', title: 'See who scores, and why', body: `${NFL_NAV.research.label} ranks every player, and each row says why in one line — tap it for the numbers behind it.` },
        { n: 3, tab: 'picks', title: 'Read the calls', body: 'Picks holds the designated calls. A call is graded; a high Boards rank is not automatically a call.' },
      ]} footer={<>
        That&apos;s the whole path. Everything below is reference.
      </>} />

      <Section title="The one thing to understand" emoji="🎯" defaultOpen={true}>
        <P>
          A score is a <b style={{ color: C.text }}>rank, not a probability</b>. A 67 does
          not mean 67%. It means he sits that far up the league on the inputs the model
          weighs.
        </P>
        <P>
          <b style={{ color: C.text }}>It&apos;s the same scale as the MLB side</b>, on
          purpose. Each component is ranked against every qualified player in the league,
          not whoever is playing this week, then the blend is landed on hr_score&apos;s own
          distribution (centred near 47, almost nothing past 75). So the grades transfer:
          A+ 78, A 70, A- 62, B+ 54, B 46. An NFL 78 is as rare as an MLB 78.
        </P>
        <Note>
          Ranking inside the slate would force a 0-100 spread every week, so the best
          goal-line back among six teams would score 100 whether he&apos;s a superstar or a
          backup. <b style={{ color: C.text }}>A thin card should score thin</b>, and the
          league-wide scale lets it.
        </Note>
      </Section>

      <Section title="Calls, rankings and saves are different" emoji="🔖">
        <Term icon="6️⃣" term="The Six" def="TUDDY's headline calls: one each for anytime TD, receiving yards, rushing yards, receptions, passing yards and kicker points. They are graded as calls." />
        <Term icon="📋" term="The Board" def="the full model ranking for one market. A player can rank first without becoming a designated pick. The form line on each row is his last eight real games, its dotted line the market bar; the arrow compares the recent half with the prior half. It is not a historical model score or an odds chart." />
        <Term icon="⭐" term="Watchlist" def="your private shortlist on this device. Saving a player does not promote or grade him." />
      </Section>

      {/* Titled from the list itself (2026-09-29): "The seven markets" went stale
          when Defense/ST TD became the eighth. That one is a TEAM market, flagged
          v1 in the payload -- the rule below is about individual defenders. */}
      <Section title={`The ${MARKETS.length} markets`} emoji="🏈">
        <P>These, and only these. No individual defensive-player props, ever — that lane rewards injuries. Defense/ST TD is a team market: ranked, but not yet tested like the others.</P>
        {MARKETS.map(([k, label, note]) => <Stat key={k} stat={label} def={note} />)}
      </Section>

      <Section title="The rule that shapes every model" emoji="🧭">
        <P>
          <b style={{ color: C.text }}>Context modulates. Volume selects.</b> Ranking a
          200-man receiver pool by implied team total floats backups on good offenses
          into the top fifteen: measured alone, team context hits 27% where trailing
          volume hits 75%. Context is <i>player-agnostic</i>, true about the game and silent
          about which player in it, so it&apos;s capped under 10% in every market whose pool
          is full of non-starters.
        </P>
        <Note>
          <b style={{ color: C.text }}>Quarterbacks and kickers are the exception.</b> Those
          pools are 32 starters with steady volume, so environment does the selecting
          instead: the passing and kicking models are context-led, everything else is
          volume-led.
        </Note>
      </Section>

      <Section title="Badges on a row" emoji="🏷️">
        <Term icon={<b style={{ color: C.yellow, fontFamily: NUM_FONT }}>Q</b>} term="Questionable" def="listed Questionable. He isn't dropped, but his opportunity inputs are scaled down 9%. Out and Doubtful never appear at all." />
        <Term icon={<b style={{ color: C.text2, fontFamily: NUM_FONT }}>CO</b>} term="Carryover" def={`no current-season form exists yet, so every number on him is${statSeason ? ` ${statSeason}` : ' last season'}'s per-game baseline. All of preseason and most of Weeks 1 and 2 are like this; the badge clears as each man banks two games of his own.`} />
        <Term icon={<span style={{ color: C.text3 }}>◌</span>} term="Dimmed" def="low sample. A rate built on four touches has no business sitting at the same visual weight as one built on two hundred." />
      </Section>

      <Section title="What each page is for" emoji="🧭">
        {/* THE BAR FIRST, under its real names (2026-10-04 user review #10: the
            Guide opened on a 'front door' that is no longer one, and listed
            Boards twice -- touchdowns and boards are the same page). */}
        <Term tab="home" go={go} icon="🏠" term={NFL_NAV.home.label} def="this week's slate, the calls, and what to watch first." />
        <Term tab="picks" go={go} icon="🎯" term={NFL_NAV.picks.label} def="every call as a card, one market at a time, with the price when a book is on the same bar." />
        <Term tab="research" go={go} icon="📈" term={NFL_NAV.research.label} def="the whole ranked board as a table — every player, every market, sortable." />
        <Term tab="boards" go={go} icon="📊" term="Boards" def="every market at once, each card carrying the one line that explains its own number." />
        <Term tab="storylines" go={go} icon="📰" term="Storylines" def="milestones, streaks, and calls the model saw but filed under the wrong market, read as sentences. Revenge games and injury-driven role changes aren't built yet." />
        <Term tab="games" go={go} icon="📋" term={NFL_NAV.games.label} def="every game, with weather, defense fatigue and the designated calls by matchup." />
        <Term tab="players" go={go} icon="👤" term={NFL_NAV.players.label} def="search one player for splits, projections, recent games and storylines." />
        <Term tab="watchlist" go={go} icon="⭐" term="Watchlist" def="only the players you saved, with the current slate row kept intact." />
        <Term tab="matchups" go={go} icon="🛡️" term="Matchups" def="defense-versus-position and matchup context without turning team context into a player pick." />
        <Term tab="pairs" go={go} icon="🔗" term="Pairs" def="related same-game combinations. Relationship labels are context, not a guarantee or independent grade." />
        <Term tab="standings" go={go} icon="📊" term={NFL_NAV.standings.label} def="every division: record, points for and against, home and road, division and conference records, streak. Measured, not modeled." />
        <Term tab="leaders" go={go} icon="🏅" term="Leaders" def="who is first in each stat category, already sorted side by side — measured, with the model's scores as columns at the end of the table." />
        <Term tab="live" go={go} icon="📡" term="Live" def="every rung on the card against its bar while the game is on: cleared, live, or missed, plus the scoring plays." />
        <Term tab="scores" go={go} icon="🏟️" term={NFL_NAV.scores.label} def="every game, one row each: kickoff or score. Tap a game for its box." />
        <Term tab="streaks" go={go} icon="🔥" term="Streaks" def="who is hot or cold at a line you pick, last 30 games, no model in the way. Hot is the play; cold is the fade." />
        <Term tab="ledger" go={go} icon="📒" term={NFL_NAV.ledger.label} def="one page, four tabs. This week: the week in names and numbers and how many touchdown calls scored. Called: every touchdown sorted into called, on the board, or not on the board. Record: public receipts for completed calls, including misses. Archive: past weeks and the whole season." />
        <Term tab="report" go={go} icon="📝" term="Report Card" def="backtests each model against a simple trailing-average baseline." />
        <Term tab="explosive" go={go} icon="🚀" term="Explosive" def="who turns a normal target into a chunk play, and which defense allows one. Measured off play-by-play, no model score." />
        <Term tab="numerology" go={go} icon="🔮" term="Numerology" def="jersey, birthday and life path, reduced to one digit. Pattern watching; it feeds no score, board or call." />
      </Section>

      <Section title="Filters never change the model" emoji="🎛️">
        <P>
          Search, team, position, game and sample controls only narrow what is visible. They
          do not recalculate a score or turn a Board row into a pick.
        </P>
      </Section>

      {isPre ? (
        <Section title="What preseason is and isn't" emoji="🗓️">
          <P>
            Starters play two series. Weekly form does not exist in August and inventing it
            would be dishonest, so every board right now is built from last season&apos;s
            per-game baselines: a futures read, not a slate read. There are no lines, so the
            game-context inputs are missing and their weight is redistributed across the
            components that remain; the board tells you which were dropped.
          </P>
          <Note color={C.yellow}>
            TUDDY is still being tuned through preseason and the early weeks. It should be
            settled by late season.
          </Note>
        </Section>
      ) : (
        <Section title="What the early weeks are" emoji="🗓️">
          <P>
            The game context is real from Week 1: the spread, the total, the roof and the
            wind are published before kickoff, so the implied-total and matchup components
            carry their full weight.
            {' '}<b style={{ color: C.text }}>The player form is not real yet.</b> Nobody has
            banked two games of {data?.season || 'this'} season, so almost every row still
            carries {statSeason ? statSeason : 'last season'}&apos;s per-game baseline (the CO
            badge): a Week 1 board is a read on who these players were, priced into this
            week&apos;s game.
          </P>
          <Note color={C.yellow}>
            The badge clears a player at a time. By Week 3 most of the board is this
            season&apos;s own form, and the defense-vs-position tables switch over with it.
          </Note>
        </Section>
      )}

      <Section title="Where the numbers come from" emoji="📦">
        <P>
          Player stats, play-by-play, Next Gen Stats, snap counts, depth charts and injury
          reports come from <b style={{ color: C.text }}>nflverse</b>. Schedules and live
          scores come from a public scoreboard feed, the only place preseason exists.
          Expected TDs use the league&apos;s own TD rate by distance from the end zone:
          inside five yards a target scores 41.8% of the time, from thirty out it&apos;s 3.3%.
        </P>
      </Section>

      {/* #9: a count typed into the Guide goes stale the next time the report is
          rebuilt, so this names the season that matters and sends people to the
          page that actually holds the number. */}
      <Note>
        <b style={{ color: C.text }}>Read the Report Card before you trust anything.</b> It
        grades every model against ranking by trailing average on completed seasons. Where
        the model doesn&apos;t win, the page says so in red. Read the out-of-sample season,
        not the tuned one: beating the baseline on the year a model was fitted proves
        nothing, and more markets fail out of sample than on the tuned year. Anytime TD
        needs care: its weights were tuned on one season and checked on the other, in both
        directions, so neither 2024 nor 2025 is a clean untouched year for it. The Report
        Card is the only place that count is current.
      </Note>
    </div>
    </GuideTheme>
  )
}
