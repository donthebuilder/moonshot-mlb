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

// "J. Mlodzinski", suffix-aware — surnames alone truncated to "Thornt…" on
// narrow cards and bare "Lowe" carried no identity (2026-08-07).
const SUFFIX = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv'])
const shortName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (!parts[0]) return ''
  if (parts.length === 1) return parts[0]
  const last = SUFFIX.has(parts[parts.length - 1].toLowerCase())
    ? parts.slice(-2).join(' ') : parts[parts.length - 1]
  return `${parts[0][0]}. ${last}`
}
const lastName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length >= 2 && SUFFIX.has(parts[parts.length - 1].toLowerCase())) return parts.slice(-2).join(' ')
  return parts.slice(-1)[0] || ''
}

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

export default function GameStrip({ games, activeGame, onSelect, mode }) {
  const botView = mode === 'botview'
  // Each Games-page mode wears its own accent (2026-08-08): ember for the
  // default read, cyan for Bot Output, green for Lineups — the strip tells
  // you which lens you're in before you read a single card.
  const accent = botView ? '#22d3ee' : mode === 'lineups' ? '#4ade80' : '#f97316'
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
        arms: arms.map(lastName).join(' · '),
        armsFull: arms.join(' vs '),
        topBat: head?.name ? `${shortName(head.name)} ${hrScore(head).toFixed(0)}` : '',
        topHrw: head?.name && nn(head?.hrw_score) > 0 ? nn(head.hrw_score).toFixed(0) : null,
        pickName: pick?.name ? shortName(pick.name) : null,
        pickRole: pick ? String(pick.game_pick_role).split('/')[0].trim().toUpperCase() : null,
        altName: altOk ? shortName(alt.name) : null,
        altScore: altOk ? nn(alt.alt_hr_score).toFixed(0) : null,
        altWhy: altOk ? String(alt.alt_reason || '') : '',
        // BOTH lineups (2026-08-07, Donovan): one ✓ hid a half-projected
        // game. Per-team marks now — ✓✓ both posted, ✓◻ one still projected.
        confMarks: (() => {
          const byTeam = {}
          gp.forEach((x) => {
            const tm = x?.team
            if (tm && !(tm in byTeam)) byTeam[tm] = x?.lineup_confirmed !== false
          })
          const ts = Object.keys(byTeam)
          if (ts.length !== 2) return null
          return { marks: ts.map((t) => byTeam[t] ? '✓' : '◻').join(''), tip: ts.map((t) => `${t} ${byTeam[t] ? 'posted' : 'projected'}`).join(' · ') }
        })(),
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
    const byGs = [...built].sort((a, b) => b.gs - a.gs)
    const rankOf = new Map(byGs.map((c, i) => [c.pk, i + 1]))
    return built.map((c) => ({
      ...c,
      edge: c.gs >= slateMed ? '▲' : '▽',
      heat: hi > lo ? (c.gs - lo) / (hi - lo) : 0.5,
      gsRank: rankOf.get(c.pk) || 0,
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
          // PERSONALITY BANDS (2026-08-07, same language as the park board):
          // the hottest game on the slate is the MAIN EVENT and burns; cold
          // games freeze quietly. Bands come from heat (GS within tonight's
          // range), so every slate has exactly one main event.
          const band = c.gsRank === 1 ? { icon: '🌋', word: 'MAIN EVENT', col: accent }
            : c.heat >= 0.62 ? { icon: '🔥', word: '', col: accent }
            : c.heat >= 0.3 ? { icon: '', word: '', col: accent }
            : { icon: '🧊', word: '', col: '#38bdf8' }
          return (
            <button
              key={c.pk}
              onClick={() => onSelect(c.pk)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '6px 9px 5px',
                borderRadius: 11, minWidth: 0, position: 'relative', overflow: 'hidden',
                // Words first (2026-08-08): basis widened so names and band
                // words render whole like the park cards do, instead of
                // ellipsing at the old 138px floor.
                flex: `${(1 + c.heat).toFixed(2)} 1 ${Math.round(158 + c.heat * 58)}px`,
                border: `1px solid ${on ? accent : `${band.col}${c.heat >= 0.62 ? '66' : '30'}`}`,
                background: on
                  ? 'rgba(249,115,22,0.09)'
                  : `linear-gradient(160deg, ${band.col}${c.gsRank === 1 ? '1f' : c.heat >= 0.62 ? '12' : '08'} 0%, rgba(17,17,19,1) 62%)`,
                boxShadow: on ? `0 0 22px -9px ${C.orange}` : c.gsRank === 1 ? `0 0 14px ${band.col}2e` : 'none',
                opacity: c.past && !on ? 0.45 : 1,
                transition: 'border-color .12s, background .12s',
              }}
            >
              {/* GS-rank watermark — the ghost numeral that says where this
                  game sits on the slate without a legend */}
              <div style={{
                position: 'absolute', top: -6, right: 2, fontFamily: NUM_FONT,
                fontSize: 40, fontWeight: 900, color: band.col, opacity: 0.09,
                lineHeight: 1, pointerEvents: 'none',
              }}>{c.gsRank}</div>

              <div style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em',
                color: on ? C.orange : C.text3, fontWeight: 700,
                display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <span title={c.confMarks ? c.confMarks.tip : (c.confirmed ? 'lineups confirmed' : 'projected lineups')}>
                  {c.confMarks ? c.confMarks.marks : (c.confirmed ? '✓' : '◻')}
                </span>
                <span style={{ fontFamily: NUM_FONT }}>{c.time}</span>
                {band.word && (
                  <span style={{ fontSize: 8.5, fontWeight: 900, color: band.col, letterSpacing: '.1em', fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                    {band.icon} {band.word}
                  </span>
                )}
                {!band.word && band.icon && <span style={{ fontSize: 9 }}>{band.icon}</span>}
                {c.weak > 0 && <span style={{ marginLeft: 'auto', color: C.yellow }}>★{c.weak}</span>}
              </div>

              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, minWidth: 0,
              }}>
                <span style={{
                  fontFamily: NUM_FONT, fontSize: 14.5, fontWeight: 800,
                  letterSpacing: '-.02em', color: on ? C.text : C.text2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                  textDecoration: c.past ? 'line-through' : 'none',
                }}>{c.matchup}</span>
                <span title="Game Score vs tonight's median" style={{
                  fontFamily: NUM_FONT, fontSize: c.heat >= 0.62 ? 14 : 11.5, fontWeight: 900,
                  color: band.col, flexShrink: 0,
                }}>
                  {c.gs.toFixed(0)}<span style={{ fontSize: 9, opacity: 0.8 }}>{c.edge}</span>
                </span>
              </div>

              {c.arms && (
                <div title={c.armsFull} style={{
                  fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT, marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>⚾ {c.arms}</div>
              )}
              {(c.topBat || ((botView || c.heat >= 0.55) && c.pickName) || (c.heat >= 0.55 && c.altName)) && (
                <div style={{ borderTop: `1px solid ${band.col}22`, marginTop: 3 }} />
              )}
              {c.topBat && (
                <div style={{
                  fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>🔝 {c.topBat}{c.heat >= 0.55 && c.topHrw ? ` · HRW ${c.topHrw}` : ''}</div>
              )}
              {/* Big cards carry more: the bot's designated pick and the top
                  ALT look ride only on cards hot enough to have the width. */}
              {(botView || c.heat >= 0.55) && c.pickName && (
                <div style={{
                  fontSize: 10.5, color: C.orange, fontFamily: NUM_FONT, marginTop: 1, fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>🤖 {c.pickName} <span style={{ opacity: 0.7, fontWeight: 400 }}>{c.pickRole} pick</span></div>
              )}
              {c.heat >= 0.55 && c.altName && (
                <div
                  title={c.altWhy || 'The bot’s secondary HR look in this game'}
                  style={{
                    fontSize: 10.5, color: '#A78BFA', fontFamily: NUM_FONT, marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>🅰 {c.altName} {c.altScore} <span style={{ opacity: 0.6 }}>alt</span></div>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 7 }}>
        First-pitch order, heat-tinted and heat-SIZED — 🌋 marks tonight's MAIN EVENT (highest GS), 🔥 runs hot, 🧊 runs cold; the ghost numeral is the game's GS rank. The warmer a card glows and the wider it
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
