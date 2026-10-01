// SCORE PICTURES (2026-10-01). Donovan wanted imagery that helps people
// "understand what they're looking at". When a score's ⓘ opens its
// explanation (ExplainBanner), a column that names `art` gets a small drawing
// of what goes INTO that score, with each part's real share where the model
// has fixed weights. One lookup (ART), keyed by the column's `art` id -- no
// sport ternaries. Decorative SVG (aria-hidden); the legend is real text.
//
// Shares, from the models themselves:
//   nfl-td   bots/nfl/nfl_scoring.py MODELS["TD"] (nfl_td_v2): red-zone
//            chances .222 + expected TDs .157 + goal-line chances .150 = .53,
//            implied team total .183, touches .157, snap share .131.
//   nhl-goal lib/nhl/goalModel.js: three percentile ranks, averaged (1/3 each).
//   mlb-hr   bots/mlb_dashboard.py hr_score: a weighted blend (season power the
//            biggest part), then 70% blend / 30% recent home-run form.
import { C } from '../lib/theme'

function Legend({ items, accent }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3, minWidth: 0 }}>
      {items.map(([name, share], i) => (
        <li key={name} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, lineHeight: 1.35, color: C.text2 }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 2, flex: '0 0 auto', background: accent, opacity: 1 - i * 0.18 }} />
          <span style={{ minWidth: 0 }}>{name}</span>
          {share && <b style={{ marginLeft: 'auto', color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{share}</b>}
        </li>
      ))}
    </ul>
  )
}

// A field, attacking left to right: the red zone (last 20 yards) shaded, the
// end zone solid, his red-zone touches as dots.
function Field({ accent }) {
  return (
    <svg viewBox="0 0 120 56" width="120" height="56" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="118" height="54" rx="4" fill="none" stroke={C.border} />
      {[20, 40, 60, 80].map((x) => <line key={x} x1={x} y1="1" x2={x} y2="55" stroke={C.border} strokeWidth="0.8" />)}
      <rect x="80" y="1" width="20" height="54" fill={accent} opacity="0.16" />
      <rect x="100" y="1" width="19" height="54" rx="3" fill={accent} opacity="0.42" />
      {[[86, 14], [92, 30], [96, 44], [89, 38], [104, 22]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.8" fill={accent} />)}
      <circle cx="50" cy="26" r="2.2" fill={C.text3} /><circle cx="64" cy="36" r="2.2" fill={C.text3} />
    </svg>
  )
}

// Half a rink: the goal line and net on the right, his shots as dots, one in.
function Rink({ accent }) {
  return (
    <svg viewBox="0 0 120 56" width="120" height="56" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="118" height="54" rx="22" fill="none" stroke={C.border} />
      <line x1="20" y1="1" x2="20" y2="55" stroke={accent} strokeWidth="1" opacity="0.5" />
      <line x1="104" y1="4" x2="104" y2="52" stroke={C.text3} strokeWidth="0.8" />
      <path d="M104 22 h6 a2 2 0 0 1 2 2 v8 a2 2 0 0 1 -2 2 h-6" fill="none" stroke={C.text2} strokeWidth="1.2" />
      {[[70, 18], [78, 34], [62, 30], [86, 24], [90, 40]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill={C.text3} />)}
      <circle cx="108" cy="28" r="2.8" fill={accent} />
      <path d="M90 40 Q100 34 107 29" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  )
}

// A diamond and one ball carried over the fence.
function Spray({ accent }) {
  return (
    <svg viewBox="0 0 120 56" width="120" height="56" aria-hidden="true" focusable="false">
      <path d="M60 52 L18 14 A58 58 0 0 1 102 14 Z" fill="none" stroke={C.border} />
      <path d="M60 52 L44 36 L60 22 L76 36 Z" fill="none" stroke={C.text3} strokeWidth="0.9" />
      <path d="M60 50 Q72 6 92 8" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="93" cy="8" r="2.8" fill={accent} />
      {[[38, 30], [70, 30], [52, 26]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill={C.text3} />)}
    </svg>
  )
}

const ART = {
  'nfl-td': { Draw: Field, title: 'What goes into the TD score', items: [['Red-zone work: chances, goal-line looks, expected TDs', '53%'], ['His team’s expected points', '18%'], ['Touches', '16%'], ['Snap share', '13%']] },
  'nhl-goal': { Draw: Rink, title: 'What goes into the goal score', items: [['Shots a game', '⅓'], ['Goals a game', '⅓'], ['Ice time a game', '⅓']] },
  'mlb-hr': { Draw: Spray, title: 'What goes into the HR score', items: [['Season power (the biggest part), the starter, park and weather, pitch fit', '70%'], ['Recent home-run form', '30%']] },
}

export const hasScoreArt = (id) => Boolean(ART[id])

export default function ScoreArt({ id, accent = C.orange }) {
  const a = ART[id]
  if (!a) return null
  const { Draw } = a
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <Draw accent={accent} />
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 4 }}>{a.title}</div>
        <Legend items={a.items} accent={accent} />
      </div>
    </div>
  )
}
