'use client'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'
import { NFL_NAV } from '../../../lib/routes'
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

      <StartHere heading="Three taps, in order" onNavigate={onNavigate} steps={[
        { n: 1, tab: 'home', title: 'Read the slate', body: 'Home shows the live ledger, The Six, lookout spots and the strongest boards.' },
        { n: 2, tab: 'touchdowns', title: 'See who scores', body: `${NFL_NAV.touchdowns.label} opens with names and a sentence, not a table -- the fastest read on this week's board.` },
        { n: 3, tab: 'picks', title: 'Read the calls', body: 'Picks holds the designated calls. A call is graded; a high Boards rank is not automatically a call.' },
      ]} footer={<>
        That&apos;s the whole path. Everything below is reference — open a section only when a
        number on screen doesn&apos;t make sense.
      </>} />

      <Section title="The one thing to understand" emoji="🎯" defaultOpen={true}>
        <P>
          A score is a <b style={{ color: C.text }}>rank, not a probability</b>. A 67 does
          not mean 67%. It means he sits that far up the league on the inputs the model
          weighs.
        </P>
        <P>
          <b style={{ color: C.text }}>It&apos;s the same scale as the MLB side</b>, on
          purpose. Each component is ranked against every qualified player in the league —
          not against whoever happens to be playing this week — then the blend is ranked
          against the league&apos;s blends and landed on hr_score&apos;s own distribution
          (centred near 47, almost nothing past 75). So the grades transfer: A+ 78, A 70,
          A- 62, B+ 54, B 46. An NFL 78 is as rare as an MLB 78.
        </P>
        <Note>
          The reason it matters: ranking inside the slate forces a 0-100 spread every
          week, so the best goal-line back among six teams scores 100 whether
          he&apos;s a superstar or a backup. <b style={{ color: C.text }}>A thin card
          should score thin</b> — and the league-wide scale lets it: a top grade only
          appears where the evidence is genuinely elite, so how high a given board
          reaches depends on who is on it, not on the week existing.
        </Note>
      </Section>

      <Section title="Calls, rankings and saves are different" emoji="🔖">
        <Term icon="6️⃣" term="The Six" def="TUDDY's headline calls: one each for anytime TD, receiving yards, rushing yards, receptions, passing yards and kicker points. They are graded as calls." />
        <Term icon="📋" term="The Board" def="the full model ranking for one market. A player can rank first without becoming a designated pick. The form line on each row is his last eight real games; its dotted line is the market bar, and the arrow compares the recent half with the prior half. It is not a historical model score or an odds chart." />
        <Term icon="⭐" term="Watchlist" def="your private shortlist on this device. Saving a player does not promote or grade him." />
      </Section>

      {/* Titled from the list itself (2026-09-29): "The seven markets" went stale
          when Defense/ST TD became the eighth. That one is a TEAM market, flagged
          v1 in the payload -- the rule below is about individual defenders. */}
      <Section title={`The ${MARKETS.length} markets`} emoji="🏈">
        <P>These, and only these. No individual defensive-player props, ever — that lane rewards injuries. Defense/ST TD is a team market, marked v1: ranked, not yet backtested like the others.</P>
        {MARKETS.map(([k, label, note]) => <Stat key={k} stat={label} def={note} />)}
      </Section>

      <Section title="The rule that shapes every model" emoji="🧭">
        <P>
          <b style={{ color: C.text }}>Context modulates. Volume selects.</b> Ranking a
          200-man receiver pool by implied team total floats backups on good offenses
          straight into the top fifteen — measured alone, team context hits 27% where
          trailing volume hits 75%. Context isn&apos;t noise, it&apos;s
          <i> player-agnostic</i>: true about the game, silent about which player in it. So
          it&apos;s capped under 10% in every market whose pool is full of non-starters.
        </P>
        <Note>
          <b style={{ color: C.text }}>Quarterbacks and kickers are the exception.</b> Those
          pools are 32 starters who all have guaranteed volume, so &quot;who plays&quot; is
          already settled and environment does the selecting instead. It&apos;s why the
          passing and kicking models are context-led and everything else is volume-led.
        </Note>
      </Section>

      <Section title="Badges on a row" emoji="🏷️">
        <Term icon={<b style={{ color: C.yellow, fontFamily: NUM_FONT }}>Q</b>} term="Questionable" def="listed Questionable. He isn't dropped, but his opportunity inputs are damped 9% (the bot's QUESTIONABLE_DAMP, 0.91). Out and Doubtful never appear at all." />
        <Term icon={<b style={{ color: C.purple, fontFamily: NUM_FONT }}>CO</b>} term="Carryover" def={`no current-season form exists yet, so every number on him is${statSeason ? ` ${statSeason}` : ' last season'}'s per-game baseline. All of preseason is like this, and so is most of Weeks 1 and 2 — the badge clears player by player as each man banks two games of his own.`} />
        <Term icon={<span style={{ color: C.text3 }}>◌</span>} term="Dimmed" def="low sample. A rate built on four touches has no business sitting at the same visual weight as one built on two hundred." />
      </Section>

      <Section title="What each page is for" emoji="🧭">
        <Term tab="touchdowns" go={go} icon="🏈" term={NFL_NAV.touchdowns.label} def="the front door — this week's anytime-touchdown board, opened with names and a plain-English reason instead of a table of percentiles." />
        <Term tab="boards" go={go} icon="📊" term="Boards" def="every market at once — touchdowns, receiving, rushing, passing, receptions, carries and kicking — each card carrying the one line that explains its own number." />
        <Term tab="storylines" go={go} icon="📰" term="Storylines" def="milestones, streaks, and calls the model saw but filed under the wrong market — read as sentences. Revenge games and injury-driven role changes aren't built yet." />
        <Term tab="games" go={go} icon="📋" term={NFL_NAV.games.label} def="every game, with drive state, weather, defense fatigue and the designated calls grouped by matchup." />
        <Term tab="players" go={go} icon="👤" term={NFL_NAV.players.label} def="search one player for measurables, splits, projections, recent games and storylines." />
        <Term tab="watchlist" go={go} icon="⭐" term="Watchlist" def="only the players you saved, with the current slate row kept intact." />
        <Term tab="research" go={go} icon="🔬" term="Research" def="deeper model inputs and supporting context. Useful after the verdict, not before it." />
        <Term tab="matchups" go={go} icon="🛡️" term="Matchups" def="defense-versus-position and matchup context without turning team context into a player pick." />
        <Term tab="pairs" go={go} icon="🔗" term="Pairs" def="related same-game combinations. Relationship labels are context, not a guarantee or independent grade." />
        <Term tab="standings" go={go} icon="📊" term={NFL_NAV.standings.label} def="every division: record, points for and against, home and road, division and conference records, streak. Measured, not modeled." />
        <Term tab="leaders" go={go} icon="🏅" term="Leaders" def="who is first in each stat category, already sorted side by side — measured, not modeled." />
        <Term tab="live" go={go} icon="📡" term="Live" def="every rung on the card against its bar, on the league feed, while the game is on. Cleared, live, or missed — plus the scoring plays as they land." />
        <Term tab="scores" go={go} icon="🏟️" term={NFL_NAV.scores.label} def="every game, one row each: kickoff or score. Tap a game for its box -- passing, rushing, receiving and kicking lines, plus each team's defense." />
        <Term tab="streaks" go={go} icon="🔥" term="Streaks" def="who is hot or cold at a line you pick, last 30 games, no model in the way. Hot is the play; cold is the fade." />
        <Term tab="accountability" go={go} icon="✅" term="The record" def="public receipts for completed calls, including misses. This is where trust is earned." />
        <Term tab="ledger" go={go} icon="🧾" term={NFL_NAV.ledger.label} def="the week in names and numbers: the card's touchdown calls and how many scored, round numbers, who needs what, name echoes -- counting facts, not picks." />
        <Term tab="tuddyledger" go={go} icon="📒" term={NFL_NAV.tuddyledger.label} def="every touchdown this season sorted into called, on the board, or never tracked, with the season's running totals." />
        <Term tab="report" go={go} icon="📝" term="Report Card" def="backtests each model against a simple trailing-average baseline." />
        <Term tab="explosive" go={go} icon="🚀" term="Explosive" def="who turns a normal target into a chunk play, and which defence keeps allowing one. Measured off real play-by-play, no model score." />
        <Term tab="numerology" go={go} icon="🔮" term="Numerology" def="jersey, birthday, life path, reduced to one digit. Pattern watching, disclosed as exactly that — it feeds no score, board or call." />
      </Section>

      <Section title="Filters never change the model" emoji="🎛️">
        <P>
          Search, team, position, game and sample controls only narrow what is visible. They
          do not recalculate a score or turn a Board row into a pick. Clear the active-filter
          chips to return to the full slate.
        </P>
      </Section>

      {isPre ? (
        <Section title="What preseason is and isn't" emoji="🗓️">
          <P>
            Starters play two series. Weekly form does not exist in August and inventing it
            would be dishonest, so every board right now is built from last season&apos;s
            per-game baselines — a futures read, not a slate read. There are no lines, so the
            game-context inputs are missing entirely; where that happens their weight is
            redistributed across the components that remain, and the board tells you which
            ones were dropped.
          </P>
          <Note color={C.yellow}>
            The bot is being tuned through preseason and into the early weeks. It should be
            fully formed by late season — same arc the baseball side took.
          </Note>
        </Section>
      ) : (
        <Section title="What the early weeks are" emoji="🗓️">
          <P>
            The game context is real from Week 1: the spread, the total, the roof and the
            wind are published before kickoff, so the implied-total and matchup components
            carry their full weight now instead of being redistributed away.
            {' '}<b style={{ color: C.text }}>The player form is not real yet.</b> Nobody has
            banked two games of {data?.season || 'this'} season, so almost every row is
            still carrying {statSeason ? statSeason : 'last season'}&apos;s per-game baseline
            — that is what the CO badge means, and it is why a Week 1 board is a read on who
            these players were, priced into this week&apos;s game.
          </P>
          <Note color={C.yellow}>
            The badge clears a player at a time. By Week 3 most of the board is this
            season&apos;s own form, and the defence-vs-position tables switch over with it.
          </Note>
        </Section>
      )}

      <Section title="Where the numbers come from" emoji="📦">
        <P>
          Player stats, play-by-play, Next Gen Stats, snap counts, depth charts and injury
          reports all come from <b style={{ color: C.text }}>nflverse</b>. Schedules and live
          scores come from a public scoreboard feed, which is also the only place preseason
          exists — nflverse carries none of it. Expected TDs are computed from the league&apos;s own TD rate by
          distance from the end zone — inside five yards a target scores 41.8% of the time,
          from thirty out it&apos;s 3.3%.
        </P>
      </Section>

      {/* #9: a count typed into the Guide goes stale the next time the report is
          rebuilt, so this names the season that matters and sends people to the
          page that actually holds the number. */}
      <Note>
        <b style={{ color: C.text }}>Read the Report Card before you trust anything.</b> It
        grades every model against the dumbest possible alternative — ranking by trailing
        average — on completed seasons. Where the model doesn&apos;t win, the page says so in
        red. Read the out-of-sample season, not the tuned one: beating the baseline on the
        year a model was fitted proves nothing, and more markets fail out of sample than on
        the tuned year. The Report Card is the only place that count is current — this page
        will not try to keep it.
      </Note>
    </div>
    </GuideTheme>
  )
}
