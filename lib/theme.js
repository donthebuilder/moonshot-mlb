export const C = {
  bg: '#09090b',
  bg2: '#111113',
  bg3: '#18181b',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.09)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#f4f4f5',
  text2: '#a1a1aa',
  text3: '#71717a',
  orange: '#f97316',
  yellow: '#f59e0b',
  cyan: '#22d3ee',
  green: '#4ade80',
  red: '#f87171',
  purple: '#a78bfa',
  blue: '#60a5fa',
}
export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"
// All seventeen boards from the Streamlit build, in its order. Longest, Due,
// Pair History and Player are new here -- the Next.js app predates them.
// Order is deliberate: the boards you scan first, then the tools you reach for
// once you have names, then the archive. Scoreboard leads because it's the one
// view with every hitter and every column — you start wide and narrow down.
// Games moved down: it's a per-game read, which is where you go AFTER you know
// who you're interested in, not before.
export const TABS = [
  ['scoreboard',  'Scoreboard'],
  ['board',       'HR Board'],
  ['hitshrr',     'Hits & HRR'],
  ['longest',     'Longest'],
  ['due',         'Due'],
  ['games',       'Games'],
  ['pitchers',    'Pitchers'],
  ['spray',       'Spray'],
  ['pairs',       'Pairs'],
  ['pools',       'Pools'],
  ['bot',         'Bot'],
  ['leaders',     'Leaders'],
  ['player',      'Player'],
  ['watch',       'Watchlist'],
  ['pairhist',    'Pair History'],
  ['results',     'Results'],
  ['guide',       'Guide'],
]
