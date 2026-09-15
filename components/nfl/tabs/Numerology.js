'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { AXIS_META, alignedWith, slateAlignments } from '../../../lib/nfl/alignments'

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

const ROOT_COLORS = ['', '#f97316', '#f59e0b', '#22d3ee', '#4ade80', '#a78bfa', '#f87171', '#60a5fa', '#FCD34D', '#c084fc']

export default function Numerology({ data }) {
  const [openRoot, setOpenRoot] = useState(null)
  const players = data?.players || []

  const model = useMemo(() => slateAlignments(players), [players])
  const { rows, clubs, totalMemberships, braids, names } = model

  const ranked = useMemo(() => [...clubs].sort((a, b) => b.count - a.count), [clubs])
  const expected = totalMemberships / 9

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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: TYPE.title, fontWeight: 900 }}>🔮 Numerology</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} players this week · five axes, one reduction
        </span>
      </div>
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
