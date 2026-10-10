// TRADING-CARD PROTOTYPES: THE BACK OF THE CARD (server only, prototype; nothing imports this from app/).
// Donovan's reference: the vintage card backs (Topps 1992, 1990 Hoops): name / position / team header, a small
// bio strip, a COMPLETE RECORD table with ONE ROW PER SEASON, a CAREER row (and a playoff row when we hold one),
// a short blurb, a bold team-colour frame on cream stock.
//
// EVERY ROW IS A SEASON WE ACTUALLY HOLD. A missing year is a missing row (never filled in); the seasons shown are
// returned in `seasonsShown` so a caller can say which years the card covers.
//   NHL  api-web.nhle.com player landing (lib/nhl/api.js playerLanding): seasonTotals (NHL regular season) and the
//        league's own careerTotals (regular season + playoffs).
//   MLB  statsapi yearByYear + career + people (the same host lib/card/sources.js reads); a traded year uses the
//        aggregate row (the lib/seasonSplit.js rule: the row with no team), never the first club's partial line.
//   NFL  nfl_logs.json (lib/nfl/dataSource.js nflLogPaths): his games, summed per season; the TOTAL row is the sum of
//        the seasons shown (the file holds no career line and no playoff games).
// The blurb is composed ONLY from the stat words the card front already prints (the percentiles and ranks), never a
// printed model number.
import { ImageResponse } from 'next/og'
import { loadFonts, loadDisplay, loadMark, loadGrain, DISPLAY, INK, DIM, RULE } from '../../dash/homerCard'
import { SPORT_ACCENT } from '../../sportAccent'
import { CHASSIS } from '../../design/tokens'
import { alpha } from '../kit'
import { playerLanding } from '../../nhl/api'
import { fetchNfl, nflLogPaths, nflSlatePaths, nflSlateLooksReal } from '../../nfl/dataSource'
import { teamCodeFromName } from '../../mlbTeams'
import { ord } from './protoData'
import { SIZE } from './protoCards'

const MINF = { p: 22, l: 24 }
const fs = (o, n) => Math.max(MINF[o], n)
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const f0 = (v) => (num(v) == null ? '—' : String(Math.round(num(v))))
const seasonWord = (id) => `${String(id).slice(2, 4)}-${String(id).slice(6, 8)}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const bornWord = (iso, city) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}${city ? ` · ${city}` : ''}` : null }
const feet = (inches) => (num(inches) ? `${Math.floor(inches / 12)}'${inches % 12}"` : null)

/** The blurb: only the stat words the front already prints. */
export function blurbOf(m) {
  const ranked = m.stats.filter((s) => s.pct != null).sort((a, b) => b.pct - a.pct).slice(0, 3)
  const word = (label) => label.replace(/ \/ (GP|G)$/, '').replace('HR / PA', 'HR per PA').split(' ').map((w) => (/^(HR|ISO|PA|TD|EV)$/.test(w) ? w : w.toLowerCase())).join(' ')
  const parts = ranked.map((s) => `${word(s.label)} ${ord(s.pct)}`)
  const unit = { nhl: "tonight's skaters", mlb: "tonight's board", nfl: "this week's players" }[m.sport]
  const head = parts.length ? `Ranks ${parts.join(', ')} among ${unit}.` : ''
  const tail = m.rankLine.length ? ` ${m.rankLine.map((t) => t[0] + t.slice(1).toLowerCase()).join(', ')}.` : ''
  return `${head}${tail}`.trim()
}

