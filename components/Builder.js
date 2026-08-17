'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, playerId, mlbId, clean, n } from '../lib/player'
import { GroupTicketBuilder } from './tabs/Pairs'
import PairBuilder from './PairBuilder'

// ═══════════════════════════════════════════════════════════════════════════
// 🧱 ONE BUILDER, ONE ENGINE
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan, first asking for the merge in capitals — "BUILD FROM GROUPS AND PAIR
// BUILDER SUPPOSED TO BE MERGED INTO ONE THING WTF" — and then, when the first
// pass gave him two MODES to switch between, asking the better question:
//
//   "why cant buuld from groups enging and the pair builder engine wokr on the
//    same build does that make isnes"
//
// It makes complete sense, and two modes was a half-answer. The engines were
// never in conflict: both read the same slate rows, build the same leg objects,
// collapse a two-designation hitter the same way and honour the same
// one-leg-per-game rule. The only difference was which END you started from —
// a name, or the markets. The site was making him choose an end.
//
// So there is ONE build now. Name a hitter or don't:
//
//   · No name           → the group engine as it always was.
//   · A name            → lib/pairEvidence.js pins him into a leg and the group
//                         engine fills the rest around him, under every one of
//                         its normal rules. Any ticket that fails to contain him
//                         is dropped, not shown.
//
// The anchor-partner explorer (PairBuilder) is still here, one click down, for
// the different question it answers — "who has HISTORY with this man" rather
// than "what ticket holds him". That is a genuinely separate question and
// deleting it would lose the same-game history it carries. It is no longer a
// mode you have to pick between; it is a second look at the man you already
// named.

export default function Builder({
  players = [],
  allPlayers = [],
  pairHistorySummary = null,
  odds = null,
  slateDate = '',
  onPlayerClick = null,
}) {
  const [q, setQ] = useState('')
  const [pinned, setPinned] = useState(null)   // the slate row, or null
  const [showPartners, setShowPartners] = useState(false)

  const pool = players.length ? players : allPlayers

  // Only DESIGNATED hitters can anchor a group ticket — the engine builds out of
  // the bot's designations, so offering an undesignated name would produce the
  // "no ticket can be built" message every time and read as a bug.
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return pool
      .filter((p) => clean(p?.game_pick_role, ''))
      .filter((p) => `${nameOf(p)} ${teamOf(p)}`.toLowerCase().includes(needle))
      .sort((a, b) => n(b?.hr_score, 0) - n(a?.hr_score, 0))
      .slice(0, 6)
  }, [pool, q])

  // ── mlbId, NOT playerId (2026-08-17) ──────────────────────────────────────
  // These are two different keys and mixing them is why the first pin silently
  // matched nothing. playerId() is a COMPOSITE — `${player_id}-${game_pk|team}`,
  // e.g. "669016-STL" — built for React keys, while lib/pairEvidence.js keys its
  // legs on legId() = mlbId() = the bare league number, 669016. So the pin was
  // compared against a string it could never equal, every ticket failed the
  // contains-him filter, and the panel confidently reported that a
  // HIT-designated hitter was "not designated in the groups you picked".
  // Two ID helpers, one comparison: always check which one the other side uses.
  const pinnedId = pinned ? mlbId(pinned) : null

  return (
    <div>
      {/* ── THE ONE CONTROL THAT MATTERS: a name, or nothing ─────────────── */}
      <div style={{
        border: `1px solid ${pinned ? C.orange : C.border}`, borderRadius: 10,
        background: pinned ? 'rgba(249,115,22,.06)' : C.bg2,
        padding: '8px 11px', marginBottom: 12,
      }}>
        {pinned ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>BUILDING AROUND</span>
            <b
              onClick={() => onPlayerClick?.(pinned)}
              style={{ fontSize: 13, cursor: onPlayerClick ? 'pointer' : 'default' }}
            >{nameOf(pinned)}</b>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(pinned)} · {clean(pinned?.game_pick_role, '')}
            </span>
            <button
              onClick={() => { setPinned(null); setQ('') }}
              style={{
                marginLeft: 'auto', padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
                border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
              }}
            >clear</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                BUILD AROUND SOMEONE
              </span>
              <span style={{ fontSize: 9.5, color: C.text3 }}>optional — leave it blank to build off the board</span>
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Who's your guy tonight?"
              style={{
                marginTop: 6, width: '100%', maxWidth: 320, padding: '6px 10px',
                borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg,
                color: C.text, fontSize: 12, outline: 'none',
              }}
            />
            {candidates.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                {candidates.map((p) => (
                  <button
                    key={playerId(p)}
                    onClick={() => setPinned(p)}
                    style={{
                      padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
                      fontWeight: 700, border: `1px solid ${C.border}`, background: 'transparent',
                      color: C.text2,
                    }}
                  >
                    {nameOf(p)}
                    <span style={{ color: C.text3, fontFamily: NUM_FONT }}>
                      {' '}{teamOf(p)} · {clean(p?.game_pick_role, '')}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {q.trim() && !candidates.length && (
              <div style={{ fontSize: 10, color: C.yellow, marginTop: 5, lineHeight: 1.55 }}>
                No designated hitter matches that. The group engine builds out of the
                bot&apos;s own designations, so only a designated bat can anchor a ticket.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── THE BUILD. One engine, with or without the anchor. ───────────── */}
      <GroupTicketBuilder
        players={pool}
        odds={odds}
        slateDate={slateDate}
        defaultSize={pinned ? 3 : 2}
        pinnedId={pinnedId}
        pinnedName={pinned ? nameOf(pinned) : ''}
        onPlayerClick={onPlayerClick}
      />

      {/* ── THE OTHER QUESTION, one click down ───────────────────────────── */}
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => setShowPartners((v) => !v)}
          style={{
            padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${showPartners ? C.orange : C.border}`,
            background: showPartners ? 'rgba(249,115,22,.14)' : 'transparent',
            color: showPartners ? C.orange : C.text3,
          }}
        >
          {showPartners ? '▾' : '▸'} Who has history with him
        </button>
        <span style={{ fontSize: 9.5, color: C.text3, marginLeft: 8 }}>
          same-game record on every partner — a different question from what ticket holds him
        </span>
        {showPartners && (
          <div style={{ marginTop: 12 }}>
            <PairBuilder
              summary={pairHistorySummary}
              players={pool}
              onPlayerClick={onPlayerClick}
              initialAnchors={pinned ? [playerId(pinned)] : []}
            />
          </div>
        )}
      </div>
    </div>
  )
}
