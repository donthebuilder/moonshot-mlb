'use client'
import NflFace from '../NflFace'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'
import DefensesTable from '../DefensesTable'
import Tap from '../../Tap'
import MobileFold from '../../MobileFold'
import { fieldModel, phrase, fmtPct, DEPTHS, SIDES, DEPTH_AX, LANES, LANE_WORD } from '../MatchupMap'
import PageHeader from '../../PageHeader'
import NflTable from '../NflTable'
import SourceSeason from '../SourceSeason'
import SeasonToggle from '../../SeasonToggle'
import useDvpSeason from '../../../lib/nfl/useDvpSeason'
import { MatchupTitle, SubLabel, BarList, FactLines, HeatTiles } from '../../matchup/MatchupParts'
import { softRole, softLine, passRushThreat, blockSeason, PASS_RUSH_AVOID, STARTER_ROLES } from '../../../lib/nfl/dvpSignal'

// Matchups -- the defenses to attack this week, then one defense read the
// way MOONSHOT reads a starter (2026-09-28, Donovan: "the match up page on nfl
// is nice with the data but just doesn't look nice ... I don't like the grid
// background, it's distracting, the last two charts are confusing ... needs to
// be more intuitive"). Built FROM MOONSHOT's Matchups detail
// (components/matchup/MatchupParts, CLAUDE.md: MOONSHOT's components are the
// base): the name line, one lead sentence, labelled bars, plain fact lines,
// a tile grid, then tables. Same data as before, nothing new computed:
//   WHERE THEY GET BEATEN  MatchupMap's twelve zones (fieldModel) as tiles
//   BY POSITION            the DvP table as a DenseTable (value + rank)
//   WHO FITS IT            the players facing them (was the map's chip picker)
// Dropped: the framed "measurement grid" panels, the dotted field map on this
// page (MatchupMap still draws it elsewhere), the drift line chart, and the
// three stat boxes -- their facts are the fact lines and the coverage bars.

