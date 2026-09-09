'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, playerId, mlbId, clean, n } from '../lib/player'
import { GroupTicketBuilder } from './tabs/Pairs'
import PairBuilder, { PAIR_MARKETS } from './PairBuilder'

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
//   4. (2026-08-23) "the pair builder and build by group — i dont like that
//      its like two separate machines on one page, they kinda do the same
//      thing. i like both elements, i want them combined."
//
// Step 4 is about the FRAME, not the engine — the engine merged at step 2 and
// both halves have shared one anchor set ever since. What still read as two
// machines was the presentation: a group builder with its own controls, then a
// full-width divider, then a collapsed pill labelled "▸ 🤝 Pair Builder" with
// a second machine behind it. Two headers with a rule between them IS two
// machines, whatever the state underneath is doing.
//
// So: one bordered machine. The anchors sit at the top of it, a segmented
// control picks which answer you want, and BOTH is the default because he
// likes both. Nothing is hidden that was not hidden before, nothing new is
// hidden, and the two panels are now visibly two views of one build rather
// than two builds that happen to be adjacent.
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
  // ── PAIR BUILDER, PROMOTED (2026-08-18) ───────────────────────────────────
  // Donovan: "the pair builder thing i'm looking for it to be like the pair
  // builder the first picture at the top or the base of the builder." It used
  // to default CLOSED behind a "▸ Who has history with them" toggle unless an
  // undesignated pin forced it open — so on a normal visit (a bot-designated
  // anchor, the common case) it was invisible until you went looking for it.
  // Defaulting it open puts it at the base of the page on every visit, which
  // is the "at the base of the builder" half of the ask; the collapse button
  // stays for anyone who wants the room back.
  // ── ONE MACHINE, THREE VIEWS (2026-08-23) ────────────────────────────────
  // 'both' by default — "i like both elements". The other two exist because a
  // phone cannot hold both at once and because someone who came here for one
  // question should be able to say so. Remembered, since which question you
  // ask this page is a standing habit rather than a per-visit whim.
  const [view, setView] = useState('both')
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('moonshot_builder_view_v1')
      if (v === 'both' || v === 'tickets' || v === 'partners') setView(v)
    } catch { /* private mode */ }
  }, [])
  const pickView = (v) => {
    setView(v)
    try { window.localStorage.setItem('moonshot_builder_view_v1', v) } catch { /* private mode */ }
  }
  // ── ONE MARKET FOR THE WHOLE MACHINE (2026-08-23) ────────────────────────
  // The market used to live inside the partner panel, which was fine when the
  // partner panel also owned the chips. Now the chips are up here, and a chip
  // list ranked by home-run score under a panel that says "the score on the
  // hitter chips" would be a lie the moment you switched to 1+ hit. So the
  // market is lifted: the panel still draws the control, the parent holds the
  // value, and the chips re-rank with it.
  //
  // Held here rather than inside PairBuilder for a second reason: the partner
  // panel is REMOUNTED by key on every pin change, so a market chosen inside
  // it was silently thrown away every time you added a name.
  const [market, setMarket] = useState('hr')
  const mkt = PAIR_MARKETS.find((x) => x.key === market) || PAIR_MARKETS[0]

  // ── THE NAMES YOU CAN JUST TAP (2026-08-23) ──────────────────────────────
  // Donovan, on the merged builder: "i like how the builder had those names
  // you can select from, then the build around look. i like the write up and
  // stats showing thing the build from groups has."
  //
  // He is naming the best element of each half, and the merge had dropped one
  // of them: the anchor picker up here was a bare text box, while the tappable
  // name chips lived inside PairBuilder — i.e. inside ONE of the two views. So
  // picking your guy worked differently depending on which answer you happened
  // to be reading, which is the opposite of one machine.
  //
  // The chips come up to the shared anchor block, where they serve both views.
  // Same behaviour as PairBuilder's: sorted by tonight's score, the score on
  // each chip, capped in HEIGHT rather than in count (it wrapped to four lines
  // and pushed the answer below the fold), scrolls inside itself, taller on
  // request. The search box stays for anyone who would rather type.
  const [tallChips, setTallChips] = useState(false)

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
      .sort((a, b) => mkt.score(b) - mkt.score(a))
      .slice(0, 8)
  }, [pool, q, poolMode, pinnedKeys, mkt])

  // Every hitter the current pool offers, ranked by tonight's HR score — the
  // chip list. One entry per MAN, not per slate row: a doubleheader publishes
  // him twice and two identical chips is a bug wearing a feature's clothes.
  const chipList = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const p2 of pool) {
      if (poolMode !== 'anyone' && !clean(p2?.game_pick_role, '')) continue
      const k = String(mlbId(p2) || nameOf(p2))
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(p2)
    }
    return out.sort((a, b) => mkt.score(b) - mkt.score(a))
  }, [pool, poolMode, mkt])

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

  // Which panels render. Both halves always MOUNT under 'both'; the other two
  // are a choice, not a demotion.
  const showTickets = view === 'both' || view === 'tickets'
  // An undesignated anchor cannot hold a group leg, so he is only answerable
  // by the partner explorer — forcing it open is the page keeping its own
  // promise from the split note above rather than leaving him nowhere.
  const showPartners = view === 'both' || view === 'partners' || freePins.length > 0

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 13px',
      background: `linear-gradient(168deg, rgba(249,115,22,.04), ${C.bg2} 60%)`,
    }}>
      {/* ── ONE HEADER FOR ONE MACHINE ─────────────────────────────────────
          The whole point of the 08-23 pass. Before this there were two: a
          group-builder heading, a full-width rule, and a second collapsed pill
          announcing the Pair Builder as though it were a different tool. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 9 }}>
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-.01em' }}>🧱 The builder</span>
        <span style={{ fontSize: 10, color: C.text3, flex: '1 1 200px', minWidth: 0 }}>
          one build — pin who you like, then read it as tickets, as partners, or both
        </span>
        <span className="chip-row" style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {[
            ['both', 'Both', 'The ticket table and the partner history together — the default, because they answer different questions about the same build.'],
            ['tickets', '🎟 Tickets', 'Crossed designations only: pick two or more of the bot’s five groups and get the tickets they make.'],
            ['partners', '🤝 Partners', 'Same-game history only: every hitter on the slate ranked by how they have done alongside your anchors. Works for ANY hitter, designated or not.'],
          ].map(([k, label, tip]) => (
            <button key={k} onClick={() => pickView(k)} title={tip} style={{
              padding: '3px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10,
              fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
              border: `1px solid ${view === k ? C.orange : C.border}`,
              background: view === k ? 'rgba(249,115,22,.14)' : 'transparent',
              color: view === k ? C.orange : C.text3,
            }}>{label}</button>
          ))}
        </span>
      </div>

      {/* ── THE ANCHORS: none, one, or several. SHARED BY BOTH VIEWS. ─────── */}
      <div style={{
        border: `1px solid ${pins.length ? C.orange : C.border}`, borderRadius: 10,
        background: pins.length ? 'rgba(249,115,22,.06)' : C.bg3,
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

        {/* ── THE BUILD-AROUND LOOK (2026-08-23) ─────────────────────────
            Donovan: "i like the build around look." That is PairBuilder's
            BUILDING AROUND panel — the anchor's name over his matchup line —
            and the merged builder had flattened it to a bare chip. One pin
            gets the full line back; several get the chip row, because five
            matchup lines is a list rather than a heading. */}
        {pins.length === 1 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div
                onClick={() => onPlayerClick?.(pins[0])}
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.01em',
                  cursor: onPlayerClick ? 'pointer' : 'default' }}
              >{nameOf(pins[0])}</div>
              <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
                {teamOf(pins[0])}
                {clean(pins[0]?.opponent_team, '') ? ` vs ${clean(pins[0].opponent_team, '')}` : ''}
                {clean(pins[0]?.pitcher_name, '') ? ` · ${clean(pins[0].pitcher_name, '')}` : ''}
                {mkt.score(pins[0]) ? ` · ${mkt.short} ${mkt.score(pins[0]).toFixed(1)}` : ''}
                {clean(pins[0]?.game_pick_role, '') ? ` · ${clean(pins[0].game_pick_role, '')}` : ' · not a bot pick'}
              </div>
            </div>
            <button onClick={() => dropPin(pins[0])} title={`Remove ${nameOf(pins[0])}`} style={{
              marginLeft: 'auto', flexShrink: 0, padding: '3px 10px', borderRadius: 999,
              cursor: 'pointer', fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
            }}>✕ clear</button>
          </div>
        )}

        {/* Two or more: the chip row, because two matchup lines is a list. The
            single-pin case is handled above and must NOT also draw a chip — the
            same name printed twice was the merged builder's first draft. */}
        {pins.length > 1 && (
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

        {/* ── THE CHIPS. Tap a name; no typing required. ─────────────────── */}
        {chipList.length > 0 && (
          <>
            <div className={`anchor-chips${tallChips ? ' tall' : ''}`} style={{
              display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start',
              marginTop: 8, paddingRight: 2,
              // Measured, not guessed: a chip is 20px tall over a 24px pitch on
              // desktop and 32 over 36 on a phone, so 68 is exactly three rows
              // there and exactly two here — either way a whole number of rows
              // rather than a fourth one sawn through the middle, which reads
              // as a clipping bug instead of as "there is more, scroll".
              maxHeight: tallChips ? 188 : 68, overflowY: 'auto',
              scrollbarWidth: 'none',
              // The whole-rows intent above only holds at scrollTop 0. The
              // moment this box is scrolled it lands wherever the wheel left
              // it, and with the scrollbar hidden a half-row at the top edge
              // reads as exactly the clipping bug the comment set out to
              // avoid — visible in Donovan's 08-30 screenshot, where the row
              // under the pinned hitter is sawn in half. Snapping on the block
              // axis makes every resting position a whole row again.
              scrollSnapType: 'y proximity',
            }}>
              {chipList.slice(0, 200).map((p2) => {
                const on = pinnedKeys.has(String(mlbId(p2)))
                const role = clean(p2?.game_pick_role, '')
                return (
                  <button
                    key={playerId(p2)}
                    onClick={() => (on ? dropPin(p2) : addPin(p2))}
                    title={`${nameOf(p2)} — ${teamOf(p2)}${role ? ` · ${role}` : ' · not a bot pick'} · ${mkt.short} ${mkt.score(p2).toFixed(0)}. ${on ? 'Click to remove.' : 'Click to build around him.'}`}
                    style={{
                      padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
                      scrollSnapAlign: 'start',
                      border: `1px solid ${on ? C.orange : C.border}`,
                      background: on ? 'rgba(249,115,22,.12)' : C.bg2,
                      color: on ? C.orange : C.text2,
                    }}
                  >
                    {on ? '✓ ' : ''}{nameOf(p2)}
                    <span style={{ color: C.text3, fontFamily: NUM_FONT, marginLeft: 5, fontSize: 9.5 }}>
                      {mkt.score(p2).toFixed(0)}
                    </span>
                    {!role && (
                      <span title="Not one of the bot's designations — he can anchor the partner view but cannot hold a leg in a group ticket"
                        style={{ color: C.text3, marginLeft: 4, fontSize: 9 }}>·</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 6 }}>
              {chipList.length > 18 && (
                <button onClick={() => setTallChips((v) => !v)} style={{
                  padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                  fontWeight: 700, fontFamily: NUM_FONT,
                  border: `1px solid ${C.border}`, background: 'transparent', color: C.text2,
                }}>{tallChips ? '▴ Collapse the list' : `▾ Taller list (${chipList.length} hitters, scrolls)`}</button>
              )}
              <span style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>
                Sorted by tonight&apos;s <b style={{ color: C.text2 }}>{mkt.label}</b> score
                {market === 'hr' ? '' : ' — the market picked in the partner panel below'}.
                {poolMode === 'anyone' && <> A <b style={{ color: C.text2 }}>·</b> means he is not one of the bot&apos;s designations — he can anchor the partner view but cannot hold a group leg.</>}
              </span>
            </div>
          </>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={pins.length ? 'Add another…' : 'Or search by name…'}
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
                  {' '}{teamOf(p)}{clean(p?.game_pick_role, '') ? ` · ${clean(p.game_pick_role, '')}` : ` · ${mkt.short} ${mkt.score(p).toFixed(0)}`}
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
      {showTickets && (
        <GroupTicketBuilder
          key={`pins-${pinnedIds.join('.') || 'none'}`}
          players={pool}
          odds={odds}
          slateDate={slateDate}
          defaultSize={Math.max(2, Math.min(4, designatedPins.length + 1))}
          pinnedIds={pinnedIds}
          pinnedName={pinnedName}
          onPlayerClick={onPlayerClick}
          bare
        />
      )}

      {/* ── THE OTHER ANSWER, same anchors ─────────────────────────────────
          A hairline, not a full rule and not a second heading — this is the
          second view of one build, and it used to announce itself as a
          separate product. When it is the ONLY view showing, even the hairline
          goes: there is nothing above it to be separated from. */}
      {showPartners && (
        <div style={showTickets
          ? { marginTop: 16, paddingTop: 13, borderTop: `1px dashed ${C.border2}` }
          : { marginTop: 4 }}>
          {showTickets && (
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.11em', color: C.text3,
              fontFamily: NUM_FONT, textTransform: 'uppercase', marginBottom: 8 }}>
              🤝 and who has history with {pins.length > 1 ? 'them' : pins.length ? 'him' : 'each of them'}
            </div>
          )}
          {/* Kept from the old collapsed pill's caption, because it is the one
              thing that distinguishes this half and it is easy to miss. */}
          {view === 'partners' && (
            <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8 }}>
              same-game record on every partner — works for ANY hitter, designated or not
            </div>
          )}
          {freePins.length > 0 && view === 'tickets' && (
            <div style={{ fontSize: 10, color: C.yellow, marginBottom: 8, lineHeight: 1.55 }}>
              Showing partners anyway: {freePins.map(nameOf).join(', ')} cannot hold a leg in a
              group ticket, so this is the only view that can answer for {freePins.length === 1 ? 'him' : 'them'}.
            </div>
          )}
          <PairBuilder
            key={pins.map((p) => playerId(p)).join('|') || 'none'}
            summary={pairHistorySummary}
            players={pool}
            onPlayerClick={onPlayerClick}
            // ── THE PIN NEVER REACHED THIS PANEL (2026-08-30) ────────────
            //
            // Donovan's screenshot: BUILD AROUND said Jarren Duran, and the
            // BUILDING AROUND panel three inches below said Tristan Peters.
            //
            // This line passed `playerId(p)`, which is the COMPOSITE key —
            // "680776-776543", player id glued to game_pk. PairBuilder seeds
            // its selection with refKey(), which reads `player_id ?? id` and
            // falls back to the name; on a bare string both are undefined, so
            // refKey returned '' for every entry, .filter(Boolean) emptied the
            // list, and the seeding effect early-returned on `if (!seedKey)`.
            // anchorKeys stayed [] and `active` fell through to its default —
            // anchors[0], the top hitter by tonight's score. Tristan Peters
            // led the HR board at 69.7, which is why HE was there.
            //
            // So the pin was not being ignored some of the time; it has never
            // arrived. Any pin looked like "the builder picked someone else".
            //
            // Passing the ROWS lets refKey do what it was written to do: id
            // when there is one, normalised name when there isn't. The `key`
            // above still remounts on a pin change, so the seed re-runs.
            //
            // The warning was already in this file — line ~175 says "mlbId,
            // NOT the composite playerId — see the 08-17 ID-mismatch note in
            // git" — and this call site used the composite anyway. Same bug,
            // same file, second time.
            initialAnchors={pins}
            marketKey={market}
            onMarketChange={setMarket}
            bare
          />
        </div>
      )}
    </div>
  )
}
