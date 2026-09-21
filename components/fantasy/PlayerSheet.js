'use client'
import { useEffect, useState } from 'react'

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

/** The tap target in a row, and the sheet it opens. A button, never a div. */
export function PlayerSheetButton({ player, weeks = [], scoring = 'ppr', className, children }) {
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
        <Sheet entry={{ player, weeks }} scoring={scoring} onClose={() => setOpen(false)} />
      ) : null}
    </>
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