// ── data ──────────────────────────────────────────────────────────────────────
async function nhlBack(m) {
  const l = await playerLanding(m.playerId).catch(() => null)
  const bio = l ? [
    ['HT / WT', [feet(l.heightInInches), l.weightInPounds ? `${l.weightInPounds} lb` : null].filter(Boolean).join(' · ')],
    ['SHOOTS', l.shootsCatches], ['BORN', bornWord(l.birthDate, l.birthCity?.default)],
    ['DRAFTED', l.draftDetails ? `${l.draftDetails.year} · Rd ${l.draftDetails.round} · #${l.draftDetails.overallPick} ${l.draftDetails.teamAbbrev}` : 'Undrafted'],
  ].filter(([, v]) => v) : []
  const cols = [['YEAR', 1.3, 'season'], ['TEAM', 1.7, 'tm'], ['GP', 1, 'gp'], ['G', 1, 'g'], ['A', 1, 'a'], ['PTS', 1, 'pts'], ['+/-', 1, 'pm'], ['SOG', 1, 'sog'], ['S%', 1, 'shp'], ['TOI', 1.1, 'toi']]
  const rowOf = (s) => ({ season: seasonWord(s.season), tm: s.teamCommonName?.default || '', gp: f0(s.gamesPlayed), g: f0(s.goals), a: f0(s.assists), pts: f0(s.points), pm: num(s.plusMinus) == null ? '—' : (s.plusMinus > 0 ? `+${s.plusMinus}` : String(s.plusMinus)), sog: f0(s.shots), shp: num(s.shootingPctg) == null ? '—' : (s.shootingPctg * 100).toFixed(1), toi: s.avgToi || '—' })
  const rows = (l?.seasonTotals || []).filter((s) => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2).sort((a, b) => a.season - b.season).map(rowOf)
  const tot = (t, label) => (t ? { ...rowOf({ ...t, season: 0 }), season: label, tm: '' } : null)
  return { bio, cols, rows, career: tot(l?.careerTotals?.regularSeason, 'NHL'), careerLabel: 'CAREER', playoffs: tot(l?.careerTotals?.playoffs, 'PLAYOFFS'), seasonsShown: rows.map((r) => r.season), source: 'NHL player landing (seasonTotals, careerTotals)' }
}

const MLB = 'https://statsapi.mlb.com/api/v1'
const jget = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
async function mlbBack(m) {
  const id = m.playerId
  const [yy, car, post, ppl] = await Promise.all([
    jget(`${MLB}/people/${id}/stats?stats=yearByYear&group=hitting&gameType=R`),
    jget(`${MLB}/people/${id}/stats?stats=career&group=hitting&gameType=R`),
    jget(`${MLB}/people/${id}/stats?stats=career&group=hitting&gameType=P`),
    jget(`${MLB}/people/${id}`),
  ])
  const p = ppl?.people?.[0]
  const bio = [
    ['HT / WT', [p?.height, p?.weight ? `${p.weight} lb` : null].filter(Boolean).join(' · ')],
    ['BATS / THROWS', p?.batSide?.code ? `${p.batSide.code} / ${p.pitchHand?.code || '—'}` : null],
    ['BORN', bornWord(p?.birthDate, [p?.birthCity, p?.birthStateProvince || p?.birthCountry].filter(Boolean).join(', '))],
    ['DEBUT', p?.mlbDebutDate ? bornWord(p.mlbDebutDate, '') : null],
  ].filter(([, v]) => v)
  const cols = [['YEAR', 1.2, 'season'], ['TEAM', 1.2, 'tm'], ['G', 1, 'g'], ['AB', 1, 'ab'], ['R', 1, 'r'], ['H', 1, 'h'], ['HR', 1, 'hr'], ['RBI', 1, 'rbi'], ['AVG', 1.15, 'avg'], ['OBP', 1.15, 'obp'], ['SLG', 1.15, 'slg'], ['OPS', 1.15, 'ops']]
  const line = (s, season, tm) => ({ season, tm, g: f0(s.gamesPlayed), ab: f0(s.atBats), r: f0(s.runs), h: f0(s.hits), hr: f0(s.homeRuns), rbi: f0(s.rbi), avg: s.avg || '—', obp: s.obp || '—', slg: s.slg || '—', ops: s.ops || '—' })
  const splits = yy?.stats?.[0]?.splits || []
  const years = [...new Set(splits.map((s) => s.season))].sort()
  const rows = []
  for (const y of years) {
    const ofYear = splits.filter((s) => s.season === y)
    const agg = ofYear.find((s) => !s.team)                       // lib/seasonSplit.js: the aggregate carries no team
    const clubs = ofYear.filter((s) => s.team)
    const one = agg || (clubs.length === 1 ? clubs[0] : null)
    if (!one) continue                                              // no aggregate and several clubs: the season is left out, not guessed
    const tm = clubs.length > 1 ? `${clubs.length}TM` : teamCodeFromName(clubs[0]?.team?.name) || ''
    rows.push(line(one.stat, y, tm))
  }
  const c = car?.stats?.[0]?.splits?.[0]?.stat
  const pc = post?.stats?.[0]?.splits?.[0]?.stat
  return { bio, cols, rows, career: c ? line(c, 'MLB', '') : null, careerLabel: 'CAREER', playoffs: pc ? line(pc, 'PLAYOFFS', '') : null, seasonsShown: rows.map((r) => r.season), source: 'statsapi yearByYear / career' }
}

