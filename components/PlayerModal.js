'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { detailUrl } from '../lib/dataSource'
import {
  nameOf, teamOf, oppOf, n, clean, pct, sc,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  recent375, recent400, recent350, ihrVal,
  avgEV, maxEV, hardHitRate, barrelRate, launchAngle,
  babipVal, pitcherBabipVal, avgVsRHP, avgVsLHP,
} from '../lib/player'
import { compactRole, roleColor, gradeFor, signalPills, bestBet } from '../lib/scoring'
import { Chip } from './ui'
import EVLog from './tabs/EVLog'
import PitchBreakdown from './tabs/PitchBreakdown'
import HotZoneMap from './HotZoneMap'
import HRPitchProfile from './HRPitchProfile'
import SprayField from './SprayField'
import MatchupPitcher from './MatchupPitcher'
import PlayerSplits from './PlayerSplits'
import SituationalSplits from './SituationalSplits'
import PlayerNotes from './PlayerNotes'
import ThresholdGrid from './ThresholdGrid'
import BvP from './BvP'

function Row({ label, value, mono = true }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.text3 }}>{label}</span>
      <span style={{ fontSize: 12, color: C.text, fontFamily: mono ? NUM_FONT : 'inherit', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
      border: `1px solid ${active ? C.orange : C.border}`,
      background: active ? `${C.orange}22` : 'transparent',
      color: active ? C.orange : C.text3,
      whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

// Seven tabs, one question each. The old four crammed the batter's pitch table
// and his spray chart into a single 1180px tab, which meant neither got read —
// and put the opposing starter nowhere at all, despite the whole slate being
// built around him. Pitch and Spray are separate now, and the arm he's facing
// has his own tab.
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pitcher',  label: '🥎 Pitcher' },
  { key: 'pitch',    label: '🎯 Pitch' },
  { key: 'spray',    label: '🗺 Spray' },
  { key: 'ev',       label: '⚡ EV Log' },
  { key: 'splits',   label: '📅 Splits' },
  { key: 'zones',    label: '🔥 Hot Zones' },
]

// `inline` renders the same content as a plain panel instead of a popup.
// The Player tab needs exactly this view but sitting still on the page --
// a modal is a bad place to read for five minutes.
function Shell({ inline, onClose, width, children }) {
  if (inline) {
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 18,
        padding: '18px 20px 22px',
      }}>{children}</div>
    )
  }
  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="modal-box"
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          transition: 'width .15s',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

// BET MARKETS for the slip. Same four the boards offer, so an entry added from
// here is indistinguishable from one added from a card.
const BETS = ['HR', 'Hit', 'HRR', 'TB']

