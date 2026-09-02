'use client'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'

// Guide — what every number means, and what it doesn't.
//
// Kept short and blunt. The MLB Guide grew to 286 lines over two seasons of
// questions; this one starts with the four things someone actually needs on
// day one and earns the rest.

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        marginBottom: 8, textTransform: 'uppercase',
      }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.75 }}>{children}</div>
    </div>
  )
}

function Card({ children, accent = C.green }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 10, padding: '11px 14px', marginTop: 8,
    }}>{children}</div>
  )
}

function PageCard({ tab, title, note, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(tab)}
      style={{
        minHeight: 72, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
      }}
    >
      <b style={{ display: 'block', color: C.text, fontSize: 12 }}>{title}</b>
      <span style={{ display: 'block', marginTop: 4, color: C.text3, fontSize: 10, lineHeight: 1.45 }}>{note}</span>
    </button>
  )
}

export default function Guide({ onNavigate }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <Section title="Start here — three taps">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
          <PageCard tab="home" title="1 · Read the slate" note="Home shows the live ledger, The Six, lookout spots and the strongest boards." onNavigate={onNavigate} />
          <PageCard tab="picks" title="2 · Read the calls" note="Picks holds the designated calls. A call is graded; a high Board rank is not automatically a call." onNavigate={onNavigate} />
          <PageCard tab="boards" title="3 · Compare the field" note="Boards ranks every eligible player by market. Filter it, inspect recent form, then tap a player for the full card." onNavigate={onNavigate} />
        </div>
      </Section>

      <Section title="The one thing to understand">
        A score is a <b style={{ color: C.text }}>rank, not a probability</b>. A 67 does
        not mean 67%. It means he sits that far up the league on the inputs the model
        weighs.
        <Card>
          <b style={{ color: C.text }}>It&apos;s the same scale as the MLB side</b>, on
          purpose. Each component is ranked against every qualified player in the league —
          not against whoever happens to be playing this week — then the blend is ranked
          against the league&apos;s blends and landed on hr_score&apos;s own distribution
          (centred near 47, almost nothing past 75). So the grades transfer: A+ 78, A 70,
          A- 62, B+ 54, B 46. An NFL 78 is as rare as an MLB 78.
          <div style={{ marginTop: 6 }}>
            The reason it matters: ranking inside the slate forces a 0-100 spread every
            week, so the best goal-line back among six teams scores 100 whether
            he&apos;s a superstar or a backup. <b style={{ color: C.text }}>A thin card
            should score thin</b> — and the league-wide scale lets it: a top grade only
            appears where the evidence is genuinely elite, so how high a given board
            reaches depends on who is on it, not on the week existing.
          </div>
        </Card>
      </Section>

      <Section title="Calls, rankings and saves are different">
        <Card>
          <b style={{ color: C.text }}>The Six</b> are TUDDY&apos;s headline calls: one each
          for anytime TD, receiving yards, rushing yards, receptions, passing yards and
          kicker points. They are graded as calls.
        </Card>
        <Card accent={C.blue}>
          <b style={{ color: C.text }}>The Board</b> is the full model ranking for one
          market. A player can rank first without becoming a designated pick. The form
          line on each row is his last eight real games; its dotted line is the market
          bar, and the arrow compares the recent half with the prior half. It is not a
          historical model score or an odds chart.
        </Card>
        <Card accent={C.purple}>
          <b style={{ color: C.text }}>Watchlist</b> is your private shortlist on this
          device. Saving a player does not promote or grade him.
        </Card>
      </Section>

      <Section title="The seven markets">
        These, and only these. No defensive props, ever — that lane rewards injuries.
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
          {MARKETS.map(([k, label, note]) => (
            <div key={k} style={{
              flex: '1 1 210px', background: C.bg2, border: `1px solid ${C.border}`,
              borderTop: `2px solid ${C.green}`, borderRadius: 9, padding: '9px 12px',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{label}</div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 2, fontFamily: NUM_FONT }}>{note}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The rule that shapes every model">
        <b style={{ color: C.text }}>Context modulates. Volume selects.</b> Ranking a
        200-man receiver pool by implied team total floats backups on good offenses
        straight into the top fifteen — measured alone, team context hits 27% where
        trailing volume hits 75%. Context isn&apos;t noise, it&apos;s
        <i> player-agnostic</i>: true about the game, silent about which player in it. So
        it&apos;s capped under 10% in every market whose pool is full of non-starters.
        <Card>
          <b style={{ color: C.text }}>Quarterbacks and kickers are the exception.</b> Those
          pools are 32 starters who all have guaranteed volume, so &quot;who plays&quot; is
          already settled and environment does the selecting instead. It&apos;s why the
          passing and kicking models are context-led and everything else is volume-led.
        </Card>
      </Section>

      <Section title="Badges on a row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
          <div><span style={{ color: C.yellow, fontWeight: 900, fontFamily: NUM_FONT }}>Q</span>
            {' '}— listed Questionable. He isn&apos;t dropped, but his opportunity inputs are
            damped 15%. Out and Doubtful never appear at all.</div>
          <div><span style={{ color: C.purple, fontWeight: 900, fontFamily: NUM_FONT }}>CO</span>
            {' '}— carryover. No current-season form exists yet, so every number on him is
            last season&apos;s per-game baseline. All of preseason is like this.</div>
          <div><span style={{ color: C.text3, fontWeight: 900 }}>dimmed</span>
            {' '}— low sample. A rate built on four touches has no business sitting at the
            same visual weight as one built on two hundred.</div>
        </div>
      </Section>

      <Section title="Where each page takes you">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
          <PageCard tab="games" title="Games" note="Drive state, weather, defense fatigue and designated calls grouped by matchup." onNavigate={onNavigate} />
          <PageCard tab="players" title="Player Portal" note="Search one player for measurables, splits, projections, recent games and storylines." onNavigate={onNavigate} />
          <PageCard tab="watchlist" title="Watchlist" note="Only the players you saved, with the current slate row kept intact." onNavigate={onNavigate} />
          <PageCard tab="research" title="Research" note="Deeper model inputs and supporting context. Useful after the verdict, not before it." onNavigate={onNavigate} />
          <PageCard tab="matchups" title="Matchups" note="Defense-versus-position and matchup context without turning team context into a player pick." onNavigate={onNavigate} />
          <PageCard tab="pairs" title="Pairs" note="Related same-game combinations. Relationship labels are context, not a guarantee or independent grade." onNavigate={onNavigate} />
          <PageCard tab="accountability" title="Results" note="Public receipts for completed calls, including misses. This is where trust is earned." onNavigate={onNavigate} />
          <PageCard tab="report" title="Report Card" note="Backtests each model against a simple trailing-average baseline." onNavigate={onNavigate} />
        </div>
      </Section>

      <Section title="Filters never change the model">
        Search, team, position, game and sample controls only narrow what is visible. They
        do not recalculate a score or turn a Board row into a pick. Clear the active-filter
        chips to return to the full slate.
      </Section>

      <Section title="What preseason is and isn't">
        Starters play two series. Weekly form does not exist in August and inventing it
        would be dishonest, so every board right now is built from last season&apos;s
        per-game baselines — a futures read, not a slate read. There are no lines, so the
        game-context inputs are missing entirely; where that happens their weight is
        redistributed across the components that remain, and the board tells you which
        ones were dropped.
        <Card accent={C.yellow}>
          The bot is being tuned through preseason and into the early weeks. It should be
          fully formed by late season — same arc the baseball side took.
        </Card>
      </Section>

      <Section title="Where the numbers come from">
        Player stats, play-by-play, Next Gen Stats, snap counts, depth charts and injury
        reports all come from <b style={{ color: C.text }}>nflverse</b>. Schedules and live
        scores come from a public scoreboard feed, because nflverse carries no
        preseason at all. Expected TDs are computed from the league&apos;s own TD rate by
        distance from the end zone — inside five yards a target scores 41.8% of the time,
        from thirty out it&apos;s 3.3%.
      </Section>

      {/* #9: this used to end "Two of the seven currently don't", which is
          wrong in both directions AND in the model's favour. The Report Card
          shows ONE market failing on the tuned season and FOUR out of sample --
          and the page itself says out-of-sample is the true number. A count
          typed into the Guide is also a count that goes stale the next time the
          report is rebuilt, so this names the season that matters and sends
          people to the page that actually holds the number. */}
      <Section title="Read the Report Card before you trust anything">
        It grades every model against the dumbest possible alternative — ranking by
        trailing average — on completed seasons. Where the model doesn&apos;t win, the page
        says so in red. <b style={{ color: C.text }}>Read the out-of-sample season, not the
        tuned one</b>: beating the baseline on the year a model was fitted proves nothing,
        and more markets fail out of sample than on the tuned year. The Report Card is the
        only place that count is current — this page will not try to keep it.
      </Section>
    </div>
  )
}
