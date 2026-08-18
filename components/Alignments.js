'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, mlbId } from '../lib/player'
import { usePeople, slateAlignments, AXIS_META } from '../lib/alignments'

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 ALIGNMENTS — where the numerology fully lives and breathes
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan: "especially in combos, i think that's where it should fully live
// and breathe." So this is a VIEW in Combos, not a strip on someone else's
// panel: the whole slate through every axis at once — gematria-style digit
// roots over next homer, jersey, birth day, life path, batting order and
// fielding position, plus the name families — with the ledger's own honesty
// copy carried over word for word where it applies.
//
// AND IT FEEDS THE BUILDER. Every hitter here can be checked, and the button
// hands the checked names to the Builder view as anchors — the alignment is
// the reason you noticed him; the ticket is still built by the group engine
// under all its normal rules. The two claims never blur: alignment is watched,
// the ticket is measured.

const ROOT_COLORS = ['', '#f97316', '#f59e0b', '#22d3ee', '#4ade80', '#a78bfa', '#f87171', '#60a5fa', '#FCD34D', '#c084fc']

export default function Alignments({ players = [], onPlayerClick, onBuildAround }) {
  const { people, loaded } = usePeople(players)
  const [picked, setPicked] = useState(() => new Set())
  const [openRoot, setOpenRoot] = useState(null)

  const model = useMemo(() => slateAlignments(players, people), [players, people, loaded])
  const { rows, clubs, totalMemberships, braids, names } = model

  const toggle = (pid) => setPicked((v) => {
    const next = new Set(v)
    if (next.has(pid)) next.delete(pid); else next.add(pid)
    return next
  })
  const pickedRows = rows.filter((a) => picked.has(a.pid))

  // Concentration against the arithmetic share: each root's expected share of
  // memberships is ~1/9. Quoted as ×, with the count and denominator.
  const ranked = [...clubs].sort((a, b) => b.count - a.count)
  const expected = totalMemberships / 9

  if (!rows.length) return <div style={{ fontSize: 11.5, color: C.text3 }}>No slate loaded yet.</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>🔮 Tonight&apos;s alignments</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} hitters · six axes, one reduction · {loaded ? 'birthdays + positions loaded' : 'loading birthdays + positions…'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.65, maxWidth: 860, marginBottom: 10 }}>
        Every number a hitter carries — his <b style={{ color: C.text2 }}>next homer</b>, his{' '}
        <b style={{ color: C.text2 }}>jersey</b>, his <b style={{ color: C.text2 }}>birth day</b>, his{' '}
        <b style={{ color: C.text2 }}>life path</b>, where he <b style={{ color: C.text2 }}>bats</b> and where he{' '}
        <b style={{ color: C.text2 }}>fields</b> — reduced the same way: add the digits until one is left (17 → 8).
        {' '}Pattern watching, not evidence: ~{rows.length} hitters over nine roots put ~{Math.round(expected)} memberships
        in every club by arithmetic alone, so read the <b style={{ color: C.text2 }}>×</b> against that share, not the raw count.
        Fun to track, never a reason to bet — nothing here feeds any score. Check names as you go and hand them to the builder.
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
              color: C.text2, fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800,
            }}
              title={`Root ${c.root}: ${c.count} memberships across all six axes, against ~${Math.round(expected)} expected by arithmetic. ${x >= 1.25 ? 'Running above its share tonight.' : x <= 0.8 ? 'Running below its share.' : 'About its arithmetic share.'}`}>
              <span style={{ color: ROOT_COLORS[c.root], fontSize: 13 }}>{c.root}</span>
              {' '}{c.count}
              <span style={{ color: x >= 1.25 ? ROOT_COLORS[c.root] : C.text3, fontSize: 9 }}> {x.toFixed(2)}×</span>
            </button>
          )
        })}
      </div>
      {openRoot && (() => {
        const c = clubs.find((k) => k.root === openRoot)
        const members = [...c.members].sort((a, b) => (b.axisKeys.length - a.axisKeys.length) || (b.a.hrScore - a.a.hrScore))
        return (
          <div style={{ border: `1px solid ${ROOT_COLORS[openRoot]}44`, background: `${ROOT_COLORS[openRoot]}0a`, borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: ROOT_COLORS[openRoot], marginBottom: 5 }}>
              THE {openRoot} CLUB · {members.length} hitters
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {members.slice(0, 40).map(({ a, axisKeys }) => (
                <button key={a.pid} onClick={() => toggle(a.pid)}
                  title={`${axisKeys.map((k) => AXIS_META[k].why(a)).join(' · ')} · bot HR score ${a.hrScore.toFixed(0)} · click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}
                  style={{
                    padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                    border: `1px solid ${picked.has(a.pid) ? C.orange : C.border}`,
                    background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                  }}>
                  {a.name}
                  <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>
                    {' '}{axisKeys.map((k) => AXIS_META[k].label).join('+')}
                  </span>
                </button>
              ))}
              {members.length > 40 && <span style={{ fontSize: 9.5, color: C.text3 }}>+{members.length - 40} more</span>}
            </div>
          </div>
        )
      })()}

      {/* ── FULL BRAIDS — his own numbers agree with each other ──────────── */}
      {braids.length > 0 && (
        <div style={{ border: `1px solid rgba(192,132,252,.3)`, background: 'rgba(192,132,252,.06)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#c084fc', marginBottom: 2 }}>
            🧬 FULL BRAIDS · {braids.length} hitters whose own numbers agree
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            Two or more of a man&apos;s OWN axes on one root — jersey, birthday, next homer, spot, position braided
            together. The rarest read here, and still arithmetic: click for every strand.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {braids.slice(0, 24).map(({ a, root, keys, strength }) => (
              <button key={a.pid} onClick={() => toggle(a.pid)}
                title={`Root ${root}: ${keys.map((k) => AXIS_META[k].why(a)).join(' · ')} · HR score ${a.hrScore.toFixed(0)} · click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                  border: `1px solid ${picked.has(a.pid) ? C.orange : strength >= 3 ? '#c084fc' : C.border}`,
                  background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                }}>
                {a.name}
                <span style={{ color: ROOT_COLORS[root], fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900 }}> {root}</span>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>×{strength}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── NAME CONNECTIONS ─────────────────────────────────────────────── */}
      {names.length > 0 && (
        <div style={{ border: `1px solid rgba(34,211,238,.28)`, background: 'rgba(34,211,238,.05)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.cyan, marginBottom: 2 }}>
            🔤 NAME CONNECTIONS · {names.length} families on the slate
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            Shared surnames (2+) and first names (3+ — pairs of a common first name are arithmetic, not a pattern).
            The ledger&apos;s echo panel grades these against the night once homers land; this is the pregame roster of them.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {names.slice(0, 8).map((f) => (
              <div key={`${f.kind}-${f.key}`} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6 }}>
                <b style={{ color: C.cyan, fontFamily: NUM_FONT }}>{f.key.toUpperCase()}</b>
                <span style={{ color: C.text3 }}> ({f.kind === 'first' ? 'first name' : 'surname'}, {f.list.length}) — </span>
                {f.list.map((a, i) => (
                  <span key={a.pid}>
                    {i > 0 && ' · '}
                    <span onClick={() => toggle(a.pid)}
                      style={{ cursor: 'pointer', fontWeight: 700, color: picked.has(a.pid) ? C.orange : C.text }}
                      title={`click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}>
                      {a.name}
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HAND-OFF TO THE BUILDER ──────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        border: `1px solid ${pickedRows.length ? C.orange : C.border}`, borderRadius: 10,
        background: C.bg2, padding: '7px 11px',
      }}>
        <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: pickedRows.length ? C.orange : C.text3, fontWeight: 800 }}>
          {pickedRows.length ? `${pickedRows.length} PICKED` : 'CLICK NAMES TO COLLECT THEM'}
        </span>
        {pickedRows.map((a) => (
          <span key={a.pid} style={{ fontSize: 10, color: C.text2 }}>{a.name}</span>
        ))}
        <button
          disabled={!pickedRows.length}
          onClick={() => onBuildAround?.(pickedRows.map((a) => a.p))}
          style={{
            marginLeft: 'auto', padding: '5px 13px', borderRadius: 999,
            cursor: pickedRows.length ? 'pointer' : 'default', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${pickedRows.length ? C.orange : C.border}`,
            background: pickedRows.length ? 'rgba(249,115,22,.14)' : 'transparent',
            color: pickedRows.length ? C.orange : C.text3,
          }}>
          🧱 Build a ticket around {pickedRows.length ? `these ${pickedRows.length}` : 'them'} →
        </button>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.55 }}>
        The alignment is why you noticed him; the ticket is still built by the group engine under its normal
        measured rules. The two claims never mix — a braid is watched, a ticket is graded.
      </div>
    </div>
  )
}