export default function PlayerModal({ player, slateMode, onClose, inline = false, onAdd, onWatch, watched = false }) {
  const [tab, setTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle')

  // THE MODAL HAS TO FETCH THE DETAIL FILE ITSELF.
  //
  // `player` is a row out of today_slim.json, and make_slim.py deliberately
  // strips the heavy per-player payloads out of that file and writes them to
  // current/detail/<slate>/batter_<id>.json instead. Checked against the live
  // slate: spray_chart, batted_ball_log, contact_log, pitch_type_summary,
  // batter_pitch_type_profile and pitch_mix_matchup are present on 0 of 267
  // slate rows. Every one of them is in the detail file.
  //
  // SprayField, HRPitchProfile and HotZoneMap each fetch that file for
  // themselves, so those three tabs worked. EV Log and PitchBreakdown read
  // straight off the prop, so they didn't: the EV Log tab showed "No batted
  // ball data. Run spray_cache.py." for every hitter on the slate, and the
  // batter half of the pitch table came up blank while the pitcher half — which
  // does live on the slate row — filled in normally. That asymmetry is why it
  // read like missing bot data rather than a wiring bug.
  //
  // Fetched once here and merged, so the whole modal sees one object. The
  // detail keys win on conflict; the slate row supplies everything else.
  const pid = player?.player_id || player?.id
  useEffect(() => {
    if (!pid) return
    let alive = true
    setDetailState('loading'); setDetail(null)
    fetch(detailUrl(pid, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setDetail(j); setDetailState(j ? 'done' : 'missing') } })
      .catch(() => { if (alive) setDetailState('error') })
    return () => { alive = false }
  }, [pid, slateMode])

  if (!player) return null
  const p = detail ? { ...player, ...detail } : player

  const role = compactRole(p)
  const rc = roleColor(role, C)
  const pills = signalPills(p, C, 'hr')
  const b = babipVal(p), pb = pitcherBabipVal(p)
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const batsHand = clean(p?.bats || p?.handedness, '')
  const matchesWeak = weakSide && batsHand && (
    (weakSide === 'LHB' && batsHand === 'L') ||
    (weakSide === 'RHB' && batsHand === 'R')
  )
  const weakLabel = weakSide
    ? `Weak vs ${weakSide}`
    : p?.pitcher_throws ? (p.pitcher_throws === 'R' ? 'RHP' : 'LHP') : '—'

  // Documented batter-vs-pitch exploit found by the model (pitch_type_match_score > 0).
  // Backtested separator: HR_PICKS with this flag hit 23.9% vs 9.5% without it
  // across 22 days / 241 picks -- the single largest gap found in that analysis.
  const hasMatchupEdge = n(p?.pitch_type_match_score, 0) > 0

  // Width follows the widest table on the tab. Pitch and Pitcher carry ten-plus
  // stat columns; Spray is a fixed-size chart and gets cramped, not helped, by
  // extra width.
  const modalWidth = tab === 'overview' ? 480
    : tab === 'spray' ? 780
    : tab === 'pitcher' || tab === 'pitch' || tab === 'splits' || tab === 'ev' ? 1100
    : 900

  return (
    <Shell inline={inline} onClose={onClose} width={modalWidth}>

          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 900 }}>{nameOf(p)}</div>
              <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 3 }}>
                {teamOf(p)} vs {oppOf(p)} · Lineup #{clean(p?.lineup_spot, '?')} · {clean(p?.handedness || p?.bats, '?')}HB
                {p?.pitcher_name && <span> · vs {p.pitcher_name} ({p.pitcher_throws}HP)</span>}
              </div>
            </div>
            {!inline && (
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            )}
          </div>

          {/* Watchlist + slip. You could open a hitter from any board, decide
              he's worth playing, and then have to close the modal and find his
              card again to add him. Both actions live here now. */}
          {(onAdd || onWatch) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              {onWatch && (
                <button
                  onClick={() => onWatch(p)}
                  title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                  style={{
                    padding: '4px 11px', fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                    fontFamily: NUM_FONT,
                    border: `1px solid ${watched ? C.orange : C.border}`,
                    background: watched ? 'rgba(249,115,22,.14)' : 'transparent',
                    color: watched ? C.orange : C.text3,
                  }}
                >{watched ? '★ On watchlist' : '☆ Watch'}</button>
              )}
              {onAdd && (
                <>
                  <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', marginLeft: 4 }}>
                    Add to slip
                  </span>
                  {BETS.map((b) => (
                    <button
                      key={b}
                      onClick={() => onAdd(p, b)}
                      title={`Add ${nameOf(p)} — ${b} — to the slip`}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                        fontFamily: NUM_FONT, border: `1px solid ${C.border}`,
                        background: 'transparent', color: C.text2,
                      }}
                    >+ {b}</button>
                  ))}
                  <span style={{ fontSize: 9, color: C.text3 }}>
                    bot&apos;s pick: <b style={{ color: C.text2 }}>{bestBet(p, 'hr')}</b>
                  </span>
                </>
              )}
            </div>
          )}

          {/* chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip color={rc}>{role}</Chip>
            <Chip color={C.text2}>{bestBet(p, 'hr')}</Chip>
            <Chip color={C.text2}>Grade {gradeFor(p, 'hr')}</Chip>
            {hasMatchupEdge && <Chip color={C.orange}>🎯 Matchup Edge</Chip>}
            {pills.map((x, i) => <Chip key={i} color={x.color}>{x.label}</Chip>)}
          </div>

          {/* tab bar + range toggle */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {TABS.map(t => (
                <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabBtn>
              ))}
            </div>
            {/* The old fixed BBE range toggle lived here and forced EV Log into
                batted-ball mode, hiding its own Games / Batted-balls control.
                EV Log owns its window now — one control, in the panel it
                belongs to. */}
            {tab !== 'overview' && detailState === 'loading' && (
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>Loading detail…</span>
            )}
            {tab !== 'overview' && (detailState === 'missing' || detailState === 'error') && (
              <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT }}>
                No detail file published for this hitter
              </span>
            )}
          </div>

          {/* overview */}
          {tab === 'overview' && (
            <>
              {/* The prop hero leads — the thing you came to check. Stats
                  grid below it is the supporting evidence, not the opener. */}
              <ThresholdGrid playerId={pid} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '8px 0 4px' }}>Model Scores</div>
                  <Row label="HR Score"  value={hrScore(p).toFixed(1)} />
                  <Row label="HRR Score" value={prodScore(p).toFixed(1)} />
                  <Row label="Hit Score" value={hitScore(p).toFixed(1)} />
                  <Row label="TB Score"  value={tbScore(p).toFixed(1)} />
                  <Row label="Pitch Mix" value={pitchMixScore(p).toFixed(1)} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '8px 0 4px' }}>Batted Ball</div>
                  <Row label="Avg EV"       value={avgEV(p) ? avgEV(p).toFixed(1) + ' mph' : '—'} />
                  <Row label="Max EV"       value={maxEV(p) ? maxEV(p).toFixed(1) + ' mph' : '—'} />
                  <Row label="Barrel %"     value={pct(barrelRate(p))} />
                  <Row label="Hard Hit %"   value={pct(hardHitRate(p))} />
                  <Row label="Launch Angle" value={launchAngle(p) ? launchAngle(p).toFixed(1) + '°' : '—'} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Recent Distance</div>
                  <Row label="350+ count" value={recent350(p)} />
                  <Row label="375+ count" value={recent375(p)} />
                  <Row label="400+ count" value={recent400(p)} />
                  <Row label="Ideal HR %" value={ihrVal(p) ? (ihrVal(p) * 100).toFixed(1) + '%' : '—'} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Season</div>
                  <Row label="AVG"    value={clean(p?.season_avg, '—')} />
                  <Row label="HR"     value={clean(p?.season_hr, '—')} />
                  <Row label="PA"     value={clean(p?.season_pa || p?.pa, '—')} />
                  <Row label="K Rate" value={pct(p?.season_k_rate)} />
                  {b > 0 && <Row label="BABIP" value={b.toFixed(3)} />}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Splits</div>
                  {avgVsRHP(p) > 0 && <Row label="vs RHP" value={avgVsRHP(p).toFixed(3)} />}
                  {avgVsLHP(p) > 0 && <Row label="vs LHP" value={avgVsLHP(p).toFixed(3)} />}
                  <Row label="L5 Hits" value={n(p?.last5_hits, 0)} />
                  <Row label="L5 HR"   value={n(p?.last5_hr, 0)} />
                  <Row label="L5 XBH"  value={n(p?.last5_xbh, 0)} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '14px 0 4px' }}>Opposing Pitcher</div>
                  <Row label="Name"   value={clean(p?.pitcher_name, '—')} mono={false} />
                  <Row label="Throws" value={clean(p?.pitcher_throws, '—')} />
                  <Row label="HR/9"   value={sc(p?.pitcher_hr9)} />
                  <Row label="WHIP"   value={sc(p?.pitcher_whip)} />
                  {weakSide && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 11, color: C.text3 }}>Weak Side</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: NUM_FONT, color: matchesWeak ? C.orange : C.text }}>
                        {weakLabel}{matchesWeak ? ' ✓' : ''}
                      </span>
                    </div>
                  )}
                  {pb > 0 && <Row label="P-BABIP" value={pb.toFixed(3)} />}
                </div>
              </div>
              {clean(p?.note || p?.summary, '') !== '—' && clean(p?.note || p?.summary, '') !== '' && (
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                  {clean(p?.note || p?.summary)}
                </div>
              )}
              {/* Your own words, this device only — the read you had on him
                  three days ago that no stat column remembers. */}
              <PlayerNotes playerId={pid} />
            </>
          )}

          {/* ev log — `p` is the merged slate row + detail file */}
          {tab === 'ev' && (
            detailState === 'loading'
              ? <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading batted balls…</div>
              : <EVLog player={p} />
          )}

          {/* the arm he's facing */}
          {tab === 'pitcher' && <MatchupPitcher player={p} slateMode={slateMode} />}

          {/* what this batter does to each pitch type */}
          {tab === 'pitch' && (
            detailState === 'loading'
              ? <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading pitch profile…</div>
              : (
                <>
                  <PitchBreakdown player={p} />
                  {/* Which pitches he actually homers off, against tonight's
                      mix. The one panel that crosses batter and pitcher, so it
                      belongs under the batter's pitch table rather than in a
                      third place. */}
                  <HRPitchProfile player={p} slateMode={slateMode} />
                </>
              )
          )}

          {/* where he puts the ball */}
          {tab === 'spray' && <SprayField player={p} height={340} slateMode={slateMode} />}

          {/* day/night, home/away, day of week, win/loss — bot-published, plus
              the situational block pulled live from the MLB StatsAPI: RISP,
              ahead-in-count, two-strike, home/away ISO. Those four aren't in
              any bot file, which is why this is the one place the site goes to
              an outside source. Context only — none of it moves a score. */}
          {tab === 'splits' && (
            <>
              {/* The head-to-head leads the tab — it's the split everyone
                  asks for first, so it goes first, wearing its sample-size
                  caveat instead of hiding. */}
              <BvP batterId={pid} pitcherId={p?.pitcher_id} pitcherName={p?.pitcher_name} />
              <PlayerSplits player={p} slateMode={slateMode} />
              <SituationalSplits playerId={pid} kind="batter" />
            </>
          )}

          {/* hot zone map */}
          {tab === 'zones' && (
            <HotZoneMap
              player={p}
              slateMode={slateMode}
              onClose={null}
            />
          )}

    </Shell>
  )
}
