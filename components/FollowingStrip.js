'use client'

// The durable half of the watchlist, rendered.
//
// The star is a statement about tonight and gets pruned with the slate.
// Following is a statement about a player and never gets pruned — so it needs
// somewhere to live that isn't tonight's board, and somewhere to be removed
// from, since un-starring deliberately doesn't unfollow.
//
// Says out loud where the list is stored, because that answer changed: signed
// in it is on the account and follows you between devices; signed out it is
// this browser, exactly like every other saved thing on the site.

import { C } from '../lib/theme'
import { useFollowing } from '../lib/dash/follow'
import { useDashAccount } from '../lib/dash/sync'

export default function FollowingStrip({ sport = 'mlb', onPlayerClick = null, liveIds = null }) {
  const { rows, unfollow } = useFollowing(sport)
  const account = useDashAccount()

  if (!rows.length) {
    return (
      <div style={wrap()}>
        <div style={head()}><b style={title()}>★ Following</b><span style={note()}>nobody yet</span></div>
        <p style={body()}>
          Star a player anywhere on the board and he lands here. Stars clear with the
          slate; this list doesn&apos;t.
        </p>
      </div>
    )
  }

  return (
    <div style={wrap()}>
      <div style={head()}>
        <b style={title()}>★ Following</b>
        <span style={note()}>
          {rows.length} {rows.length === 1 ? 'player' : 'players'} ·{' '}
          {account.signedIn ? 'saved to your account' : 'saved on this device'}
        </span>
      </div>
      <div style={grid()}>
        {rows.map((row) => {
          const live = liveIds ? liveIds.has(String(row.id)) : null
          return (
            <span key={`${row.sport}:${row.id}`} style={{ ...chip(), opacity: live === false ? 0.55 : 1 }}>
              <button
                type="button"
                onClick={() => onPlayerClick?.(row)}
                style={chipName()}
                title={live === false ? 'Not on the current board' : 'Open his card'}
              >
                {row.name}
                {row.team ? <em style={chipTeam()}>{row.team}</em> : null}
                {live ? <i style={dot()} title="On the current board" /> : null}
              </button>
              <button type="button" onClick={() => unfollow(row.id)} style={chipX()} title="Stop following">×</button>
            </span>
          )
        })}
      </div>
      {!account.signedIn && account.configured ? (
        <p style={body()}>
          <a href="/dash#sign-in" style={{ color: 'inherit' }}>Sign in</a> and this list follows you
          to your phone.
        </p>
      ) : null}
    </div>
  )
}

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const wrap = () => ({ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10, background: C.bg2 })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const head = () => ({ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const title = () => ({ fontSize: 11.5, fontWeight: 900 })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const note = () => ({ color: C.text3, font: '800 9px/1 monospace', letterSpacing: '.06em', textTransform: 'uppercase' })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const body = () => ({ margin: '6px 0 0', color: C.text3, fontSize: 11, lineHeight: 1.5 })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const grid = () => ({ display: 'flex', flexWrap: 'wrap', gap: 6 })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const chip = () => ({ display: 'inline-flex', alignItems: 'stretch', border: `1px solid ${C.border2}`, borderRadius: 999, overflow: 'hidden', background: C.bg3 })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const chipName = () => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', border: 0, background: 'transparent', color: C.text, font: '700 11px/1 inherit', cursor: 'pointer' })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const chipTeam = () => ({ color: C.text3, font: '800 8px/1 monospace', fontStyle: 'normal' })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const chipX = () => ({ padding: '0 8px', border: 0, borderLeft: `1px solid ${C.border2}`, background: 'transparent', color: C.text3, fontSize: 13, cursor: 'pointer' })
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const dot = () => ({ width: 5, height: 5, borderRadius: 999, background: C.orange, display: 'inline-block' })
