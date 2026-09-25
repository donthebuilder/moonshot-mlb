'use client'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampPlayer } from '../../../lib/nhl/useLamp'
import { nhlTeam } from '../../../lib/nhl/teams'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, StaleSeasonNote, fmtDay, ageFrom, fmtHeight, fmtPct1, fmtPct3, fmt2, fmtSec, plusMinus, dash } from '../ui'

// 🏒 PLAYER — one man's file, at a stable address (#sport=nhl&tab=player&
// player=<id>). A skater and a goalie share the route and NOT the page:
// the goalie's hierarchy is starts, record, GAA, SV%, shutouts (spec §10),
// the skater's is goals, assists, points. Everything is a field of
// player/{id}/landing or the game log; the season shown is the feed's own
// featured season, and before opening night the page says it is last
// season's line. Nothing here is a projection.
const SK_SEASON_COLS = [
  { key: 'seasonLabel', label: 'Season', w: 70, heat: false, sticky: true }, { key: 'team', label: 'Team', w: 110, heat: false },
  { key: 'gp', label: 'GP', w: 36, heat: false }, { key: 'g', label: 'G', w: 34 }, { key: 'a', label: 'A', w: 34 }, { key: 'pts', label: 'PTS', w: 42 },
  { key: 'plusMinus', label: '+/-', w: 40, fmt: plusMinus }, { key: 'pim', label: 'PIM', w: 40, heat: false }, { key: 'ppg', label: 'PPG', w: 40 }, { key: 'shg', label: 'SHG', w: 40, heat: false },
  { key: 'gwg', label: 'GWG', w: 42 }, { key: 'shots', label: 'S', w: 36 }, { key: 'shPct', label: 'S%', w: 42, fmt: fmtPct1 }, { key: 'toi', label: 'TOI', w: 48, fmt: fmtSec },
]
const G_SEASON_COLS = [
  { key: 'seasonLabel', label: 'Season', w: 70, heat: false, sticky: true }, { key: 'team', label: 'Team', w: 110, heat: false },
  { key: 'gp', label: 'GP', w: 36, heat: false }, { key: 'gs', label: 'GS', w: 36, heat: false }, { key: 'w', label: 'W', w: 34 }, { key: 'l', label: 'L', w: 34, invert: true }, { key: 'otl', label: 'OTL', w: 40, heat: false },
  { key: 'gaa', label: 'GAA', w: 46, invert: true, fmt: fmt2 }, { key: 'svPct', label: 'SV%', w: 48, fmt: fmtPct3 }, { key: 'so', label: 'SO', w: 34 }, { key: 'sa', label: 'SA', w: 44, heat: false }, { key: 'ga', label: 'GA', w: 40, heat: false },
]
const SK_LOG_COLS = [
  { key: 'date', label: 'Date', w: 84, heat: false, sticky: true, fmt: fmtDay }, { key: 'vs', label: 'Opp', w: 64, heat: false },
  { key: 'g', label: 'G', w: 34 }, { key: 'a', label: 'A', w: 34 }, { key: 'pts', label: 'PTS', w: 42 }, { key: 'plusMinus', label: '+/-', w: 40, fmt: plusMinus },
  { key: 'shots', label: 'S', w: 36 }, { key: 'pim', label: 'PIM', w: 40, heat: false }, { key: 'ppp', label: 'PPP', w: 40 }, { key: 'toi', label: 'TOI', w: 48, heat: false }, { key: 'shifts', label: 'Shifts', w: 48, heat: false },
]
const G_LOG_COLS = [
  { key: 'date', label: 'Date', w: 84, heat: false, sticky: true, fmt: fmtDay }, { key: 'vs', label: 'Opp', w: 64, heat: false },
  { key: 'decision', label: 'Dec', w: 40, heat: false }, { key: 'sa', label: 'SA', w: 40 }, { key: 'ga', label: 'GA', w: 40, invert: true }, { key: 'svPct', label: 'SV%', w: 48, fmt: fmtPct3 }, { key: 'so', label: 'SO', w: 34, heat: false }, { key: 'toi', label: 'TOI', w: 52, heat: false },
]
const vs = (r) => `${r.home ? 'vs' : '@'} ${r.opp}`

export default function Player({ id, onOpenTeam, onOpenGame, onBack, backLabel = 'Players' }) {
  const { data: p, error, loading } = useLampPlayer(id)
  if (!/^\d{7}$/.test(String(id || ''))) return <EmptyState title="NO PLAYER PICKED" note="Open a player from a roster, the directory, a leaders table, or a goal."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !p) return <Loading what="the player file" />
  if (!p) {
    const nobody = error?.status === 400 || error?.status === 404
    return <EmptyState title={nobody ? 'NO SUCH PLAYER' : 'LIVE DATA DELAYED'} note={nobody ? 'That is not a player id the league knows.' : 'We’re waiting on the league’s player feed.'} tone={nobody ? C.text3 : C.amber}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  }
  return <PlayerBody p={p} error={error} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} onBack={onBack} backLabel={backLabel} />
}

