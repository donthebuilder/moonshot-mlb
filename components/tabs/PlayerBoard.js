'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, playerId, clean, n } from '../../lib/player'
import { scoreFor, tierRole } from '../../lib/scoring'
import { Empty, inputStyle } from '../ui'
import PlayerModal from '../PlayerModal'
import { rampColor, inkFor } from '../Heatmap'

// Player — the modal's contents as a real board.
//
// On the Streamlit side this exists because that framework had no modal at
// all. It's worth keeping here for the opposite reason: a modal is a bad place
// to sit and read for five minutes, and this is the tab you leave open while
// you work through one hitter.

// QUESTION CHIPS (2026-08-08, "more inquisitive"): the list used to answer
// exactly one question — who's top by HR score. Each chip is a question you'd
// otherwise dig for, using only fields already on the slate row.
const ASKS = [
  { key: 'bot',  label: '🤖 Bot picks', test: (p) => String(p?.game_pick_role || '').trim() !== '',
    why: 'Hitters the bot designated for one of tonight’s five pick slots' },
  { key: 'weak', label: '⭐ Weak spots', test: (p) => p?.weak_spot_flag === true,
    why: 'Batting in a lineup spot this starter has been beaten in' },
  { key: 'hot',  label: 'Hot L5', test: (p) => n(p?.last5_hits, 0) >= 6 || n(p?.last5_hr, 0) >= 2,
    why: '6+ hits or 2+ homers over his last five games' },
  { key: 'edge', label: '🎯 Pitch match', test: (p) => n(p?.pitch_type_match_score, 0) > 0,
    why: 'The model found a documented batter-vs-pitch exploit — the single largest graded separator' },
  { key: 'due',  label: '🔁 HR recently', test: (p) => n(p?.games_since_last_hr, 99) <= 2,
    why: 'Homered inside his last two games — the back-to-back chase' },
]

