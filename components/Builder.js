'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, playerId, mlbId, clean, n } from '../lib/player'
import { GroupTicketBuilder } from './tabs/Pairs'
import PairBuilder from './PairBuilder'

// ═══════════════════════════════════════════════════════════════════════════
// 🧱 ONE BUILDER, ONE ENGINE — now with ONE OR MORE anchors, from ANYONE
// ═══════════════════════════════════════════════════════════════════════════
//
// The history, in his words:
//   1. "BUILD FROM GROUPS AND PAIR BUILDER SUPPOSED TO BE MERGED INTO ONE
//      THING WTF" → they merged, badly: two modes behind a toggle.
//   2. "why cant buuld from groups enging and the pair builder engine wokr on
//      the same build" → one engine, one pin.
//   3. (2026-08-17) "pair buiulder should be ables to build around one player
//      or more then also buulding around bot picks only or any one ony site."
//
// So now: pick as many hitters as you want, from the WHOLE slate. The pool
// toggle decides who the search offers — the bot's designated picks, or every
// hitter on the board. The engine (lib/pairEvidence.js) pins every DESIGNATED
// anchor into a leg; an undesignated anchor cannot hold a group leg, because
// group tickets are built out of the bot's own designations and inventing a
// designation for him would be a lie — so he is carried into the partner
// explorer below instead, and the panel says exactly that split out loud
// rather than silently dropping him.