async function nflBack(m) {
  const [logs, week] = await Promise.all([fetchNfl(nflLogPaths()).catch(() => null), fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)])
  const p = (week?.players || []).find((x) => x.player_id === m.playerId)
  const games = logs?.logs?.[m.playerId]?.log || []
  const bio = [['POSITION', m.pos], ['TEAM', m.team], ['NUMBER', m.number != null ? `#${m.number}` : null], ['BORN', bornWord(p?.birth_date, '')]].filter(([, v]) => v)
  const qb = m.pos === 'QB'
  const cols = qb
    ? [['YEAR', 1.2, 'season'], ['TEAM', 1.2, 'tm'], ['G', 1, 'g'], ['PASS YDS', 1.6, 'payd'], ['CAR', 1, 'car'], ['RUSH YDS', 1.6, 'ruyd'], ['TD', 1, 'td']]
    : [['YEAR', 1.2, 'season'], ['TEAM', 1.2, 'tm'], ['G', 1, 'g'], ['CAR', 1, 'car'], ['RUSH YDS', 1.6, 'ruyd'], ['REC', 1, 'rec'], ['REC YDS', 1.5, 'recyd'], ['TD', 1, 'td']]
  const seasons = [...new Set(games.map((g) => g.s))].sort()
  const sum = (arr, k) => arr.reduce((a, g) => a + (num(g[k]) || 0), 0)
  const mk = (arr, season, tm) => ({ season, tm, g: String(arr.length), payd: f0(sum(arr, 'g_payd')), car: f0(sum(arr, 'g_car')), ruyd: f0(sum(arr, 'g_ruyd')), rec: f0(sum(arr, 'g_rec')), recyd: f0(sum(arr, 'g_recyd')), td: f0(sum(arr, 'g_td')) })
  const rows = seasons.map((s) => { const a = games.filter((g) => g.s === s); return mk(a, String(s), a[a.length - 1]?.tm || '') })
  return { bio, cols, rows, career: rows.length ? mk(games, `${rows.length} YR`, '') : null, careerLabel: 'TOTAL (seasons shown)', playoffs: null, seasonsShown: rows.map((r) => r.season), source: 'nfl_logs.json games, summed per season' }
}

const BACKS = { nhl: nhlBack, mlb: mlbBack, nfl: nflBack }
export async function backOf(m) {
  const b = await BACKS[m.sport](m)
  return { ...b, blurb: blurbOf(m) }
}

// ── drawing ───────────────────────────────────────────────────────────────────
const STOCK = INK            // the cream stock: the poster palette's own cream
const PRINT = CHASSIS.bg     // printed in the chassis black
const SOFT = alpha(CHASSIS.bg, 0.72)

