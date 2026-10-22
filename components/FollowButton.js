'use client'

// Follow / unfollow, as its own control.
//
// Starring already follows (see lib/nfl/watchlist.js and Dashboard's
// toggleWatch), but a side effect nobody can see is a side effect nobody
// trusts — and the two actions genuinely differ: the star is about tonight and
// clears with the slate, the follow is about the player and doesn't. So the
// card shows both, side by side, and says which is which on hover.
//
// ITS OWN COMPONENT, holding its own hook, on purpose: PlayerModal and
// NflPlayerModal both have early returns above their JSX, and adding a hook to
// either of them means auditing every one of those paths for hook-order
// safety. A leaf component that mounts inside the JSX can't have that problem.
//
// Works for an OFF-SLATE player too. Following needs a name and an id, not a
// game — which is the whole distinction — so this renders on the API-only
// cards where the watch button correctly refuses to.

import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import { useSportTheme } from './SportTheme'
import { useFollowing } from '../lib/dash/follow'
import { useDashAccount } from '../lib/dash/sync'

// cell: the button fills a grid cell and wears the site chip (the even watch / slip row on the player cards, 2026-10-22)
export default function FollowButton({ sport = 'mlb', id, name, team, position, compact = false, cell = false }) {
  const { following, toggle } = useFollowing(sport)
  // TUDDY / LAMP cards: the sport's cool accent (C.cyan on every theme).
  const { C, NUM_FONT } = useSportTheme()
  const account = useDashAccount()
  if (!id) return null

  const on = following(id)
  const where = account.signedIn ? 'your account' : 'this device'

  if (cell) {
    return (
      <button type="button" onClick={() => toggle({ id, name, team, position, sport })} aria-pressed={on}
        title={on ? `${name || 'He'} is on your watchlist — saved to ${where}.` : `Watch ${name || 'him'} for his next game — saved to ${where}.`}
        className={FLAT_CHIP_CLASS} style={{ ...flatChip(on, C.cyan, C, NUM_FONT), justifyContent: 'center', minWidth: 0 }}
      >{on ? '★ Watching' : '☆ Watch'}</button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => toggle({ id, name, team, position, sport })}
      // ONE WATCH WORD (2026-10-06): 'Watch', MOONSHOT's, on every product. ONE STAR + MEMORY (2026-10-01): LAMP's only save control, now the
      // watch -- it lasts until a game he was starred for is over
      // (lib/nhl/useLampSaves.js), and his card remembers how he did.
      title={on
        ? `${name || 'He'} is on your watchlist — saved to ${where}. It clears after his next game; his card keeps how he did for you.`
        : `Watch ${name || 'him'} for his next game — saved to ${where}. It clears after the game; his card keeps how he did for you.`}
      // 44px TAP TARGET (2026-10-10, the star is shared by every sport): the button is the 44px box, pulled back with a negative
      // margin so the row keeps its height; the pill inside is the same pill as before (same padding, border, colour).
      aria-pressed={on}
      style={{ minHeight: 44, minWidth: 44, margin: '-10px 0', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    ><span style={flatChip(on, C.cyan, C, NUM_FONT)}>{/* the site's one chip (lib/chips.js flatChip, the oval; 10-22) */}{on ? '★ Watching' : '☆ Watch'}</span></button>
  )
}
