'use client'
// THE CALL ON A GAME PAGE, ANY SPORT (2026-10-05). MOONSHOT's block (components/MlbWriteupBlock.js,
// TUDDY's look) made sport-blind: the write-up JSON (lib/writeups/<sport>.js) plus the product's
// theme and three lines of its own words -- the status line, each player's meta and his numbers.
// Since 2026-10-20: quick chips for the called players + the game's storylines (see below).
import { useEffect, useState } from 'react'
import CallStatusBadge from './CallStatusBadge'
import Tap from './Tap'
import { useLockOf, CardLockLine } from './MemberGate'

/**
 * @param w        a write-up (buildWriteup)
 * @param theme    { C, NUM_FONT, TYPE, accent }
 * @param words    { status(w), meta(p), numbers(p) } -> strings
 * @param onOpen   (p) => void, opens the player
 * @param lockIn   optional (p) => { key, time, graded? }: the members gate (2026-10-16). A CALLED player a non-member may not read is left out, with the rest of the write-up
 *                 (its lines can name him); one generic line (no count) says the rest is for members. Absent, or any other viewer: unchanged.
 * @param chips    optional: draw the players as chips on a phone (2026-10-17). words.chips(p) -> [{ value, label, hot? }] is the player's head row; the reasons and watch-outs
 *                 are the same lines as chips (components/writeups/ChipLines.js). Off, or on a desktop: the list below, unchanged.
 * @param depth    optional { player(p) => node, game: node } the sport's deeper sections, drawn only while the full write-up is open
 * @param title    optional: the section's kicker word (default 'THE CALL'); ariaLabel its label (default 'The call')
 * @param closed   optional node: drawn INSTEAD of the player list while the write-up is closed (TUDDY's swipe cards, 2026-10-18); the open view is unchanged
 * @param playerHead optional (p) => node: replaces each player's name / status / meta row (TUDDY's face, club logo and score); absent: the row below
 */
export default function GameWriteupBlock({ w, theme, words, onOpen, depth = null, lockIn = null, chips = false, title = 'THE CALL', ariaLabel = 'The call', closed = null, playerHead = null }) {
  // QUICK CHIPS, NO FULL WRITE-UP (2026-10-20, Donovan: "the call thing with the full write-up, let's just get rid of that but
  // we can keep the players ... use little chips, quick chips"). Each called player is one chip (his name, the board word and
  // score) that opens him; under them, the game's own storylines (/api/stories, the same rows as the Storylines page and the
  // home tape). `depth`, `chips` and `playerHead` stay accepted so no caller changes; the reasons and the depth sections now live
  // on the player's page. TUDDY's swipe cards (`closed`) still draw in place of the chips.
  const { C, NUM_FONT, TYPE, accent: ACCENT } = theme
  const lockOf = useLockOf()
  const stories = useGameStories(w?.sport, w?.game_id)
  if (!w || !w.players.length) return null
  const shown = lockIn ? w.players.filter((p) => !lockOf({ status: p.status, ...lockIn(p) }).locked) : w.players
  const hiddenN = w.players.length - shown.length
  return (
    <section aria-label={ariaLabel} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: ACCENT }}>{title}</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{words.status(w)}</span>
      </div>
      {closed || (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {shown.map((p) => (
            <Tap key={p.player_id} onClick={onOpen ? () => onOpen(p) : null} title={words.numbers ? words.numbers(p) : undefined}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.border2 || C.border}`, background: C.bg2, color: C.text, fontSize: TYPE.body + 1, fontWeight: 800 }}>
              <span>{p.name}</span>
              <CallStatusBadge variant="text" status={p.status} score={p.score ?? null} theme={C} numFont={NUM_FONT} accent={ACCENT} />
            </Tap>
          ))}
        </div>
      )}
      {/* no per-game count: with the visible list it could point at the man (2026-10-17) */}
      {hiddenN > 0 && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 6 }} />}
      {stories.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 8, display: 'grid', gap: 4 }}>
          <span style={{ font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3 }}>STORYLINES</span>
          {stories.slice(0, STORY_MAX).map((st, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: TYPE.body, lineHeight: 1.45, color: C.text2, minWidth: 0 }}>
              <span style={{ flexShrink: 0 }}>{st.icon}</span>
              <span style={{ minWidth: 0 }}>{(st.parts || []).map((x, j) => (x.t === 'name' ? <b key={j} style={{ color: C.text }}>{x.v}</b>
                : x.t === 'num' ? <b key={j} style={{ fontFamily: NUM_FONT, color: ACCENT }}>{x.v}</b> : <span key={j}>{x.v}</span>))}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const STORY_MAX = 3
// the game's own stories, rarest first; the long model rows stay on the Storylines page
function useGameStories(sport, gameId) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!sport || !gameId) return undefined
    let alive = true
    fetch(`/api/stories?sport=${encodeURIComponent(sport)}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setRows((j.stories || []).filter((s) => String(s.game_id) === String(gameId) && s.type !== 'model')) })
      .catch(() => {})
    return () => { alive = false }
  }, [sport, gameId])
  return rows
}
