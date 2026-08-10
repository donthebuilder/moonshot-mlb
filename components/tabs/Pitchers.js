'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { penStatsFor, fetchPenFatigue, penTier } from '../../lib/bullpen'
import { teamAbbrs } from '../../lib/gamelogs'
import { groupPitchers } from '../../lib/data'
import { n, clean } from '../../lib/player'
import { pitcherOverall } from '../../lib/scoring_additions'
import { PanelTitle, Empty, Chip, btnStyle, Band } from '../ui'
import { rankArms } from '../../lib/armLeak'
import DenseTable from '../DenseTable'
import PitcherSpots from '../PitcherSpots'
import PitcherProfile from '../PitcherProfile'
import PitcherModal from '../PitcherModal'

// Rates arrive as 0–1 fractions; show them as percentages so a 0.38 fly-ball
// rate reads as 38.0 next to the ERA and WHIP columns instead of as 0.
const PCT = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? (x * 100).toFixed(1) : '—'
}

const SORTS = [
  ['weak', 'Most Weak Spots'],
  ['hr9', 'Highest HR/9'],
  ['whip', 'Highest WHIP'],
  ['time', 'Game Time'],
]

function sortPitchers(pitchers, sortKey) {
  const list = [...pitchers]
  if (sortKey === 'weak') return list.sort((a, b) => b.weak_spot_count - a.weak_spot_count)
  if (sortKey === 'hr9') return list.sort((a, b) => (b.pitcher_hr9 ?? -1) - (a.pitcher_hr9 ?? -1))
  if (sortKey === 'whip') return list.sort((a, b) => (b.pitcher_whip ?? -1) - (a.pitcher_whip ?? -1))
  return list.sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}