export default function PlayerBoard({ players, onAdd, onWatch, watchIds }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [ask, setAsk] = useState(null)

  const ranked = useMemo(
    () => [...players].sort((a, b) => scoreFor(b, 'hr') - scoreFor(a, 'hr')),
    [players],
  )

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    const asked = ask ? ranked.filter(ASKS.find((a) => a.key === ask)?.test || (() => true)) : ranked
    if (!q) return asked.slice(0, 40)
    return asked
      .filter((p) => `${nameOf(p)} ${teamOf(p)} ${oppOf(p)}`.toLowerCase().includes(q))
      .slice(0, 40)
  }, [ranked, query, ask])

  // WHO HAS ACTUALLY BEEN TAPPED — no fallback. The fallback used to live in
  // here (`|| matches[0]`) and it is what broke the phone layout completely;
  // see the note above showList below.
  const picked = useMemo(
    () => ranked.find((p) => playerId(p) === selectedId) || null,
    [ranked, selectedId],
  )

  // ⚠️ RULES OF HOOKS (moved up 2026-08-09, repo bug scan). The phone flag
  // used to be declared BELOW the `if (!ranked.length) return` on the next
  // line. React identifies hooks by call order, so on the render where the
  // slate goes from empty to loaded — which is every single page load, since
  // the payload arrives after the first paint — this component went from 3
  // hooks to 5 and React throws "Rendered more hooks than during the previous
  // render". A white screen on the Players tab, every time, on the exact
  // render where the data shows up.
  //
  // Nothing else can go between here and the early return.
  //
  // The flag is set in an effect rather than read during render, so the server
  // and the first client render agree — reading matchMedia during render is a
  // hydration mismatch.
  //
  // 700px, NOT 560 (fixed 2026-08-10). This flag decides whether the tab is
  // master-detail or two columns, and MobileCSS collapses .playerboard to one
  // column at 700. They disagreed, so every viewport between 561 and 700 —
  // phones in landscape, small tablets, a narrow desktop window — got the
  // stacked grid with BOTH panes rendered: the full 40-row list, then the
  // detail card 40 rows below it. Two rules describing the same layout have to
  // read the same number.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  // Tapping a hitter on a phone swaps the list out for his card IN PLACE. If
  // you were twenty rows down the list when you tapped, the card opens twenty
  // rows down the page — on his splits, or on nothing at all. Land at the top
  // of what you just opened.
  useEffect(() => {
    if (phone && selectedId) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phone, selectedId])

  if (!ranked.length) return <Empty text="No players on this slate yet." />

  // Ramp bounds come from what's on screen, not the whole slate -- otherwise a
  // filtered search of nine mid hitters renders as nine identical dark chips.
  const shownScores = matches.map((p) => scoreFor(p, 'hr'))
  const sLo = Math.min(...shownScores, 0)
  const sHi = Math.max(...shownScores, 1)

  // ── PORTRAIT IS A DIFFERENT PAGE (2026-08-09, Donovan: "the players tab is
  // not optimized for the phone in portrait mode") ─────────────────────────
  //
  // The old phone treatment stacked the two columns and capped the list at
  // 34vh. That is technically responsive and practically unusable: you scroll
  // a cramped list, tap a hitter, and his card renders BELOW the list — so
  // every single selection means scrolling past the list again to see what you
  // just picked, and then back up to change your mind.
  //
  // A phone wants master-DETAIL, not master-and-detail. Pick from the list,
  // and the list gets out of the way; one tap on ← brings it back with your
  // search and filters intact. Desktop is untouched.
  //
  // THE PHONE LIST WAS UNREACHABLE (fixed 2026-08-10). Donovan: "the player
  // tab on mobile is not optimized correctly." It wasn't a layout problem —
  // the master-detail above never worked at all, and the reason is one line.
  //
  // `selected` used to be `find(picked) || matches[0] || null`, so it was
  // truthy from the very first render. `showList = !phone || !selected` was
  // therefore FALSE on a phone before you touched anything: the tab opened
  // straight into the top hitter's card with no list, no search box and no
  // filter chips. Worse, "← All hitters" cleared selectedId and the fallback
  // immediately re-selected matches[0], so the button did nothing. On a phone
  // there was no way to reach any hitter but the highest-scored one.
  //
  // The fix is to keep "what has been tapped" and "what to show" as two
  // different questions. The desktop fallback — open on the top hitter so the
  // right pane is never empty — belongs to the two-column layout only.
  const selected = phone ? picked : (picked || matches[0] || null)

  // The flag is set in an effect rather than read during render, so the server
  // and the first client render agree — reading matchMedia during render is a
  // hydration mismatch.
  const showList = !phone || !selected
  const showDetail = !phone || !!selected

  // Mobile (2026-08-06): the side-by-side grid squeezed the detail pane into
  // a sliver on phones — MobileCSS stacks these and shortens the list so
  // picking a player doesn't mean scrolling past 200 rows.
  return (
    <div className="playerboard" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 14, alignItems: 'start' }}>
      {showList && (
      <div className="playerboard-side" style={{ position: 'sticky', top: 12 }}>
        <input
          style={{ ...inputStyle(), width: '100%', marginBottom: 6 }}
          placeholder="Search a hitter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          {ASKS.map((a) => {
            const on = ask === a.key
            return (
              <button key={a.key} onClick={() => setAsk(on ? null : a.key)} title={a.why}
                style={{
                  padding: '2px 8px', fontSize: 9, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${on ? C.orange : C.border}`,
                  background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                  color: on ? C.orange : C.text3, whiteSpace: 'nowrap',
                }}>{a.label}</button>
            )
          })}
          <button
            onClick={() => { const pool = matches.length ? matches : ranked; const pick = pool[Math.floor(Math.random() * pool.length)]; if (pick) setSelectedId(playerId(pick)) }}
            title="Open a random hitter from the current list — for the nights you want the site to start the conversation"
            style={{
              padding: '2px 8px', fontSize: 9, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
              border: `1px dashed ${C.border2}`, background: 'transparent', color: C.text3, whiteSpace: 'nowrap',
            }}>🎲</button>
        </div>
        <div className="playerboard-list" style={{
          border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
          maxHeight: '72vh', overflowY: 'auto', background: C.bg2,
        }}>
          {matches.map((p) => {
            const id = playerId(p)
            const on = selected && playerId(selected) === id
            const role = tierRole(p)
            return (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: 'none', cursor: 'pointer',
                  textAlign: 'left', color: on ? C.text : C.text2,
                  background: on ? C.bg3 : 'transparent',
                  borderLeft: `2px solid ${on ? C.green : 'transparent'}`,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nameOf(p)}
                    {String(p?.game_pick_role || '').trim() && <span title="Bot pick tonight" style={{ fontSize: 9, marginLeft: 4 }}>🤖</span>}
                    {p?.weak_spot_flag && <span title="Weak lineup spot vs this starter" style={{ fontSize: 9, marginLeft: 2 }}>⭐</span>}
                  </span>
                  <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {teamOf(p)} vs {oppOf(p)} · #{clean(p?.lineup_spot, '?')} · {clean(p?.pitcher_name, 'TBD')}
                  </span>
                </span>
                {(() => {
                  const bg = rampColor(scoreFor(p, 'hr'), sLo, sHi)
                  return (
                    <span
                      title={`${role} · HR ${scoreFor(p, 'hr').toFixed(1)}`}
                      style={{
                        fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800,
                        background: bg || C.bg3, color: bg ? inkFor(bg) : C.text3,
                        padding: '2px 6px', borderRadius: 5, minWidth: 30, textAlign: 'center',
                      }}
                    >{scoreFor(p, 'hr').toFixed(0)}</span>
                  )
                })()}
              </button>
            )
          })}
          {!matches.length && (
            <div style={{ padding: 14, fontSize: 12, color: C.text3 }}>No hitter matches that.</div>
          )}
        </div>
      </div>
      )}

      {showDetail && (
      <div>
        {phone && selected && (
          <button onClick={() => setSelectedId(null)} className="tap-row" style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
            border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.04)',
            color: C.text2, borderRadius: 9, padding: '7px 12px', fontSize: 11.5,
            fontWeight: 700, cursor: 'pointer', width: '100%',
          }}>← <span>All hitters</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              {matches.length} in the list
            </span>
          </button>
        )}
        {selected ? (
          // ONE HEADER, NOT TWO (2026-08-10, phone pass). This used to render a
          // PanelTitle — name, matchup, grade — directly above a card whose own
          // header says the name and the matchup again, with more in it (lineup
          // spot, handedness, the arm's throwing hand). On a desktop that was
          // redundant. On a phone it was two headers and a full-width Watch bar
          // before a single number, because .panel-title turns its right slot
          // into a stretched scrolling row and a lone button fills it.
          //
          // The card's header is the better of the two, so it is the one that
          // stays. Watch moves into the card's own action row beside Add to
          // slip, where the same button already lives when a modal opens from
          // any other board — so the tab now behaves like every other surface
          // rather than growing a second copy of the control.
          <PlayerModal
            player={selected}
            inline
            onAdd={onAdd}
            onWatch={onWatch}
            watched={!!watchIds?.has(playerId(selected))}
          />
        ) : (
          <Empty text={phone ? 'Pick a hitter above.' : 'Pick a hitter on the left.'} />
        )}
      </div>
      )}
    </div>
  )
}
