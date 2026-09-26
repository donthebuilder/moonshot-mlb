'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { NHL_NAV } from '../../../lib/nhl/routes'

// 🏒 HOW THIS WORKS — LAMP explained to somebody who has never seen it
// (spec §32, "test NHL as a stranger"). Says what is here, where it comes
// from, and what is NOT here yet, in that order. Nothing promised as if it
// existed.
const ROWS = [
  ['scores', 'Every game on one day: score, period and clock, shots on goal, and who scored (tap the goals count). Tap a row for the game.'],
  ['schedule', 'The league week, day by day, with puck-drop times in your zone. Games already played show their score.'],
  ['standings', 'Division, wild card, conference and league tables, in the league’s own order. Tap a column’s ⓘ for what it means.'],
  ['game', 'One game top to bottom: by-period goals and shots, every goal with its assists and strength, penalties, the team comparison, three stars.'],
  ['players', 'Every player on a current roster. Type a name or a club, tap for the file: the season line, career, last five, the game log, season by season.'],
  ['goalies', 'Every goalie, and a goalie’s file is its own page — starts, record, GAA, save percentage, shutouts — not a skater’s with different labels.'],
  ['teams', 'The 32 clubs by division. Tap one for its record and place, next up, last five, the roster with season lines, team leaders, the whole schedule.'],
  ['leaders', 'Who leads the league in each category, ten deep, regular season, straight from the league. Measured, not modelled.'],
  ['fullboard', 'Every skater the model scored tonight, all games together, ranked #1 to the bottom by score, with the numbers behind it. CALLED still means top three in his own game.'],
  ['board', 'The goal board: three skaters called per game, locked before puck drop, graded after. Tap a called man for the three percentiles behind his score.'],
  ['results', 'Every graded night: of the skaters who scored, how many the board called and how many it had on the board. The base rate to beat is about 15%.'],
]

export default function Guide({ onNavigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <PageHeader eyebrow="LAMP · HOW THIS WORKS" title="What LAMP is" theme={C} numFont={NUM_FONT} accent={C.ice}
        note="LAMP is the NHL desk inside DASH Network, next to MOONSHOT (MLB) and TUDDY (NFL). It reads the league’s own feed and shows you the game, in hockey’s own words." />

      <Section title="WHAT IS HERE NOW">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {ROWS.map(([key, what]) => (
              <tr key={key} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '9px 8px 9px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  <button type="button" onClick={() => onNavigate?.(key === 'game' ? 'scores' : key)}
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.ice, font: `900 11px/1.3 ${NUM_FONT}`, letterSpacing: '.04em' }}>
                    {NHL_NAV[key].icon} {NHL_NAV[key].label.toUpperCase()}
                  </button>
                </td>
                <td style={{ padding: '9px 0', color: C.text2, lineHeight: 1.5 }}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="WHERE THE NUMBERS COME FROM">
        <p style={p}>Every number on LAMP is a field from the NHL’s public feed (api-web.nhle.com), read once on our server and cached for a few seconds, then shown to you. Scores refresh every 30 seconds while a game is on. Each page says at its foot exactly which feed it read and when.</p>
        <p style={p}>The day is the league’s Eastern calendar day. The times are yours. The season on every page comes from the feed itself, which is why, before opening night, the standings page says plainly that it is showing last season’s final table.</p>
      </Section>

      <Section title="WHAT LAMP DOES NOT DO YET">
        <p style={p}>No goalie in the score — the league feed names no starter before a game, so the board makes no claim about the net until the game is over, then records who actually started and his line beside the graded board. That archive is what a later version fits on. No matchups, no shot maps, no alerts yet. Those arrive in order, each only when its numbers trace to the feed. Nothing here is priced.</p>
      </Section>

      <Section title="THE THREE WORDS">
        <p style={p}><b style={{ color: C.ice }}>CALLED</b> — one of the three the board picked in his game. <b style={{ color: C.text }}>ON THE BOARD</b> — scored and ranked, but fourth or worse. <b style={{ color: C.text3 }}>NOT ON THE BOARD</b> — on the roster, not scored, and the reason is printed (usually fewer than ten NHL games on file). Same words, same meaning, on MOONSHOT and TUDDY.</p>
        <p style={p}>The score is the average of three percentile ranks among the night’s scored skaters: shots per game, goals per game, ice time per game, each over his last 82 NHL games (this season first, last season for the rest). A board is <b style={{ color: C.amber }}>PREVIEW</b> until 100 minutes before puck drop, <b style={{ color: C.teal }}>LOCKED</b> from the last write before the puck drops, <b style={{ color: C.cream }}>GRADED</b> after the final. A locked row is never rewritten.</p>
      </Section>

      <Section title="READING A SCORE ROW">
        <p style={p}><b style={{ color: C.lamp }}>Red</b> means the lamp is lit — a goal, or a game that is on right now. It never means a miss. <b style={{ color: C.text }}>STR</b> on a goal is the strength: EV even strength, PP power play, SH short-handed, EN empty net, PS penalty shot. The number in brackets after a scorer is his goals this season including that one.</p>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <div style={{ color: C.ice, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  )
}
const p = { margin: '0 0 10px', color: C.text2, fontSize: 12.5, lineHeight: 1.6 }
