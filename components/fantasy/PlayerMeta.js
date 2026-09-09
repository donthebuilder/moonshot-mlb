import LocalTime from './LocalTime'
import { matchupLabel } from '../../lib/fantasy/schedule'

// The second line of a player row: position, club, opponent, kickoff.
//
// It replaces four hand-written copies of "`${position} · ${team}`" that had
// each drifted a little, and it is where the opponent and the kickoff now live.
//
// WHY THE META LINE AND NOT A COLUMN. ESPN gives OPP and STATUS their own two
// columns, on a table that has the full width of a desktop browser to spend.
// The Franchise player board is ~590px wide inside its two-column layout and
// already carries five columns; a sixth and a seventh would have to come out of
// the player's name, and on a phone the grid drops to four columns and folds
// the move controls onto a second line as it is. The meta line is free space
// that is already reserved on every row at every width, so the fact lands on
// mobile and desktop identically without a media query deciding which of two
// duplicate DOM nodes a screen reader reads.
//
// BYE REPLACES THE MATCHUP, it does not sit next to it. A player with no game
// has no opponent and no kickoff, so printing "BYE" after an empty matchup was
// never a risk -- but printing it *before* the club would bury the club code
// that the whole line is anchored on.
export default function PlayerMeta({ player, game, bye, showPosition = true }) {
  if (!player) return null
  const club = player.team || 'FA'
  const matchup = bye ? null : matchupLabel(game)
  const kickoff = bye ? null : game?.kickoff
  return (
    <small>
      {showPosition && player.position ? `${player.position} · ` : ''}
      {club}
      {bye ? ' · BYE' : matchup ? ` ${matchup}` : ''}
      {kickoff ? <> · <LocalTime mode="datetime" value={kickoff}/></> : null}
    </small>
  )
}
