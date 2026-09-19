'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { AXIS_META, alignedWith, slateAlignments, dateDigitRoot, shiftDateKey } from '../../../lib/nfl/alignments'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import PageHeader from '../../PageHeader'
import { etToday } from '../../../lib/freshness'

// 🔮 NUMEROLOGY — B10(d), 2026-09-15. TUDDY's clone of MLB's Alignments view
// (components/Alignments.js + lib/alignments.js). Donovan approved shipping
// it as disclosed flavor, same line MLB already carries: MLB's own 08-28
// sweep tested 18 axes -- gematria, birthdate eight ways, jersey, lineup-spot
// root, season-HR root, letters -- against 4,238 real player-nights and
// found ZERO significant axes. This is not a claim that any of the numbers
// below predict a touchdown. Pattern watching, not evidence, same as MLB.
//
// FIVE AXES, NOT MLB'S SEVEN. Batting-order "spot" and fielding "position
// code" are both real 1-9 numbers baseball already publishes for every
// plate appearance; football has nothing structurally equivalent to either,
// so lib/nfl/alignments.js drops them rather than inventing a stand-in. See
// that file's header for the full account, and bots/nfl/nfl_numerology.py's
// for where jersey_number/birth_date/season_td actually come from.
//
// WHAT'S DEFERRED, NOT FORGOTTEN. MLB's Alignments also reads back a live
// "aligned with tonight's number" archive that HomerLedger writes off real
// graded results, and lets a picked name seed the Builder view. Neither
// exists for NFL yet -- no per-game live results writer at TUDDY's weekly
// cadence, no Builder-equivalent to hand names to -- so this ships the
// pregame slate engine only, the same core MLB's own page leads with.
//
// YOUR WATCHLIST, ALIGNING -- ONE THIRD OF MLB's CHECK, NOT ALL THREE
// (2026-09-16). MLB's own section checks a watched hitter's own axes
// against YESTERDAY's and TODAY's archived leading root (both read
// HomerLedger's live graded-results archive -- the same missing writer
// named above) AND against TOMORROW's date, reduced -- pure calendar
// arithmetic on a player's own unchanging numbers, needing no archive at
// all. Only the third one ports honestly here. Building fake yesterday/
// today checks off a results writer TUDDY doesn't have would be exactly
// the invented-data rule #16 exists to stop.

const ROOT_COLORS = ['', '#f97316', '#f59e0b', '#22d3ee', '#4ade80', '#a78bfa', '#f87171', '#60a5fa', '#FCD34D', '#c084fc']

