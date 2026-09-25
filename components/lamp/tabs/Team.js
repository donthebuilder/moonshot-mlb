'use client'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampTeam } from '../../../lib/nhl/useLamp'
import { nhlLogo } from '../../../lib/nhl/teams'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, StaleSeasonNote, GameTypeChip, LampDot, TeamMark, fmtDay, fmtPuckDrop, ageFrom, fmtPct1, fmtPct3, fmt2, fmtSec, plusMinus, dash } from '../ui'

// 🏒 TEAM — one club, a real destination (spec §11), never a modal. Its
// record and place from the standings feed; NEXT UP and LAST FIVE from the
// club schedule; the roster with each man's season line joined by player id
// from club-stats; the whole schedule folded. Season lines are labelled and,
// before opening night, say they are last season's.
const rec = (r) => `${r.w}-${r.l}-${r.otl}`

const SKATER_COLS = [
  { key: 'number', label: '#', w: 34, heat: false, fmt: (v) => (v == null ? '' : v) },
  { key: 'name', label: 'Player', w: 150, heat: false, sticky: true },
  { key: 'pos', label: 'Pos', w: 36, heat: false },
  { key: 'age', label: 'Age', w: 38, heat: false },
  { key: 'gp', label: 'GP', w: 36, heat: false },
  { key: 'g', label: 'G', w: 34 }, { key: 'a', label: 'A', w: 34 }, { key: 'pts', label: 'PTS', w: 42 },
  { key: 'plusMinus', label: '+/-', w: 40, fmt: plusMinus }, { key: 'pim', label: 'PIM', w: 40, heat: false },
  { key: 'shots', label: 'S', w: 36 }, { key: 'shPct', label: 'S%', w: 42, fmt: fmtPct1 },
  { key: 'toi', label: 'TOI', w: 48, fmt: fmtSec }, { key: 'ppg', label: 'PPG', w: 40 }, { key: 'gwg', label: 'GWG', w: 42 },
]
const GOALIE_COLS = [
  { key: 'number', label: '#', w: 34, heat: false, fmt: (v) => (v == null ? '' : v) },
  { key: 'name', label: 'Goalie', w: 150, heat: false, sticky: true },
  { key: 'age', label: 'Age', w: 38, heat: false },
  { key: 'gp', label: 'GP', w: 36, heat: false }, { key: 'gs', label: 'GS', w: 36, heat: false },
  { key: 'w', label: 'W', w: 34 }, { key: 'l', label: 'L', w: 34, invert: true }, { key: 'otl', label: 'OTL', w: 40, heat: false },
  { key: 'gaa', label: 'GAA', w: 46, invert: true, fmt: fmt2 }, { key: 'svPct', label: 'SV%', w: 48, fmt: fmtPct3 },
  { key: 'so', label: 'SO', w: 34 }, { key: 'sa', label: 'SA', w: 42, heat: false },
]

export default function Team({ abbrev, onOpenPlayer, onOpenGame, onBack }) {
  const { data: t, error, loading } = useLampTeam(abbrev)
  if (!/^[A-Za-z]{3}$/.test(String(abbrev || ''))) return <EmptyState title="NO CLUB PICKED" note="Open a club from Teams, a score row, or a player’s file."><BackBtn onBack={onBack} /></EmptyState>
  if (loading && !t) return <Loading what="the club" />
  if (!t) {
    const notAClub = error?.status === 400 || error?.status === 404
    return <EmptyState title={notAClub ? 'NO SUCH CLUB' : 'LIVE DATA DELAYED'} note={notAClub ? 'That is not one of the 32 NHL clubs.' : 'We’re waiting on the league’s club feeds.'} tone={notAClub ? C.text3 : C.amber}><BackBtn onBack={onBack} /></EmptyState>
  }
  return <TeamBody t={t} error={error} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} onBack={onBack} />
}

