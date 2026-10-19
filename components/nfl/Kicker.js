// A section's small capital heading on TUDDY's game page (was exported from GameOffDef, the big field, removed 10-19).
import { C, NUM_FONT } from '../../lib/nfl/theme'

export const Kicker = ({ children, style }) => (
  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT, margin: '0 0 8px', ...style }}>{children}</div>
)