export default function Numerology({ data }) {
  const watchlist = useNflWatchlist(data)
  const [openRoot, setOpenRoot] = useState(null)
  const players = data?.players || []

  const model = useMemo(() => slateAlignments(players), [players])
  const { rows, clubs, totalMemberships, braids, names } = model

  const ranked = useMemo(() => [...clubs].sort((a, b) => b.count - a.count), [clubs])
  // How many men on the slate have PLAYED and not scored -- the honest reason
  // root 1 leads in September. A player with no season_td at all is absent,
  // not a zero, and is not counted here (see lib/nfl/alignments.js's axesOf).
  const zeroTdCount = useMemo(
    () => rows.filter((a) => a.seasonTd === 0).length, [rows])
  const expected = totalMemberships / 9

  // Tomorrow's date, reduced -- see the header note above for why this is
  // the one archive-free third of MLB's watchlist cross-check. Recomputed
  // per render (cheap string arithmetic); the day doesn't change mid-session.
  // EASTERN, NOT UTC (fixed 2026-09-18). This read
  // `new Date().toISOString().slice(0, 10)`, which is the UTC date -- so from
  // 5pm Phoenix / 8pm Eastern onward the page had already rolled over and
  // "tomorrow" was the day after tomorrow. Every other day-boundary on this
  // site is the Eastern game day (lib/freshness.js's etToday, the same clock
  // StaleBanner and the box scores use), and a football page has no business
  // running on a different calendar than the games do.
  const tomorrowRoot = dateDigitRoot(shiftDateKey(etToday(), 1))
  const watchedRows = useMemo(() => rows
    .filter((a) => watchlist.isPinned(a.pid))
    .map((a) => {
      const ownRoots = new Set(Object.values(a.axes).filter((v) => v != null))
      return { a, hitsTomorrow: tomorrowRoot != null && ownRoots.has(tomorrowRoot) }
    }), [rows, watchlist, tomorrowRoot])

  if (!players.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border}`, borderRadius: 10, padding: '22px 16px',
        textAlign: 'center', color: C.text3, fontSize: TYPE.body,
      }}>
        Waiting for this week&apos;s slate.
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="🔮 Numerology"
        sub={`${rows.length} players this week · five axes, one reduction`}
        theme={C}
        numFont={NUM_FONT}
      />
      <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.65, maxWidth: 860, marginBottom: 12 }}>
        Every number a player carries -- the <b style={{ color: C.text }}>touchdowns he&apos;s sitting on</b>, his{' '}
        <b style={{ color: C.text }}>next touchdown</b>, his <b style={{ color: C.text }}>jersey</b>, his{' '}
        <b style={{ color: C.text }}>birth day</b>, his <b style={{ color: C.text }}>life path</b> -- reduced the
        same way: add the digits until one is left (17 → 8).{' '}
        Pattern watching, not evidence: ~{rows.length} players over nine roots put ~{Math.round(expected)} memberships
        in every club by arithmetic alone, so read the <b style={{ color: C.text2 }}>×</b> against that share, not the
        raw count. MLB&apos;s own sweep of this same method tested 18 axes against 4,238 real player-nights and found
        zero significant ones -- fun to track, never a reason to bet. Nothing here feeds any score, board, or call.
      </div>

      {/* WHY ROOT 1 IS THE BIG ONE, AND WHY THAT IS ARITHMETIC (2026-09-18).
          The page's whole job is "who is clustering", so the largest club has
          to explain itself or it reads as a pattern when it is a calendar. In
          September most of the slate has not scored yet, every one of those men
          is sitting on 0, and 0 + 1 reduces to 1 for all of them at once. It
          shrinks on its own as the season puts touchdowns on people. Shown only
          while it is actually true. */}
      {zeroTdCount > 0 && (
        <div style={{
          border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.text3}`,
          background: C.bg2, borderRadius: 8, padding: '7px 11px', marginBottom: 12,
          fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, maxWidth: 860,
        }}>
          <b style={{ color: C.text2 }}>Root 1 is crowded for a boring reason.</b>{' '}
          {zeroTdCount} of these players have not scored yet this season, so every one of them is
          sitting on 0 and his next touchdown is #1. That is the calendar, not a cluster -- it
          thins out as the season puts touchdowns on people.
        </div>
      )}

      {/* ── YOUR WATCHLIST, ALIGNING (tomorrow only -- see header note) ──── */}
      {watchlist.pins.length > 0 && (
        <div style={{
          border: `1px solid ${watchedRows.some((w) => w.hitsTomorrow) ? C.orange + '77' : C.border}`,
          background: watchedRows.some((w) => w.hitsTomorrow) ? 'rgba(249,115,22,.06)' : C.bg2,
          borderRadius: 10, padding: '8px 11px', marginBottom: 10,
        }}>
          <div style={{ fontSize: TYPE.label, fontWeight: 800, color: C.text2, marginBottom: 2 }}>
            ⭐ YOUR WATCHLIST, ALIGNING
          </div>
          {watchedRows.length === 0 ? (
            <div style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6 }}>
              None of your starred players are on this week&apos;s slate.
            </div>
          ) : (
            <>
              <div style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
                Checked against each man&apos;s own jersey / birthday / life-path roots --{' '}
                <b style={{ color: C.orange }}>+1</b> means tomorrow&apos;s date reduces to a root his own numbers
                touch. No yesterday/today check yet -- those read a live graded-results archive MLB has and TUDDY
                doesn&apos;t, at its weekly cadence.
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {watchedRows.map(({ a, hitsTomorrow }) => (
                  <span key={a.pid} style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: TYPE.body, fontWeight: 700,
                    border: `1px solid ${hitsTomorrow ? C.orange : C.border}`,
                    background: hitsTomorrow ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                  }}>
                    {a.name}
                    {hitsTomorrow && (
                      <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: TYPE.micro, marginLeft: 4 }}>+1</span>
                    )}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── THE CLUBS — nine roots, concentration stated ─────────────────── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {ranked.map((c) => {
          const x = expected > 0 ? c.count / expected : 0
          const on = openRoot === c.root
          return (
            <button key={c.root} onClick={() => setOpenRoot(on ? null : c.root)} style={{
              padding: '5px 12px', borderRadius: 9, cursor: 'pointer',
              border: `1px solid ${on ? ROOT_COLORS[c.root] : C.border}`,
              background: on ? `${ROOT_COLORS[c.root]}18` : C.bg2,
              color: C.text2, fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 800,
            }}
              title={`Root ${c.root}: ${c.count} memberships across all five axes, against ~${Math.round(expected)} expected by arithmetic. ${x >= 1.25 ? 'Running above its share this week.' : x <= 0.8 ? 'Running below its share.' : 'About its arithmetic share.'}`}>
              <span style={{ color: ROOT_COLORS[c.root], fontSize: TYPE.name }}>{c.root}</span>
              {' '}{c.count}
              <span style={{ color: x >= 1.25 ? ROOT_COLORS[c.root] : C.text3, fontSize: TYPE.micro }}> {x.toFixed(2)}×</span>
            </button>
          )
        })}
      </div>

      {openRoot && (() => {
        const c = clubs.find((k) => k.root === openRoot)
        const members = [...c.members].sort((a, b) => (b.axisKeys.length - a.axisKeys.length) || (b.a.tdScore - a.a.tdScore))
        return (
          <div style={{ border: `1px solid ${ROOT_COLORS[openRoot]}44`, background: `${ROOT_COLORS[openRoot]}0a`, borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
            <div style={{ fontSize: TYPE.label, fontWeight: 800, color: ROOT_COLORS[openRoot], marginBottom: 5 }}>
              THE {openRoot} CLUB · {members.length} players
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {members.slice(0, 40).map(({ a, axisKeys }) => (
                <span key={a.pid}
                  title={`${axisKeys.map((k) => AXIS_META[k].why(a)).join(' · ')} · ${a.team}`}
                  style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: TYPE.body, fontWeight: 700,
                    border: `1px solid ${C.border}`, color: C.text2,
                  }}>
                  {a.name}
                  <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro }}>
                    {' '}{axisKeys.map((k) => {
                      const raw = AXIS_META[k].raw ? AXIS_META[k].raw(a) : null
                      return raw ? `${AXIS_META[k].label} ${raw}→${openRoot}` : AXIS_META[k].label
                    }).join(' · ')}
                  </span>
                </span>
              ))}
              {members.length > 40 && <span style={{ fontSize: TYPE.micro, color: C.text3 }}>+{members.length - 40} more</span>}
            </div>
          </div>
        )
      })()}

      {/* ── FULL BRAIDS — his own numbers agree with each other ──────────── */}
      {braids.length > 0 && (
        <div style={{ border: '1px solid rgba(192,132,252,.3)', background: 'rgba(192,132,252,.06)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: TYPE.label, fontWeight: 800, color: '#c084fc', marginBottom: 2 }}>
            🧬 FULL BRAIDS · {braids.length} players whose own numbers agree
          </div>
          <div style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            Two or more of a man&apos;s OWN axes on one root -- jersey, birthday, next touchdown braided together.
            The rarest read here, and still arithmetic.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {braids.slice(0, 24).map(({ a, root, keys, strength }) => (
              <span key={a.pid}
                title={`Root ${root}: ${keys.map((k) => AXIS_META[k].why(a)).join(' · ')} · ${a.team}`}
                style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: TYPE.body, fontWeight: 700,
                  border: `1px solid ${strength >= 3 ? '#c084fc' : C.border}`, color: C.text2,
                }}>
                {a.name}
                <span style={{ color: ROOT_COLORS[root], fontFamily: NUM_FONT, fontSize: TYPE.micro, fontWeight: 900 }}> {root}</span>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro }}>×{strength}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── NAME CONNECTIONS ─────────────────────────────────────────────── */}
      {names.length > 0 && (
        <div style={{ border: '1px solid rgba(53,205,255,.28)', background: 'rgba(53,205,255,.05)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: TYPE.label, fontWeight: 800, color: C.cyan, marginBottom: 2 }}>
            🔤 NAME CONNECTIONS · {names.length} families this week
          </div>
          <div style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            Shared surnames (2+) and first names (3+ -- pairs of a common first name are arithmetic, not a pattern).
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {names.slice(0, 8).map((f) => (
              <div key={`${f.kind}-${f.key}`} style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.6 }}>
                <b style={{ color: C.cyan, fontFamily: NUM_FONT }}>{f.key.toUpperCase()}</b>
                <span style={{ color: C.text3 }}> ({f.kind === 'first' ? 'first name' : 'surname'}, {f.list.length}) — </span>
                {f.list.map((a, i) => (
                  <span key={a.pid}>{i > 0 && ' · '}<span style={{ fontWeight: 700 }}>{a.name}</span></span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 4, lineHeight: 1.6, maxWidth: 760 }}>
        No batting-order or fielding-position axis -- football has no honest equivalent to either, so they're left
        out rather than faked. Season TD only counts completed weeks, so a player&apos;s count here always describes
        games already played.
      </div>
    </div>
  )
}