function TeamBody({ t, error, onOpenPlayer, onOpenGame, onBack }) {
  const s = t.standing
  const games = t.schedule?.games || []
  const played = games.filter((g) => g.state === 'final')
  const last5 = played.slice(-5).reverse()
  const next5 = games.filter((g) => g.state !== 'final').slice(0, 5)
  const live = games.filter((g) => g.state === 'live')
  const stats = t.stats
  const byId = new Map((stats?.skaters || []).concat(stats?.goalies || []).map((x) => [x.id, x]))
  const rosterRows = (group) => (t.roster || []).filter((r) => r.group === group).map((r) => {
    const line = byId.get(r.id) || {}
    return { ...line, id: r.id, number: r.number, name: r.name, pos: r.pos, age: ageFrom(r.birthDate), _headshot: r.headshot }
  })
  const fwd = rosterRows('forwards'); const def = rosterRows('defensemen'); const gk = rosterRows('goalies')
  const withLine = (rows) => rows.filter((r) => r.gp != null).length
  const skaterLeaders = (stats?.skaters || []).slice().sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1)).slice(0, 5)
  const sched = usePreview(games, 12)
  const stale = t.statsStale
  const opens = t.season?.opens
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackBtn onBack={onBack} />
      <DelayedBanner error={error} what="the league’s club feeds" />
      <PageHeader
        eyebrow={`LAMP · TEAM · ${t.team.conference === 'E' ? 'EASTERN' : 'WESTERN'} · ${t.team.division.toUpperCase()}`}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><img src={nhlLogo(t.team.abbrev)} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain' }} />{t.team.name}</span>}
        note={s ? `${t.standingSeason}${t.standingStale ? ' final' : ''}: ${rec(s)}, ${s.pts} points, ${ordinal(s.divRank)} in the ${s.divName}, ${ordinal(s.confRank)} in the ${s.confName === 'Eastern' ? 'East' : 'West'}. Goals ${s.gf} for, ${s.ga} against (${plusMinus(s.diff)}). Last ten ${s.l10.w}-${s.l10.l}-${s.l10.otl}${s.streak ? `, ${s.streak}` : ''}. Home ${s.home.w}-${s.home.l}-${s.home.otl}, road ${s.road.w}-${s.road.l}-${s.road.otl}.` : 'No standings row for this club yet.'}
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={s ? [{ value: rec(s), label: t.standingStale ? `${t.standingSeason} FINAL` : 'RECORD', tone: t.standingStale ? C.amber : C.text2 }, { value: s.pts, label: 'PTS', tone: C.text }, { value: plusMinus(s.diff), label: 'DIFF', tone: s.diff >= 0 ? C.teal : C.text3 }] : null}
      />

      {live.length > 0 && (
        <section aria-label="Live now">
          <Kicker tone={C.lamp}>LIVE NOW</Kicker>
          {live.map((g) => <GameRow key={g.id} g={g} onOpen={onOpenGame} />)}
        </section>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section aria-label="Next up">
          <Kicker>NEXT UP</Kicker>
          {next5.length ? <table style={tbl}><tbody>{next5.map((g) => <GameRow key={g.id} g={g} onOpen={onOpenGame} />)}</tbody></table> : <EmptyState title="NO GAMES SCHEDULED" note="Nothing left on the club’s schedule." />}
        </section>
        <section aria-label="Last five">
          <Kicker>LAST FIVE</Kicker>
          {last5.length ? <table style={tbl}><tbody>{last5.map((g) => <GameRow key={g.id} g={g} onOpen={onOpenGame} />)}</tbody></table> : <EmptyState title="NO GAMES PLAYED" note={`The club’s ${t.schedule?.seasonLabel} schedule has not started.`} />}
        </section>
      </div>

      <section aria-label="Roster">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <Kicker>ROSTER · {t.roster.length}</Kicker>
          {stats?.seasonLabel && <span style={{ color: stale ? C.amber : C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em', marginBottom: 6 }}>{stats.seasonLabel} LINES{stale ? ' (LAST SEASON)' : ''} · {withLine(fwd) + withLine(def) + withLine(gk)} OF {t.roster.length} HAVE ONE</span>}
        </div>
        {stale && <div style={{ marginBottom: 10 }}><StaleSeasonNote label={stats?.seasonLabel || ''} opens={opens} what="lines" /></div>}
        <div style={{ color: C.text3, fontSize: 11, marginBottom: 8 }}>A blank line is a man with no NHL games for this club that season — a new signing, a call-up, a camp invite. Tap a name for his file.</div>
        {[['FORWARDS', fwd, SKATER_COLS], ['DEFENCE', def, SKATER_COLS], ['GOALIES', gk, GOALIE_COLS]].map(([title, rows, cols]) => rows.length ? (
          <div key={title} style={{ marginBottom: 12 }}>
            <Kicker tone={C.text3}>{title} · {rows.length}</Kicker>
            <LampTable rows={rows} columns={cols} maxHeight={9999} maxRows={60} heatMode="standouts" initialSort={cols === GOALIE_COLS ? 'gp' : 'pts'} onRowClick={(r) => onOpenPlayer?.(r.id)} />
          </div>
        ) : null)}
      </section>

      {skaterLeaders.length > 0 && (
        <section aria-label="Team leaders">
          <Kicker>TEAM LEADERS · {stats.seasonLabel}{stale ? ' (LAST SEASON)' : ''}</Kicker>
          <table style={tbl}><tbody>
            {skaterLeaders.map((p, i) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, width: 22, fontFamily: NUM_FONT, color: C.text3, fontSize: 10 }}>{i + 1}</td>
                <td style={td}><button type="button" onClick={() => onOpenPlayer?.(p.id)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit', fontWeight: 700 }}>{p.name}</button> <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{p.pos}</span></td>
                <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }}>{p.g} G · {p.a} A</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 900 }}>{p.pts} <span style={{ color: C.text3, fontSize: 9 }}>PTS</span></td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      <section aria-label="Schedule">
        <Kicker>SCHEDULE · {t.schedule?.seasonLabel} · {games.length} GAMES</Kicker>
        <table style={tbl}><tbody>{sched.shown.map((g) => <GameRow key={g.id} g={g} onOpen={onOpenGame} />)}</tbody></table>
        <ShowMoreButton open={sched.open} restN={sched.restN} toggle={sched.toggle} itemWord="games" />
      </section>

      <SourceLine>Source: NHL standings/now, roster/{t.team.abbrev}/current, club-stats/{t.team.abbrev}/{'{season}'}/2 and club-schedule-season/{t.team.abbrev}/now via /api/lamp/team, cached ten minutes. Season lines are for the newest season with games in it.</SourceLine>
    </div>
  )
}

function GameRow({ g, onOpen }) {
  const live = g.state === 'live'; const done = g.state === 'final'
  const status = g.statusLine || fmtPuckDrop(g.startUtc)
  const tone = g.result === 'W' ? C.teal : g.result ? C.text3 : C.text2
  return (
    <tr onClick={() => onOpen?.(g.id)} tabIndex={0} role="link" aria-label={`${fmtDay(g.date)} ${g.home ? 'vs' : 'at'} ${g.opponent.abbrev}, ${status}. Open game.`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(g.id) } }}
      style={{ cursor: 'pointer', borderTop: `1px solid ${C.border}`, background: live ? `linear-gradient(90deg, ${C.lamp}12, transparent 40%)` : 'transparent', opacity: g.scheduleState !== 'OK' ? .55 : 1 }}>
      <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3, whiteSpace: 'nowrap' }}>{fmtDay(g.date)}{g.gameType === 1 ? <span style={{ marginLeft: 6, color: C.amber, fontSize: 8, letterSpacing: '.1em' }}>PRE</span> : null}</td>
      <td style={td}><span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginRight: 6 }}>{g.home ? 'VS' : '@'}</span><TeamMark abbrev={g.opponent.abbrev} size={16} /></td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: NUM_FONT, color: live ? C.lamp : tone, fontWeight: 800, fontSize: 11 }}>
        {live && <LampDot />}
        {done ? <>{g.result} {g.us.score}–{g.opponent.score}{g.outcome && g.outcome !== 'REG' ? ` (${g.outcome})` : ''}</> : live ? `${g.us.score}–${g.opponent.score} · ${status}` : status}
      </td>
    </tr>
  )
}
const ordinal = (n) => { if (n == null) return '—'; const r = n % 100; if (r >= 11 && r <= 13) return `${n}th`; return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
function BackBtn({ onBack }) {
  return <div><button type="button" onClick={onBack} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ Teams</button></div>
}
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
