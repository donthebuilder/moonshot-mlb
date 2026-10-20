'use client'
import { useState } from 'react'
import TeamMark from '../TeamMark'
import Tap from '../Tap'

// HOW TO ATTACK THEM, EVERY SPORT (2026-10-20, Donovan: "i damn near need that how to attack for all sports"). TUDDY's
// attack sheet (Donovan 10-19, "G2") lifted out of components/nfl/GameSections.js so MOONSHOT, LAMP and BUCKETS draw the
// same block: pick whose turn it is to attack; each row is one thing the other side does (the word, the number, its rank)
// and the player on this side who beats it, with the real number that says so. Rows come from each sport's pure builder
// (lib/nfl/attackSheet.js, lib/mlb/attackSheet.js, lib/nhl/attackSheet.js, lib/nba/attackSheet.js):
//   { k, word, val, rank, of, tier, player, name, why }   tier 0 / 2 = a standout (top or bottom third or eight), 1 = middle
// The theme comes in (C, NUM_FONT, accent): TUDDY passes its own and stays as it was.

/**
 * @param teams    [away, home] club codes
 * @param rowsFor  (off, def) -> rows, most extreme first
 * @param head     (def) -> the left header words ("NYJ DEFENSE · RANK OF 32")
 * @param turn     (club) -> the pill word after the logo ("ball", "bats", "attack")
 * @param note     the one line under the rows
 * @param Kicker   the sport's own kicker component (else a plain one)
 */
export default function AttackSheet({ sport, teams, rowsFor, head, turn = () => 'ball', note = '', C, NUM_FONT, accent, onPick = null, kicker = 'HOW TO ATTACK THEM', ariaLabel = 'How to attack them', start = null, answerWord = 'WHO BEATS IT', Kicker = null }) {
  const [away, home] = teams
  const [ball, setBall] = useState(start || home)
  const def = ball === home ? away : home
  const rows = rowsFor(ball, def) || []
  if (!(rowsFor(home, away) || []).length && !(rowsFor(away, home) || []).length) return null
  const pill = (t) => ({ minHeight: 0, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', font: `800 12px/1 ${NUM_FONT}`, background: 'transparent',
    border: `1px solid ${t === ball ? accent : C.border2}`, color: t === ball ? accent : C.text2, display: 'inline-flex', alignItems: 'center', gap: 6 })
  return (
    <section aria-label={ariaLabel} style={{ marginBottom: 16 }}>
      {Kicker ? <Kicker>{kicker}</Kicker> : <div style={{ font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.12em', color: C.text3, margin: '0 0 8px' }}>{kicker}</div>}
      <div role="group" aria-label="Whose turn" style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {[away, home].map((t) => (
          <button key={t} type="button" className="tap-box" aria-pressed={t === ball} onClick={() => setBall(t)} style={pill(t)}>
            <TeamMark sport={sport} abbr={t} variant="logo" px={16} />{t} {turn(t)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3, padding: '4px 0' }}>
        <span>{head(def)}</span><span>{answerWord}</span>
      </div>
      {!rows.length && <div style={{ padding: '8px 0', fontSize: 12, color: C.text3, borderTop: `1px solid ${C.border}` }}>Not enough numbers for this side yet.</div>}
      {rows.map((r) => (
        <div key={r.k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) 14px minmax(0, 1.3fr)', gap: 8, alignItems: 'center', minHeight: 44, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <b style={{ font: `900 12px/1.15 ${NUM_FONT}`, letterSpacing: '.03em', color: r.tier === 1 ? C.text2 : C.text }}>{r.word}</b>
            <span style={{ font: `700 11px/1.2 ${NUM_FONT}`, color: C.text3 }}>{r.val}{r.rank != null ? ` · #${r.rank}` : ''}</span>
          </span>
          <span aria-hidden="true" style={{ font: `900 14px/1 ${NUM_FONT}`, color: accent, textAlign: 'center' }}>→</span>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <b style={{ fontSize: 13, lineHeight: 1.2, color: C.text }}>{r.player && onPick ? <Tap onClick={() => onPick(r.player, r)}>{r.name}</Tap> : r.name}</b>
            <span style={{ fontSize: 11, color: C.text2, lineHeight: 1.3 }}>{r.why}</span>
          </span>
        </div>
      ))}
      {note && <p style={{ margin: '6px 0 0', fontSize: 11, color: C.text3, lineHeight: 1.4 }}>{note}</p>}
    </section>
  )
}
