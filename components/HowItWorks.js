// HOW IT WORKS: LOOK -> PICK -> TRACK (2026-10-01). Donovan: "something that
// will help the people understand what they're looking at, picking and doing",
// then "now upgrade them visually".
//
// Three drawings, one verb and one short line each, with arrows between the
// steps. Server-safe (no hooks), so /start renders it on the server. Colours
// come in as props, so /start passes its own CSS variables and an in-app page
// passes its theme tokens -- no hex here; tints are color-mix() of the accent,
// which works with either. The words differ per sport and live in ONE lookup
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
    pick: 'The bot calls one skater per team, two in every game. Tap a name to see why.',
    track: 'Every call is graded after the game, hit or miss.',
  },
}

const tint = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

// A head-and-shoulders silhouette, centred on (x, y), radius r.
const Face = ({ x, y, r, fill, ring }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={tint(fill, 22)} stroke={ring || 'none'} strokeWidth={ring ? 1.4 : 0} />
    <circle cx={x} cy={y - r * 0.18} r={r * 0.36} fill={fill} opacity="0.85" />
    <path d={`M${x - r * 0.62} ${y + r * 0.72} a${r * 0.62} ${r * 0.5} 0 0 1 ${r * 1.24} 0`} fill={fill} opacity="0.85" />
  </g>
)

// ── the drawings: decorative, aria-hidden; the words carry the meaning ──
function Board({ accent, line, dim, ink }) {
  return (
    <svg viewBox="0 0 120 76" width="100%" style={{ maxWidth: 150, display: 'block' }} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="116" height="72" rx="8" fill={tint(accent, 4)} stroke={line} />
      <rect x="2" y="2" width="116" height="11" rx="8" fill={tint(dim, 14)} />
      {[0, 1, 2, 3].map((i) => {
        const y = 17 + i * 14, top = i === 0
        return (
          <g key={i}>
            {top && <rect x="5" y={y - 1} width="110" height="13" rx="4" fill={tint(accent, 16)} stroke={accent} strokeWidth="1.2" />}
            <text x="11" y={y + 8.5} textAnchor="middle" fontSize="7" fontWeight="900" fill={top ? accent : dim}>{i + 1}</text>
            <Face x={23} y={y + 5.5} r={4.6} fill={top ? accent : dim} />
            <rect x="31" y={y + 3.5} width={34 - i * 4} height="3.6" rx="1.8" fill={top ? ink : dim} opacity={top ? 0.9 : 0.55} />
            <rect x="82" y={y + 1} width="30" height="9" rx="2.5" fill={accent} opacity={1 - i * 0.24} />
          </g>
        )
      })}
    </svg>
  )
}

function Pick({ accent, line, dim, ink }) {
  return (
    <svg viewBox="0 0 120 76" width="100%" style={{ maxWidth: 150, display: 'block' }} aria-hidden="true" focusable="false">
      <rect x="10" y="10" width="100" height="60" rx="10" fill={tint(dim, 6)} stroke={line} transform="rotate(-4 60 40)" />
      <rect x="12" y="6" width="100" height="62" rx="10" fill={tint(accent, 6)} stroke={accent} strokeOpacity="0.6" />
      <Face x={34} y={28} r={12} fill={accent} ring={accent} />
      <rect x="52" y="20" width="44" height="5" rx="2.5" fill={ink} opacity="0.85" />
      <rect x="52" y="30" width="30" height="4" rx="2" fill={dim} opacity="0.6" />
      <rect x="22" y="47" width="80" height="13" rx="6.5" fill={tint(accent, 22)} stroke={accent} />
      <circle cx="31" cy="53.5" r="3" fill={accent} />
      <text x="62" y="56.4" textAnchor="middle" fontSize="7.5" fontWeight="900" letterSpacing=".14em" fill={accent}>CALLED</text>
      <path d="M92 50.5 l2.4 2.4 l4.6 -4.6" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M104 8 l1.4 3.4 l3.4 1.4 l-3.4 1.4 l-1.4 3.4 l-1.4 -3.4 l-3.4 -1.4 l3.4 -1.4 z" fill={accent} />
    </svg>
  )
}