function PlayerBody({ p, error, onOpenTeam, onOpenGame, onBack, backLabel }) {
  const goalie = p.goalie
  const f = p.featured
  const stale = Boolean(p.current && f.season && f.season < p.current)
  const nhlSeasons = p.seasons.filter((s) => s.league === 'NHL' && s.gameType === 2).slice().reverse()
  const otherLeagues = p.seasons.filter((s) => s.league !== 'NHL')
  const playoffSeasons = p.seasons.filter((s) => s.league === 'NHL' && s.gameType === 3)
  const logRows = (p.log?.rows || []).map((r) => ({ ...r, vs: vs(r), _id: r.gameId }))
  const log = usePreview(logRows, 10)
  const team = nhlTeam(p.team)
  const bio = [
    p.pos && `${goalie ? 'Goalie' : { C: 'Centre', L: 'Left wing', R: 'Right wing', D: 'Defence' }[p.pos] || p.pos}`,
    p.shoots && `${goalie ? 'catches' : 'shoots'} ${p.shoots}`,
    fmtHeight(p.heightIn) && `${fmtHeight(p.heightIn)}, ${dash(p.weightLb)} lb`,
    ageFrom(p.birthDate) != null && `age ${ageFrom(p.birthDate)}`,
    p.birthCity && `${p.birthCity}${p.birthCountry ? `, ${p.birthCountry}` : ''}`,
    p.draft ? `drafted ${p.draft.year} by ${p.draft.team}, round ${p.draft.round} (#${p.draft.overall} overall)` : 'undrafted',
  ].filter(Boolean).join(' · ')
  const seasonLine = (row, label) => (row ? { ...row, seasonLabel: label, team: row.team || '' } : null)
  const thisSeasonRows = [
    seasonLine(f.regular, `${f.seasonLabel} reg.`),
    f.playoffs ? seasonLine(f.playoffs, `${f.seasonLabel} playoffs`) : null,
    seasonLine(p.career.regular, 'Career reg.'),
    p.career.playoffs?.gp ? seasonLine(p.career.playoffs, 'Career playoffs') : null,
  ].filter(Boolean).map((r, i) => ({ ...r, _id: i }))
  const cols = goalie ? G_SEASON_COLS : SK_SEASON_COLS
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackBtn onBack={onBack} label={backLabel} />
      <DelayedBanner error={error} what="the league’s player feed" />
      <header style={{ display: 'flex', gap: 14, alignItems: 'center', borderBottom: `1px solid ${C.border2}`, paddingBottom: 12 }}>
        {p.headshot && <img src={p.headshot} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: '50%', background: C.bg3, objectFit: 'cover', flex: 'none' }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.ice, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', marginBottom: 6 }}>LAMP · {goalie ? 'GOALIE' : 'PLAYER'}{!p.active ? ' · NOT ACTIVE' : ''}</div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.1, color: C.cream }}>{p.name}{p.number != null && <span style={{ color: C.text3, font: `800 12px/1 ${NUM_FONT}`, marginLeft: 8 }}>#{p.number}</span>}</h2>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {p.team && (
              <button type="button" onClick={() => onOpenTeam?.(p.team)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit' }}>
                {p.teamLogo && <img src={p.teamLogo} alt="" width={18} height={18} style={{ width: 18, height: 18 }} />}
                <b style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>{p.team}</b>
                <span style={{ color: C.text3, fontSize: 11 }}>{team ? team.name : p.teamName}</span>
              </button>
            )}
          </div>
          <div style={{ marginTop: 6, color: C.text3, fontSize: 11, lineHeight: 1.5 }}>{bio}</div>
        </div>
      </header>

      <section aria-label="Season line">
        <Kicker>{goalie ? 'RECORD' : 'THE LINE'} · {f.seasonLabel}{stale ? ' (LAST SEASON)' : ''}</Kicker>
        {stale && <div style={{ marginBottom: 10 }}><StaleSeasonNote label={f.seasonLabel} opens={p.opens} what="line" /></div>}
        {f.regular
          ? <LampTable rows={thisSeasonRows} columns={cols.filter((c) => c.key !== 'team')} maxHeight={9999} heatMode="none" />
          : <EmptyState title="NO NHL LINE YET" note="The league has no regular-season line for him. A camp invite or a prospect, most likely." />}
      </section>

      {p.last5.length > 0 && (
        <section aria-label="Last five">
          <Kicker>LAST FIVE</Kicker>
          <table style={tbl}>
            <thead><tr style={thr}><th style={th}>DATE</th><th style={th}>OPP</th>{goalie ? <><th style={th}>DEC</th><th style={{ ...th, textAlign: 'right' }}>SA</th><th style={{ ...th, textAlign: 'right' }}>GA</th><th style={{ ...th, textAlign: 'right' }}>SV%</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>TOI</th></> : <><th style={{ ...th, textAlign: 'right' }}>G</th><th style={{ ...th, textAlign: 'right' }}>A</th><th style={{ ...th, textAlign: 'right' }}>PTS</th><th style={{ ...th, textAlign: 'right' }}>S</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>+/-</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>TOI</th></>}</tr></thead>
            <tbody>
              {p.last5.map((g) => (
                <tr key={g.gameId} onClick={() => onOpenGame?.(g.gameId)} tabIndex={0} role="link" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenGame?.(g.gameId) } }} style={{ cursor: 'pointer', borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3, whiteSpace: 'nowrap' }}>{fmtDay(g.date)}{g.gameType === 3 ? <span style={{ marginLeft: 6, color: C.amber, fontSize: 8, letterSpacing: '.1em' }}>PLAYOFF</span> : null}</td>
                  <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 11 }}>{g.home ? 'vs' : '@'} {g.opp}</td>
                  {goalie
                    ? <><td style={{ ...td, fontFamily: NUM_FONT, fontWeight: 800, color: g.decision === 'W' ? C.teal : C.text2 }}>{dash(g.decision)}</td><td style={num}>{dash(g.sa)}</td><td style={num}>{dash(g.ga)}</td><td style={{ ...num, fontWeight: 800 }}>{fmtPct3(g.svPct)}</td><td className="sm-hide" style={num}>{dash(g.toi)}</td></>
                    : <><td style={{ ...num, color: g.g > 0 ? C.lamp : C.text2, fontWeight: g.g > 0 ? 900 : 600 }}>{dash(g.g)}</td><td style={num}>{dash(g.a)}</td><td style={{ ...num, fontWeight: 800 }}>{dash(g.pts)}</td><td style={num}>{dash(g.shots)}</td><td className="sm-hide" style={num}>{plusMinus(g.plusMinus)}</td><td className="sm-hide" style={num}>{dash(g.toi)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-label="Game log">
        <Kicker>GAME LOG · {p.log?.seasonLabel || f.seasonLabel} REGULAR SEASON · {logRows.length} GAMES</Kicker>
        {logRows.length
          ? <>
              <LampTable rows={log.shown} columns={goalie ? G_LOG_COLS : SK_LOG_COLS} maxHeight={9999} maxRows={100} heatMode="standouts" onRowClick={(r) => onOpenGame?.(r.gameId)} />
              <ShowMoreButton open={log.open} restN={log.restN} toggle={log.toggle} itemWord="games" />
            </>
          : <EmptyState title="NO GAMES LOGGED" note={`The league has no ${p.log?.seasonLabel || f.seasonLabel} regular-season games for him yet.`} />}
      </section>

      {nhlSeasons.length > 0 && (
        <section aria-label="Season by season">
          <Kicker>SEASON BY SEASON · NHL REGULAR SEASON</Kicker>
          <LampTable rows={nhlSeasons.map((s, i) => ({ ...s, _id: `${s.season}-${i}` }))} columns={cols} maxHeight={9999} maxRows={40} heatMode="standouts" />
          {(playoffSeasons.length > 0 || otherLeagues.length > 0) && (
            <div style={{ color: C.text3, fontSize: 11, marginTop: 6 }}>
              Also on file: {playoffSeasons.length ? `${playoffSeasons.length} NHL playoff run${playoffSeasons.length === 1 ? '' : 's'}` : ''}{playoffSeasons.length && otherLeagues.length ? ' and ' : ''}{otherLeagues.length ? `${otherLeagues.length} season${otherLeagues.length === 1 ? '' : 's'} in ${[...new Set(otherLeagues.map((s) => s.league))].join(', ')}` : ''}.
            </div>
          )}
        </section>
      )}

      {p.awards.length > 0 && (
        <section aria-label="Awards">
          <Kicker tone={C.cream}>AWARDS</Kicker>
          <table style={tbl}><tbody>
            {p.awards.map((a) => (
              <tr key={a.trophy} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={td}><b>{a.trophy}</b></td>
                <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{a.seasons.length} × · {a.seasons.map((s) => `${String(s).slice(0, 4)}-${String(s).slice(6, 8)}`).join(', ')}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}
      <SourceLine>Source: NHL player/{p.id}/landing and player/{p.id}/game-log/{'{season}'}/2 via /api/lamp/player, cached ten minutes. The featured season is the feed’s own.</SourceLine>
    </div>
  )
}

function BackBtn({ onBack, label }) {
  return <div><button type="button" onClick={onBack} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ {label}</button></div>
}
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const thr = { color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }
