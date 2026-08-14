'use client'
import { useEffect } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor } from '../../lib/nfl/theme'
import HitRate from './HitRate'

// Why this player scores what he scores.
//
// The board gives a number; without this the number is an assertion. Every
// component that went into the score is listed with its own percentile and
// the weight it carried, so the arithmetic is inspectable rather than trusted.
// That's the same posture as the MLB ScoreAudit — if the model is wrong you
// should be able to SEE where it went wrong, not just that it did.

const LABELS = {
  f_gl_opp: 'Goal-line opportunity',
  f_rz_opp: 'Red-zone touches',
  implied_total: 'Implied team total',
  f_xtd: 'Expected TDs',
  opp_td_soft: 'Defense TD softness',
  td_regression: 'TD regression (due)',
  f_wopr: 'WOPR (opportunity)',
  f_receiving_yards: 'Receiving yards form',
  f_receiving_air_yards: 'Air yards (depth)',
  opp_pass_soft: 'Defense pass softness',
  f_target_share: 'Target share',
  f_receptions: 'Receptions form',
  f_targets: 'Targets',
  f_carries: 'Carries',
  f_rushing_yards: 'Rushing yards form',
  f_rz_car: 'Red-zone carries',
  f_ngs_rush_yards_over_expected_per_att: 'RYOE per attempt (NGS)',
  total_line: 'Game total',
  f_attempts: 'Pass attempts',
  f_passing_cpoe: 'CPOE',
  f_tm_fg_drive_rate: 'Team FG-drive rate',
  f_tm_rz_td_rate_inv: 'Team RZ TD rate (inverted)',
  f_fg_att: 'FG attempts',
  kick_env: 'Kicking environment',
  f_tm_drives: 'Team drives',
}


// ── splits ────────────────────────────────────────────────────────────────────

// Which per-game number a split should show depends on what you're looking at.
// Staring at the TD board, "he averages 3.18 targets when trailing" is trivia;
// "he scores 0.36 a game when trailing vs 0.20 when leading" is the read.
const SPLIT_STAT = {
  TD:       ['td',    'TD/g'],
  REC_YDS:  ['recyd', 'yds/g'],
  REC:      ['rec',   'rec/g'],
  RUSH_YDS: ['ruyd',  'yds/g'],
  RUSH_ATT: ['car',   'car/g'],
  PASS_YDS: ['payd',  'yds/g'],
}

