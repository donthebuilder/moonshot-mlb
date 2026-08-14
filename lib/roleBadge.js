// 🎫 ROLE + BET TYPE, as typography instead of emoji.
//
// WHY THIS FILE EXISTS. The bot publishes its conviction tier as a string with
// a pictograph baked into it — "🏆 HR Bet", "🔥 HR Lean", "🏁 HRR", "🔭 Power
// Watch", "💠 Contact", "⛔ True Avoid" — and the site rendered that string
// straight through, then derived the badge COLOUR by sniffing for the glyph:
//
//     if (s.includes('🏆')) return C.orange
//
// Two problems with that, one cosmetic and one structural.
//
// COSMETIC: none of the four apps named as the redesign reference — ESPN,
// PropFinder, Fanatics, FanDuel — use emoji as UI. They use restrained icon
// systems, team logos, player photography, and typographic tags with isolated
// colour accents. Emoji render differently on every platform, can't be
// weighted or tracked with the rest of the type, carry unpredictable widths
// that break table alignment, and read as decoration in a product whose whole
// pitch is receipts.
//
// STRUCTURAL, and the reason this is a module rather than a find-and-replace:
// colour was keyed on the glyph. So the glyph wasn't decoration at all — it
// was load-bearing. Delete the emoji from the string and every badge silently
// falls through to the default orange. The fix has to introduce a semantic
// token FIRST, colour off that, and only then drop the pictograph.
//
// The bot is unchanged. It keeps publishing whatever it publishes; this file
// is the site's translation layer, so nothing on the data branch has to move
// and old graded files still resolve.

// Every pictograph, variation selector and zero-width joiner. \p{} escapes are
// fine here — the build targets evergreen browsers and Next transpiles the rest.
const GLYPHS = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu

/** Strip pictographs and tidy the whitespace they leave behind. */
export function stripGlyphs(s) {
  return String(s ?? '')
    .replace(GLYPHS, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// The conviction ladder, in order of conviction. `match` is checked against the
// ORIGINAL string (glyph included) so a tier resolves whether the bot sends
// "🏆 HR Bet", "HR Bet", or "hr_bet".
//
// `tone` is a key on the theme, not a hex value — the palette owns the hexes,
// and hard-coding them here would fork the colour system.
export const TIERS = [
  { key: 'hr_bet',      label: 'HR BET',   full: 'HR Bet',      tone: 'orange', glyph: '🏆', match: /hr\s*bet/i },
  { key: 'hr_lean',     label: 'HR LEAN',  full: 'HR Lean',     tone: 'orange', glyph: '🔥', match: /hr\s*lean/i },
  { key: 'hrr',         label: 'HRR',      full: 'HRR',         tone: 'cyan',   glyph: '🏁', match: /\bhrr\b|run.?rbi|production/i },
  { key: 'power_watch', label: 'POWER',    full: 'Power Watch', tone: 'purple', glyph: '🔭', match: /power\s*watch/i },
  { key: 'contact',     label: 'CONTACT',  full: 'Contact',     tone: 'blue',   glyph: '💠', match: /contact|total\s*base|\btb\b/i },
  { key: 'avoid',       label: 'AVOID',    full: 'True Avoid',  tone: 'red',    glyph: '⛔', match: /avoid|skip/i },
  { key: 'hit',         label: 'HIT',      full: 'Hit',         tone: 'purple', glyph: '',   match: /\bhit\b|base\s*hit/i },
  { key: 'value',       label: 'VALUE',    full: 'Value HR',    tone: 'purple', glyph: '',   match: /value|hidden/i },
  { key: 'trap',        label: 'TRAP',     full: 'Trap',        tone: 'yellow', glyph: '⚠️', match: /\btrap\b/i },
]

const BY_KEY = Object.fromEntries(TIERS.map((t) => [t.key, t]))

/**
 * Resolve any role / bet-type string to a semantic tier.
 *
 * Glyph first, because it's unambiguous when present. Text second, so a
 * de-emojified or hand-typed value still lands. Order matters within the
 * text pass: "Avoid HR" contains "HR" and must not resolve as an HR bet, so
 * `avoid` is tested before the looser patterns by sitting earlier in a
 * dedicated priority list.
 */
const TEXT_ORDER = ['avoid', 'trap', 'hr_bet', 'hr_lean', 'power_watch', 'hrr', 'contact', 'value', 'hit']

export function tierOf(raw) {
  const s = String(raw ?? '')
  if (!s.trim()) return null
  for (const t of TIERS) {
    if (t.glyph && s.includes(t.glyph)) return t
  }
  const text = stripGlyphs(s)
  if (!text) return null
  for (const key of TEXT_ORDER) {
    if (BY_KEY[key].match.test(text)) return BY_KEY[key]
  }
  return null
}

/**
 * The badge to render: a short uppercase label and a colour off the theme.
 *
 * Falls back to the string's own de-emojified text so an unrecognised tier
 * still shows something truthful rather than a wrong tier or a blank.
 */
export function roleBadge(raw, C) {
  const t = tierOf(raw)
  const text = stripGlyphs(raw)
  if (!t) {
    return { key: null, label: text || '—', color: C?.text2 ?? '#a1a1aa', glyph: null, known: false }
  }
  return { key: t.key, label: t.label, color: C?.[t.tone] ?? C?.text2, glyph: t.glyph || null, known: true }
}

/** Colour for a tier, by token rather than by glyph. */
export function tierTone(raw, C) {
  return roleBadge(raw, C).color
}
