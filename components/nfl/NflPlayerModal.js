'use client'
import { useEffect } from 'react'

import useScrollLock from '../../lib/useScrollLock'
import { C, NUM_FONT, MARKETS, gradeFor } from '../../lib/nfl/theme'
import PropsGrid from './PropsGrid'
import PlayerNotes from '../PlayerNotes'
import { VerdictStamp, PutOnCard } from './CardActions'
import MatchupMap from './MatchupMap'
import NflFace from './NflFace'
import DvpTable, { GROUP } from './DvpTable'
import DvpDrift from './DvpDrift'
import ChartFrame from './ChartFrame'
import { downloadNflPickCard } from './shareCard'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import FollowButton from '../FollowButton'
import { injuryTag, injuryTitle, injuryColor } from '../../lib/nfl/injury'
import ScoreAnatomy from './ScoreAnatomy'
import SplitDumbbell from './SplitDumbbell'

// Why this player scores what he scores — see components/nfl/ScoreAnatomy.js.
// The list of components that used to live here (label map included) moved
// there on 2026-09-13 when the WHY panel became a stacked bar; the panel is
// mounted below and the labels are exported from that file so the board rungs
// and this modal cannot drift apart.


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

  // 2026-09-13: six two-column rows became six dumbbells. Same numbers, but
  // the GAP is now a length instead of a subtraction the reader has to do.
  // One dumbbell per situational pair, each on its own scale — a TD rate and
  // a yardage rate never shared an axis and drawing them as if they did would
  // flatten every rate row to nothing.
  const rows = pairs.map(([a, b]) => ({
    key: `${a}-${b}`,
    label: `${data?.labels?.[a] || a} / ${data?.labels?.[b] || b}`,
    a: Number.isFinite(sp[a]?.[statKey]) ? Number(sp[a][statKey]) : null,
    b: Number.isFinite(sp[b]?.[statKey]) ? Number(sp[b][statKey]) : null,
    ga: sp[a]?.g,
    gb: sp[b]?.g,
  }))

  return (
    <>
      <div style={{
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '16px 0 7px',
      }}>SPLITS — {unit}</div>
      <SplitDumbbell
        rows={rows}
        note={`Per-game ${unit}. Filled is the first side of each label, hollow the second, each pair on its own scale. The number on the right is the gap — it lights past 15%, because a smaller one on this sample is noise.`}
      />
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

function Head({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
      margin: '18px 0 8px',
    }}>{children}</div>
  )
}

// The map, scoped to this player and the defence he's actually facing.
//
// This is the one thing in the modal that isn't about him in the abstract —
// every other section would read the same if he were playing a bye week.
// 2026-09-07 — two things were wrong with which side of the map opened.
//
// The old rule flipped to rushing whenever the passing map was missing. But
// `player_pass` is keyed by the man CATCHING the ball, so a quarterback is
// absent from it by construction: 77 of 87 quarterbacks have no entry. Open
// Jared Goff from the PASSING YARDS board and the old rule sent you to his
// rushing map, which is built on eight carries in his entire log, and then the
// map asserted underneath it that he "takes 62.5% of his carries up the
// middle." Five carries out of eight, stated like a tendency.
//
// So: the map follows the market's own stat family, and the fallback to the
// other side has to earn it with a real sample. A thin map still renders — the
// grid already dims what it can't support — but it says it is thin instead of
// narrating a spot. Against the live Week 1 payload this suppresses 37
// market/player maps (23 QB, 12 RB, 2 TE) and notes 340 more.
const PASS_MARKETS = new Set(['PASS_YDS', 'REC', 'REC_YDS'])
const RUSH_MARKETS = new Set(['RUSH_YDS', 'RUSH_ATT'])
const FALLBACK_MIN_ATT = 20

const mapAttempts = (m) =>
  Object.values(m || {}).reduce((n, z) => n + (Number(z?.att) || 0), 0)

