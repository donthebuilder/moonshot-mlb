// SCORE PICTURES (2026-10-01). Donovan wanted imagery that helps people
// "understand what they're looking at", then: "now upgrade them visually".
// When a score's ⓘ opens its explanation (ExplainBanner), a column that names
// `art` gets a drawing of where the score comes from and a WEIGHT BAR: each
// part's real share as a slice of one bar, then the same parts as a legend.
// One lookup (ART), keyed by the column's `art` id -- no sport ternaries.
// The drawings are decorative (aria-hidden); the legend is real text. Colours
// are theme tokens + the caller's accent (no hex). Motion respects
// prefers-reduced-motion.
//
// Shares, from the models themselves:
//   nfl-td   bots/nfl/nfl_scoring.py MODELS["TD"] (nfl_td_v2): red-zone
//            chances .222 + expected TDs .157 + goal-line chances .150 = .53,
//            implied team total .183, touches .157, snap share .131.
//   nhl-goal lib/nhl/goalModel.js: three percentile ranks, averaged (1/3 each).
//   mlb-hr   bots/mlb_dashboard.py hr_score: a weighted blend (season power the
//            biggest part), then 70% blend / 30% recent home-run form.
import { C, NUM_FONT } from '../lib/theme'

const W = 200, H = 96

function Defs({ id, accent }) {
  return (
    <defs>
      <linearGradient id={`${id}-turf`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={accent} stopOpacity="0.16" />
        <stop offset="1" stopColor={accent} stopOpacity="0.04" />
      </linearGradient>
      <radialGradient id={`${id}-glow`}>
        <stop offset="0" stopColor={accent} stopOpacity="0.9" />
        <stop offset="1" stopColor={accent} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-arc`} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor={accent} stopOpacity="0.15" />
        <stop offset="1" stopColor={accent} stopOpacity="1" />
      </linearGradient>
    </defs>
  )
}

const Glow = ({ id, x, y, r = 7 }) => <circle cx={x} cy={y} r={r} fill={`url(#${id}-glow)`} opacity="0.55" />

// A field, attacking left to right: yard lines, the red zone (last 20) lit,
// the end zone solid, his red-zone touches glowing, one carry into the paint.
function Field({ accent }) {
  const id = 'sa-field'
  const yard = (y) => 14 + y * 1.6          // 0..100 yards -> x
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 240, display: 'block' }} aria-hidden="true" focusable="false">
      <Defs id={id} accent={accent} />
      <rect x="2" y="6" width={W - 4} height={H - 12} rx="6" fill={`url(#${id}-turf)`} stroke={C.border} />
      <rect x="2" y="6" width="12" height={H - 12} rx="5" fill={C.text3} opacity="0.12" />
      <rect x={yard(80)} y="6" width={yard(100) - yard(80)} height={H - 12} fill={accent} opacity="0.14" />
      <rect x={yard(100)} y="6" width={W - 2 - yard(100)} height={H - 12} rx="5" fill={accent} opacity="0.5" />
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
        <g key={y}>
          <line x1={yard(y)} y1={y === 80 ? 21 : 6} x2={yard(y)} y2={H - 6} stroke={C.text3} strokeOpacity={y === 80 ? 0.9 : 0.35} strokeWidth={y === 80 ? 1.2 : 0.7} strokeDasharray={y === 80 ? '3 2' : undefined} />
          {y % 20 === 0 && <text x={yard(y)} y={H - 10} textAnchor="middle" fontSize="7" fill={C.text3} fontFamily={NUM_FONT}>{y > 50 ? 100 - y : y}</text>}
        </g>
      ))}
      <text x={(yard(80) + yard(100)) / 2} y="16" textAnchor="middle" fontSize="7" fontWeight="800" letterSpacing=".12em" fill={accent}>RED ZONE</text>
      <text x={(yard(100) + W - 2) / 2} y={H / 2} textAnchor="middle" fontSize="7" fontWeight="900" letterSpacing=".1em" fill={C.bg} transform={`rotate(90 ${(yard(100) + W - 2) / 2} ${H / 2})`}>END ZONE</text>
      {[[86, 30], [92, 56], [96, 70], [89, 46], [98, 40]].map(([y, py]) => (
        <g key={`${y}${py}`}><Glow id={id} x={yard(y)} y={py} /><circle cx={yard(y)} cy={py} r="3" fill={accent} /></g>
      ))}
      <circle cx={yard(46)} cy="40" r="2.4" fill={C.text3} /><circle cx={yard(62)} cy="62" r="2.4" fill={C.text3} />
      <path className="sa-flight" d={`M${yard(62)} 62 Q${yard(84)} 30 ${yard(104)} 48`} fill="none" stroke={`url(#${id}-arc)`} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
    </svg>
  )
}

// Half a rink: blue line, faceoff circles, the crease and the net; his shots
// as dots, one goal lit like the lamp.
function Rink({ accent }) {
  const id = 'sa-rink'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 240, display: 'block' }} aria-hidden="true" focusable="false">
      <Defs id={id} accent={accent} />
      <rect x="2" y="4" width={W - 4} height={H - 8} rx="38" fill={`url(#${id}-turf)`} stroke={C.text3} strokeOpacity="0.6" />
      <line x1="40" y1="4" x2="40" y2={H - 4} stroke={accent} strokeWidth="3" opacity="0.55" />
      <line x1="172" y1="10" x2="172" y2={H - 10} stroke={C.text3} strokeWidth="1" />
      {[30, 66].map((cy) => (
        <g key={cy}>
          <circle cx="140" cy={cy} r="15" fill="none" stroke={C.text3} strokeOpacity="0.5" />
          <circle cx="140" cy={cy} r="1.8" fill={C.text3} />
        </g>
      ))}
      <path d={`M172 38 A10 10 0 0 0 172 58 Z`} fill={accent} opacity="0.3" />
      <path d="M172 40 h8 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 h-8" fill="none" stroke={C.text} strokeWidth="1.6" />
      {[[112, 30], [124, 62], [100, 50], [146, 44], [132, 74]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill={C.text3} />
      ))}
      <path className="sa-flight" d="M132 74 Q156 64 176 49" fill="none" stroke={`url(#${id}-arc)`} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
      <Glow id={id} x={177} y={48} r={11} />
      <circle cx="177" cy="48" r="3.4" fill={accent} />
    </svg>
  )
}

