'use client'
import { explain } from '../../lib/explain'
import { roleLabel, roleLong, roleNote } from '../../lib/nfl/roles'

// HIS DEPTH ROLE, WHERE A NAME IS PRINTED (lib/nfl/roles.js): "WR1", else the plain position. When he has a role it
// says where it is from on hover AND on tap (lib/explain.js), with the season and the games behind it. Plain text when
// he has none: nothing is guessed.
export default function RoleTag({ player, season = null, style }) {
  const word = roleLong(player) || roleLabel(player)
  const note = roleNote(player, season)
  if (!note) return <span style={style}>{word}</span>
  const say = (e) => { e.stopPropagation(); explain(word, note) }
  return (
    <span role="button" tabIndex={0} title={note} onClick={say}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(e) } }}
      style={{ ...style, cursor: 'help', display: 'inline-block', padding: 9, margin: -9 }}>{word}</span>
  )
}
