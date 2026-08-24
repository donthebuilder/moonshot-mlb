'use client'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'

// Games — the slate, one card per matchup: real scoreboard weight up top,
// each side's best plays underneath.
//
// Folded Live's real-time scoreboard treatment (pulse dot, big score line,
// cyan glow card) in here on 2026-08-24 rather than keeping it a separate
// tab — two tabs answering "what's the score" and "what should I play" cost
// a click apiece for no reason when one card can carry both honestly. See
// Live.js's header (kept on disk, no longer wired into NflDashboard.js/TABS)
// for exactly which fields this is and isn't built on — same ESPN scoreboard
// fetch, same absence of possession and of quarter/clock as separate fields
// (`detail` already arrives as ESPN's own formatted "Q3 8:42" string).
//
// Kept the "top three per team" scoping from the original design on
// purpose. This is still the orientation tab: you come here to see WHAT'S
// ON, not to research. Everything deeper is one tab over, and a card that
// tries to be a board is neither.

function StateBadge({ g }) {
  if (g.state === 'in') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999, background: C.cyan,
          boxShadow: `0 0 6px ${C.cyan}`, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.cyan, letterSpacing: '.06em', fontFamily: NUM_FONT,
        }}>{g.detail || 'LIVE'}</span>
      </span>
    )
  }
  if (g.completed) {
    return (
      <span style={{
        fontSize: 9.5, fontWeight: 900, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase',
      }}>Final</span>
    )
  }
  let t = g.detail
  if (!t && g.kickoff) {
    try {
      t = new Date(g.kickoff).toLocaleString('en-US', {
        weekday: 'short', hour: 'numeric', minute: '2-digit',
      })
    } catch { t = 'TBD' }
  }
  return <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{t || 'TBD'}</span>
}

// Real scoreboard weight — 21px numerals, not the 12px line the score used
// to share with the kickoff label. Shown for both live and final states;
// pregame cards get the plain matchup headline instead (there's no score to
// carry yet).
function ScoreLine({ g }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: NUM_FONT, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, minWidth: 28 }}>{g.away}</span>
      <span style={{ fontSize: 21, fontWeight: 900, color: C.text }}>{g.away_score ?? 0}</span>
      <span style={{ fontSize: 12, color: C.text3 }}>–</span>
      <span style={{ fontSize: 21, fontWeight: 900, color: C.text }}>{g.home_score ?? 0}</span>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, minWidth: 28 }}>{g.home}</span>
    </div>
  )
}

function SidePicks({ players, team, onPlayerClick }) {
  const rows = players
    .filter((p) => p.team === team && !p.low_sample)
    .sort((a, b) => (b.scores?.TD ?? 0) - (a.scores?.TD ?? 0))
    .slice(0, 3)

  if (!rows.length) {
    return <div style={{ fontSize: 10.5, color: C.text3, padding: '6px 0' }}>No scored players</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {rows.map((p) => {
        const g = gradeFor(p.scores?.TD)
        return (
          <button
            key={p.player_id}
            onClick={() => onPlayerClick?.(p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '5px 8px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{
              fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: g.color,
              minWidth: 30,
            }}>{Math.round(p.scores?.TD ?? 0)}</span>
            <span style={{
              fontSize: 11, color: C.text, fontWeight: 600, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name}</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{p.position}</span>
            {p.questionable && (
              <span style={{ fontSize: 8.5, color: C.yellow, fontWeight: 900 }}>Q</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function Games({ data, onPlayerClick }) {
  const games = data?.games || []
  const players = data?.players || []

  if (!games.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>
        No games on this slate yet. The bot posts the week when the schedule lands.
      </div>
    )
  }

  // Live first — real scoreboard behavior: what's happening right now
  // belongs at the top of the grid, not wherever the payload's own order
  // happened to put it. Array.prototype.sort is stable, so pregame/final
  // games keep their original relative order.
  const sorted = [...games].sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1))

  return (
    <div>
      <div style={{
        fontSize: 11, color: C.text3, marginBottom: 10, lineHeight: 1.6,
      }}>
        Score for every game on the slate, top three by <b style={{ color: C.text2 }}>Anytime TD</b> score
        under each side. Low-sample players are held out of this view — they&apos;re still on the boards.
      </div>

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      }}>
        {sorted.map((g) => {
          const live = g.state === 'in'
          const hasScore = live || g.completed
          return (
            <div key={g.game_id} style={{
              background: live ? `linear-gradient(155deg, rgba(34,211,238,.08), ${C.bg2} 55%)` : C.bg2,
              border: `1px solid ${live ? 'rgba(34,211,238,.4)' : C.border}`,
              borderRadius: 12, padding: '11px 13px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, marginBottom: hasScore ? 6 : 2,
              }}>
                {hasScore ? (
                  <StateBadge g={g} />
                ) : (
                  <>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.text }}>
                      {g.away} <span style={{ color: C.text3, fontWeight: 600 }}>@</span> {g.home}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: NUM_FONT }}><StateBadge g={g} /></span>
                  </>
                )}
              </div>

              {hasScore && <ScoreLine g={g} />}

              {g.venue && (
                <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 2 }}>
                  {g.venue}{g.indoors ? ' · indoors' : ''}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                {[g.away, g.home].map((t) => (
                  <div key={t}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 900, color: C.text3,
                      letterSpacing: '.08em', textTransform: 'uppercase',
                    }}>{t}</div>
                    <SidePicks players={players} team={t} onPlayerClick={onPlayerClick} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
