'use client'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'

// Games — the slate, one card per matchup, with each side's best play under it.
//
// Kept to the top three per team on purpose. This is the orientation tab: you
// come here to see WHAT'S ON, not to research. Everything deeper is one tab
// over, and a card that tries to be a board is neither.

function KickoffLabel({ g }) {
  if (g.state === 'in') {
    return <span style={{ color: C.cyan, fontWeight: 800 }}>{g.detail || 'LIVE'}</span>
  }
  if (g.completed) return <span style={{ color: C.text3 }}>Final</span>
  let t = g.detail
  if (!t && g.kickoff) {
    try {
      t = new Date(g.kickoff).toLocaleString('en-US', {
        weekday: 'short', hour: 'numeric', minute: '2-digit',
      })
    } catch { t = 'TBD' }
  }
  return <span style={{ color: C.text3 }}>{t || 'TBD'}</span>
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

  return (
    <div>
      <div style={{
        fontSize: 11, color: C.text3, marginBottom: 10, lineHeight: 1.6,
      }}>
        Top three by <b style={{ color: C.text2 }}>Anytime TD</b> score per side.
        Low-sample players are held out of this view — they&apos;re still on the boards.
      </div>

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      }}>
        {games.map((g) => (
          <div key={g.game_id} style={{
            background: C.bg2, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '11px 13px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 8, marginBottom: 2,
            }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: C.text }}>
                {g.away} <span style={{ color: C.text3, fontWeight: 600 }}>@</span> {g.home}
              </span>
              <span style={{ fontSize: 10, fontFamily: NUM_FONT }}><KickoffLabel g={g} /></span>
            </div>
            {(g.state === 'in' || g.completed) && (
              <div style={{
                fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: C.cyan,
                marginBottom: 4,
              }}>{g.away_score} – {g.home_score}</div>
            )}
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
        ))}
      </div>
    </div>
  )
}
