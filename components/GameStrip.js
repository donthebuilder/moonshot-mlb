'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nn, hrScore, prodScore, median as med } from '../lib/player'

// Game selector strip — the PropFinder pattern.
//
// The pill bar this replaces told you a matchup existed and nothing else, so
// picking a game meant opening several to find the live one. A card carries
// the numbers that decide it: first pitch, Game Score against the slate
// median, how much of the lineup is in a hot window, weak spots, park.
//
// First-pitch order, always. You read a slate chronologically -- re-ranking by
// strength makes you hunt for the 7:05 game you're about to bet.

const playerScore = (p) => med([
  hrScore(p), prodScore(p), nn(p?.hrw_score), nn(p?.damage_conversion_score),
])

function timeText(t) {
  if (!t) return 'TBD'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const isPast = (t) => !!t && new Date(t) < new Date(Date.now() - 3 * 60 * 60 * 1000)

export default function GameStrip({ games, activeGame, onSelect }) {
  const cards = useMemo(() => {
    const built = games.map((g) => {
      const gp = g.players || []
      const head = gp.reduce((a, b) => (hrScore(b) > hrScore(a) ? b : a), gp[0] || {})
      // The pitching matchup — the single most informative line a game card
      // can carry, and it was missing. Both starters live on the hitter rows.
      const arms = [...new Set(gp.map((x) => x?.pitcher_name).filter(Boolean))].slice(0, 2)
      // Extra cargo for the BIG cards — a hot card is physically wider now,
      // so it carries more: the bot's designated pick for this game, and the
      // best ALT look (the bot's own "secondary HR look" lane, alt_hr_score /
      // alt_reason — verified on the live slim payload). Small cards skip
      // these lines; earning pixels goes both ways.
      const pick = gp.find((x) => /^(TOP|HR)\b/.test(String(x?.game_pick_role || '').split('/')[0].trim().toUpperCase()))
      const alt = gp.reduce((a, b) => (nn(b?.alt_hr_score) > nn(a?.alt_hr_score) ? b : a), gp[0] || {})
      const altOk = alt?.name && nn(alt.alt_hr_score) > 0 && alt !== head
      return {
        arms: arms.map((a) => String(a).split(' ').slice(-1)[0]).join(' v '),
        topBat: head?.name ? `${String(head.name).split(' ').slice(-1)[0]} ${hrScore(head).toFixed(0)}` : '',
        topHrw: head?.name && nn(head?.hrw_score) > 0 ? nn(head.hrw_score).toFixed(0) : null,
        pickName: pick?.name ? String(pick.name).split(' ').slice(-1)[0] : null,
        pickRole: pick ? String(pick.game_pick_role).split('/')[0].trim().toUpperCase() : null,
        altName: altOk ? String(alt.name).split(' ').slice(-1)[0] : null,
        altScore: altOk ? nn(alt.alt_hr_score).toFixed(0) : null,
        altWhy: altOk ? String(alt.alt_reason || '') : '',
        pk: g.game_pk,
        matchup: `${g.away || '—'} @ ${g.home || '—'}`,
        time: timeText(g.game_time),
        past: isPast(g.game_time),
        confirmed: !!g.lineup_confirmed,
        gs: med(gp.map(playerScore)),
        hrw: med(gp.map((x) => nn(x?.hrw_score))),
        weak: gp.filter((x) => x?.weak_spot_flag).length,
        venue: head?.venue_name || '',
        batters: gp.length,
      }
    })
    const slateMed = med(built.map((c) => c.gs))
    // Heat rank: each card tinted by where its GS sits in tonight's range,
    // so the best game glows like a hot cell and cold games recede.
    const gsAll = built.map((c) => c.gs)
    const lo = Math.min(...gsAll), hi = Math.max(...gsAll)
    return built.map((c) => ({
      ...c,
      edge: c.gs >= slateMed ? '▲' : '▽',
      heat: hi > lo ? (c.gs - lo) / (hi - lo) : 0.5,
    }))
  }, [games])

  if (!cards.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      {/* EVEN ROWS (2026-08-06): auto-fill grid stranded orphans — 12 games
          on a 10-wide row left two cards floating in six empty cells. Flex
          with grow means every row stretches edge to edge no matter the
          count, and the leftover width isn't distributed evenly: each card's
          flex-grow AND flex-basis scale with its Game Score, so the hottest
          games are physically bigger. The size IS the heat, twice over. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {cards.map((c) => {
          const on = activeGame === c.pk
          return (
            <button
              key={c.pk}
              onClick={() => onSelect(c.pk)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '6px 9px 5px',
                borderRadius: 10, minWidth: 0,
                flex: `${(1 + c.heat).toFixed(2)} 1 ${Math.round(118 + c.heat * 46)}px`,
                border: `1px solid ${on ? C.orange : `rgba(249,115,22,${(0.12 + c.heat * 0.5).toFixed(2)})`}`,
                background: on
                  ? 'rgba(249,115,22,0.09)'
                  : `linear-gradient(155deg, rgba(249,115,22,${(c.heat * 0.13).toFixed(3)}), rgba(17,17,19,1))`,
                boxShadow: on ? `0 0 22px -9px ${C.orange}` : 'none',
                opacity: c.past && !on ? 0.45 : 1,
                transition: 'border-color .12s, background .12s',
              }}
            >
              <div style={{
                fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em',
                color: on ? C.orange : C.text3, fontWeight: 700,
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                <span>{c.confirmed ? '✓' : '◻'}</span>
                <span style={{ fontFamily: NUM_FONT }}>{c.time}</span>
                {c.weak > 0 && <span style={{ marginLeft: 'auto', color: C.yellow }}>★{c.weak}</span>}
              </div>

              <div style={{
                fontFamily: NUM_FONT, fontSize: 12.5, fontWeight: 800, marginTop: 2,
                letterSpacing: '-.02em', color: on ? C.text : C.text2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                textDecoration: c.past ? 'line-through' : 'none',
              }}>
                {c.matchup}
                <span style={{ fontSize: 9, fontWeight: 600, color: C.text3, marginLeft: 5 }}>
                  GS {c.gs.toFixed(0)}<span style={{ color: c.edge === '▲' ? C.orange : C.text3 }}>{c.edge}</span>
                </span>
              </div>

              {c.arms && (
                <div style={{
                  fontSize: 9, color: C.text2, fontFamily: NUM_FONT, marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>⚾ {c.arms}</div>
              )}
              {c.topBat && (
                <div style={{
                  fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>🔝 {c.topBat}{c.heat >= 0.55 && c.topHrw ? ` · HRW ${c.topHrw}` : ''}</div>
              )}
              {/* Big cards carry more: the bot's designated pick and the top
                  ALT look ride only on cards hot enough to have the width. */}
              {c.heat >= 0.55 && c.pickName && (
                <div style={{
                  fontSize: 9, color: C.orange, fontFamily: NUM_FONT, marginTop: 1, fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>🤖 {c.pickName} <span style={{ opacity: 0.7, fontWeight: 400 }}>{c.pickRole} pick</span></div>
              )}
              {c.heat >= 0.55 && c.altName && (
                <div
                  title={c.altWhy || 'The bot’s secondary HR look in this game'}
                  style={{
                    fontSize: 9, color: '#A78BFA', fontFamily: NUM_FONT, marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>🅰 {c.altName} {c.altScore} <span style={{ opacity: 0.6 }}>alt</span></div>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 7 }}>
        First-pitch order, heat-tinted and heat-SIZED — the warmer a card glows and the wider it
        stretches, the higher its{' '}
        <strong style={{ color: C.text2 }}>GS</strong> (Game Score: the median of every hitter&apos;s
        four board scores, then the median across the lineup — &ldquo;is this whole lineup
        dangerous&rdquo;, not &ldquo;is there one guy&rdquo;). ▲/▽ = above/below tonight&apos;s median.
        ⚾ the pitching matchup · 🔝 the game&apos;s top bat and his HR score · ★ weak lineup spots
        · ✓/◻ lineup confirmed or projected. The hottest cards carry two extra lines the small ones
        don&apos;t: 🤖 the bot&apos;s designated pick, and 🅰 its best <em>alt look</em> — the secondary
        HR lane, hover for the reason.
      </div>
    </div>
  )
}