const WINDOWS = [['season', 'Season'], ['l10', 'L10'], ['l5', 'L5'], ['l3', 'L3']]
const SHELL_WORD = { C0: 'Cover 0', C1: 'Cover 1', C2: 'Cover 2', C3: 'Cover 3', C4: 'Cover 4', C6: 'Cover 6', C9: 'Cover 9', C2M: '2-Man' }
// Short enough for seven tiles across a phone.
const LANE_TILE = { 'left|end': 'L END', 'left|tackle': 'L TKL', 'left|guard': 'L GRD', 'middle|middle': 'MID', 'right|guard': 'R GRD', 'right|tackle': 'R TKL', 'right|end': 'R END' }
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x)
const ordinal = (n) => { const suf = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${suf[(v - 20) % 10] || suf[v] || suf[0]}` }
const P = { theme: C, numFont: NUM_FONT }

// WHAT HAPPENS IN EACH LANE (2026-09-28): the bot counts, per defence and
// league-wide, carries stopped for 0 or less (stf) and runs of 10+ (x10) --
// bots/nfl/nfl_field.py. A lane is only named when it has LANE_MIN carries and
// sits LANE_GAP points off the league's rate there; otherwise no line, because
// three weeks of one lane is a handful of carries.
const LANE_MIN = 15
const LANE_GAP = 4
const rate = (n, d) => (d ? (100 * n) / d : null)
export function laneOutcomes(field, team) {
  const mine = field?.def_rush?.[team]
  const lg = field?.league_rush
  if (!mine || !lg) return null
  let stuff = null, leak = null
  for (const z of LANES) {
    const c = mine[z], l = lg[z]
    if (!c || !l || c.stf == null || c.att < LANE_MIN) continue
    const s = rate(c.stf, c.att), sl = rate(l.stf, l.att)
    const x = rate(c.x10, c.att), xl = rate(l.x10, l.att)
    if (s - sl >= LANE_GAP && (!stuff || s - sl > stuff.d)) stuff = { z, v: s, lg: sl, n: c.att, d: s - sl }
    if (x - xl >= LANE_GAP && (!leak || x - xl > leak.d)) leak = { z, v: x, lg: xl, n: c.att, d: x - xl }
  }
  return { stuff, leak }
}
const pct0 = (v) => `${Math.round(v)}%`

// WHERE THEY GET BEATEN: the map's own numbers, as MOONSHOT's zone tiles.
export function Zones({ field, team }) {
  const [pass, setPass] = useState(true)
  const model = useMemo(() => fieldModel({ field, defTeam: team, mode: 'def', pass }), [field, team, pass])
  const rushable = Boolean(field?.def_rush?.[team])
  const toggle = rushable ? (
    <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
      <button onClick={() => setPass(true)} style={btnStyle(C.cyan, pass)}>Passing</button>
      <button onClick={() => setPass(false)} style={btnStyle(C.cyan, !pass)}>Running</button>
    </div>
  ) : null
  if (!model) return <div style={{ marginBottom: 12 }}><SubLabel {...P}>WHERE THEY GET BEATEN</SubLabel>{toggle}<div style={{ fontSize: 12, color: C.text3 }}>No {pass ? 'passing' : 'running'} map for {team} yet.</div></div>
  const order = pass ? DEPTHS.flatMap((d) => SIDES.map((sd) => `${sd}|${d}`)) : LANES
  const unit = pass ? 'target' : 'carry'
  const spot = model.spot
  const where = (z) => (pass ? phrase(z) : LANE_WORD[z])
  return (
    <div>
      <SubLabel {...P}>WHERE THEY GET BEATEN</SubLabel>
      {toggle}
      <HeatTiles {...P}
        lead={spot
          ? <><b style={{ color: C.text }}>{cap(where(spot.z))}</b>: {team} give up <b style={{ color: C.orange }}>{fmtPct(spot.leak)}</b> yards a {unit} against a normal defence there, and {Math.round(spot.share)}% of all the yards they allow come from it{spot.tdN ? <> — <b style={{ color: C.text }}>{spot.tdN} TD{spot.tdN === 1 ? '' : 's'}</b></> : null}.</>
          : <>No zone stands out: nowhere do {team} give up clearly more than a normal defence.</>}
        cells={order.map((z) => {
          const c = model.by[z]
          return {
            key: z, heat: Number.isFinite(c?.leak) ? c.heat : null,
            big: Number.isFinite(c?.leak) ? fmtPct(c.leak) : '—',
            small: c?.att ? `${c.tdN} TD` : null,
            title: [c?.tip || where(z), !pass && field?.def_rush?.[team]?.[z]?.stf != null
              ? `stopped for 0 or less on ${pct0(rate(field.def_rush[team][z].stf, field.def_rush[team][z].att))}, 10+ yards on ${pct0(rate(field.def_rush[team][z].x10, field.def_rush[team][z].att))} (${field.def_rush[team][z].att} carries)` : null].filter(Boolean).join(' · '),
          }
        })}
        cols={pass ? 3 : 7} hotKey={spot?.z ?? null}
        rowLabels={pass ? DEPTHS.map((d) => `${DEPTH_AX[d][0]} ${DEPTH_AX[d][1]}`) : null}
        colLabels={pass ? ['LEFT', 'MIDDLE', 'RIGHT'] : LANES.map((z) => LANE_TILE[z])}
        rowLabelWidth={84} maxWidth={pass ? 380 : 560} aspect={pass ? '1.6 / 1' : '1 / 1.1'}
        legend={<>Big number: yards per {unit} {team} allow there, against a normal defence (+ = leakier). Small: touchdowns they have allowed there. More orange = leakier; — = too few plays to call.</>}
      />
      {!pass && (() => {
        const o = laneOutcomes(field, team)
        return o && (o.stuff || o.leak) ? (
          <div style={{ marginTop: 8 }}>
            <FactLines theme={C} lines={[
              ['Stuffs it', o.stuff ? <>{LANE_WORD[o.stuff.z].replace('runs ', '')}, {pct0(o.stuff.v)} of {o.stuff.n} carries go for 0 or less (league {pct0(o.stuff.lg)}).</> : null],
              ['Springs leaks', o.leak ? <>{LANE_WORD[o.leak.z].replace('runs ', '')}, {pct0(o.leak.v)} of {o.leak.n} carries go 10+ yards (league {pct0(o.leak.lg)}).</> : null],
            ]} />
          </div>
        ) : null
      })()}
    </div>
  )
}

// BY POSITION: what they allow each depth role, value and league rank, in
// the site's table (was a wall of tiles).
function ByPosition({ matchup, team, win, setWin, slateSeason }) {
  const dvpSeason = useDvpSeason(matchup)
  const data = dvpSeason.view
  const blob = data?.dvp?.[win]?.[team]
  const roles = (data?.dvp_roles || []).filter((r) => blob?.[r])
  const labels = data?.dvp_labels || {}
  const stats = (data?.dvp_stats || []).filter((st) => roles.some((r) => blob[r]?.[st] != null))
  const rows = roles.map((r) => {
    const o = { _id: r, role: r }
    for (const st of stats) { const rk = blob[r]?.[`${st}_rank`]; o[st] = Number.isFinite(rk) ? 33 - rk : null; o[`${st}__v`] = blob[r]?.[st]; o[`${st}__r`] = rk }
    return o
  })
  const columns = [
    { key: 'role', label: 'Role', w: 70, heat: false, sticky: true, fmt: (v) => <b>{v}</b> },
    ...stats.map((st) => ({
      key: st, label: labels[st] || st, w: 62, scale: 'seq', domain: [1, 32],
      fmt: (v, r) => (v == null ? '—' : <span><b>{Number.isInteger(r[`${st}__v`]) ? r[`${st}__v`] : Number(r[`${st}__v`]).toFixed(1)}</b> <span style={{ fontSize: 10, opacity: 0.7 }}>#{r[`${st}__r`]}</span></span>),
    })),
  ]
  const best = softRole(data, team, win, roles)
  return (
    <div style={{ marginBottom: 12 }}>
      <SubLabel {...P} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>BY POSITION · WHAT {team} ALLOW EACH ROLE</span>
        <SourceSeason matchup={data} kind="stats" slateSeason={slateSeason} />
      </SubLabel>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {WINDOWS.filter(([k]) => data?.dvp?.[k]).map(([k, label]) => (
          <button key={k} onClick={() => setWin(k)} style={btnStyle(C.cyan, k === win)}>{label}</button>
        ))}
        {dvpSeason.hasToggle && <SeasonToggle seasons={[dvpSeason.current, dvpSeason.alt]} slateSeason={slateSeason} value={dvpSeason.showing} onPick={dvpSeason.pick} loading={dvpSeason.state === 'loading' ? dvpSeason.showing : null} />}
      </div>
      {rows.length ? (
        <NflTable rows={rows} columns={columns} heatMode="full" maxHeight={9999} />
      ) : (
        <div style={{ fontSize: 12, color: C.text3 }}>{dvpSeason.state === 'loading' ? `Loading ${dvpSeason.showing} defence…` : `No ${dvpSeason.showing || ''} defence data for ${team} in this window.`}</div>
      )}
      <div style={{ marginTop: 5, fontSize: 11, color: C.text3, lineHeight: 1.5 }}>
        Each cell: what {team} allow that role, and its rank of 32 (#1 allows the most). More orange = softer.
        {best?.standout ? <> Softest: <b style={{ color: C.orange }}>{best.role}</b> in <b style={{ color: C.orange }}>{best.label}</b>.</> : null}
      </div>
    </div>
  )
}

// ONE DEFENSE IN PLAIN LINES (2026-09-28): Coverage / Big plays / Pass rush /
// Up front. The Matchups detail and the Slate's read both print these.
// THIS SEASON'S TENDENCIES (2026-09-28): FTN charting, weekly, published by
// the bot as matchup.tendencies (bots/nfl/nfl_tendencies.py) with its own
// season, a games count per team, league figures and a rank (1 = the most).
// Every line says its season and how many games it is over, because three
// weeks in "over 2 games" is the honest size of it.
const tendNote = (t, games, slate) => (
  <span style={{ color: C.text3 }}> · {t.season}{slate && t.season < slate ? ' season' : ''}, {games} {games === 1 ? 'game' : 'games'}</span>
)
const ofN = (rank, side) => (rank ? ` (${ordinal(rank)} of ${Object.keys(side || {}).length})` : '')

// UNDER PRESSURE (2026-09-28): this week's QB (the one with the most dropbacks
// in his team's latest game), from matchup.qb_pressure (bots/nfl/
// nfl_qb_pressure.py): PFR's pressure rate, ranked among starters, and FTN's
// yards a dropback blitzed vs not -- only when both sides have 10+ dropbacks.
// Beside it, how often the defence he faces blitzes (tendencies).
function pressureLine(matchup, team, def, slate) {
  const q = matchup?.qb_pressure
  const id = q?.starter?.[team]
  const p = id ? q.qbs?.[id] : null
  if (!p || p.pressure_pct == null) return null
  const rk = q.rank?.[id]
  const split = p.blitz?.n >= 10 && p.no_blitz?.n >= 10
  const d = def ? matchup?.tendencies?.defense?.[def] : null
  const dr = def ? matchup?.tendencies?.rank?.defense?.[def]?.blitz_pct : null
  return <>{p.name} is pressured on {p.pressure_pct}% of dropbacks{rk ? ` (${ordinal(rk)}-most of ${q.ranked})` : ''}{split ? <>; {p.blitz.ypd} yds a dropback when blitzed, {p.no_blitz.ypd} when not</> : null}{d?.blitz_pct != null ? <>. {def} blitz on {d.blitz_pct}% of dropbacks{dr ? ` (${ordinal(dr)})` : ''}</> : null}<span style={{ color: C.text3 }}> · {q.season}{slate && q.season < slate ? ' season' : ''}, {p.games} {p.games === 1 ? 'game' : 'games'}</span>.</>
}

/** The offense's own shape this season, one line: formation, motion, play-action. */
export function offenseFacts(matchup, team, slateSeason = null, def = null) {
  const t = matchup?.tendencies
  const o = t?.offense?.[team]
  const pressure = ['Under pressure', pressureLine(matchup, team, def, Number(slateSeason) || null)]
  if (!o) return [pressure]
  const r = t.rank?.offense?.[team] || {}
  const gun = o.shotgun_pct != null && o.under_center_pct != null && o.shotgun_pct >= o.under_center_pct
  const lead = gun ? ['shotgun', o.shotgun_pct, r.shotgun_pct] : ['under center', o.under_center_pct, r.under_center_pct]
  return [
    pressure,
    ['Lines up', lead[1] != null ? <>{lead[0]} on {lead[1]}% of snaps{ofN(lead[2], t.offense)}, motion on {o.motion_pct}%{o.play_action_pct != null ? <>, play-action on {o.play_action_pct}% of dropbacks{ofN(r.play_action_pct, t.offense)}</> : null}{tendNote(t, o.games, Number(slateSeason) || null)}.</> : null],
  ]
}

// THEIR TOP TARGETS · THE CORNERS (2026-09-28, Donovan: "the top receivers
// with the top corners when we're looking at a matchup"). matchup.pass_game
// (bots/nfl/nfl_pass_game.py): an offense's top 3 by targets, a defence's
// rank-1 LCB / RCB / NB from the depth chart. Side by side and NEVER paired:
// no free source says who covered whom. The one line that connects them is a
// TEAM number from DvP -- what this defence allows WR1s -- and says so.
const SLOT_WORD = { LCB: 'LCB', RCB: 'RCB', NB: 'Slot' }
export function PassGame({ matchup, data, off, def, onPlayerClick = null }) {
  const pg = matchup?.pass_game
  const tg = pg?.targets?.[off] || []
  const cb = pg?.corners?.[def] || []
  if (!tg.length && !cb.length) return null
  const slate = Number(data?.season) || null
  const rows = data?.players || []
  const rowOf = (id) => rows.find((p) => String(p.player_id) === String(id))
  const wr1 = matchup?.dvp?.season?.[def]?.WR1
  const Row = ({ face, name, meta }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, borderBottom: `1px solid ${C.border}` }}>
      {face}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.35 }}>{meta}</div>
      </div>
    </div>
  )
  const yr = (y) => (slate && y && y < slate ? ` · ${y}` : '')
  // PHONE FOLD (2026-09-28, Donovan: "get them done"): six rows of faces per
  // side made the Matchups detail ~2,300px and each Slate game side ~1,200px
  // at 390. On a phone the block is one tap-to-open line (MOONSHOT's
  // MobileFold); on a desktop it renders exactly as before.
  const top = tg[0] ? (rowOf(tg[0].player_id)?.name || tg[0].name) : null
  return (
    <MobileFold title="Top targets · corners" summary={`${off}${top ? ` · ${top}` : ''} vs ${def}'s corners`} count={tg.length + cb.length} accent={C.cyan}>
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        <div>
          <SubLabel {...P}>{off} OFFENSE · TOP TARGETS{yr(pg.season)}</SubLabel>
          {tg.map((t) => {
            const r = rowOf(t.player_id)
            const name = r?.name || t.name
            return <Row key={t.player_id}
              face={<NflFace player={r || { name, team: off }} size={30} />}
              name={r && onPlayerClick ? <Tap onClick={() => onPlayerClick(r)}>{name}</Tap> : name}
              meta={<>{t.position || '—'} · {t.share}% of targets · {t.adot != null ? `${t.adot} air yds a target` : '—'} · {t.yds} yds, {t.td} TD in {t.games} {t.games === 1 ? 'game' : 'games'}</>} />
          })}
        </div>
        <div>
          <SubLabel {...P}>{def} DEFENSE · CORNERS ON THE DEPTH CHART{yr(pg.corner_season)}</SubLabel>
          {cb.map((c) => (
            <Row key={c.slot}
              face={<NflFace player={{ espn_id: c.espn_id, name: c.name, team: def }} size={30} />}
              name={<>{c.name} <span style={{ color: C.text3, fontWeight: 700, fontSize: 11 }}>{SLOT_WORD[c.slot] || c.slot}</span></>}
              meta={c.games ? <>{c.pd} passes defended · {c.int} INT in {c.games} {c.games === 1 ? 'game' : 'games'}</> : <>no games yet this season</>} />
          ))}
        </div>
      </div>
      {wr1?.recyd_g != null && Number.isFinite(wr1.recyd_g_rank) ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
          As a team, {def} allow {wr1.recyd_g} receiving yards a game to WR1s, the {ordinal(wr1.recyd_g_rank)}-most in the league. Not who covers whom: no free source says that.
        </p>
      ) : null}
    </div>
    </MobileFold>
  )
}