function Track({ accent, line, dim, ink }) {
  const marks = [true, false, true]
  return (
    <svg viewBox="0 0 120 76" width="100%" style={{ maxWidth: 150, display: 'block' }} aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="112" height="68" rx="8" fill={tint(accent, 4)} stroke={line} />
      {marks.map((hit, i) => {
        const y = 12 + i * 19
        return (
          <g key={i}>
            <rect x="10" y={y} width="72" height="14" rx="4" fill={hit ? tint(accent, 12) : tint(dim, 8)} stroke={hit ? accent : line} strokeOpacity={hit ? 0.7 : 1} />
            <rect x="16" y={y + 5.4} width={30 - i * 4} height="3.2" rx="1.6" fill={hit ? ink : dim} opacity={hit ? 0.85 : 0.5} />
            {hit
              ? <path d={`M62 ${y + 7} l3.6 3.6 l7.2 -7.2`} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              : <path d={`M63 ${y + 3.5} l7 7 M70 ${y + 3.5} l-7 7`} fill="none" stroke={dim} strokeWidth="2" strokeLinecap="round" />}
          </g>
        )
      })}
      <g transform="rotate(-14 99 40)">
        <circle cx="99" cy="40" r="15" fill="none" stroke={accent} strokeWidth="1.6" />
        <circle cx="99" cy="40" r="11.5" fill="none" stroke={accent} strokeWidth="0.8" strokeDasharray="2 1.6" />
        <text x="99" y="42" textAnchor="middle" fontSize="5.4" fontWeight="900" letterSpacing=".02em" fill={accent}>GRADED</text>
      </g>
    </svg>
  )
}

const STEPS = [
  { key: 'look', verb: 'Look', Art: Board, cta: 'Open board' },
  { key: 'pick', verb: 'Pick', Art: Pick, cta: 'See picks' },
  { key: 'track', verb: 'Track', Art: Track, cta: 'See record' },
]

/**
 * sport: 'mlb' | 'nfl' | 'nhl'
 * colors: { accent, ink, dim, line, bg } -- CSS colours (variables welcome); bg inks the step number
 * hrefs: { look, pick, track } -- each tile is a tap-through to the real place
 *        (recordHref is the older name for hrefs.track)
 */
export default function HowItWorks({ sport, colors, recordHref = null, hrefs = {}, title = 'How it works' }) {
  const to = { ...hrefs, track: hrefs.track || recordHref }
  const words = WORDS[sport] || WORDS.mlb
  const { accent, ink, dim, line, bg } = colors
  return (
    <div>
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: ink }}>{title}</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        {STEPS.map(({ key, verb, Art, cta }, i) => (
          <li key={key} style={{
            position: 'relative', minWidth: 0, borderRadius: 12, padding: '10px 8px 12px',
            border: `1px solid ${tint(accent, 30)}`,
            background: `radial-gradient(120% 80% at 50% 0%, ${tint(accent, 14)}, transparent 70%)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 7,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 999, background: accent, color: bg || ink, fontSize: 11, fontWeight: 900, lineHeight: '20px' }}>{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', color: accent }}>{verb}</span>
            </span>
            <Art accent={accent} line={line} dim={dim} ink={ink} />
            <span style={{ fontSize: 12, lineHeight: 1.4, color: dim }}>{words[key]}</span>
            {/* The whole tile is the link (a stretched anchor), so a thumb
                anywhere on it lands on the real place. */}
            {to[key] && (
              <a href={to[key]} style={{ fontSize: 12, fontWeight: 800, color: accent, textDecoration: 'none', marginTop: 'auto', whiteSpace: 'nowrap' }}>
                <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 12 }} />
                {cta}{'\u00a0\u203a'}
              </a>
            )}
            {/* the arrow to the next step, sitting in the gap */}
            {i < STEPS.length - 1 && (
              <svg aria-hidden="true" focusable="false" viewBox="0 0 12 12" width="12" height="12"
                style={{ position: 'absolute', right: -13, top: 58, zIndex: 1 }}>
                <path d="M3 2 l5 4 l-5 4" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
