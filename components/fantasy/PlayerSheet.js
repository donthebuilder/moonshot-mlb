'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import PlayerFace from './PlayerFace'
import InjuryTag from './InjuryTag'
import { fantasyPointsFromStats } from '../../lib/fantasy/scoring'

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
// ONE SHEET, NOT EIGHTY. The trigger in each row is a button that calls into
// this context; the sheet itself is mounted once at the page level. Eighty
// rows each holding their own open/closed state and their own portal is how a
// list gets slow on the device it most needs to be fast on.
//
// WHAT IT DOES NOT DO YET, on purpose: Donovan asked for the full profile
// "eventually" — season totals and the TUDDY touchdown score with its reason
// chips — and for this week to be right first. The weekly line is real and
// complete; the rest crosses into the NFL dashboard's data and is a bigger
// build. `weeks` is shaped so that view can hang off the same sheet.

const SheetContext = createContext(null)

const STAT_ROWS = [
  ['passing_yards', 'Passing yds'],
  ['passing_touchdowns', 'Passing TD'],
  ['interceptions', 'Interceptions'],
  ['rushing_yards', 'Rushing yds'],
  ['rushing_touchdowns', 'Rushing TD'],
  ['receptions', 'Catches'],
  ['receiving_yards', 'Receiving yds'],
  ['receiving_touchdowns', 'Receiving TD'],
  ['fumbles_lost', 'Fumbles lost'],
  ['return_touchdowns', 'Return TD'],
  ['field_goals_0_39', 'FG 0-39'],
  ['field_goals_40_49', 'FG 40-49'],
  ['field_goals_50_plus', 'FG 50+'],
  ['extra_points', 'Extra points'],
  ['def_sacks', 'Sacks'],
  ['def_interceptions', 'Interceptions'],
  ['def_fumble_recoveries', 'Fumbles recovered'],
  ['def_touchdowns', 'Defensive TD'],
  ['def_safeties', 'Safeties'],
  ['points_allowed', 'Points allowed'],
]

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Only the lines he actually has. A stat sheet of twenty zeroes is furniture. */
function linesFor(stats = {}) {
  return STAT_ROWS
    .filter(([key]) => stats[key] !== undefined && stats[key] !== null && num(stats[key]) !== 0)
    .map(([key, label]) => [label, num(stats[key])])
}

export function PlayerSheetProvider({ children, scoring = 'ppr', data = {} }) {
  const [openId, setOpenId] = useState(null)
  const open = useCallback((id) => setOpenId(id), [])
  const close = useCallback(() => setOpenId(null), [])

  // Escape closes it, and the page behind it stops scrolling while it is up --
  // a sheet you can scroll the list behind is how you lose the row you tapped.
  useEffect(() => {
    if (!openId) return undefined
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [openId, close])

  const value = useMemo(() => ({ open, has: (id) => Boolean(data[id]) }), [open, data])
  const entry = openId ? data[openId] : null

  return (
    <SheetContext.Provider value={value}>
      {children}
      {entry ? <Sheet entry={entry} scoring={scoring} onClose={close} /> : null}
    </SheetContext.Provider>
  )
}

export function usePlayerSheet() {
  return useContext(SheetContext)
}

/** The tap target in a row. A button, never a link or a div. */
export function PlayerSheetButton({ playerId, className, children }) {
  const sheet = usePlayerSheet()
  if (!sheet) return children
  return (
    <button
      type="button"
      className={className}
      onClick={() => sheet.open(playerId)}
      aria-haspopup="dialog"
      title="What he has actually done"
    >{children}</button>
  )
}

function Sheet({ entry, scoring, onClose }) {
  const { player, weeks = [] } = entry
  const latest = weeks[0] || null
  const lines = latest ? linesFor(latest.stats) : []
  const points = (row) => fantasyPointsFromStats(row?.stats || {}, scoring)

  return (
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
            <small>{player.position} · {player.team || 'FA'}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">esc</button>
        </header>

        {latest ? (
          <>
            <div className="fxSheetHero">
              <span><small>WEEK {latest.week}</small><b>{points(latest).toFixed(1)}</b><i>fantasy pts</i></span>
              {latest.projected_points != null && (
                <span><small>PROJECTED</small><b>{Number(latest.projected_points).toFixed(1)}</b><i>before kickoff</i></span>
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

        {weeks.length > 1 && (
          <div className="fxSheetWeeks">
            <small>RECENT WEEKS</small>
            <ul>
              {weeks.map((row) => (
                <li key={row.week}>
                  <span>Wk {row.week}</span>
                  <b>{points(row).toFixed(1)}</b>
                  <i>{row.status === 'final' ? '' : row.status}</i>
                </li>
              ))}
            </ul>
            <p>Fantasy points under this league&apos;s scoring, from the same stored line the matchup grades against.</p>
          </div>
        )}
      </section>
    </div>
  )
}