export async function playerBack(m, b, o = 'p') {
  const [base, display, , grain] = await Promise.all([loadFonts(), loadDisplay(), loadMark(), loadGrain()])
  const accent = SPORT_ACCENT[m.sport]
  const P = o === 'p'
  const W = SIZE[o].w, H = SIZE[o].h
  const inset = P ? 28 : 14, bw = P ? 22 : 12
  const nRows = P ? 6 : 4
  const shown = b.rows.slice(-nRows)
  const tableW = W - 2 * (inset + bw) - (P ? 64 : 40) - 34
  const unit = tableW / b.cols.reduce((a, c) => a + c[1], 0)
  const rowH = P ? 62 : 40
  const cell = (c, v, i, head, bold) => (
    <div key={i} style={{ display: 'flex', width: Math.floor(c[1] * unit), justifyContent: i === 0 ? 'flex-start' : i === 1 ? 'flex-start' : 'flex-end', paddingRight: i === 0 ? 0 : 6 }}>
      <span style={{ fontSize: fs(o, head ? (P ? 22 : 24) : (P ? 26 : 24)), fontWeight: head || bold ? 800 : 600, color: head ? PRINT : PRINT, whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
  const line = (r, key, kind) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', height: rowH, padding: '0 14px', background: kind === 'head' ? accent : kind === 'tot' ? alpha(accent, 0.38) : kind === 'alt' ? alpha(PRINT, 0.06) : 'transparent', borderTop: kind === 'tot' ? `3px solid ${PRINT}` : 'none' }}>
      {b.cols.map((c, i) => cell(c, kind === 'head' ? c[0] : (r[c[2]] ?? ''), i, kind === 'head', kind === 'tot'))}
    </div>
  )
  const nameSize = Math.max(44, Math.min(P ? 96 : 66, Math.floor((W - 2 * (inset + bw) - 240) / (String(m.name).length * 0.46))))
  const dateWord = m.dayWord
  const el = (
    <div style={{ width: W, height: H, display: 'flex', background: CHASSIS.bg, fontFamily: 'Inter', position: 'relative' }}>
      <div style={{ display: 'flex', position: 'absolute', left: inset, top: inset, width: W - 2 * inset, height: H - 2 * inset, borderRadius: P ? 30 : 20, border: `${bw}px solid ${accent}`, background: STOCK, overflow: 'hidden', flexDirection: 'column' }}>
        {grain ? <img src={grain} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.35 }} /> : null}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: P ? '22px 32px 10px 32px' : '10px 20px 4px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1, color: PRINT, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.name}</span>
            <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 800, color: SOFT, marginTop: 6 }}>{[m.pos, m.teamName, m.number != null ? `#${m.number}` : null].filter(Boolean).join('  ·  ')}</span>
          </div>
          {m.logo ? (m.logoPlate
            ? <div style={{ display: 'flex', width: P ? 120 : 76, height: P ? 120 : 76, borderRadius: 60, background: PRINT, alignItems: 'center', justifyContent: 'center' }}><img src={m.logo} width={P ? 90 : 56} height={P ? 90 : 56} /></div>
            : <img src={m.logo} width={P ? 120 : 76} height={P ? 120 : 76} />) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: P ? 8 : 4, padding: P ? '0 32px' : '0 20px', margin: P ? '6px 0 14px 0' : '2px 0 6px 0' }}>
          {b.bio.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginRight: 18 }}>
              <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: SOFT, letterSpacing: 1 }}>{k}</span>
              <span style={{ fontSize: fs(o, P ? 26 : 24), fontWeight: 800, color: PRINT }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: P ? '0 32px' : '0 20px', padding: '0 14px', height: P ? 54 : 40, background: PRINT, borderRadius: '8px 8px 0 0' }}>
          <span style={{ fontFamily: DISPLAY, fontSize: P ? 38 : 30, fontWeight: 900, color: STOCK, letterSpacing: 2 }}>COMPLETE RECORD</span>
          <span style={{ fontSize: fs(o, 22), fontWeight: 700, color: STOCK }}>{shown.length ? `${shown[0].season}${shown.length > 1 ? ` to ${shown[shown.length - 1].season}` : ''}` : ''}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: P ? '0 32px' : '0 20px', border: `3px solid ${PRINT}`, borderTop: 'none' }}>
          {line(null, 'h', 'head')}
          {shown.length ? shown.map((r, i) => line(r, r.season, i % 2 ? 'alt' : 'row')) : (
            <div style={{ display: 'flex', height: rowH, alignItems: 'center', padding: '0 14px' }}><span style={{ fontSize: fs(o, 26), fontWeight: 700, color: SOFT }}>No season rows on file for this player</span></div>
          )}
          {b.career ? line({ ...b.career, season: b.career.season }, 'career', 'tot') : null}
          {b.playoffs ? line(b.playoffs, 'po', 'row') : null}
        </div>
        <div style={{ display: 'flex', margin: P ? '4px 32px 0 32px' : '2px 20px 0 20px' }}>
          <span style={{ fontSize: fs(o, 22), fontWeight: 600, color: SOFT }}>{`${b.careerLabel === 'CAREER' ? 'CAREER row: the league’s own total, all seasons.' : `${b.careerLabel}: the sum of the ${b.rows.length} season${b.rows.length === 1 ? '' : 's'} on file.`}${b.rows.length > shown.length ? ` Last ${shown.length} of ${b.rows.length} seasons shown.` : ''}`}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: P ? '14px 32px 0 32px' : '6px 20px 0 20px', padding: P ? '14px 20px' : '6px 14px', borderLeft: `10px solid ${accent}`, background: alpha(PRINT, 0.07) }}>
          <span style={{ fontSize: fs(o, 22), fontWeight: 800, letterSpacing: 3, color: SOFT }}>WHY HE'S ON THE BOARD</span>
          <span style={{ fontSize: fs(o, P ? 30 : 24), fontWeight: 700, color: PRINT, marginTop: 4 }}>{b.blurb}</span>
        </div>
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: P ? 66 : 44, alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: PRINT }}>
          <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: STOCK, letterSpacing: 1 }}>{`${m.brand.name} · DASH Network`}</span>
          <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: alpha(STOCK, 0.8) }}>{dateWord}</span>
        </div>
      </div>
    </div>
  )
  // the same type-floor lint the fronts use
  const { lintType, LINT } = await import('./protoCards')
  LINT.push(...lintType(el, o).map((x) => ({ ...x, o, card: 'back' })))
  const res = new ImageResponse(el, { width: W, height: H, fonts: [...base, ...display] })
  return Buffer.from(await res.arrayBuffer())
}
