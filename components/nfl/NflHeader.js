'use client'
import { C, NUM_FONT, TABS, GRADIENT } from '../../lib/nfl/theme'
import { setSport } from '../../lib/sport'
import PaletteButton from '../PaletteButton'

// The NFL header. Deliberately the same silhouette as the MLB one — logo tile
// left, status strip centre, controls right, tab rail underneath — so the
// switch feels like changing channel, not changing site. Only the accents move.

function Tile({ label, value, color, title }) {
  return (
    <div
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 13px', borderRadius: 9,
        background: `linear-gradient(135deg, ${color}1e, ${color}08)`,
        border: `1px solid ${color}4d`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{
          fontSize: 8.5, color: C.text3, textTransform: 'uppercase',
          letterSpacing: '.09em', fontWeight: 800,
        }}>{label}</span>
        <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, color }}>{value}</span>
      </div>
    </div>
  )
}

export default function NflHeader({ tab, setTab, data, meta }) {
  const games = data?.games?.length ?? 0
  const live = (data?.games || []).filter((g) => g.state === 'in').length
  const isPre = data?.mode === 'preseason'

  // What the header used to say was "3 games, 102 players", which is a
  // description of the file, not of the slate. These two are the output:
  // how many touchdowns the card projects, and how many plays cleared A-.
  const rows = data?.players || []
  const projTd = rows.reduce((a, p) => a + (p.stats?.xTD || 0), 0)
  const aGrade = rows.filter(
    (p) => Math.max(...Object.values(p.scores || { _: 0 })) >= 62).length

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'rgba(9,9,11,0.86)', backdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            position: 'relative', width: 34, height: 34, borderRadius: 10,
            background: GRADIENT, display: 'flex', alignItems: 'center',
            justifyContent: 'center', boxShadow: `0 0 18px ${C.green}59`,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 900, color: '#052e16',
              letterSpacing: '-0.05em', fontFamily: NUM_FONT,
            }}>TD</span>
            {live > 0 && (
              <div style={{
                position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                borderRadius: '50%', background: C.cyan, border: '2px solid #09090b',
                animation: 'pulse 2s infinite',
              }} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em',
                background: GRADIENT, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>MOONSHOT</span>
              {/* The switch. MLB is the sibling now, not a different website. */}
              <span style={{ display: 'flex', gap: 3, marginLeft: 5, alignSelf: 'center' }}>
                <button
                  onClick={() => setSport('mlb')}
                  style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    padding: '1px 7px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${C.border2}`, background: 'transparent', color: C.text3,
                  }}
                >MLB</button>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                  padding: '1px 7px', borderRadius: 999,
                  background: `${C.green}26`, border: `1px solid ${C.green}73`, color: C.green,
                }}>NFL</span>
              </span>
            </div>
            <div style={{
              height: 2, background: `linear-gradient(90deg, ${C.green}, transparent)`,
              borderRadius: 1, marginTop: 1, width: 80,
            }} />
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, flexWrap: 'wrap', flex: '1 1 420px', minWidth: 0,
        }}>
          <Tile label="Games" value={games} color={C.blue} title="Games on this slate" />
          <Tile
            label="Proj TD"
            value={projTd ? projTd.toFixed(1) : '—'}
            color={C.green}
            title={`Expected touchdowns across the ${rows.length} players scored on this slate — the sum of each man's xTD.${
              isPre ? ' Preseason caveat: xTD is last season\'s per-game rate at full usage, and starters play two series. Read it as the ceiling, not the projection.' : ''}`}
          />
          <Tile label="A-grade" value={aGrade} color={C.cyan}
                title="Players clearing A- (62) in at least one market" />
          {live > 0 && <Tile label="Live" value={live} color={C.yellow} title="Games in progress" />}
          {isPre && (
            <div
              title="Preseason: starters play two series, so weekly form does not exist yet. Every board here is built from last season's per-game baselines and says so on each row."
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                borderRadius: 9, background: `${C.yellow}14`, border: `1px solid ${C.yellow}45`,
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 900, color: C.yellow, letterSpacing: '.08em',
              }}>PRESEASON · CARRYOVER</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
          }}>{meta?.built_at_human || data?.built_at_human || '—'}</span>
          <PaletteButton />
        </div>
      </div>

      <div className="rail" style={{
        maxWidth: 1300, margin: '0 auto', padding: '0 16px',
        overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: 'flex', gap: 2, minWidth: 'max-content' }}>
          {TABS.map(([key, label]) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding: '8px 13px', fontSize: 11, fontWeight: active ? 800 : 500,
                  cursor: 'pointer', border: 'none', borderRadius: 0,
                  background: 'transparent', color: active ? C.green : C.text3,
                  position: 'relative', transition: 'color .12s', whiteSpace: 'nowrap',
                }}
              >
                {label}
                {active && <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                  background: GRADIENT, borderRadius: '2px 2px 0 0',
                }} />}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        header div::-webkit-scrollbar { display: none; }
      `}</style>
    </header>
  )
}
