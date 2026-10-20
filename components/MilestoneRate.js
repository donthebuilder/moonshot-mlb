'use client'
import { playerHref } from '../lib/routes'

// 🏁 A MILESTONE'S HIT RATE (2026-10-20, Donovan: "milestone tap opens the player's hit rate to whatever it's showing,
// or like last 5"). Opens under a countdown row on the Ledger / Numerology MILESTONES block and on Storylines:
// what he needs (1+ points), his last five games of that stat as numbered tiles (lit = reached it), and how often he
// reached it over 5 / 10 / this season. The numbers are the engine's (lib/stories/milestones.js hitRate, from his own
// game log); nothing is computed here but the words. Tiles, not bars (no new bar charts).
const SING = {
  points: 'point', goals: 'goal', assists: 'assist', threes: 'three', rebounds: 'rebound', catches: 'catch',
  'scrimmage TDs': 'scrimmage TD', 'passing TDs': 'passing TD', hits: 'hit', homers: 'homer', runs: 'run', steals: 'steal',
  doubles: 'double', triples: 'triple', 'total bases': 'total base', 'extra-base hits': 'extra-base hit',
  'rushing yards': 'rushing yard', 'receiving yards': 'receiving yard', 'passing yards': 'passing yard',
}
const unitOf = (word, n) => { const w = String(word || '').replace(/^career /, '').replace(/ this season$/, ''); return n === 1 ? (SING[w] || w) : w }
const frac = (p) => (p ? `${p[0]}/${p[1]}` : null)

export default function MilestoneRate({ sport, story: s, theme: C, numFont, accent, onOpenPlayer = null }) {
  const r = s?.numbers?.rate
  const need = Number(s?.numbers?.need)
  const linkStyle = { color: C.text2, fontSize: 11, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }
  return (
    <div style={{ padding: '2px 0 4px 22px' }}>
      {r ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', fontFamily: numFont, color: C.text3 }}>
            NEEDS <span style={{ color: accent }}>{need.toLocaleString('en-US')}+</span> {unitOf(s.numbers.word, need).toUpperCase()} IN A GAME
          </div>
          <div role="list" aria-label="His last five games, newest first" style={{ display: 'flex', gap: 4, margin: '5px 0 3px' }}>
            {r.last.map((g, i) => (
              <span role="listitem" key={`${g.d}${i}`} title={`${g.d || ''}${g.opp ? ` vs ${g.opp}` : ''}: ${g.v}`}
                style={{ minWidth: 30, height: 26, padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3,
                  border: `1px solid ${g.hit ? accent : C.border}`, background: g.hit ? `color-mix(in srgb, ${accent} 18%, transparent)` : 'transparent',
                  color: g.hit ? C.text : C.text3, fontFamily: numFont, fontSize: 12, fontWeight: 800 }}>
                {Number(g.v).toLocaleString('en-US')}
              </span>
            ))}
            <span style={{ alignSelf: 'center', marginLeft: 2, fontSize: 10, color: C.text3, fontFamily: numFont }}>← newest</span>
          </div>
          <div style={{ fontSize: 11.5, color: C.text2 }}>
            <b style={{ color: C.text, fontFamily: numFont }}>{frac(r.l5)}</b> last 5
            {r.l10 ? <> · <b style={{ color: C.text, fontFamily: numFont }}>{frac(r.l10)}</b> last {r.l10[1]}</> : null}
            {r.szn ? <> · <b style={{ color: C.text, fontFamily: numFont }}>{frac(r.szn)}</b> this season</> : null}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: C.text3 }}>{s?.numbers?.key === 'gamesPlayed' || s?.numbers?.key === 'gp' ? 'A games-played mark: it lands the moment he plays.' : 'No game log to rate this one yet.'}</div>
      )}
      {onOpenPlayer
        ? <button type="button" onClick={() => onOpenPlayer(s.player_id, s)} style={{ font: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer', ...linkStyle }}>Open {String(s.name || '').split(' ').pop()}’s card ›</button>
        : <a href={playerHref(sport, s.player_id)} style={linkStyle}>Open {String(s.name || '').split(' ').pop()}’s page ›</a>}
    </div>
  )
}
