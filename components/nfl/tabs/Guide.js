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

export default function Guide() {
  return (
    <div style={{ maxWidth: 760 }}>
      <Section title="The one thing to understand">
        A score is a <b style={{ color: C.text }}>rank, not a probability</b>. An 88 means
        he sits in the top slice of this slate on the inputs the model weighs. It does not
        mean 88%. Every component is percentile-ranked inside that week&apos;s eligible
        pool, then weighted — so the weights mean exactly what they say, and no input
        dominates just because its raw numbers are bigger.
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
        scores come from ESPN&apos;s public scoreboard, because nflverse carries no
        preseason at all. Expected TDs are computed from the league&apos;s own TD rate by
        distance from the end zone — inside five yards a target scores 41.8% of the time,
        from thirty out it&apos;s 3.3%.
      </Section>

      <Section title="Read the Report Card before you trust anything">
        It grades every model against the dumbest possible alternative — ranking by
        trailing average — on completed seasons. Where the model doesn&apos;t win, the page
        says so in red. Two of the seven currently don&apos;t.
      </Section>
    </div>
  )
}