// 🚪 BULLPEN BOARD (audit #5, 2026-08-08). The starter table above answers
// "who starts weak"; this answers the OTHER six innings — which pens on
// tonight's slate leak homers (season reliever-only HR/9, sitCodes=rp, the
// verified split behind penStatsFor) and which ones come in already tired
// (yesterday's workload). Both live-API context lanes; nothing here scores.
//
// USABILITY PASS 2026-08-09 ("make it more usable"): the board was a ranked
// bar and a fatigue tag, with no answer to "whose pen is this playing
// against tonight", no way to reorder it, and no way to get from a row to
// the game it belongs to. All three are here now.
//
// NOT here, deliberately: the pen's team RECORD. Nothing in the slate payload
// carries team wins/losses — the closest fields are per-pitcher season lines —
// and a record is exactly the kind of number that would be trivial to
// approximate and wrong. The caption says the pen's real workload numbers
// instead, which are measured.
function BullpenBoard({ pitchers, onTeamClick }) {
  const [pen, setPen] = useState(null)          // ABBR → {hr9, hr, ip}
  const [fatByAbbr, setFatByAbbr] = useState(null)
  const [open, setOpen] = useState(false)
  const [sortKey, setSortKey] = useState('hr9') // hr9 | fatigue

  useEffect(() => {
    penStatsFor().then((m) => setPen(m)).catch(() => {})
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([fat, abbrs]) => {
      const m = {}
      Object.entries(fat || {}).forEach(([tid, t]) => {
        const ab = abbrs?.[tid]
        if (ab) m[String(ab).toUpperCase()] = t
      })
      setFatByAbbr(m)
    }).catch(() => {})
  }, [])

  // WHO THEY FACE. Every grouped starter carries his own team and his
  // opponent, so both directions of each matchup are already on the page —
  // the pen board just never used them. opp[TEAM] = the club its relievers
  // will be pitching to tonight; arm[TEAM] = that club's own starter, which
  // is the row's click target.
  const { oppOfTeam, starterOfTeam } = useMemo(() => {
    const oppMap = {}
    const armMap = {}
    pitchers.forEach((p) => {
      const t = String(p.team || '').toUpperCase()
      const o = String(p.opponent_team || '').toUpperCase()
      if (t && o) { oppMap[t] = o; oppMap[o] = t }
      if (t) armMap[t] = p
    })
    return { oppOfTeam: oppMap, starterOfTeam: armMap }
  }, [pitchers])

  const rows = useMemo(() => {
    if (!pen) return []
    const tonight = new Set()
    pitchers.forEach((p) => {
      [p.team, p.opponent_team].forEach((t) => t && tonight.add(String(t).toUpperCase()))
    })
    const built = [...tonight]
      .map((ab) => ({ ab, st: pen.get(ab), tier: penTier(fatByAbbr?.[ab]), fat: fatByAbbr?.[ab] }))
      .filter((r) => r.st?.hr9 != null)
    if (sortKey === 'fatigue') {
      // Heaviest yesterday first; pens with no workload logged sink, because
      // "no data" and "fresh" are not the same claim and shouldn't share a slot.
      return built.sort((a, b) =>
        (b.fat?.pitches ?? -1) - (a.fat?.pitches ?? -1)
        || (b.fat?.used ?? -1) - (a.fat?.used ?? -1)
        || b.st.hr9 - a.st.hr9)
    }
    return built.sort((a, b) => b.st.hr9 - a.st.hr9)
  }, [pen, fatByAbbr, pitchers, sortKey])

  if (!rows.length) return null
  const shown = open ? rows : rows.slice(0, 8)
  const worst = Math.max(...rows.map((r) => r.st.hr9), 0.01)
  const anyFatigue = rows.some((r) => r.fat)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(248,113,113,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>🚪 Bullpen board</span>
        <span style={{ fontSize: 9.5, color: C.text3, flex: '1 1 220px', minWidth: 0 }}>
          the other six innings — whose pen, who they face, and how hard they worked yesterday
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sort</span>
          {[['hr9', 'HR/9'], ['fatigue', 'Fatigue']].map(([k, label]) => (
            <button key={k} onClick={() => setSortKey(k)}
              disabled={k === 'fatigue' && !anyFatigue}
              title={k === 'fatigue'
                ? (anyFatigue ? "Heaviest reliever workload yesterday first. Pens with nothing logged sink — no data isn't the same claim as fresh."
                  : 'No reliever workload logged for yesterday, so there is nothing to sort by')
                : 'Season reliever-only HR/9, leakiest first'}
              style={{
                padding: '2px 9px', borderRadius: 6, fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT,
                cursor: k === 'fatigue' && !anyFatigue ? 'not-allowed' : 'pointer',
                border: `1px solid ${sortKey === k ? C.orange : C.border}`,
                background: sortKey === k ? 'rgba(249,115,22,.14)' : 'transparent',
                color: k === 'fatigue' && !anyFatigue ? C.text3 : sortKey === k ? C.orange : C.text2,
                opacity: k === 'fatigue' && !anyFatigue ? 0.45 : 1,
              }}>{label}</button>
          ))}
        </div>
      </div>
      {/* SINGLE-COLUMN, RANKED (owner feedback 2026-08-08): the two-column
          grid read as noise — one pen per row, top to bottom, is the list. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {shown.map((r, i) => {
          const opp = oppOfTeam[r.ab] || ''
          const arm = starterOfTeam[r.ab] || null
          const clickable = !!(arm && onTeamClick)
          return (
            <div key={r.ab}
              onClick={clickable ? () => onTeamClick(arm) : undefined}
              title={clickable
                ? `${r.ab} relievers this season: ${r.st.hr} HR in ${r.st.ip} IP (HR/9 ${r.st.hr9.toFixed(2)})${opp ? ` — they pitch to ${opp} tonight` : ''}. Click to open ${arm.pitcher_name}, ${r.ab}'s starter in this game.`
                : `${r.ab} relievers this season: ${r.st.hr} HR in ${r.st.ip} IP — HR/9 ${r.st.hr9.toFixed(2)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '2px 5px', borderRadius: 6,
                cursor: clickable ? 'pointer' : 'default',
                background: clickable ? 'transparent' : 'transparent',
              }}
              onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 16, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, width: 34, flexShrink: 0 }}>{r.ab}</span>
              {/* WHO THEY FACE — the question the board couldn't answer. */}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 46, flexShrink: 0 }}>
                {opp ? `vs ${opp}` : '—'}
              </span>
              <div style={{ flex: '1 1 80px', maxWidth: 190, height: 7, background: C.bg3, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, (100 * r.st.hr9) / worst)}%`, height: '100%',
                  background: r.st.hr9 >= 1.3 ? '#f87171' : r.st.hr9 >= 1.05 ? C.orange : '#4ade80',
                }} />
              </div>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800, width: 38, flexShrink: 0, color: r.st.hr9 >= 1.3 ? '#f87171' : C.text2 }}>
                {r.st.hr9.toFixed(2)}
              </span>
              {/* The raw counts the bar is built from, on the row instead of
                  hidden in a tooltip — a 1.40 on 180 IP and a 1.40 on 40 IP
                  are not the same statement. */}
              <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, width: 82, flexShrink: 0 }}>
                {r.st.hr} HR / {r.st.ip} IP
              </span>
              {r.tier ? (
                <span title={`${r.ab} bullpen yesterday: ${r.fat.used} relievers, ${r.fat.pitches} pitches`}
                  style={{ fontSize: 9, fontWeight: 900, color: r.tier.col, flexShrink: 0 }}>
                  {r.tier.icon} {r.tier.word}
                </span>
              ) : r.fat ? (
                <span title={`${r.ab} bullpen yesterday: ${r.fat.used} relievers, ${r.fat.pitches} pitches — under both fatigue thresholds`}
                  style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
                  {r.fat.used}a / {r.fat.pitches}p
                </span>
              ) : (
                <span title="No reliever workload logged for this club yesterday — an off day, or the boxscore hasn't landed" style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
                  no log
                </span>
              )}
            </div>
          )
        })}
      </div>
      {rows.length > 8 && (
        <button onClick={() => setOpen(!open)} style={{
          marginTop: 6, fontSize: 9.5, fontWeight: 700, cursor: 'pointer', color: C.text3,
          background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 6, padding: '2px 9px',
        }}>{open ? 'show less' : `all ${rows.length} pens`}</button>
      )}
      <div style={{ fontSize: 9, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        Red bar = a pen surrendering 1.30+ HR/9 — the late innings there are a live power window,
        doubly so with a 🥵 tag (they threw heavy yesterday). <b style={{ color: C.text2 }}>vs</b> is who
        those relievers pitch to tonight; click a row to open that club&apos;s own starter.
        {' '}HR/9 is season reliever-only (sitCode rp) and the HR / IP beside it is what the rate is
        built from. <b style={{ color: C.text2 }}>&ldquo;no log&rdquo;</b> means nothing was recorded for
        them yesterday — an off day or a boxscore that hasn&apos;t landed — which is not the same as
        rested, so it is never sorted as if it were. Team records aren&apos;t shown because the slate
        payload doesn&apos;t publish them; everything here is measured. Context lane: this ranks nothing
        else on the site.
      </div>
    </div>
  )
}

function localTime(gameTime) {
  if (!gameTime) return '—'
  const d = new Date(gameTime)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

// Same plain-stat-bar look used by Games.js's bot-view player rows, scaled
// down for HR/9 and WHIP since those don't run 0-100 like the hr/hrr scores.
function StatBar({ label, value, max, color }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ width: 34, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ width: 32, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: NUM_FONT, textAlign: 'right' }}>
        {value == null ? '—' : value.toFixed(2)}
      </span>
    </div>
  )
}

function LineupRow({ b, onPlayerClick }) {
  return (
    <div
      onClick={() => onPlayerClick?.(b.raw)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
        cursor: onPlayerClick ? 'pointer' : 'default',
        borderRadius: 6,
      }}
    >
      <span style={{ width: 18, fontSize: 10, color: C.text3, fontFamily: NUM_FONT, textAlign: 'center', flexShrink: 0 }}>
        {b.lineup_spot ?? '?'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {b.name}
      </span>
      <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{b.bats}HB</span>
      {!b.lineup_confirmed && (
        <span style={{ fontSize: 9, color: C.text3, flexShrink: 0 }}>(proj.)</span>
      )}
      {b.weak_spot_flag && (
        <span title="Weak pitcher spot" style={{ fontSize: 11, flexShrink: 0 }}>⭐</span>
      )}
      {b.pitch_type_match_score > 0 && (
        <span title="Matchup edge" style={{ fontSize: 11, flexShrink: 0 }}>🎯</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, fontFamily: NUM_FONT, width: 28, textAlign: 'right', flexShrink: 0 }}>
        {Math.round(b.hr_score)}
      </span>
    </div>
  )
}

function PitcherCard({ pitcher, isOpen, onToggle, onPlayerClick, onOpenPitcher }) {
  const hasWeak = pitcher.weak_spot_count > 0
  // BAND PERSONALITY (2026-08-07, same language as parks/games): from the
  // HITTER's point of view — a leaky starter is a 🎯 TARGET and burns, a
  // stingy one is a 🔒 WALL and cools. HR/9 + weak spots decide it.
  const hr9 = Number(pitcher.pitcher_hr9) || 0
  const band = (hr9 >= 1.5 || pitcher.weak_spot_count >= 3) ? { icon: '🎯', word: 'TARGET', col: '#f97316' }
    : (hr9 >= 1.2 || pitcher.weak_spot_count >= 1) ? { icon: '🔥', word: 'LEAKY', col: '#fb923c' }
    : hr9 > 0 && hr9 <= 0.85 ? { icon: '🔒', word: 'WALL', col: '#38bdf8' }
    : { icon: '', word: '', col: '' }
  return (
    <div style={{
      background: band.col ? `linear-gradient(160deg, ${band.col}0e 0%, ${C.bg2} 55%)` : C.bg2,
      border: `1px solid ${band.col ? `${band.col}44` : C.border}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 8,
    }}>
      <div
        onClick={() => onToggle(pitcher.pitcher_id)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', cursor: 'pointer', gap: 10, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: C.text3, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', width: 10 }}>▸</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{pitcher.pitcher_name}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{pitcher.pitcher_throws}HP</span>
              {band.word && (
                <span title={band.word === 'WALL'
                  ? 'Stingy: HR/9 ≤ 0.85 — hitters facing him fight uphill tonight'
                  : `From the hitter's side: HR/9 ${hr9 ? hr9.toFixed(2) : '—'}${pitcher.weak_spot_count ? ` + ${pitcher.weak_spot_count} weak spot${pitcher.weak_spot_count > 1 ? 's' : ''}` : ''} — this is an arm to attack`}
                  style={{ fontSize: 8, fontWeight: 900, color: band.col, letterSpacing: '.09em', fontFamily: NUM_FONT }}>
                  {band.icon} {band.word}
                </span>
              )}
              {hasWeak && <Chip color="#f59e0b">⭐ {pitcher.weak_spot_count} weak spot{pitcher.weak_spot_count > 1 ? 's' : ''}</Chip>}
            </div>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
              {pitcher.team} vs {pitcher.opponent_team} · {localTime(pitcher.game_time)}
              {pitcher.venue_name ? ` · ${pitcher.venue_name}` : ''}
              {' · '}{pitcher.lineup_confirmed ? 'Lineup confirmed' : 'Projected lineup'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPitcher?.(pitcher) }}
            style={{
              padding: '4px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6,
              cursor: 'pointer', border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text3, whiteSpace: 'nowrap',
            }}
          >Open card</button>
          <div style={{ minWidth: 130 }}>
            <StatBar label="ERA" value={pitcher.pitcher_era} max={6} color={C.cyan} />
            <StatBar label="HR/9" value={pitcher.pitcher_hr9} max={3} color={C.orange} />
            <StatBar label="WHIP" value={pitcher.pitcher_whip} max={2} color={C.purple} />
          </div>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${C.border}` }}>
          {/* Spot-by-spot first. The plain row list underneath is the roster;
              this is the question you actually opened the card to answer. */}
          <PitcherSpots pitcher={pitcher} onPlayerClick={onPlayerClick} />
          <PitcherProfile pitcher={pitcher} />

          <div style={{ fontSize: 9, color: C.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 4px' }}>
            Opposing Lineup ({pitcher.lineup.length})
          </div>
          {pitcher.lineup.map((b) => (
            <LineupRow key={b.player_id ?? b.name} b={b} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Pitchers({ players, onPlayerClick }) {
  const [sortKey, setSortKey] = useState('weak')
  const [openId, setOpenId] = useState(null)
  const [modalPitcher, setModalPitcher] = useState(null)
  const [colGroup, setColGroup] = useState('core')

  const pitchers = useMemo(() => groupPitchers(players), [players])
  const sorted = useMemo(() => sortPitchers(pitchers, sortKey), [pitchers, sortKey])
  const tableRef = useRef(null)

  if (!pitchers.length) return <Empty text="No pitcher data found yet." />

  // THE WORKBENCH (2026-08-08 redesign — "lazy and unusable" no more). The
  // old verdict was 3+3 bare names in two boxes: it told you WHO but never
  // WITH WHAT. Every pitcher entry from groupPitchers already carries his
  // full opposing lineup, so each attack card now answers the page's real
  // question in one glance: this arm, his leak numbers, and the three bats
  // best equipped to punish him tonight — clickable, straight to the hitter.
  // ── ONE NUMBER FOR "HOW ATTACKABLE IS THIS ARM" (2026-08-09) ────────────
  //
  // The site was carrying two, and they disagreed. Home ranked the weakest
  // arms with lib/armLeak (eight published fields, ranked against tonight's
  // other starters); this page ranked them with pitcherOverall (a 70/30
  // season-and-recent blend of a narrower set). Same question, two answers,
  // no explanation of the difference anywhere — which is the kind of thing
  // that quietly costs trust on a site whose whole pitch is that the numbers
  // are explainable.
  //
  // armLeak wins the headline because it is the better answer to THIS
  // question: it carries the park the man is pitching in, tonight's contact
  // quality against him, and his velocity against his own baseline, and it
  // names the two terms driving each ranking. pitcherOverall survives as the
  // table's Overall column, where it's labelled as what it is — a season and
  // recent-form blend, a different lens rather than a rival verdict.
  const leaks = rankArms(players)
  const leakBy = new Map(leaks.map((a) => [a.name, a]))
  const byOverall = [...pitchers]
    .map((p) => ({
      p,
      ov: pitcherOverall(p.lineup?.[0]?.raw || {}),
      leak: leakBy.get(p.pitcher_name) || null,
    }))
    .filter((x) => x.ov > 0 || x.leak)
    // Leak score leads; the old blend only breaks ties for arms the leak
    // ranker couldn't score (too few published fields on a thin slate).
    .sort((a, b) => (b.leak?.leak ?? -1) - (a.leak?.leak ?? -1) || b.ov - a.ov)
  const targets = byOverall.slice(0, 3)
  const avoids = byOverall.slice(-3).reverse()
  const topBats = (p, k = 3) => [...(p.lineup || [])].sort((a, b) => b.hr_score - a.hr_score).slice(0, k)

  return (
    <div>
      <PanelTitle
        title="Pitchers"
        sub={`${pitchers.length} starters ranked by leak score — who to attack, with which bats`}
        right={
          <button
            onClick={() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={btnStyle(C.cyan, false)}
          >↓ Full starter table</button>
        }
      />

      {/* ── ATTACK CARDS — the arm, his leaks, and the bats to do it with ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {targets.map(({ p, ov, leak }, i) => (
          <div key={p.pitcher_id ?? p.pitcher_name} style={{
            flex: '1 1 280px', minWidth: 0,
            background: `linear-gradient(160deg, rgba(249,115,22,${i === 0 ? '.14' : '.09'}), ${C.bg2} 60%)`,
            border: `1px solid rgba(249,115,22,${i === 0 ? '.55' : '.35'})`,
            borderRadius: 13, padding: '10px 13px',
            boxShadow: i === 0 ? '0 0 18px rgba(249,115,22,.14)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 900, color: C.orange, letterSpacing: '.09em', fontFamily: NUM_FONT, flexShrink: 0 }}>
                🎯 ATTACK #{i + 1}
              </span>
              <span
                title={leak
                  ? `Leak score ${leak.leak}/100 — ranked against tonight's ${leaks.length} starters only, not the league. Built from ${leak.scoredOn} published fields: ${leak.terms.map((t) => `${t.label} ${t.text}`).join(' · ')}.${leak.thin ? ' Small Statcast sample behind the contact-quality terms.' : ''} The same number the Home page ranks arms with.`
                  : "Season and recent-form blend — this arm didn't carry enough published fields for the leak score."}
                style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 900, color: C.orange, fontFamily: NUM_FONT, flexShrink: 0, cursor: 'help' }}>
                {leak ? leak.leak : ov.toFixed(0)}{leak?.thin ? '·' : ''}
              </span>
            </div>
            <div onClick={() => setModalPitcher(p)} style={{ cursor: 'pointer', marginTop: 3 }}>
              <span style={{ fontSize: 14.5, fontWeight: 800 }}>{p.pitcher_name}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginLeft: 6 }}>{p.pitcher_throws}HP · {p.team} vs {p.opponent_team} · {localTime(p.game_time)}</span>
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 4, fontFamily: NUM_FONT, fontSize: 10 }}>
              <span title="HR allowed per nine — the leak" style={{ color: n(p.pitcher_hr9, 0) >= 1.3 ? C.orange : C.text2, fontWeight: 800 }}>HR/9 {n(p.pitcher_hr9, 0).toFixed(2)}</span>
              <span style={{ color: C.text3 }}>ERA {n(p.pitcher_era, 0).toFixed(2)}</span>
              <span style={{ color: C.text3 }}>WHIP {n(p.pitcher_whip, 0).toFixed(2)}</span>
              {p.weak_spot_count > 0 && <span title="Weak lineup spots the opposing order fills tonight" style={{ color: '#FCD34D', fontWeight: 800 }}>★{p.weak_spot_count} weak spot{p.weak_spot_count > 1 ? 's' : ''}</span>}
              {!p.lineup_confirmed && <span style={{ color: C.text3 }}>◻ proj. lineup</span>}
            </div>
            {leak?.drivers?.length > 0 && (
              <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 3 }}
                title="The two terms carrying his leak score tonight — hover the number above for the full breakdown.">
                worst on: {leak.drivers.map((d) => `${d.label} ${d.text}`).join(' · ')}
              </div>
            )}
            {/* the point of the card: attack WITH these bats */}
            <div style={{ marginTop: 7, paddingTop: 6, borderTop: '1px solid rgba(249,115,22,.2)' }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 4 }}>Attack with</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {topBats(p).map((b) => (
                  <button key={b.player_id ?? b.name} onClick={() => onPlayerClick?.(b.raw)}
                    title={`${b.name} — HR score ${Math.round(b.hr_score)}${b.weak_spot_flag ? ' · sits in a weak spot for this arm' : ''}`}
                    style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 5, cursor: 'pointer', minWidth: 0,
                      background: C.bg3, border: `1px solid ${b.weak_spot_flag ? 'rgba(252,211,77,.5)' : C.border2}`,
                      borderRadius: 8, padding: '3px 9px',
                    }}>
                    <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{b.lineup_spot ?? '·'}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(b.name || '').split(' ').slice(-1)[0]}</span>
                    {b.weak_spot_flag && <span style={{ fontSize: 9 }}>⭐</span>}
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: C.orange, fontFamily: NUM_FONT }}>{Math.round(b.hr_score)}</span>
                  </button>
                ))}
                {!p.lineup?.length && <span style={{ fontSize: 9.5, color: C.text3 }}>no opposing bats on the slate yet</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── STAY AWAY — one compact strip, not a twin box of dead space ── */}
      {avoids.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 12,
        }}>
          {avoids.map(({ p, ov, leak }) => {
            const best = topBats(p, 1)[0]
            return (
              <div key={p.pitcher_id ?? p.pitcher_name} style={{
                flex: '1 1 220px', minWidth: 0,
                background: 'linear-gradient(160deg, rgba(96,165,250,.08), transparent 65%)',
                border: '1px solid rgba(96,165,250,.3)', borderRadius: 11, padding: '7px 11px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 900, color: '#60a5fa', letterSpacing: '.08em', fontFamily: NUM_FONT, flexShrink: 0 }}>🧊 STAY AWAY</span>
                  <span
                    title={leak ? `Leak score ${leak.leak}/100 against tonight's starters — the same scale the attack cards use.` : 'Season and recent-form blend.'}
                    style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: '#60a5fa', fontFamily: NUM_FONT, cursor: 'help' }}>
                    {leak ? leak.leak : ov.toFixed(0)}
                  </span>
                </div>
                <div onClick={() => setModalPitcher(p)} style={{ cursor: 'pointer', marginTop: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>{p.pitcher_name}</span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginLeft: 5 }}>{p.team} vs {p.opponent_team} · HR/9 {n(p.pitcher_hr9, 0).toFixed(2)} · ERA {n(p.pitcher_era, 0).toFixed(2)}</span>
                </div>
                {best && (
                  <div style={{ fontSize: 9, color: C.text3, marginTop: 3 }}>
                    If you must:{' '}
                    <span onClick={() => onPlayerClick?.(best.raw)} style={{ color: C.text2, fontWeight: 700, cursor: 'pointer' }}>
                      {best.name} <b style={{ fontFamily: NUM_FONT, color: '#60a5fa' }}>{Math.round(best.hr_score)}</b>
                    </span>
                    {' '}is his lineup&apos;s best-armed bat.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <BullpenBoard
        pitchers={pitchers}
        onTeamClick={(p) => {
          // A pen row is a team; the way into that team's game from here is
          // its own starter's card, which carries the matchup, the lineup and
          // the arsenal. Scroll the table into view behind the modal so
          // closing it leaves you somewhere sensible rather than back at the top.
          tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          setModalPitcher(p)
        }}
      />

      {/* Column groups — the other half of the usability fix. Thirty columns
          at once was a wall; each group is one question. */}
      <div ref={tableRef} style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center', scrollMarginTop: 130 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Columns</span>
        {[['core', 'Core'], ['recent', 'Recent form'], ['bot', 'Bot scores'], ['bb', 'Batted ball'], ['all', 'Everything']].map(([k, label]) => (
          <button key={k} onClick={() => setColGroup(k)} style={{
            padding: '3px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
            border: `1px solid ${colGroup === k ? C.orange : C.border}`,
            background: colGroup === k ? 'rgba(249,115,22,.12)' : 'transparent',
            color: colGroup === k ? C.orange : C.text3,
          }}>{label}</button>
        ))}
      </div>
      {/* The card list below is one starter at a time. This is the slate:
          which arms are actually attackable, and on which axis. */}
      {/* One sortable table of EVERY starter, replacing the old "most
          attackable" heatmap. That heatmap showed the top 15 and the card list
          below it showed all 28 — the same starters twice, with the top of one
          list also being the top of the other. This does the heatmap's job
          (scan the slate, sort on whatever you care about) without being a
          second copy of the thing underneath it.

          L3 columns are the addition: pitcher_l3_era, _l3_whip, _l3_hr9 and
          _l3_starts_found are on 143 of 143 slate rows. Season K/9 is here too
          — there is no L3 K/9 published, so it isn't invented. */}
      <DenseTable
        rows={(() => {
        const built = sorted.map((p) => {
          const src = (k) => {
            for (const b of p.lineup || []) {
              const v = b?.raw?.[k]
              if (v !== null && v !== undefined && v !== '') return v
            }
            return null
          }
          return {
            _key: p.pitcher_id ?? p.pitcher_name,
            _raw: p,
            name: `${p.pitcher_name}${(p.lineup || []).some((x) => x?.raw?.pitcher_projected) ? ' ≈' : ''}`,
            t: p.pitcher_throws,
            tm: p.team,
            vs: p.opponent_team,
            era: n(p.pitcher_era, null),
            whip: n(p.pitcher_whip, null),
            hr9: n(p.pitcher_hr9, null),
            k9: n(src('pitcher_k9'), null),
            l3era: n(src('pitcher_l3_era'), null),
            l3whip: n(src('pitcher_l3_whip'), null),
            l3hr9: n(src('pitcher_l3_hr9'), null),
            l3n: n(src('pitcher_l3_starts_found'), 0),
            trend: clean(src('pitcher_trend_direction'), ''),
            // The bot's own pitcher scoring. All five are on 268/268 slate rows
            // and none of them were shown anywhere on this board.
            attack: n(src('pitcher_attack_score'), null),
            attackTag: clean(src('pitcher_attack_tag'), ''),
            wsScore: n(src('pitcher_weak_side_score'), null),
            spotDmg: n(src('pitcher_spot_damage_score'), null),
            zoneDmg: n(src('pitcher_zone_damage_score'), null),
            lowK: src('pitcher_low_k_flag') === true ? 1 : 0,
            overall: pitcherOverall(p.lineup?.[0]?.raw || {}),
            // The attack tag as three flags instead of a sentence — see the
            // column block below for why.
            gbTrap: /GB\/TRAP/i.test(clean(src('pitcher_attack_tag'), '')) ? 1 : 0,
            hardCon: /HARD CONTACT/i.test(clean(src('pitcher_attack_tag'), '')) ? 1 : 0,
            weakSide: clean(p.pitcher_weak_side, ''),
            spots: p.weak_spot_count,
            conf: p.lineup_confirmed ? 1 : 0,

            // BATTED BALL ALLOWED. All four verified on 268 of 268 slate rows
            // and none of them were on this board before. For a home-run site
            // these are closer to the point than ERA is: fly balls are the only
            // batted ball that leaves the yard, and hard-hit and barrel rate are
            // what separates a fly ball from a can of corn.
            //
            // WHAT IS MISSING, and it matters: pitcher_gb_rate, pitcher_ld_rate
            // and pitcher_popup_rate are published as 0 on all 268 rows. The
            // only GB/LD/popup fields with real values in the payload are
            // l25pa_gb_rate and friends, which are the HITTER's last-25-PA
            // rates, not the pitcher's. Using those here would be silently
            // wrong, so the ground-ball and line-drive columns are simply not
            // built. See BOT-DATA-REQUESTS.md — this is a bot-side fix.
            // Docket #20 calibrated fields — null until the bot's xHR machine
            // publishes; the columns only appear once they carry values.
            xallowed: n(src('pitcher_xhr_allowed'), null) || null,
            xluck: (() => { const v = n(src('pitcher_hr_luck'), null); return v === 0 ? null : v })(),
            fb: n(src('pitcher_fb_rate'), null),
            fbSc: n(src('pitcher_statcast_fb_rate'), null),
            hh: n(src('pitcher_hardhit_allowed'), null),
            brl: n(src('pitcher_barrel_allowed'), null),
            hrfb: n(src('pitcher_hr_fb_pct'), null),
            pullAir: n(src('pitcher_pullair_allowed_pct'), null),
            // XBH allowed comes split by batter hand; the total is what the
            // column shows, and the two sides stay available in the modal.
            xbh: (() => {
              const l = n(src('pitcher_xbh_vs_lhb'), null)
              const r = n(src('pitcher_xbh_vs_rhb'), null)
              if (l == null && r == null) return null
              return (l || 0) + (r || 0)
            })(),
          }
        })
        // HR LUCK (2026-08-06, from the expected-vs-actual teardown): rank
        // every starter on the slate by the LOUDNESS of contact he allows
        // (barrel + hard-hit + pull-air + fly-ball, equal parts of what's
        // present) and by his actual HR/9, both as slate percentiles. The gap
        // is the luck read: allowed loud contact but few homers so far =
        // "lucky", the regression bet says TARGET him; homers without loud
        // contact = "unlucky", his HR/9 overstates him. Published fields
        // only, no expected-HR model — a pointer, not a projection.
        const pct = (arr, v) => {
          const xs = arr.filter((x) => x != null).sort((a, b) => a - b)
          if (v == null || !xs.length) return null
          let i = 0; while (i < xs.length && xs[i] <= v) i++
          return i / xs.length
        }
        const damage = (r) => {
          const parts = [
            pct(built.map((x) => x.brl), r.brl),
            pct(built.map((x) => x.hh), r.hh),
            pct(built.map((x) => x.pullAir), r.pullAir),
            pct(built.map((x) => x.fb), r.fb),
          ].filter((x) => x != null)
          return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null
        }
        built.forEach((r) => {
          const d = damage(r)
          const h = pct(built.map((x) => x.hr9), r.hr9)
          r.luck = d != null && h != null ? Math.round((d - h) * 100) : null
        })
        return built
        })()}
        columns={(() => {
          // Calibrated xHR columns appear on their own once the bot publishes
          // (docket #20) — until then they'd be a blank stripe, so they don't.
          const hasX = sorted.some((p) => (p.lineup || []).some((b) => Number(b?.raw?.pitcher_xhr_bbe) >= 50))
          // Column groups. 'core' answers tonight; the rest are drill-ins.
          const GROUPS = {
            core:   ['name','t','tm','vs','weakSide','trend','gbTrap','hardCon','lowK','conf','overall','hr9',...(hasX ? ['xallowed','xluck'] : ['luck']),'era','whip','spots'],
            recent: ['name','tm','vs','overall','l3hr9','l3era','l3whip','l3n','trend'],
            bot:    ['name','tm','vs','overall','attack','wsScore','zoneDmg','spotDmg','spots','gbTrap','hardCon','lowK'],
            bb:     ['name','tm','vs','overall','fb','fbSc','hh','brl','hrfb','pullAir','xbh','k9',...(hasX ? ['xallowed','xluck'] : ['luck'])],
          }
          const all = [
          // LAYOUT RULE: every text column first, every number after, nothing
          // interleaved. The table had Trend and Weak side sitting between
          // numeric columns, which breaks the eye's run down a block of digits
          // and makes the whole row harder to scan than it needs to be.
          { key: 'name',   label: 'Starter', heat: false, w: 148, bold: true, sticky: true },
          { key: 't',      label: 'T',   heat: false, w: 24, mono: true, dim: true },
          { key: 'tm',     label: 'Tm',  heat: false, w: 32, mono: true, dim: true },
          { key: 'vs',     label: 'vs',  heat: false, w: 32, mono: true, dim: true },
          { key: 'weakSide', label: 'Weak', heat: false, w: 44, mono: true, dim: true,
            title: 'The side this pitcher struggles against' },
          { key: 'trend',  label: 'Trend', heat: false, w: 58, dim: true },
          // Flags, as dots. The attack tag used to print "🧊 GB/TRAP" and
          // "⚠️ HARD CONTACT" as words in a 104px column — three values wearing
          // a lot of width, and the emoji made every row look busy. As dots
          // they scan instantly and sort like the booleans they are.
          { key: 'gbTrap', label: 'GB',  flag: true, mark: '●', w: 30,
            title: 'Bot tag: ground-ball / trap profile' },
          { key: 'hardCon', label: 'HRD', flag: true, mark: '●', w: 32,
            title: 'Bot tag: gives up hard contact' },
          { key: 'lowK',   label: 'LoK', flag: true, mark: '●', w: 32,
            title: 'Bot’s low-strikeout flag — fires on 98 of 268, so it’s common' },
          { key: 'conf',   label: 'LU',  flag: true, mark: '●', w: 28,
            title: 'Lineup confirmed' },
          // ── numbers from here down, uninterrupted ──
          { key: 'overall', label: 'Overall', w: 58, dp: 0,
            title: 'A SECOND LENS, not the headline. Blended attackability: HR/9 30%, attack 25%, zone damage 20%, weak side 15%, minus swinging-strike 10%, weighted 70% season / 30% recent form. The cards above rank on the LEAK SCORE instead (lib/armLeak) — eight published fields ranked against tonight\'s other starters, including the park and tonight\'s contact quality, which this column has no view of. Both unvalidated: none of these inputs has reached the graded archive.' },
          { key: 'hr9',    label: 'HR/9', w: 46, dp: 2 },
          { key: 'xallowed', label: 'xHR', w: 48, dp: 1,
            title: 'Expected homers allowed from the contact he\'s actually given up — the bot\'s league (EV, LA) table, no park or weather. Compare with his real HR total.' },
          { key: 'xluck', label: 'HR luck', w: 54, dp: 1, invert: true,
            title: 'Actual HRs allowed minus expected-from-contact. NEGATIVE = fewer homers than his contact deserved — the "lucky" arm, and the regression bet says target him. Positive = he\'s paid more than the contact warranted. Calibrated (docket #20), replaces the old percentile pointer.' },
          { key: 'luck',   label: 'HR luck', w: 54, dp: 0,
            title: 'Loudness of contact allowed (barrel/HH/pull-air/FB percentiles) minus HR/9 percentile, both within tonight\'s slate. POSITIVE = loud contact but few homers paid so far — the "lucky" arm, and the regression bet says target him. Negative = his HR/9 overstates the damage he actually allows. A pointer, not a projection.' },
          { key: 'era',    label: 'ERA', w: 44, dp: 2 },
          { key: 'whip',   label: 'WHIP', w: 46, dp: 2 },
          { key: 'k9',     label: 'K/9', w: 44, dp: 1, invert: true,
            title: 'Season strikeouts per nine. Inverted — a high K/9 is bad for the hitter.' },
          { key: 'l3hr9',  label: 'L3 HR/9', w: 54, dp: 2,
            title: 'Last three starts. Small by construction — check the L3 GS column.' },
          { key: 'l3era',  label: 'L3 ERA', w: 50, dp: 2 },
          { key: 'l3whip', label: 'L3 WHIP', w: 54, dp: 2 },
          { key: 'l3n',    label: 'L3 GS', w: 44,
            title: 'How many recent starts the L3 numbers actually found. Under 3 and they are thinner than they look.' },
          { key: 'attack', label: 'Attack', w: 52, dp: 0,
            title: 'The bot’s attack score. Range on tonight’s slate is 0–54, median 19 — so 30+ is genuinely high, not middling.' },
          { key: 'wsScore', label: 'Weak side', w: 58, dp: 0,
            title: 'How exploitable his platoon split is. 0–90 on tonight’s slate.' },
          { key: 'zoneDmg', label: 'Zone dmg', w: 58, dp: 0,
            title: 'Damage he allows by order third — pooled, so sturdier than the per-spot number' },
          { key: 'spotDmg', label: 'Spot dmg', w: 56, dp: 0,
            title: 'Damage by individual lineup spot. Thin by construction.' },
          { key: 'spots',  label: '★ Spots', w: 52,
            title: 'Weak lineup spots he faces tonight' },

          // Batted ball allowed. Grouped at the end so the bot-score block
          // above stays one uninterrupted run of numbers.
          { key: 'fb',     label: 'FB%', w: 46, fmt: PCT,
            title: 'Fly-ball rate allowed, season. The only batted ball that can leave the yard — slate mean is 38%.' },
          { key: 'fbSc',   label: 'FB% sc', w: 54, fmt: PCT,
            title: 'Statcast fly-ball rate allowed. Classified from launch angle rather than scorer judgement, so it reads a few points lower than FB% — slate mean 34%.' },
          { key: 'hh',     label: 'HH%', w: 46, fmt: PCT,
            title: 'Hard-hit rate allowed — share of batted balls at 95+ mph. Slate mean 38%.' },
          { key: 'brl',    label: 'Brl%', w: 48, fmt: PCT,
            title: 'Barrel rate allowed. The single best contact-quality signal for home runs. Slate mean 7%.' },
          { key: 'hrfb',   label: 'HR/FB', w: 52, fmt: PCT,
            title: 'Share of his fly balls that left the yard. Slate mean 10%. Noisy year to year — a high number is as often park and luck as it is the arm.' },
          { key: 'pullAir', label: 'Pull air', w: 54, fmt: PCT,
            title: 'Pulled air contact allowed. Pulled fly balls are where the short porch lives.' },
          { key: 'xbh',    label: 'XBH', w: 44, dp: 0,
            title: 'Extra-base hits allowed this season, both batter sides combined. A count, not a rate — it scales with innings pitched, so read it next to ERA rather than alone.' },
        ]
          if (colGroup === 'all') return all
          const keep = new Set(GROUPS[colGroup] || GROUPS.core)
          return all.filter((c) => keep.has(c.key))
        })()}
        onRowClick={(p) => setModalPitcher(p)}
        initialSort="hr9"
        maxHeight={420}
        caption="Every starter on the slate, now including the bot's own pitcher scoring — Attack, Weak side, Zone damage and Spot damage, none of which appeared anywhere on this board before. Read Attack against its real range: it runs 0–54 tonight with a median of 19, so a 35 is a strong signal even though it looks low on a 100-point instinct. Bright is good for the hitter throughout, so K/9 is inverted — a high strikeout rate is his strength, not yours. L3 columns are the last three starts and are thin on purpose: three outings is a handful of innings, so read them as a direction rather than a rate, and check L3 GS before trusting them. Click a header to sort, shift-click to add a tiebreaker, a row to open the starter. The batted-ball block at the right is what he actually gives up: fly balls, hard contact, barrels, pulled air and extra-base hits. Ground-ball and line-drive rates are deliberately absent — the bot publishes pitcher_gb_rate and pitcher_ld_rate as zero on all 268 rows, and the only real GB/LD numbers in the payload belong to the hitter, not the arm. Overall now blends 70% season with 30% last-three-starts wherever L3 HR/9 exists, so a starter who has been getting hit lately no longer reads like his April self."
      />

      {/* The per-pitcher accordion card list that lived here is GONE
          (2026-08-05, on feedback: "I wanna use it but it doesn't seem like
          much"). It was a third rendering of the same starters — everything
          it held (weak spots, order-zone damage, arsenal, the vs-side and
          zone reads) lives in the modal a row-click opens, where it's
          organized instead of stacked. One table, one click, one deep view. */}
      <div style={{ fontSize: 10, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
        Click any starter above for the full breakdown — order-zone damage, arsenal, weak spots,
        situational splits and the damage field all live in his card.
      </div>

      {modalPitcher && (
        <PitcherModal
          pitcher={modalPitcher}
          onClose={() => setModalPitcher(null)}
          onPlayerClick={(p) => { setModalPitcher(null); onPlayerClick?.(p) }}
        />
      )}
    </div>
  )
}
