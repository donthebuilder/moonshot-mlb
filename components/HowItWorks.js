// HOW IT WORKS: LOOK -> PICK -> TRACK (2026-10-01). Donovan: "something that
// will help the people understand what they're looking at, picking and doing."
//
// Three small drawings, one verb and one short line each. Server-safe (no
// hooks), so /start renders it on the server. Colours come in as props, so
// /start passes its own CSS variables and an in-app page passes its theme
// tokens -- no hex here. The words differ per sport and live in ONE lookup
// (WORDS), never a sport ternary.

const WORDS = {
  mlb: {
    look: 'Every hitter on the slate, ranked before first pitch.',
    pick: 'The bot makes its calls in every game. Tap a name to see why.',
    track: 'Every call is graded after the game, hit or miss.',
  },
  nfl: {
    look: 'Every player on the week’s board, ranked before kickoff.',
    pick: 'The bot calls five per market each week. Tap a name to see why.',
    track: 'Every call is graded after the games, hit or miss.',
  },
  nhl: {
    look: 'Every skater on tonight’s board, ranked before puck drop.',
    pick: 'The bot calls three in every game. Tap a name to see why.',
    track: 'Every call is graded after the game, hit or miss.',
  },
}

// ── the drawings: decorative, aria-hidden; the words carry the meaning ──
function Board({ accent, line, dim }) {
  const rows = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true" focusable="false">
      {rows.map((i) => (
        <g key={i} transform={`translate(4 ${4 + i * 15})`}>
          <rect width="88" height="12" rx="3" fill="none" stroke={i === 0 ? accent : line} strokeWidth={i === 0 ? 1.6 : 1} />
          <circle cx="9" cy="6" r="3.2" fill={i === 0 ? accent : dim} opacity={i === 0 ? 1 : 0.5} />
          <rect x="16" y="4.5" width={30 - i * 3} height="3" rx="1.5" fill={dim} opacity="0.6" />
          <rect x="60" y="3" width={24 - i * 5} height="6" rx="2" fill={accent} opacity={1 - i * 0.22} />
        </g>
      ))}
    </svg>
  )
}

function Pick({ accent, line, dim }) {
  return (
    <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true" focusable="false">
      <rect x="10" y="6" width="76" height="52" rx="8" fill="none" stroke={line} strokeWidth="1.2" />
      <circle cx="30" cy="27" r="10" fill={dim} opacity="0.45" />
      <rect x="45" y="20" width="30" height="4" rx="2" fill={dim} opacity="0.7" />
      <rect x="45" y="29" width="20" height="3" rx="1.5" fill={dim} opacity="0.45" />
      <rect x="20" y="42" width="56" height="9" rx="4.5" fill={accent} opacity="0.18" stroke={accent} strokeWidth="1" />
      <circle cx="28" cy="46.5" r="2.4" fill={accent} />
      <rect x="34" y="45" width="34" height="3" rx="1.5" fill={accent} />
    </svg>
  )
}

function Track({ accent, line, dim }) {
  const marks = [true, false, true]
  return (
    <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true" focusable="false">
      {marks.map((hit, i) => (
        <g key={i} transform={`translate(8 ${6 + i * 18})`}>
          <rect width="80" height="14" rx="3" fill="none" stroke={line} strokeWidth="1" />
          <rect x="8" y="5.5" width={34 - i * 4} height="3" rx="1.5" fill={dim} opacity="0.6" />
          {hit
            ? <path d="M60 7.5 l4 4 l8 -8" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            : <path d="M61 3.5 l7 7 M68 3.5 l-7 7" fill="none" stroke={dim} strokeWidth="2" strokeLinecap="round" />}
        </g>
      ))}
    </svg>
  )
}

const STEPS = [
  { key: 'look', verb: 'Look', Art: Board },
  { key: 'pick', verb: 'Pick', Art: Pick },
  { key: 'track', verb: 'Track', Art: Track },
]

/**
 * sport: 'mlb' | 'nfl' | 'nhl'
 * colors: { accent, ink, dim, line } -- CSS colours (variables welcome)
 * recordHref: where "Track" points (the sport's public record)
 */
export default function HowItWorks({ sport, colors, recordHref = null, title = 'How it works' }) {
  const words = WORDS[sport] || WORDS.mlb
  const { accent, ink, dim, line } = colors
  return (
    <div>
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: ink }}>{title}</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {STEPS.map(({ key, verb, Art }, i) => (
          <li key={key} style={{ minWidth: 0, border: `1px solid ${line}`, borderRadius: 10, padding: '10px 8px 12px', display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 6 }}>
            <Art accent={accent} line={line} dim={dim} />
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', color: accent }}>
              {i + 1} · {verb}
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.4, color: dim }}>
              {words[key]}
              {key === 'track' && recordHref && (
                <> <a href={recordHref} style={{ color: ink, fontWeight: 700, display: 'inline-block', padding: '12px 4px', margin: '-12px -4px' }}>See the record</a></>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
