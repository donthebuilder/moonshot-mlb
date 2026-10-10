'use client'
import NflNote, { QMark } from '../NflNote'
import TeamMark from '../../TeamMark'
import PlayerFace from '../../PlayerFace'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'
import DefensesTable from '../DefensesTable'
import Tap from '../../Tap'
import MobileFold from '../../MobileFold'
import { fieldModel, phrase, fmtPct, DEPTHS, SIDES, DEPTH_AX, LANES, LANE_WORD } from '../../../lib/nfl/fieldModel'
import PageHeader from '../../PageHeader'
import NflTable from '../NflTable'
import SourceSeason from '../SourceSeason'
import SeasonToggle from '../../SeasonToggle'
import useDvpSeason from '../../../lib/nfl/useDvpSeason'
import { MatchupTitle, SubLabel, BarList, FactLines, FactTiles } from '../../matchup/MatchupParts'
import FootballField from '../FootballField'
import MatchupExplorer from '../MatchupExplorer'
import { ViewRow } from '../../results/ResultsParts'
import { SportTheme } from '../../SportTheme'
import { softRole, softLine, passRushThreat, PASS_RUSH_AVOID, STARTER_ROLES } from '../../../lib/nfl/dvpSignal'
import TheField from '../TheField'
import { ordinal } from '../../../lib/format'
import { gameVenue } from '../../../lib/nfl/venueOf'

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
const P = { theme: C, numFont: NUM_FONT }

