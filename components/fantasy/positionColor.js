// C4 (dash-network-master-plan-2026-08-28.md): "position color language
// consistent with TUDDY's." Checked directly first -- TUDDY (components/nfl/)
// has no position-color table at all (confirmed: no TeamMark/TeamBadge/
// TeamLogo-style component, no position->color map anywhere in lib/nfl or
// components/nfl). So there's no existing source of truth to port; this is
// a new, small, Franchise-scoped map, kept deliberately inside the app's own
// dark palette (the --orange/--gold/--green/--cyan tokens already used
// throughout fantasy.module.css) rather than importing a generic sports-app
// color scheme wholesale.
//
// Applied as inline styles (not new CSS classes) on purpose: fantasy.module.css
// is one large hand-minified file with no per-position hooks today, and
// editing it blind risks breaking an unrelated rule sharing the same line.
// An inline color on the existing .positionTag/.playerDash/.slotBadge
// elements gets the same visual result without touching that file.
// R10 (2026-10-03): the same five hues, read from FRANCHISE's theme (the
// chassis palette) instead of typed here -- one red, one green ... network-wide.
import { C } from '../../lib/fantasy/theme'
export const POSITION_COLORS = {
  QB: C.red,
  RB: C.green,
  WR: C.cyan,
  TE: C.purple,
  K: C.yellow,
  DEF: C.text3,
  DST: C.text3,
}

export const DEFAULT_COLOR = C.gold // FRANCHISE's accent, for an unrecognized position

export function colorForPosition(position) {
  return POSITION_COLORS[String(position || '').toUpperCase()] || DEFAULT_COLOR
}
