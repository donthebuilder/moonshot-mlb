// 🎨 CHROME PALETTES — the frame around the data.
//
// Distinct from lib/palette.js, which owns the HEAT RAMPS (the colour inside
// table cells). That file went through five passes and a computed dead-zone
// check and is not being re-litigated here. This is the surrounding chrome:
// backgrounds, borders, type tiers, accents.
//
// Three directions, plus the shipped one as the control.
//
//   ember   what's live — orange/red, warm, loud
//   mono    Fanatics' beta: black, white type, colour reserved for the score
//           and the grade and nothing else
//   steel   cool blue/steel base — reads analytical rather than heat-mapped
//   regal   deep indigo with a muted gold accent; the one built to be a BRAND
//           rather than a sportsbook skin
//
// THE GREYS ARE NOT FREELY CHOSEN. text2/text3 went through a readability pass
// on 2026-08-08 ("easier to read for older/younger eyes") because text2 was
// ~7:1 on the darkest cards and text3 ran ~4.2:1 at 9px, which is squint
// territory. Every theme below is checked by scripts/check-themes.mjs to clear
// 4.5:1 for text3 on bg3 — the worst realistic pairing — so a new palette
// can't quietly undo that work.

export const THEMES = {
  ember: {
    label: 'Ember',
    note: 'Shipped. Warm, loud, unmistakably MOONSHOT.',
    C: {
      bg: '#09090b', bg2: '#111113', bg3: '#18181b',
      glass: 'rgba(255,255,255,0.045)',
      border: 'rgba(255,255,255,0.09)', border2: 'rgba(255,255,255,0.15)',
      text: '#f4f4f5', text2: '#b4b4bc', text3: '#8b8b95',
      orange: '#f97316', yellow: '#f59e0b', cyan: '#22d3ee',
      green: '#4ade80', red: '#f87171', purple: '#a78bfa', blue: '#60a5fa',
    },
    accent: '#f97316',
    gradient: 'linear-gradient(90deg, #f97316, #ef4444)',
  },

  mono: {
    label: 'Mono',
    note: 'Near-monochrome. One accent, spent only on the number that decides.',
    C: {
      bg: '#0a0a0a', bg2: '#131313', bg3: '#1b1b1b',
      glass: 'rgba(255,255,255,0.05)',
      border: 'rgba(255,255,255,0.10)', border2: 'rgba(255,255,255,0.18)',
      text: '#fafafa', text2: '#bcbcbc', text3: '#949494',
      // Everything that isn't the decision collapses toward grey. The accents
      // still resolve — shared components reach for C.cyan and C.purple by
      // name — they just stop competing.
      orange: '#e8a33d', yellow: '#d9b25a', cyan: '#9aa4ab',
      green: '#8fb996', red: '#d98a8a', purple: '#a9a3b8', blue: '#93a1ad',
    },
    accent: '#e8a33d',
    gradient: 'linear-gradient(90deg, #e8e8e8, #9a9a9a)',
  },

  steel: {
    label: 'Steel',
    note: 'Cool blue base. Reads analytical rather than heat-mapped.',
    C: {
      bg: '#080b10', bg2: '#0f141b', bg3: '#161d26',
      glass: 'rgba(255,255,255,0.05)',
      border: 'rgba(148,180,214,0.12)', border2: 'rgba(148,180,214,0.22)',
      text: '#eef3f8', text2: '#b0becd', text3: '#8b9aab',
      orange: '#f0a35a', yellow: '#e8c56a', cyan: '#4fd1e0',
      green: '#5fd0a0', red: '#f08a90', purple: '#a5a8f0', blue: '#5aa6f0',
    },
    accent: '#5aa6f0',
    gradient: 'linear-gradient(90deg, #5aa6f0, #4fd1e0)',
  },

  regal: {
    label: 'Regal',
    note: 'Deep indigo, muted gold. Built to be a brand, not a sportsbook skin.',
    C: {
      bg: '#0a0913', bg2: '#12111d', bg3: '#1a1828',
      glass: 'rgba(255,255,255,0.05)',
      border: 'rgba(198,178,232,0.13)', border2: 'rgba(198,178,232,0.24)',
      text: '#f5f2fa', text2: '#bab3cc', text3: '#948CAA',
      // Gold is the signature and it is RATIONED — it belongs to the score and
      // nothing else. A gold used everywhere stops reading as gold.
      orange: '#d4af6a', yellow: '#e0c47f', cyan: '#7fd2d8',
      green: '#7fc99a', red: '#e08a95', purple: '#b39ae0', blue: '#8aa5e8',
    },
    accent: '#d4af6a',
    gradient: 'linear-gradient(90deg, #d4af6a, #b39ae0)',
  },
}

export const THEME_KEYS = Object.keys(THEMES)

/** Which theme to render. ?theme=regal while we're comparing. */
export function themeFromUrl(fallback = 'ember') {
  if (typeof window === 'undefined') return fallback
  try {
    const q = new URLSearchParams(window.location.search).get('theme')
    if (q && THEME_KEYS.includes(q)) return q
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem('moonshot_theme_v1')
    if (saved && THEME_KEYS.includes(saved)) return saved
  } catch { /* ignore */ }
  return fallback
}
