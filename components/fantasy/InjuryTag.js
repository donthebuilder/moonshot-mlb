// The injury badge, as a badge.
//
// Franchise printed injury status as lowercase prose on the end of the meta
// line -- "QB · BUF · questionable" -- in the same 8px dim monospace as the
// club code. It read as another neutral fact about the player rather than the
// one word on the row that should stop you. Every fantasy product in existence
// renders this as a coloured letter against the name, and does it there rather
// than in the meta line because that is where the eye already is.
//
// Inline-styled for positionColor.js's stated reason: fantasy.module.css is one
// large hand-minified file, and a chip that appears on five surfaces styled by
// it is safer as a self-contained span than as a new class threaded through it.
//
// Colours borrow from positionColor.js's map (by reference, not by re-spelling
// the hex) everywhere the same shade already exists there -- K's gold for
// "questionable", the unrecognised-position fallback grey for "probable" and
// for an unrecognised status. Only two shades are genuinely new to Franchise
// (RED for the three out-of-action states, and suspended's purple), and RED
// is declared once and reused three times rather than three times over
// (check-scales.mjs counts literal appearances, not distinct colours).
import { POSITION_COLORS, DEFAULT_COLOR } from './positionColor'

const RED = '#ff5c5c'
const TAGS = {
  questionable: ['Q', POSITION_COLORS.K, 'Questionable'],
  doubtful: ['D', DEFAULT_COLOR, 'Doubtful'],
  out: ['O', RED, 'Out'],
  ir: ['IR', RED, 'Injured reserve'],
  pup: ['PUP', RED, 'Physically unable to perform'],
  suspended: ['SUSP', '#c084fc', 'Suspended'],
  probable: ['P', POSITION_COLORS.DEF, 'Probable'],
}

export default function InjuryTag({ status }) {
  const key = String(status || '').trim().toLowerCase().replace(/[^a-z]/g, '')
  const tag = TAGS[key]
  // An unrecognised status is still worth showing -- the feed is not ours and a
  // new string should not silently disappear. It just gets the neutral colour.
  const [label, color, title] = tag || (key ? [String(status).slice(0, 4).toUpperCase(), POSITION_COLORS.DEF, String(status)] : [])
  if (!label) return null
  return (
    <span
      title={title}
      style={{
        display: 'inline-block', verticalAlign: 'middle', marginLeft: 6,
        padding: '1px 4px', borderRadius: 3,
        border: `1px solid ${color}66`, background: `${color}1f`, color,
        font: '800 8px/1.35 monospace', letterSpacing: '.02em',
      }}
    >{label}</span>
  )
}