function Splits({ player, market, data }) {
  const sp = player?.splits
  if (!sp || !Object.keys(sp).length) return null
  const entry = SPLIT_STAT[market]
  // Kickers have no play-level split: nflverse attributes a field goal to the
  // kicker but the situational buckets here are built off receiver/rusher/
  // passer roles. Rather than render an empty grid, say nothing.
  if (!entry) return null
  const [statKey, unit] = entry

  const pairs = (data?.pairs || []).filter(([a, b]) => sp[a] || sp[b])
  if (!pairs.length) return null

  // Colour the better side of each pair, but only when the gap is real — a
  // 4% difference on a 17-game sample is not a split, it's noise wearing one.
  const MEANINGFUL = 0.15

  return (
    <>
      <div style={{
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}>SPLITS — {unit}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pairs.map(([a, b]) => {
          const A = sp[a]; const B = sp[b]
          const va = A?.[statKey]; const vb = B?.[statKey]
          const both = Number.isFinite(va) && Number.isFinite(vb)
          const hi = both && Math.max(va, vb) > 0
            && Math.abs(va - vb) / Math.max(va, vb) >= MEANINGFUL
            ? (va > vb ? 'a' : 'b') : null
          const cell = (v, g, side) => (
            <div style={{
              flex: 1, textAlign: 'center', padding: '4px 6px', borderRadius: 7,
              background: hi === side ? `${C.green}14` : 'transparent',
              border: `1px solid ${hi === side ? C.green + '45' : 'transparent'}`,
            }}>
              <div style={{
                fontFamily: NUM_FONT, fontSize: 12.5, fontWeight: 900,
                color: hi === side ? C.green : C.text,
              }}>{Number.isFinite(v) ? v.toFixed(2) : '—'}</div>
              <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
                {g ? `${g}g` : ''}
              </div>
            </div>
          )
          return (
            <div key={`${a}-${b}`} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '5px 8px',
            }}>
              <span style={{ fontSize: 10, color: C.text3, minWidth: 62 }}>
                {data?.labels?.[a] || a}
              </span>
              {cell(va, A?.g, 'a')}
              <span style={{ fontSize: 9, color: C.text3 }}>vs</span>
              {cell(vb, B?.g, 'b')}
              <span style={{
                fontSize: 10, color: C.text3, minWidth: 62, textAlign: 'right',
              }}>{data?.labels?.[b] || b}</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
        Per-game rates, games beside them. Lit at a 15%+ gap.
      </div>
    </>
  )
}


// ── coverage + explosive ──────────────────────────────────────────────────────

function Mini({ label, children, accent }) {
  return (
    <div style={{
      flex: '1 1 210px', background: 'rgba(255,255,255,.03)',
      border: `1px solid ${C.border}`, borderLeft: `2px solid ${accent}`,
      borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{
        fontSize: 8.5, fontWeight: 900, color: C.text3, letterSpacing: '.09em',
        marginBottom: 5,
      }}>{label}</div>
      {children}
    </div>
  )
}

function KV({ k, v, hi }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
      <span style={{ fontSize: 10, color: C.text3 }}>{k}</span>
      <span style={{
        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, color: hi ? C.green : C.text,
      }}>{v}</span>
    </div>
  )
}

function CoverageAndExplosive({ player, matchup }) {
  const cov = matchup?.coverage_player?.[player?.player_id]
  const exp = matchup?.player_explosive?.[player?.player_id]
  const oppCov = matchup?.coverage_team?.[player?.opp]
  if (!cov && !exp) return null

  // Which side he's better against, and by how much — the reason to show the
  // split at all rather than two columns of numbers.
  let edge = null
  if (cov?.man && cov?.zone) {
    const d = cov.zone.ypt - cov.man.ypt
    if (Math.abs(d) >= 1.0) edge = d > 0 ? 'zone' : 'man'
  }

  return (
    <>
      <div style={{
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}>COVERAGE & EXPLOSIVE</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {cov?.man && (
          <Mini label="VS MAN" accent={edge === 'man' ? C.green : C.border2}>
            <KV k="Targets" v={cov.man.tgts} />
            <KV k="Yds / target" v={cov.man.ypt} hi={edge === 'man'} />
            <KV k="Catch %" v={`${cov.man.catch_pct}%`} />
            <KV k="TD" v={cov.man.td} />
          </Mini>
        )}
        {cov?.zone && (
          <Mini label="VS ZONE" accent={edge === 'zone' ? C.green : C.border2}>
            <KV k="Targets" v={cov.zone.tgts} />
            <KV k="Yds / target" v={cov.zone.ypt} hi={edge === 'zone'} />
            <KV k="Catch %" v={`${cov.zone.catch_pct}%`} />
            <KV k="TD" v={cov.zone.td} />
          </Mini>
        )}
        {exp && (
          <Mini label="EXPLOSIVE" accent={C.purple}>
            <KV k="10+ / 20+" v={`${exp.rec_10} / ${exp.rec_20}`} />
            <KV k="30+ / 40+" v={`${exp.rec_30} / ${exp.rec_40}`} />
            <KV k="Longest" v={exp.lng} />
            <KV k="Air yards" v={exp.air} />
          </Mini>
        )}
      </div>
      {edge && oppCov && (
        <div style={{ fontSize: 10.5, color: C.text2, marginTop: 7, lineHeight: 1.6 }}>
          Better vs <b style={{ color: C.green }}>{edge}</b> · {player.opp} plays{' '}
          <b style={{ color: C.cyan }}>
            {edge === 'zone' ? `${oppCov.zone_pct}% zone` : `${oppCov.man_pct}% man`}
          </b>
        </div>
      )}
    </>
  )
}

export default function NflPlayerModal({ player, market, markets, splitMeta, logs, matchup, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  if (!player) return null
  const spec = (markets || []).find((m) => m.key === market)
  const comps = player.components?.[market] || {}
  const weights = spec?.weights || {}

  const ordered = Object.entries(comps)
    .map(([k, v]) => ({ key: k, pct: v, w: weights[k.replace(/_inv$/, '')] ?? 0 }))
    .sort((a, b) => b.w - a.w)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 14,
          padding: 18, maxWidth: 520, width: '100%', maxHeight: '84vh', overflowY: 'auto',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>{player.name}</div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
              {player.position} · {player.team}{player.opp ? ` vs ${player.opp}` : ''}
              {player.questionable && <span style={{ color: C.yellow, fontWeight: 900 }}> · Q</span>}
              {player.low_sample && <span style={{ color: C.text3 }}> · low sample</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${C.border}`, color: C.text3,
            borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
          }}>esc</button>
        </div>

        {/* every market's score, so you can see the whole player at once */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '13px 0 4px' }}>
          {MARKETS.map(([k, label]) => {
            const s = player.scores?.[k]
            if (!Number.isFinite(s)) return null
            const g = gradeFor(s)
            const on = k === market
            return (
              <div key={k} title={label} style={{
                padding: '4px 9px', borderRadius: 8,
                background: on ? `${g.color}1f` : 'rgba(255,255,255,.03)',
                border: `1px solid ${on ? g.color + '66' : C.border}`,
              }}>
                <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800 }}>{k}</div>
                <div style={{
                  fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, color: g.color,
                }}>{Math.round(s)}</div>
              </div>
            )
          })}
        </div>

        {ordered.length > 0 && (
          <>
            <div style={{
              fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
              margin: '16px 0 7px',
            }}>WHY — {spec?.label || market}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ordered.map(({ key, pct, w }) => (
                <div key={key} style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 9,
                  background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '6px 10px', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    background: `linear-gradient(90deg, ${C.green}1a, transparent)`,
                  }} />
                  <span style={{
                    position: 'relative', fontSize: 11.5, color: C.text2, flex: 1,
                  }}>{LABELS[key] || key}</span>
                  <span style={{
                    position: 'relative', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT,
                  }}>{Math.round(w * 100)}% wt</span>
                  <span style={{
                    position: 'relative', fontFamily: NUM_FONT, fontSize: 12,
                    fontWeight: 900, color: C.green, minWidth: 34, textAlign: 'right',
                  }}>{Math.round(pct)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
              Percentile against the league at his position — not a probability.
            </div>
          </>
        )}

        {Object.keys(player.stats || {}).length > 0 && (
          <>
            <div style={{
              fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
              margin: '16px 0 7px',
            }}>PER-GAME</div>
            <div style={{
              display: 'grid', gap: 5,
              gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
            }}>
              {Object.entries(player.stats).map(([k, v]) => (
                <div key={k} style={{
                  background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '5px 8px',
                }}>
                  <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800 }}>{k}</div>
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: C.text,
                  }}>{typeof v === 'number' ? (Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1)) : v}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {logs?.logs?.[player.player_id]?.log && (
          <HitRate
            log={logs.logs[player.player_id].log}
            market={market}
            defaultBar={spec?.bar ?? 1}
          />
        )}

        <CoverageAndExplosive player={player} matchup={matchup} />

        <Splits player={player} market={market} data={splitMeta} />

        {player.carryover && (
          <div style={{
            marginTop: 14, fontSize: 10.5, color: C.text2, lineHeight: 1.6,
            background: `${C.purple}12`, border: `1px solid ${C.purple}38`,
            borderRadius: 9, padding: '7px 10px',
          }}>
            <b style={{ color: C.purple }}>Carryover</b> — last season&apos;s per-game baseline.
          </div>
        )}
      </div>
    </div>
  )
}
