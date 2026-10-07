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

import { useSportTheme } from './SportTheme'
import { alpha } from '../lib/scales'
import { useFollowing } from '../lib/dash/follow'
import { useDashAccount } from '../lib/dash/sync'

export default function FollowButton({ sport = 'mlb', id, name, team, position, compact = false }) {
  const { following, toggle } = useFollowing(sport)
  // TUDDY / LAMP cards: the sport's cool accent (C.cyan on every theme).
  const { C, NUM_FONT, themed } = useSportTheme()
  const account = useDashAccount()
  if (!id) return null

  const on = following(id)
  const where = account.signedIn ? 'your account' : 'this device'

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
      style={{
        padding: compact ? '3px 9px' : '4px 11px',
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        fontFamily: NUM_FONT,
        borderRadius: 7,
        cursor: 'pointer',
        border: `1px solid ${on ? C.cyan : C.border}`,
        background: on ? (themed ? alpha(C.cyan, 0.14) : 'rgba(34,211,238,.14)') : 'transparent',
        color: on ? C.cyan : C.text3,
        whiteSpace: 'nowrap',
      }}
    >{on ? '★ Watching' : '☆ Watch'}</button>
  )
}
