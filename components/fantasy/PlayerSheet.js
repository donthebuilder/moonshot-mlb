'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import PlayerFace from './PlayerFace'
import InjuryTag from './InjuryTag'

// 📋 THE PLAYER SHEET — what he actually did, one tap from the row.
//
// Donovan, 2026-09-21: the Franchise side is "quietly being slept on", and the
// specific gap is the people on the adds and drops — you decide whether to
// sign a man off a projection and a market score, with nothing about what he
// has actually produced.
//
// The data was already there. nfl_player_week_stats has carried a real weekly
// line per player since the scoring feed shipped, and the Matchup and Team
// pages both read it. The Wire never did. So this is the same shape as most of
// the week's findings: real data, no reader.
//
// A BOTTOM SHEET ON A PHONE, a dialog on a desktop, one component. The phone
// is the case that matters here — a wire list is something you scroll on a
// couch — so it slides from the bottom where the thumb already is, and the row
// you tapped stays visible behind it. The desktop branch is the same markup
// re-anchored by a media query rather than a second component.
//
// ── IT DID NOT OPEN, AND THE CLEVER PART IS WHY (2026-09-21) ───────────────
// The first version put one sheet at the page level and had each row call into
// it through React context. Donovan clicked a player on desktop and nothing
// happened.
//
// That context was the only createContext in this entire codebase, crossing a
// server/client boundary that nothing else here crosses -- a pattern I
// introduced for this one feature and that had never been exercised in this
// app. Whatever the precise failure, the lesson is the same: the risky part
// was the architecture, and it bought nothing.
//
// EACH TRIGGER NOW OWNS ITS OWN SHEET. A button with a useState(false) is a
// few bytes of state; only the one that is open renders any sheet markup at
// all, so the "eighty portals" cost I was avoiding never existed. No context,
// no provider, no boundary to get wrong. The page hands each row its player
// and his weeks and that is the whole contract.
//
// WHAT IT DOES NOT DO YET, on purpose: Donovan asked for the full profile
// "eventually" — season totals and the TUDDY touchdown score with its reason
// chips — and for this week to be right first. The weekly line is real and
// complete; the rest crosses into the NFL dashboard's data and is a bigger
// build. `weeks` is shaped so that view can hang off the same sheet.

// ── THE PAYLOAD MOVED TO THE SERVER (2026-09-20) ────────────────────────────
// STAT_ROWS, linesFor() and the points arithmetic used to live here, which
// meant every raw weekly `stats` blob had to cross to the browser for this
// component to format it -- 639 KB of React payload on the Wire, for eighty
// modals nobody had opened. They are in lib/fantasy/sheetEntry.js now and this
// component renders what it is handed. See that file for the measurements.
export function PlayerSheetButton({ sheet, className, children }) {
  const player = sheet?.player
  const [open, setOpen] = useState(false)

  // Escape closes it, and the list behind it stops scrolling while it is up --
  // a sheet you can scroll behind is how you lose the row you tapped.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!player) return children ?? null
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${player.name} — what he has actually done`}
      >{children}</button>
      {open ? (
        <Sheet entry={sheet} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

// ── THE SHEET IS A PORTAL, AND IT HAS TO BE (2026-09-20) ────────────────────
//
// Reported live on the Wire: tapping a player turned the screen black with no
// panel on it. The panel was rendering the whole time -- 520x198, correct
// colours, correct content -- at y=2766 in a 974px-tall window.
//
// .roomBody carries `animation: franchiseEnter .22s ease-out both`, whose
// final keyframe is `transform: none`. An animation with fill mode `both`
// RETAINS its end state, and a retained animated transform computes to
// matrix(1,0,0,1,0,0) rather than to `none`. An identity matrix is still a
// transform, and any transform makes the element a containing block for
// `position: fixed` descendants -- permanently, since the fill never lets go.
//
// So `inset: 0` on the scrim resolved against a 5,516px-tall .roomBody instead
// of the viewport: the scrim covered the whole document (which is why the
// visible page dimmed, and why this read as "it goes black"), and
// `align-items: flex-end` pinned the sheet to the bottom of the DOCUMENT,
// thousands of pixels below the fold. Every Franchise page shares .roomBody,
// so this was never a Wire bug.
//
// The fix is not to delete the entrance animation -- that is a real piece of
// the product and the next transform anywhere up the tree would break this
// again. An overlay simply does not belong inside the subtree it covers. It
// portals to <body>, where nothing can redefine what `fixed` means. Tokens
// still resolve (they are on :root) and player-sheet.css is global.
//
// Safe without a mounted guard because Sheet only ever renders behind
// `open`, which starts false and is set by a click -- so it never runs during
// SSR. The typeof check is belt and braces for a future caller.
function Sheet({ entry, onClose }) {
  const { player, weeks = [], lines = [] } = entry
  const latest = weeks[0] || null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fxSheetScrim" onClick={onClose} role="presentation">
      <section
        className="fxSheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} — weekly production`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fxSheetGrab" aria-hidden="true" />
        <header className="fxSheetHead">
          <PlayerFace player={player} size={42} />
          <div>
            <b>{player.name}<InjuryTag status={player.injury_status} /></b>
            <small>{player.position} · {player.team || 'FA'}{entry.next?.opp ? ` · this week ${entry.next.opp}` : ''}{Number.isFinite(entry.next?.proj) ? ` · proj ${entry.next.proj.toFixed(1)}` : ''}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">esc</button>
        </header>

        {latest ? (
          <>
            <div className="fxSheetHero">
              <span><small>WEEK {latest.week}</small><b>{latest.points.toFixed(1)}</b><i>fantasy pts</i></span>
              {latest.projected != null && (
                <span><small>PROJECTED</small><b>{latest.projected.toFixed(1)}</b><i>before kickoff</i></span>
              )}
              <span><small>STATUS</small><b>{String(latest.status || '').toUpperCase() || '—'}</b><i>{latest.status === 'final' ? 'game over' : latest.status === 'live' ? 'in progress' : 'not started'}</i></span>
            </div>

            {lines.length ? (
              <dl className="fxSheetLines">
                {lines.map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            ) : (
              // #24: say which state this is. "No stats" reads as broken when
              // the real answer is that the game has not kicked off.
              <p className="fxSheetEmpty">
                {latest.status === 'final'
                  ? 'He played and did not record a scoring stat.'
                  : 'Nothing yet — his game has not kicked off.'}
              </p>
            )}
          </>
        ) : (
          <p className="fxSheetEmpty">No weekly line published for him yet this season.</p>
        )}

        {entry.totals && (
          <div className="fxSheetTotals">
            <small>LAST {entry.totals.games} GAME{entry.totals.games === 1 ? '' : 'S'}</small>
            <p>{entry.totals.line || 'No scoring stats recorded.'}</p>
          </div>
        )}

        {weeks.length > 0 && (
          <div className="fxSheetWeeks">
            <small>GAME LOG</small>
            <ul>
              {weeks.map((row) => (
                <li key={row.week}>
                  <span>Wk {row.week}{row.opp ? <em> {row.opp}</em> : null}</span>
                  <b>{row.status === 'scheduled' ? '—' : row.points.toFixed(1)}</b>
                  <i>{row.status === 'final' ? '' : row.status}</i>
                  {row.line ? <p className="fxSheetBox">{row.line}</p> : null}
                </li>
              ))}
            </ul>
            <p>Fantasy points under this league&apos;s scoring, from the same stored line the matchup grades against.</p>
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}