export default function Builder({
  players = [],
  allPlayers = [],
  pairHistorySummary = null,
  odds = null,
  slateDate = '',
  onPlayerClick = null,
  // 🔮 HAND-OFF FROM ALIGNMENTS (2026-08-18). Donovan: "especially in combos,
  // i think that's where it should fully live and breathe" — and the payoff
  // of a pattern page is being able to act on it. Alignments' "Build a ticket
  // around these →" button hands slate rows here. seedPins is a fresh array
  // reference each time the button fires (even re-picking the same names), so
  // it can't be compared for equality — a signature of the ids is instead. The
  // names are ADDED to whatever's already pinned, not swapped in, since
  // arriving from Alignments mid-build shouldn't discard work already done.
  // onSeedConsumed lets the parent clear its copy so navigating back to
  // Alignments and hitting the button again with the SAME picks still fires.
  seedPins = null,
  onSeedConsumed = null,
}) {
  const [q, setQ] = useState('')
  const [pins, setPins] = useState([])          // slate rows, any number
  const [poolMode, setPoolMode] = useState('picks')   // 'picks' | 'anyone'
  const [showPartners, setShowPartners] = useState(false)

  const pool = players.length ? players : allPlayers

  const lastSeedSig = useRef('')
  useEffect(() => {
    if (!seedPins || !seedPins.length) return
    const sig = seedPins.map((p) => mlbId(p)).filter(Boolean).join('.')
    if (!sig || sig === lastSeedSig.current) return
    lastSeedSig.current = sig
    setPins((v) => {
      const have = new Set(v.map((p) => String(mlbId(p))))
      const add = seedPins.filter((p) => mlbId(p) && !have.has(String(mlbId(p))))
      return add.length ? [...v, ...add] : v
    })
    setPoolMode('anyone')   // Alignments draws from the whole slate, not just picks
    onSeedConsumed?.()
  }, [seedPins, onSeedConsumed])

  const pinnedKeys = useMemo(() => new Set(pins.map((p) => String(mlbId(p)))), [pins])

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return pool
      .filter((p) => (poolMode === 'anyone' ? true : clean(p?.game_pick_role, '')))
      .filter((p) => !pinnedKeys.has(String(mlbId(p))))
      .filter((p) => `${nameOf(p)} ${teamOf(p)}`.toLowerCase().includes(needle))
      .sort((a, b) => n(b?.hr_score, 0) - n(a?.hr_score, 0))
      .slice(0, 8)
  }, [pool, q, poolMode, pinnedKeys])

  // The split the engine needs: designated anchors pin group legs; the rest
  // ride the partner explorer.
  const designatedPins = useMemo(() => pins.filter((p) => clean(p?.game_pick_role, '')), [pins])
  const freePins = useMemo(() => pins.filter((p) => !clean(p?.game_pick_role, '')), [pins])
  // mlbId, NOT the composite playerId — see the 08-17 ID-mismatch note in git.
  const pinnedIds = useMemo(() => designatedPins.map((p) => mlbId(p)).filter(Boolean), [designatedPins])
  const pinnedName = pins.length === 1 ? nameOf(pins[0])
    : pins.length > 1 ? `${nameOf(pins[0])} +${pins.length - 1}` : ''

  const addPin = (p) => { setPins((v) => [...v, p]); setQ('') }
  const dropPin = (p) => setPins((v) => v.filter((x) => String(mlbId(x)) !== String(mlbId(p))))

  return (
    <div>
      {/* ── THE ANCHORS: none, one, or several ───────────────────────────── */}
      <div style={{
        border: `1px solid ${pins.length ? C.orange : C.border}`, borderRadius: 10,
        background: pins.length ? 'rgba(249,115,22,.06)' : C.bg2,
        padding: '8px 11px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            BUILD AROUND {pins.length ? `${pins.length} HITTER${pins.length === 1 ? '' : 'S'}` : 'SOMEONE'}
          </span>
          {!pins.length && (
            <span style={{ fontSize: 9.5, color: C.text3 }}>optional — leave it blank to build off the board</span>
          )}
          {/* Who the search offers. Two honest pools, stated. */}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[['picks', 'Bot picks'], ['anyone', 'Anyone on the slate']].map(([k, label]) => (
              <button key={k} onClick={() => setPoolMode(k)} style={{
                padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
                fontWeight: 800, fontFamily: NUM_FONT,
                border: `1px solid ${poolMode === k ? C.orange : C.border}`,
                background: poolMode === k ? 'rgba(249,115,22,.14)' : 'transparent',
                color: poolMode === k ? C.orange : C.text3,
              }}>{label}</button>
            ))}
          </span>
        </div>

        {pins.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
            {pins.map((p) => (
              <span key={playerId(p)} style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 6,
                border: `1px solid ${clean(p?.game_pick_role, '') ? C.orange : C.border2}`,
                background: 'rgba(249,115,22,.10)', borderRadius: 999, padding: '3px 6px 3px 11px',
              }}>
                <b
                  onClick={() => onPlayerClick?.(p)}
                  style={{ fontSize: 11.5, cursor: onPlayerClick ? 'pointer' : 'default' }}
                >{nameOf(p)}</b>
                <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
                  {teamOf(p)}{clean(p?.game_pick_role, '') ? ` · ${clean(p.game_pick_role, '')}` : ' · not a bot pick'}
                </span>
                <button onClick={() => dropPin(p)} title={`Remove ${nameOf(p)}`} style={{
                  border: 'none', background: 'transparent', color: C.text3, cursor: 'pointer',
                  fontSize: 11, padding: '0 3px', lineHeight: 1,
                }}>✕</button>
              </span>
            ))}
            <button onClick={() => setPins([])} style={{
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
              fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
            }}>clear all</button>
          </div>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={pins.length ? 'Add another…' : "Who's your guy tonight?"}
          style={{
            marginTop: 7, width: '100%', maxWidth: 320, padding: '6px 10px',
            borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg,
            color: C.text, fontSize: 12, outline: 'none',
          }}
        />
        {candidates.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {candidates.map((p) => (
              <button key={playerId(p)} onClick={() => addPin(p)} style={{
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
                fontWeight: 700, border: `1px solid ${C.border}`, background: 'transparent',
                color: C.text2,
              }}>
                {nameOf(p)}
                <span style={{ color: C.text3, fontFamily: NUM_FONT }}>
                  {' '}{teamOf(p)}{clean(p?.game_pick_role, '') ? ` · ${clean(p.game_pick_role, '')}` : ` · HR ${n(p?.hr_score, 0).toFixed(0)}`}
                </span>
              </button>
            ))}
          </div>
        )}
        {q.trim() && !candidates.length && (
          <div style={{ fontSize: 10, color: C.yellow, marginTop: 5, lineHeight: 1.55 }}>
            {poolMode === 'picks'
              ? <>No designated hitter matches that. Switch the pool to <b>Anyone on the slate</b> to search all of tonight&apos;s bats.</>
              : 'Nobody on tonight’s slate matches that.'}
          </div>
        )}

        {/* The honest split, said before the tickets rather than discovered in them. */}
        {freePins.length > 0 && (
          <div style={{ fontSize: 10, color: C.text3, marginTop: 6, lineHeight: 1.6 }}>
            {freePins.map(nameOf).join(', ')} {freePins.length === 1 ? 'is' : 'are'} not among the
            bot&apos;s designations, so {freePins.length === 1 ? 'he' : 'they'} can&apos;t hold a leg in a
            group ticket — group tickets are built out of the bot&apos;s own picks. {freePins.length === 1 ? 'He is' : 'They are'} loaded
            into <b style={{ color: C.text2 }}>Who has history with them</b> below instead.
          </div>
        )}
      </div>

      {/* ── THE BUILD ─────────────────────────────────────────────────────── */}
      {/* KEYED ON THE ANCHOR SET (2026-08-17). defaultSize is only read at
          mount, so without the key two same-group anchors landed in a builder
          whose size was still 2 — one HIT slot for two HIT pins — and every
          ticket was dropped with a message blaming the wrong thing. The
          remount makes the leg count grow with the pins. */}
      <GroupTicketBuilder
        key={`pins-${pinnedIds.join('.') || 'none'}`}
        players={pool}
        odds={odds}
        slateDate={slateDate}
        defaultSize={Math.max(2, Math.min(4, designatedPins.length + 1))}
        pinnedIds={pinnedIds}
        pinnedName={pinnedName}
        onPlayerClick={onPlayerClick}
      />

      {/* ── THE OTHER QUESTION, seeded with every anchor ──────────────────── */}
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => setShowPartners((v) => !v)}
          style={{
            padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${(showPartners || freePins.length) ? C.orange : C.border}`,
            background: (showPartners || freePins.length) ? 'rgba(249,115,22,.14)' : 'transparent',
            color: (showPartners || freePins.length) ? C.orange : C.text3,
          }}
        >
          {(showPartners || freePins.length > 0) ? '▾' : '▸'} Who has history with {pins.length > 1 ? 'them' : 'him'}
        </button>
        <span style={{ fontSize: 9.5, color: C.text3, marginLeft: 8 }}>
          same-game record on every partner — works for ANY hitter, designated or not
        </span>
        {(showPartners || freePins.length > 0) && (
          <div style={{ marginTop: 12 }}>
            <PairBuilder
              key={pins.map((p) => playerId(p)).join('|') || 'none'}
              summary={pairHistorySummary}
              players={pool}
              onPlayerClick={onPlayerClick}
              initialAnchors={pins.map((p) => playerId(p))}
            />
          </div>
        )}
      </div>
    </div>
  )
}
