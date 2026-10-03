'use client'
import { useEffect, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'
import { useFollowing } from '../lib/dash/follow'
import { useDashAccount } from '../lib/dash/sync'

// ⭐ YOUR PLAYERS, THE VIEW (2026-10-03, parity). MOONSHOT's Your players
// section (components/YourPlayers.js) lifted out markup for markup -- the
// collapsible header with the whole list's live and event counts, the ranked
// rows, × to remove, show more, Clear all -- so TUDDY and LAMP show their
// followed players the same way. Each sport builds its rows (its live feed,
// its "cleared" bars, its event word); this only draws them.
//
// rows: [{ id, name, p, status: live|pre|final|off, bars, hr (event count),
//          role, matchup, lineNode, clock, starred }], already ranked.

// ── COLLAPSED BY DEFAULT ────────────────────────────────────────────────────
//
// 2026-09-03, Donovan: "i want the your players on the home page to be
// collapsable or like show only little and can open big — right now it takes
// up a large portion of the home page esp when you have a lot of players you
// follow."
//
// He is right, and the reason is structural: this list has no natural ceiling.
// Following is DURABLE and never pruned (lib/dash/follow.js), so it only ever
// grows, and a man followed in May still takes a row in September. Every other
// block on Home is bounded by the slate; this one is bounded by how long he
// has used the site.
//
// THE RULE THAT MAKES COLLAPSING SAFE: a collapsed section must never hide the
// thing you opened it for. So the cap is a FLOOR, not a limit — anyone whose
// night is still changing (live) or who has already done something (a homer)
// is shown regardless of where he falls. Collapsing can only ever hide men who
// are finished, not yet playing, or not on tonight's board at all.
//
// 2026-09-05, Donovan, with a screenshot of 32 live rows filling Home: "make
// sure it only shows 3 players max for the preview, it takes up the whole
// page." He is right again, and the floor rule above is exactly why: on a
// full slate nearly everyone he follows is live, so "the first five plus
// anyone live" was the whole list. The floor became the page.
//
// So the preview is now a HARD CAP of three. What survives from the floor
// idea is the RANKING, not the exemption: rows are already sorted live-first,
// homers-first, loudest-first, so the three that show are the three that
// matter most tonight, and the header still counts every live man and every
// homer across the whole list so nothing is hidden twice. One tap opens the
// rest.
const COLLAPSED_N = 3
// A SECOND, SEPARATE STATE, and the distinction is the whole point.
//   OPEN_KEY  — show every row, or the first few plus anyone live/deep
//   SHUT_KEY  — the section itself is closed
// Donovan: "the your player need to be colapable." It was not: the header was
// static and the only control expanded a list that never went below five rows
// plus anybody live. So on a night with a live man it could not be made small,
// which is the same complaint that started this section ("the live tracker
// takes up the screen every time I open the page") arriving from the other
// side. The header is the toggle now.

// Per-device, and deliberately NOT synced to the account (lib/dash/sync.js
// keeps device facts local; how much of a list fits on screen is one).
export const KEYS = {
  mlb: { open: 'dash_yourplayers_open_v1', shut: 'dash_yourplayers_shut_v1' },
  nfl: { open: 'tuddy_yourplayers_open_v1', shut: 'tuddy_yourplayers_shut_v1' },
  nhl: { open: 'lamp_yourplayers_open_v1', shut: 'lamp_yourplayers_shut_v1' },
}
const readKey = (k) => { try { return window.localStorage.getItem(k) === '1' } catch { return false } }
const writeKey = (k, v) => { try { window.localStorage.setItem(k, v ? '1' : '0') } catch { /* private mode */ } }

const wrapOf = (C) => ({
  background: C.scrim, border: `1px solid ${C.border2}`, borderRadius: 12,
  padding: '10px 12px 11px', marginBottom: 16,
})
const headS = { display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }
const titleOf = (C) => ({ fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: '.04em' })
const noteOf = (C, NUM_FONT) => ({ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT })

export default function YourPlayersView({
  sport = 'mlb', rows, onPlayerClick = null, collapsible = true, onUnstar = null, previewN = COLLAPSED_N,
  eventWord = (n) => `${n} HR tonight`, hiddenEventWord = (n) => `${n} with a HR`,
  emptyNote = <>Star a player anywhere on the board and he lands here, with tonight&apos;s line
          beside him. A star lasts the night; his card remembers how he did for you.</>,
  theme = MLB_C, numFont = MLB_NUM, accent = null, liveInk = null, keys = KEYS.mlb,
}) {
  const C = theme
  const NUM_FONT = numFont
  const ACC = accent || C.orange
  const LIVE = liveInk || C.green
  const wrap = wrapOf(C); const head = headS; const title = titleOf(C); const note = noteOf(C, NUM_FONT)
  const { unfollow, clear: clearFollowing } = useFollowing(sport)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  const account = useDashAccount()
  const [open, setOpen] = useState(false)
  const [shut, setShut] = useState(false)
  useEffect(() => { setOpen(readKey(keys.open)); setShut(readKey(keys.shut)) }, [keys.open, keys.shut])
  const toggle = () => setOpen((v) => { writeKey(keys.open, !v); return !v })
  const toggleShut = () => setShut((v) => { writeKey(keys.shut, !v); return !v })
  if (!rows.length) {
    return (
      <div style={wrap}>
        <div style={head}>
          <b style={title}>★ Your players</b>
          <span style={note}>nobody yet</span>
        </div>
        <p style={{ ...note, margin: '6px 0 0', lineHeight: 1.6 }}>
          {emptyNote}
        </p>
      </div>
    )
  }

  const liveN = rows.filter((r) => r.status === 'live').length
  const hrN = rows.reduce((a, r) => a + r.hr, 0)   // r.hr = the sport's event count tonight (HR / TD / goal)

  // The cap, in one line: the first COLLAPSED_N by rank. `rows` is ranked
  // live-first then homers-first, so the preview is the three loudest nights
  // and the header carries the totals for everyone behind the fold.
  // collapsible={false} is still honoured for any caller that wants the
  // whole list, but no page passes it any more: You.js dropped it on
  // 2026-09-05 because the full list on a phone "makes the scroll too much".
  // ── HOW MANY ROWS THE PREVIEW SHOWS (2026-09-18) ────────────────────────
  // Three is right on Home, where this is one section among many and the
  // 09-05 note applies ("the full list on a phone makes the scroll too
  // much"). It is wrong on the YOU tab, where this list IS the page and the
  // job is managing it: Donovan had 37 followed players and saw three of
  // them, so pressing × removed a man and the next one slid into his place
  // — a list that never visibly shrinks reads as a remove button that does
  // nothing. Measured on the live site before changing anything: the × and
  // Clear all both work correctly and both survive a reload; what was broken
  // was being able to SEE either one work. So You.js asks for a taller
  // preview and Home keeps three.
  const capN = Math.max(1, previewN)
  const shown = (open || !collapsible) ? rows : rows.slice(0, capN)
  const restN = rows.length - shown.length
  const hidden = rows.slice(shown.length)
  const hiddenLive = hidden.filter((r) => r.status === 'live').length
  const hiddenHr = hidden.filter((r) => r.hr > 0).length

  // WHY THE COUNTS STAY IN THE HEADER WHEN IT IS SHUT. This section exists
  // because starred players were getting lost. A closed section that says
  // nothing would lose them again, more quietly — so the header keeps the
  // whole list's summary, including anyone live and anything that has gone
  // deep, and those stay in colour. Shut means "not now", never "don't tell
  // me". It is the same rule the row slice already follows: the counts
  // describe the WHOLE list, not the visible part, so a homer is never hidden
  // twice.
  const summary = (
    <span style={note}>
      {rows.length}{' '}
      {liveN ? <>· <b style={{ color: LIVE }}>{liveN} live</b> </> : null}
      {hrN ? <>· <b style={{ color: ACC }}>{eventWord(hrN)}</b> </> : null}
      {shut && collapsible ? null : <>· {account.signedIn ? 'saved to your account' : 'saved on this device'}</>}
    </span>
  )

  // The watchlist tab passes collapsible={false} — that page IS this list, and
  // a header that could hide it would make the dedicated view the weaker of
  // the two.
  if (collapsible && shut) {
    return (
      <div style={{ ...wrap, padding: '8px 12px' }}>
        <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
          <button type="button" onClick={toggleShut} aria-expanded={false}
            style={{ ...head, width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <b style={title}>★ Your players</b>
            {summary}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: ACC, fontFamily: NUM_FONT, fontWeight: 800 }}>▾</span>
          </button>
        </h2>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {collapsible ? (
        <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
          <button type="button" onClick={toggleShut} aria-expanded
            style={{ ...head, width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <b style={title}>★ Your players</b>
            {summary}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: ACC, fontFamily: NUM_FONT, fontWeight: 800 }}>▴</span>
          </button>
        </h2>
      ) : (
        <div style={head}>
          <b style={title}>★ Your players</b>
          {summary}
        </div>
      )}

      <div style={{ display: 'grid', gap: 1, marginTop: 7 }}>
        {shown.map((r) => (
          <div
            key={r.id}
            className="quiet-tile yp-row"
            role="button"
            tabIndex={0}
            onClick={() => r.p && onPlayerClick?.(r.p)}
            onKeyDown={(e) => { if (e.key === 'Enter' && r.p) onPlayerClick?.(r.p) }}
            title={r.p ? 'Open his card' : 'Not on tonight’s board — nothing to open'}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 9, padding: '6px 9px',
              borderRadius: 8, cursor: r.p ? 'pointer' : 'default',
              opacity: r.status === 'off' ? 0.5 : 1,
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: r.status === 'live' ? LIVE : r.status === 'pre' ? ACC : 'transparent',
              border: r.status === 'final' || r.status === 'off' ? `1px solid ${C.text3}` : 'none',
            }} className={r.status === 'live' ? 'live-pulse' : undefined} />

            <span style={{ fontSize: 12, fontWeight: 800, color: C.text, flexShrink: 0 }}>{r.name}</span>

            {r.role && (
              <span style={{
                fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: ACC,
                letterSpacing: '.06em', flexShrink: 0,
              }}>{r.role}</span>
            )}

            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
              {r.matchup}
            </span>

            {/* THE LINE. This is the whole reason the section was rebuilt, so
                it gets the weight: the numbers are the same size as the name
                and the context around them is grey. */}
            {/* yp-line: one line with the name on a monitor, its own line
                under it on a phone — see MobileCSS. */}
            <span className="yp-line" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
              {r.bars.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 800, color: LIVE, fontFamily: NUM_FONT }}>
                  {r.bars.join(' · ')}
                </span>
              )}
              {r.lineNode}
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                {r.clock}
              </span>
              {/* ── × MEANS GONE, ON EVERY ROW (2026-09-18) ──────────────
                  Donovan: "when i click the x the person stayed." Two
                  separate reasons, both fixed here:

                  1. It only ever dropped the FOLLOW. A man who was also
                     starred stayed on this list as a starred-only row —
                     which then rendered no × at all, so the list showed him
                     sitting there with nothing left to press. Pressing ×
                     now clears him from both stores.
                  2. It was only rendered for followed rows in the first
                     place, so a starred-only row was unremovable from here
                     by construction.

                  Still 22px of glyph, but in a 44px box — the tap target
                  every phone guideline asks for, on a row that is itself a
                  button (a near-miss used to open his card instead of
                  removing him, which reads exactly like "nothing
                  happened"). */}
              <button
                type="button"
                className="yp-x"
                aria-label={`Remove ${r.name} from your players`}
                title="Remove — un-star him"
                onClick={(e) => {
                  e.stopPropagation()
                  unfollow(r.id)
                  // The star is keyed on the composite row key, not the
                  // numeric id, so it can only be dropped through the slate
                  // row itself — see the `rows` memo's own note on the two
                  // identities. `onUnstar` is Dashboard's toggleWatch, which
                  // is a toggle: guarded on r.starred so it can never ADD a
                  // star to a man who is being removed.
                  if (r.starred && r.p && onUnstar) onUnstar(r.p)
                }}
                style={{
                  flexShrink: 0, width: 44, height: 44, marginTop: -11, marginBottom: -11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  background: 'transparent', border: 'none', borderRadius: 6,
                  color: C.text3, fontSize: 18, lineHeight: 1, cursor: 'pointer',
                }}
              >×</button>
            </span>
          </div>
        ))}
      </div>

      {collapsible && (restN > 0 || open) && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          style={{
            width: '100%', marginTop: 6, padding: '6px 9px',
            background: 'transparent', border: `1px solid ${C.border}`,
            borderRadius: 8, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
            color: C.text3, letterSpacing: '.04em',
          }}
        >
          {open
            ? 'Show less'
            /* Name what is behind the fold. With a hard cap the fold CAN hide
               live men and homers, so the button says how many of each rather
               than promising it hid nothing — the counts come from the whole
               list minus the three on show. */
            : `Show ${restN} more${hiddenLive || hiddenHr
                ? ` — ${[hiddenLive ? `${hiddenLive} live` : '', hiddenHr ? hiddenEventWord(hiddenHr) : ''].filter(Boolean).join(', ')}`
                : ''}`}
        </button>
      )}

      {/* ── CLEAR ALL (2026-09-18) ──────────────────────────────────────────
          Donovan: "where is the clear all button." There wasn't one — the
          only way to empty this list was one × at a time, and the × was
          broken. Clears both stores the same way a single × does: every
          follow is tombstoned (lib/dash/follow.js's `unfollowAll`, a
          tombstone per player rather than a bare delete, so another tab or
          device can't merge them all back), and every starred row on tonight's
          board is un-starred through the same toggle a × uses.

          Only rendered when there is something to clear, and it sits after
          the show-more control rather than up in the header: a destructive
          action should not be the first thing your thumb finds. */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={() => {
              if (!armed) { setArmed(true); return }
              setArmed(false)
              clearFollowing()
              if (onUnstar) rows.forEach((r) => { if (r.starred && r.p) onUnstar(r.p) })
            }}
            style={{
              // Carries its own count and reads as a control rather than a
              // footnote — "where is the clear all button" was the ask, and a
              // grey word in a corner is not an answer to it.
              background: armed ? `${C.red}22` : 'rgba(255,255,255,.04)',
              border: `1px solid ${armed ? C.red : C.border}`,
              borderRadius: 8, padding: '7px 11px', minHeight: 36,
              cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: NUM_FONT,
              letterSpacing: '.03em', color: armed ? C.red : C.text3, whiteSpace: 'nowrap',
            }}
          >{armed ? `Confirm — clear all ${rows.length}` : `Clear all ${rows.length}`}</button>
        </div>
      )}
    </div>
  )
}