function MatchupSection({ player, matchup, market }) {
  const field = matchup?.field
  if (!field || !player?.opp) return null
  const passMap = field.player_pass?.[player.player_id]
  const rushMap = field.player_rush?.[player.player_id]
  if (!passMap && !rushMap) return null

  const passAtt = mapAttempts(passMap)
  const rushAtt = mapAttempts(rushMap)

  // TD is played from both sides, so it opens on whichever side he does more of.
  const natural = PASS_MARKETS.has(market) ? 'pass'
    : RUSH_MARKETS.has(market) ? 'rush'
      : (passAtt >= rushAtt ? 'pass' : 'rush')

  const have = (v) => (v === 'pass' ? Boolean(passMap) : Boolean(rushMap))
  const att = (v) => (v === 'pass' ? passAtt : rushAtt)

  let view = natural
  if (!have(natural)) {
    const other = natural === 'pass' ? 'rush' : 'pass'
    // Falling back across the ball is only worth doing on a real sample.
    if (!have(other) || att(other) < FALLBACK_MIN_ATT) return null
    view = other
  }

  const thin = att(view) < FALLBACK_MIN_ATT
  return (
    <>
      <Head>MATCHUP MAP — HIS WORK ON {player.opp}&apos;S HOLES</Head>
      <MatchupMap field={field} player={player} mode="player" compact
                  defaultView={view} />
      {thin && (
        <div style={{ fontSize: 10, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
          Built on {att(view)} {view === 'pass' ? 'targets' : 'carries'} — thin enough
          that the shape is a hint, not a tendency.
        </div>
      )}
    </>
  )
}

// ...and the same defence read the orthodox way. The map says where the field
// is soft; this says whether it's soft to somebody in HIS chair. A defence can
// leak deep right all day and still smother the WR3 who runs those routes.
function DvpSection({ player, matchup }) {
  const group = GROUP[player?.position]
  if (!group || !matchup?.dvp?.season?.[player?.opp]) return null
  const role = matchup?.roles?.[player.player_id]
  return (
    <>
      <Head>{player.opp} DEFENCE VS {player.position} — BY DEPTH ROLE</Head>
      {/* The grid is a measurement too, so it wears the same chrome — the
          frame means "this is an instrument", and a table of league ranks is
          exactly that. Game cards are deliberately NOT framed yet: that grid
          is the next thing being rebuilt and decorating it first would be
          decorating something about to change. */}
      <ChartFrame accent={C.cyan} pad="0" style={{ overflow: 'hidden' }}>
        <DvpTable data={matchup} team={player.opp} roles={group}
                  highlight={role} minWidth={340} />
      </ChartFrame>
      <div style={{ marginTop: 14 }}>
        <DvpDrift data={matchup} team={player.opp} roles={group} highlight={role} />
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
        Rank 1 = allows the most = softest matchup. {matchup.season} season.
        {!role && ' Depth roles publish with the next bot run, so no row is pinned to him yet.'}
      </div>
    </>
  )
}

// 📸 SHARE (2026-08-24) — the pregame half of the NFL share-card pair. Builds
// the compact `pick` shape components/nfl/shareCard.js draws from out of
// whatever the modal already has in scope: no re-fetch, no season lookup,
// nothing this screen isn't already showing. `hit`/`actual`/`void` are left
// unset here on purpose — this modal only ever carries a pregame score, never
// a graded line, so the card it downloads always reads as a case, never a
// result. The Accountability tab's own row (which DOES carry a graded line)
// wires the same shareCard.js function with those fields filled in instead.
function pickFromPlayer(player, market, spec) {
  return {
    name: player.name,
    team: player.team,
    opp: player.opp,
    position: player.position,
    market,
    marketLabel: spec?.label || market,
    bar: spec?.bar,
    questionable: player.questionable,
    low_sample: player.low_sample,
    score: player.scores?.[market],
    grade: Number.isFinite(player.scores?.[market]) ? gradeFor(player.scores[market]).label : undefined,
  }
}

export default function NflPlayerModal({ player, market, markets, splitMeta, logs, matchup, slate, picks, results, onClose, onFullProfile }) {
  useScrollLock(Boolean(player))
  const watchlist = useNflWatchlist(slate)
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  if (!player) return null
  const spec = (markets || []).find((m) => m.key === market)
  const comps = player.components?.[market] || {}
  const weights = spec?.weights || {}


  return (
    <div
      onClick={onClose}
      style={{
        // #30, same as the MLB modals: the floating nav is z-index 390 and
        // drew on top of an open card. Above the bar, below the signature rail.
        position: 'fixed', inset: 0, zIndex: 395, background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 14,
          padding: 18, maxWidth: 620, width: '100%', maxHeight: '86vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
        }}>
          {/* 2026-09-07. Donovan, 8/27: "site needs visuals; we don't have
              player pictures." We did have them — FRANCHISE has rendered faces
              for weeks — TUDDY just never got one. See NflFace for why this is
              not the same component. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NflFace player={player} size={44} />
            <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>{player.name}</div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
              {player.position} · {player.team}{player.opp ? ` vs ${player.opp}` : ''}
              {injuryTag(player) && (
                <span title={injuryTitle(injuryTag(player))}
                      style={{ color: injuryColor(injuryTag(player), C), fontWeight: 900 }}>
                  {' · '}{injuryTag(player)}
                </span>
              )}
              {player.low_sample && <span style={{ color: C.text3 }}> · low sample</span>}
            </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <FollowButton sport="nfl" id={player?.player_id} name={player?.name} team={player?.team} position={player?.position} compact />
            <button onClick={() => watchlist.toggle(player)}
              aria-label={watchlist.isPinned(player.player_id) ? `Remove ${player.name} from watchlist` : `Save ${player.name} to watchlist`}
              style={{
                background: watchlist.isPinned(player.player_id) ? `${C.yellow}26` : 'transparent',
                border: `1px solid ${watchlist.isPinned(player.player_id) ? C.yellow + '66' : C.border}`,
                color: watchlist.isPinned(player.player_id) ? C.yellow : C.text3,
                borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: 9, fontWeight: 900,
              }}>{watchlist.isPinned(player.player_id) ? '★ SAVED' : '☆ SAVE'}</button>
            {onFullProfile && <button onClick={() => onFullProfile(player)}
              style={{
                background: `${C.green}20`, border: `1px solid ${C.green}70`, color: C.green,
                borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: 9,
                fontWeight: 900,
              }}>FULL PROFILE →</button>}
            {/* 🎴 his card as a PNG — the NFL twin of the MLB player-modal
                share button (components/PlayerModal.js). Client-side only:
                draws a canvas, triggers a browser download, nothing else. */}
            <button onClick={() => downloadNflPickCard(pickFromPlayer(player, market, spec))}
              title="Download his pick card as a PNG for posting — the bot's call on this market, ready to share manually"
              aria-label="Download pick card as image"
              style={{
                background: 'transparent', border: `1px solid ${C.border}`, color: C.text3,
                borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
              }}>📸</button>
            <button onClick={onClose} style={{
              background: 'transparent', border: `1px solid ${C.border}`, color: C.text3,
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
            }}>esc</button>
          </div>
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

        {/* graded state and your card, before the matchup: the two things a
            bettor opens the card to do (2026-09-05, Batch 2). */}
        <VerdictStamp player={player} results={results} bars={Object.fromEntries((markets || []).map((m) => [m.key, Number(m.bar)]))} />
        <PutOnCard player={player} market={market} picks={picks} slate={slate} />
        <MatchupSection player={player} matchup={matchup} market={market} />
        <DvpSection player={player} matchup={matchup} />

        {Object.keys(comps).length > 0 && (
          <div style={{ marginTop: 18 }}>
            <ScoreAnatomy
              components={comps}
              weights={weights}
              score={player.scores?.[market]}
              marketLabel={spec?.label || market}
              dropped={spec?.dropped}
            />
          </div>
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

        {/* 🎯 The props grid, football edition (2026-08-15) — the MLB matrix
            ported. HitRate still draws the bars; it now rides INSIDE the grid
            and follows whichever row is open, so the modal keeps one chart
            and gains the every-market glance above it. */}
        {logs?.logs?.[player.player_id]?.log && (
          <PropsGrid
            log={logs.logs[player.player_id].log}
            market={market}
            defaultBar={spec?.bar ?? 1}
            scores={player.scores}
          />
        )}

        <CoverageAndExplosive player={player} matchup={matchup} />

        <Splits player={player} market={market} data={splitMeta} />
        {/* Same per-device note store as MOONSHOT's card; ids can't collide. */}
        <PlayerNotes playerId={player.player_id} />

        {player.carryover && (
          <div style={{
            marginTop: 14, fontSize: 10.5, color: C.text2, lineHeight: 1.6,
            background: `${C.purple}20`, border: `1px solid ${C.purple}4d`,
            borderRadius: 9, padding: '7px 10px',
          }}>
            <b style={{ color: C.purple }}>Carryover</b> — last season&apos;s per-game baseline.
          </div>
        )}
      </div>
    </div>
  )
}