export function defenseFacts(matchup, team, rushThreat = passRushThreat(matchup, team), slateSeason = null) {
  // A line from an older season than the slate says so (charting is last
  // season's all year; pass_rush can be at the flip). Same year = no note.
  const slate = Number(slateSeason) || null
  const older = (yr) => (slate && yr && yr < slate ? <span style={{ color: C.text3 }}> ({yr} season)</span> : null)
  const cov = matchup?.coverage_team?.[team]
  const dominant = cov && cov.zone_pct != null && cov.man_pct != null ? (cov.zone_pct >= cov.man_pct ? 'zone' : 'man') : null
  const domPct = dominant ? cov[`${dominant}_pct`] : null
  const covRank = dominant ? 1 + Object.values(matchup.coverage_team || {}).map((t) => t?.[`${dominant}_pct`]).filter((v) => typeof v === 'number' && v > domPct).length : null
  const exp = matchup?.def_explosive?.[team]
  const dis = matchup?.disruption_team?.[team]
  return [
    ['Coverage', dominant ? <>{dominant} on {domPct}% of snaps{covRank ? ` (${ordinal(covRank)}-most in the league)` : ''}{older(Number(matchup?.chart_season))}.</> : null],
    ['Big plays', exp ? <>{exp.pass_20} passes of 20+ yards allowed, {exp.deep_td} touchdowns on throws of 20+ air yards ({exp.deep_cmp} of {exp.deep_att} completed).</> : null],
    ['Pass rush', dis?.pressure?.created_pct != null ? <>pressure on {dis.pressure.created_pct}% of {dis.pressure.created_plays || 'their'} pass plays faced{older(Number(matchup?.chart_season))}.</> : null],
    ['Front', (() => {
      const t = matchup?.tendencies
      const d = t?.defense?.[team]
      if (!d || d.box_avg == null) return null
      const r = t.rank?.defense?.[team] || {}
      return <>{d.box_avg} in the box on average, 8+ on {d.box8_pct}% of runs faced{d.blitz_pct != null ? <>; blitz on {d.blitz_pct}% of dropbacks{ofN(r.blitz_pct, t.defense)}</> : null}{tendNote(t, d.games, slate)}.</>
    })()],
    ['Up front', rushThreat && rushThreat.percentile >= PASS_RUSH_AVOID ? <><b style={{ color: C.red }}>{rushThreat.name}</b> ({rushThreat.position}) is {ordinal(Math.round(rushThreat.percentile))}-percentile at turning pressure into sacks{older(blockSeason(matchup, 'pass_rush'))}.</> : null],
  ]
}