// A ballpark from above: the grass fan, the dirt diamond, the fence, and one
// ball carried out.
function Park({ accent }) {
  const id = 'sa-park'
  const home = [100, 90]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 240, display: 'block' }} aria-hidden="true" focusable="false">
      <Defs id={id} accent={accent} />
      <path d="M100 90 L22 18 A110 110 0 0 1 178 18 Z" fill={`url(#${id}-turf)`} stroke={C.text3} strokeOpacity="0.5" />
      <path d="M22 18 A110 110 0 0 1 178 18" fill="none" stroke={C.text2} strokeWidth="2.2" />
      <path d="M100 90 L76 66 L100 44 L124 66 Z" fill={C.text3} opacity="0.22" stroke={C.text3} strokeOpacity="0.7" />
      {[[76, 66], [100, 44], [124, 66]].map(([x, y]) => <rect key={`${x}`} x={x - 2.2} y={y - 2.2} width="4.4" height="4.4" fill={C.text} transform={`rotate(45 ${x} ${y})`} />)}
      <circle cx={home[0]} cy={home[1] - 2} r="2.4" fill={C.text} />
      {[[60, 46], [134, 40], [92, 30]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill={C.text3} />)}
      <path className="sa-flight" d="M100 88 Q124 4 158 8" fill="none" stroke={`url(#${id}-arc)`} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="5 3" />
      <Glow id={id} x={160} y={8} r={10} />
      <circle cx="160" cy="8" r="3.4" fill={accent} />
    </svg>
  )
}

// items: [name, share %, shown (if not "N%"), short label for inside the bar]
const ART = {
  'nfl-td': { Draw: Field, title: 'Where the TD score comes from',
    plain: 'About half of it is one question: does he get the ball near the end zone?',
    items: [['Red-zone work: chances, goal-line looks, expected TDs', 53, null, 'Red zone'], ['His team\u2019s expected points', 18, null, 'Team pts'], ['Touches', 16, null, 'Touches'], ['Snap share', 13, null, 'Snaps']] },
  'nhl-goal': { Draw: Rink, title: 'Where the goal score comes from',
    plain: 'Three equal questions: does he shoot, does he score, does he play big minutes?',
    items: [['Shots a game', 100 / 3, '\u2153', 'Shots'], ['Goals a game', 100 / 3, '\u2153', 'Goals'], ['Ice time a game', 100 / 3, '\u2153', 'Ice time']] },
  'mlb-hr': { Draw: Park, title: 'Where the HR score comes from',
    plain: 'Mostly tonight\u2019s setup (his power, the pitcher, the park), plus how he\u2019s been hitting them lately.',
    items: [['Season power (the biggest part), the starter, park and weather, pitch fit', 70, null, 'Tonight\u2019s setup'], ['Recent home-run form', 30, null, 'Recent form']] },
}

export const hasScoreArt = (id) => Boolean(ART[id])

const SLICE_ALPHA = ['', 'a6', '73', '4d']
const tone = (i) => [1, 0.72, 0.5, 0.34][i] ?? 0.3

export default function ScoreArt({ id, accent = C.orange }) {
  const a = ART[id]
  if (!a) return null
  const { Draw } = a
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'center', marginTop: 10,
      padding: 10, borderRadius: 10, background: C.bg2, border: `1px solid ${C.border}` }}>
      <style>{`@keyframes saFlight{to{stroke-dashoffset:-14}}.sa-flight{animation:saFlight 1.2s linear infinite}@media (prefers-reduced-motion: reduce){.sa-flight{animation:none}}`}</style>
      <Draw accent={accent} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: accent, marginBottom: 4 }}>{a.title}</div>
        {/* IN PLAIN WORDS first, then the parts. */}
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.4, marginBottom: 9 }}>{a.plain}</div>
        {/* THE WEIGHT BAR: one bar, each part's share as its slice, named
            inside when the slice has room. */}
        <div aria-hidden="true" style={{ display: 'flex', height: 22, borderRadius: 7, overflow: 'hidden', gap: 2, marginBottom: 9 }}>
          {a.items.map(([name, share, , short], i) => (
            <span key={name} style={{ flex: `${share} 0 0`, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              // Faded with background alpha, not opacity, so the label stays
              // solid; light ink on the paler slices.
              background: `${accent}${SLICE_ALPHA[i] ?? '4d'}`, color: i === 0 ? C.bg : C.text,
              fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {share >= 25 ? short : ''}
            </span>
          ))}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {a.items.map(([name, share, shown], i) => (
            <li key={name} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 7, alignItems: 'baseline', fontSize: 11, lineHeight: 1.35, color: C.text2 }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: accent, opacity: tone(i), alignSelf: 'center' }} />
              <span style={{ minWidth: 0 }}>{name}</span>
              <b style={{ color: C.text, fontFamily: NUM_FONT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{shown || `${share}%`}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