// WHAT HAPPENS IN EACH LANE (2026-09-28): the bot counts, per defense and
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
      <button onClick={() => setPass(true)} style={btnStyle(C.green, pass)}>Passing</button>
      <button onClick={() => setPass(false)} style={btnStyle(C.green, !pass)}>Running</button>
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
      {/* THE FIELD, DRAWN (2026-09-30, Donovan: "I want to be able to see the
          field"; components/nfl/FootballField.js). Was a 4x3 / 7-wide grid of
          tiles; now the zones are painted on the grass (pass) or the holes are
          arrows at the line (run), the leakiest one ringed. */}
      <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
        {spot
          ? <><b style={{ color: C.text }}>{cap(where(spot.z))}</b>: {team} give up <b style={{ color: C.green }}>{fmtPct(spot.leak)}</b> yards a {unit} against a normal defense there, and {Math.round(spot.share)}% of all the yards they allow come from it{spot.tdN ? <> — <b style={{ color: C.text }}>{spot.tdN} TD{spot.tdN === 1 ? '' : 's'}</b></> : null}.</>
          : <>No zone stands out: nowhere do {team} give up clearly more than a normal defense.</>}
      </p>
      <FootballField mode={pass ? 'pass' : 'rush'} maxWidth={pass ? 380 : 460} pickedKey={spot?.z ?? null}
        cells={Object.fromEntries(order.map((z) => {
          const c = model.by[z]
          const ok = Number.isFinite(c?.leak)
          return [z, {
            heat: ok ? c.heat : null,
            len: ok ? 0.3 + 0.7 * (c.heat || 0) : 0.15,
            big: ok ? fmtPct(c.leak) : '—',
            small: pass ? (c?.att ? `${c.tdN} TD` : null) : LANE_TILE[z],
            title: [c?.tip || where(z), !pass && field?.def_rush?.[team]?.[z]?.stf != null
              ? `stopped for 0 or less on ${pct0(rate(field.def_rush[team][z].stf, field.def_rush[team][z].att))}, 10+ yards on ${pct0(rate(field.def_rush[team][z].x10, field.def_rush[team][z].att))} (${field.def_rush[team][z].att} carries)` : null].filter(Boolean).join(' · '),
          }]
        }))} />
      <div style={{ fontSize: 10, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        <b style={{ color: C.green }}>orange</b> = they give up more there than a normal defense · the number is yards per {unit} vs normal{pass ? ', with touchdowns allowed under it' : ''} · ringed = the softest spot · — = too few plays
      </div>
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
        <SourceSeason matchup={data} kind="stats" slateSeason={slateSeason} team={win === 'season' ? team : null} />
      </SubLabel>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {WINDOWS.filter(([k]) => data?.dvp?.[k]).map(([k, label]) => (
          <button key={k} onClick={() => setWin(k)} style={btnStyle(C.green, k === win)}>{label}</button>
        ))}
        {dvpSeason.hasToggle && <SeasonToggle seasons={[dvpSeason.current, dvpSeason.alt]} slateSeason={slateSeason} value={dvpSeason.showing} onPick={dvpSeason.pick} loading={dvpSeason.state === 'loading' ? dvpSeason.showing : null} />}
      </div>
      {rows.length ? (
        <NflTable rows={rows} columns={columns} heatMode="full" maxHeight={9999} />
      ) : (
        <div style={{ fontSize: 12, color: C.text3 }}>{dvpSeason.state === 'loading' ? `Loading ${dvpSeason.showing} defense…` : `No ${dvpSeason.showing || ''} defense data for ${team} in this window.`}</div>
      )}
      <div style={{ marginTop: 5, fontSize: 11, color: C.text3, lineHeight: 1.5 }}>
        Each cell: what {team} allow that role, and its rank of 32 (#1 allows the most). More orange = softer.
        {best?.standout ? <> Softest: <b style={{ color: C.green }}>{best.role}</b> in <b style={{ color: C.green }}>{best.label}</b>.</> : null}
      </div>
    </div>
  )
}

// THE SAME FACTS AS TILES (2026-10-04, Donovan: "all these words give me
// anxiety"). offenseFacts / defenseFacts as sentences said each number's rank,
// season and game count inline, on every line. Here: one label, the number,
// its rank -- and the season / sample once, in factsNote. Same fields, nothing
// new computed. The blitz rate lives once, on the defense.
const rk = (n, side) => (n ? `${ordinal(n)} of ${Object.keys(side || {}).length}` : null)
export function offenseTiles(matchup, team) {
  const out = []
  const q = matchup?.qb_pressure
  const id = q?.starter?.[team]
  const p = id ? q.qbs?.[id] : null
  if (p?.pressure_pct != null) {
    const r = q.rank?.[id]
    out.push({ k: 'QB PRESSURED', v: `${p.pressure_pct}%`, sub: r ? `${ordinal(r)}-most` : p.name })
    if (p.blitz?.n >= 10 && p.no_blitz?.n >= 10) out.push({ k: 'VS BLITZ', v: `${p.blitz.ypd} yds`, sub: `${p.no_blitz.ypd} when not` })
  }
  const t = matchup?.tendencies
  const o = t?.offense?.[team]
  if (o) {
    const r = t.rank?.offense?.[team] || {}
    const gun = o.shotgun_pct != null && o.under_center_pct != null && o.shotgun_pct >= o.under_center_pct
    if (gun ? o.shotgun_pct != null : o.under_center_pct != null) out.push({ k: gun ? 'SHOTGUN' : 'UNDER CENTER', v: `${gun ? o.shotgun_pct : o.under_center_pct}%`, sub: rk(gun ? r.shotgun_pct : r.under_center_pct, t.offense) })
    if (o.motion_pct != null) out.push({ k: 'MOTION', v: `${o.motion_pct}%` })
    if (o.play_action_pct != null) out.push({ k: 'PLAY-ACTION', v: `${o.play_action_pct}%`, sub: rk(r.play_action_pct, t.offense) })
  }
  return out
}
export function defenseTiles(matchup, team, rushThreat = passRushThreat(matchup, team)) {
  const out = []
  const cov = matchup?.coverage_team?.[team]
  const dominant = cov && cov.zone_pct != null && cov.man_pct != null ? (cov.zone_pct >= cov.man_pct ? 'zone' : 'man') : null
  if (dominant) {
    const v = cov[`${dominant}_pct`]
    const covRank = 1 + Object.values(matchup.coverage_team || {}).map((x) => x?.[`${dominant}_pct`]).filter((x) => typeof x === 'number' && x > v).length
    out.push({ k: dominant === 'zone' ? 'ZONE' : 'MAN', v: `${v}%`, sub: `${ordinal(covRank)}-most` })
  }
  const exp = matchup?.def_explosive?.[team]
  if (exp) {
    out.push({ k: '20+ PASSES', v: String(exp.pass_20), sub: 'allowed' })
    out.push({ k: 'DEEP TDS', v: String(exp.deep_td), sub: `${exp.deep_cmp}/${exp.deep_att} caught` })
  }
  const dis = matchup?.disruption_team?.[team]
  if (dis?.pressure?.created_pct != null) out.push({ k: 'PRESSURE', v: `${dis.pressure.created_pct}%`, sub: 'of dropbacks' })
  const t = matchup?.tendencies
  const d = t?.defense?.[team]
  if (d) {
    const r = t.rank?.defense?.[team] || {}
    if (d.blitz_pct != null) out.push({ k: 'BLITZ', v: `${d.blitz_pct}%`, sub: rk(r.blitz_pct, t.defense) })
    if (d.box_avg != null) out.push({ k: 'IN THE BOX', v: String(d.box_avg), sub: d.box8_pct != null ? `8+ on ${d.box8_pct}%` : null })
  }
  if (rushThreat && rushThreat.percentile >= PASS_RUSH_AVOID) out.push({ k: 'EDGE THREAT', v: String(rushThreat.name || '').replace(/^(\S)\S*\s+(.+)$/, '$1. $2'), sub: `${rushThreat.position} · ${ordinal(Math.round(rushThreat.percentile))}`, tone: C.text3 })
  return out
}
/** The one caveat line under the tiles: which seasons, over how many games. */
export function factsNote(matchup, off, def, slateSeason) {
  const slate = Number(slateSeason) || null
  const t = matchup?.tendencies
  const g = Math.min(...[t?.offense?.[off]?.games, t?.defense?.[def]?.games].filter((x) => Number.isFinite(x)))
  const parts = []
  if (t?.season && Number.isFinite(g)) parts.push(`${t.season}, ${g} ${g === 1 ? 'game' : 'games'}`)
  const chart = Number(matchup?.chart_season)
  if (slate && chart && chart < slate) parts.push(`coverage + pressure: ${chart} season`)
  return parts.length ? parts.join(' · ') : null
}

// THEIR TOP TARGETS · THE CORNERS (2026-09-28, Donovan: "the top receivers
// with the top corners when we're looking at a matchup"). matchup.pass_game
// (bots/nfl/nfl_pass_game.py): an offense's top 3 by targets, a defense's
// rank-1 LCB / RCB / NB from the depth chart. Side by side and NEVER paired:
// no free source says who covered whom. The one line that connects them is a
// TEAM number from DvP -- what this defense allows WR1s -- and says so.
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
    <MobileFold title="Top targets · corners" summary={`${off} vs ${def}'s corners`} count={tg.length + cb.length} accent={C.green}>
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        <div>
          <SubLabel {...P}>{off} OFFENSE · TOP TARGETS{yr(pg.season)}</SubLabel>
          {tg.map((t) => {
            const r = rowOf(t.player_id)
            const name = r?.name || t.name
            return <Row key={t.player_id}
              face={<PlayerFace sport="nfl" espnId={r?.espn_id} team={r?.team || off} name={r?.name || name} size={30} />}
              name={r && onPlayerClick ? <Tap onClick={() => onPlayerClick(r)}>{name}</Tap> : name}
              meta={<>{t.position || '—'} · {t.share}% tgt{t.adot != null ? ` · ${t.adot} aDOT` : ''} · {t.yds} yds · {t.td} TD</>} />
          })}
        </div>
        <div>
          <SubLabel {...P}>{def} DEFENSE · CORNERS ON THE DEPTH CHART{yr(pg.corner_season)}</SubLabel>
          {cb.map((c) => (
            <Row key={c.slot}
              face={<PlayerFace sport="nfl" espnId={c.espn_id} team={def} name={c.name} size={30} />}
              name={<>{c.name} <span style={{ color: C.text3, fontWeight: 700, fontSize: 11 }}>{SLOT_WORD[c.slot] || c.slot}</span></>}
              meta={c.games ? <>{c.pd} PD · {c.int} INT</> : null} />
          ))}
        </div>
      </div>
      {wr1?.recyd_g != null && Number.isFinite(wr1.recyd_g_rank) ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
          {def} allow {wr1.recyd_g} rec yds a game to WR1s ({ordinal(wr1.recyd_g_rank)}-most). <QMark label="Team number" text="This is a team number, not who covers whom." />
        </p>
      ) : null}
    </div>
    </MobileFold>
  )
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
  // THREE WAYS IN (2026-09-30): this week's defenses, the league by coverage, the league by hole.
  const [view, setView] = useState('week')
  const [win, setWin] = useState('season')
  // The detail opens on the table's #1 (the softest defense this week) until a
  // row is tapped -- same measure, starters only.
  const softest = useMemo(() => slate.flat()
    .map((t) => [t, softRole(matchup, t, win, STARTER_ROLES)?.z])
    .filter(([, z]) => Number.isFinite(z))
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null, [slate, matchup, win])
  const active = team || softest || slate[0]?.[0] || rest[0]
  const opp = useMemo(() => { const g = slate.find((pr) => pr.includes(active)); return g ? g.find((t) => t !== active) : null }, [slate, active])

  // Who's actually going at this defense on this card, best score first
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

  // HOW THEY COVER: the shell mix is MOONSHOT's pitch mix for a defense.
  const cov = matchup?.coverage_team?.[active]
  const shells = cov && cov.shell_n >= 50
    ? Object.entries(cov.shells || {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, v]) => ({ key: k, label: SHELL_WORD[k] || k, pct: v, text: `${v}%` }))
    : []
  const tiles = defenseTiles(matchup, active, rushThreat)
  // logo-only (Donovan 10-02, logos site-wide); the code rides the logo's title / alt
  const teamLink = (t) => <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={t}><span style={{ display: 'inline-flex', alignItems: 'center' }}><TeamMark sport="nfl" abbr={t} variant="logo" px={18} /></span></Tap>

  const whoColumns = [
    { key: 'name', label: 'Player', w: 150, heat: false, sticky: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PlayerFace sport="nfl" espnId={r?.espn_id} team={r?.team} name={r?.name} size={22} />{/* wraps rather than clipping, the board's rule (NflBoardExtras) */}<b style={{ whiteSpace: 'normal', lineHeight: 1.15, minWidth: 0 }}>{v}</b></span>) },
    { key: 'position', label: 'Pos', w: 40, heat: false },
    { key: 'team', label: 'Team', w: 48, heat: false },
    { key: 'role', label: 'Role', w: 56, heat: false, fmt: (v) => v || '—' },
    { key: 'best', label: 'Best score', w: 64, primary: true, scale: 'seq', domain: 'auto', dp: 0 },
    { key: 'cov', label: 'Vs their coverage', w: 230, heat: false, fmt: (_, r) => {
      const d = r.coverage_mismatch_detail
      if (!d?.opp_lean) return <span style={{ color: C.text3 }}>—</span>
      const other = d.opp_lean === 'zone' ? 'man' : d.opp_lean === 'man' ? 'zone' : 'the rest'
      const tag = r.coverage_mismatch_tag
      return <span>{tag ? <b style={{ color: tag === 'TARGET' ? C.green : C.text3 }}>{tag} </b> : null}{d.leaned_ypt} yds a target vs {d.opp_lean}, {d.other_ypt} vs {other}</span>
    } },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · MATCHUPS"
        title="Matchups"
        note={<NflNote tab="matchups" />}
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
      />
      <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
        <ViewRow value={view} onChange={setView}
          views={[['week', '🛡 This week'], ['coverage', '🎯 Coverage explorer'], ['holes', '🏃 Run holes']]} />
      </SportTheme>
      {view !== 'week' && <MatchupExplorer matchup={matchup} data={data} onPlayerClick={onPlayerClick} view={view} />}
      {view === 'week' && <>
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
            <BarList {...P} items={shells} accent={C.green} labelWidth={64} />
          </div>
        )}
        <FactTiles theme={C} numFont={NUM_FONT} tiles={tiles} note={factsNote(matchup, null, active, data?.season)} />
        {opp ? <PassGame matchup={matchup} data={data} off={opp} def={active} onPlayerClick={onPlayerClick} /> : null}
        {/* THE FIELD, TEAM mode (0e c F6): ONE picture of where this defense
            gets beaten -- the offence facing it, every target, over the ink,
            the run gaps a tap away. It replaced the FootballField heat map
            (Zones) and a second, folded FieldChart of the same defense. A
            defense with no game on the slate has no offence to draw, so it
            keeps the zone read. */}
        {opp ? <>
          <TheField key={`${opp}-${active}`} team={opp} defTeam={active} defWeek={data?.week} matchup={matchup} venue={gameVenue(data?.games, opp, active)}
            players={data?.players} initialMode="TEAM" onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
          {(() => {
            const o = laneOutcomes(matchup.field, active)
            return o && (o.stuff || o.leak) ? (
              <div style={{ marginBottom: 12 }}>
                <FactLines theme={C} lines={[
                  ['Stuffs it', o.stuff ? <>{LANE_WORD[o.stuff.z].replace('runs ', '')}, {pct0(o.stuff.v)} of {o.stuff.n} carries go for 0 or less (league {pct0(o.stuff.lg)}).</> : null],
                  ['Springs leaks', o.leak ? <>{LANE_WORD[o.leak.z].replace('runs ', '')}, {pct0(o.leak.v)} of {o.leak.n} carries go 10+ yards (league {pct0(o.leak.lg)}).</> : null],
                ]} />
              </div>
            ) : null
          })()}
        </> : <Zones field={matchup.field} team={active} />}
        <ByPosition matchup={matchup} team={active} win={win} setWin={setWin} slateSeason={data?.season} />

        {facing.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <SubLabel {...P}>WHO FITS IT · THE PLAYERS FACING {active} THIS WEEK</SubLabel>
            <NflTable rows={facing} columns={whoColumns} heatMode="primary" maxRows={8} maxHeight={9999}
              onRowClick={onPlayerClick ? (r) => onPlayerClick(r) : undefined} />
          </div>
        )}
      </section>
      </>}
    </div>
  )
}