export default function Matchups({ matchup, data, onPlayerClick = null, onOpenTeam = null }) {
  // The slate is six teams. Listing all 32 alphabetically put ATL next to ARI
  // and buried the ones playing tonight in a wall of three-letter codes — so
  // the games lead, laid out as games, and the league hides behind a toggle.
  const slate = useMemo(
    () => (data?.games || []).map((g) => [g.away, g.home]).filter(([a, h]) => a && h),
    [data])
  const onSlate = useMemo(() => new Set(slate.flat()), [slate])
  const rest = useMemo(
    () => Object.keys(matchup?.dvp?.season || {}).sort().filter((t) => !onSlate.has(t)),
    [matchup, onSlate])

  const [team, setTeam] = useState(null)
  const [win, setWin] = useState('season')
  // The detail opens on the table's #1 (the softest defense this week) until a
  // row is tapped -- same measure, starters only.
  const softest = useMemo(() => slate.flat()
    .map((t) => [t, softRole(matchup, t, win, STARTER_ROLES)?.z])
    .filter(([, z]) => Number.isFinite(z))
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null, [slate, matchup, win])
  const active = team || softest || slate[0]?.[0] || rest[0]
  const opp = useMemo(() => { const g = slate.find((pr) => pr.includes(active)); return g ? g.find((t) => t !== active) : null }, [slate, active])

  // Who's actually going at this defence on this card, best score first
  // (QBs included via field.qb_pass, 2026-09-21).
  const facing = useMemo(() => (data?.players || [])
    .filter((p) => p.opp === active
      && (matchup?.field?.player_pass?.[p.player_id] || matchup?.field?.qb_pass?.[p.player_id]))
    .map((p) => ({ ...p, _id: String(p.player_id), best: Object.values(p.scores || { x: 0 }).reduce((top, v) => Math.max(top, v), 0), role: matchup?.roles?.[p.player_id] || null }))
    .sort((a, b) => b.best - a.best)
    .slice(0, 30), [data, active, matchup])

  const soft = useMemo(() => softRole(matchup, active, win), [matchup, active, win])
  const rushThreat = useMemo(() => passRushThreat(matchup, active), [matchup, active])

  if (!matchup?.dvp) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: TYPE.body,
      }}>Matchup data hasn&apos;t been published yet.</div>
    )
  }

  // HOW THEY COVER: the shell mix is MOONSHOT's pitch mix for a defence.
  const cov = matchup?.coverage_team?.[active]
  const shells = cov && cov.shell_n >= 50
    ? Object.entries(cov.shells || {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, v]) => ({ key: k, label: SHELL_WORD[k] || k, pct: v, text: `${v}%` }))
    : []
  const facts = defenseFacts(matchup, active, rushThreat, data?.season)
  const teamLink = (t) => <Tap onClick={onOpenTeam && (() => onOpenTeam(t))}>{t}</Tap>

  const whoColumns = [
    { key: 'name', label: 'Player', w: 150, heat: false, sticky: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><NflFace player={r} size={22} />{/* wraps rather than clipping, the board's rule (NflBoardExtras) */}<b style={{ whiteSpace: 'normal', lineHeight: 1.15, minWidth: 0 }}>{v}</b></span>) },
    { key: 'position', label: 'Pos', w: 40, heat: false },
    { key: 'team', label: 'Team', w: 48, heat: false },
    { key: 'role', label: 'Role', w: 56, heat: false, fmt: (v) => v || '—' },
    { key: 'best', label: 'Best score', w: 64, primary: true, scale: 'seq', domain: 'auto', dp: 0 },
    { key: 'cov', label: 'Vs their coverage', w: 230, heat: false, fmt: (_, r) => {
      const d = r.coverage_mismatch_detail
      if (!d?.opp_lean) return <span style={{ color: C.text3 }}>—</span>
      const other = d.opp_lean === 'zone' ? 'man' : d.opp_lean === 'man' ? 'zone' : 'the rest'
      const tag = r.coverage_mismatch_tag
      return <span>{tag ? <b style={{ color: tag === 'TARGET' ? C.green : C.red }}>{tag} </b> : null}{d.leaned_ypt} yds a target vs {d.opp_lean}, {d.other_ypt} vs {other}</span>
    } },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · MATCHUPS"
        title="Matchups"
        note="The defenses to attack this week. Tap one for where it gets beaten, what it allows each position, and who on the slate is walking into it."
        theme={C}
        numFont={NUM_FONT}
        accent={C.cyan}
      />
      <DefensesTable matchup={matchup} data={data} win={win} active={active} onPlayerClick={onPlayerClick} onPick={(t) => { setTeam(t); if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('tuddy-def-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} />

      <section id="tuddy-def-detail" aria-label={`${active} defense`} style={{ scrollMarginTop: 80 }}>
        <MatchupTitle {...P} type={TYPE} name={<>{teamLink(active)} defense</>} meta={<>{opp ? <>vs {teamLink(opp)} · </> : null}tap another row above to switch</>} />
        <p style={{ margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
          {soft?.standout
            ? <><b style={{ color: C.text }}>{teamLink(active)}</b> {softLine(soft)}. That&apos;s the opening.</>
            : <><b style={{ color: C.text }}>{teamLink(active)}</b> has no standout weakness: nothing they give up is far enough above the league&apos;s average for that role to call an opening.</>}
        </p>

        {shells.length > 0 && (
          <div style={{ marginBottom: 2 }}>
            <SubLabel {...P} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>HOW THEY COVER · share of {cov.shell_n} charted snaps</span><SourceSeason matchup={matchup} kind="charting" slateSeason={data?.season} />
            </SubLabel>
            <BarList {...P} items={shells} accent={C.cyan} labelWidth={64} />
          </div>
        )}
        <FactLines theme={C} lines={facts} />
        {opp ? <PassGame matchup={matchup} data={data} off={opp} def={active} onPlayerClick={onPlayerClick} /> : null}

        <Zones field={matchup.field} team={active} />
        <ByPosition matchup={matchup} team={active} win={win} setWin={setWin} slateSeason={data?.season} />

        {facing.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <SubLabel {...P}>WHO FITS IT · THE PLAYERS FACING {active} THIS WEEK</SubLabel>
            <NflTable rows={facing} columns={whoColumns} heatMode="primary" maxRows={8} maxHeight={9999}
              onRowClick={onPlayerClick ? (r) => onPlayerClick(r) : undefined} />
          </div>
        )}
      </section>
    </div>
  )
}
