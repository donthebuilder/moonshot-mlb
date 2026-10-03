'use client'
import ShotPanel from '../ShotPanel'
import FollowButton from '../../FollowButton'
import StarMemory from '../../watch/StarMemory'
import PlayerNotes from '../../PlayerNotes'
import MultiLine from '../../ledger/MultiLine'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import HisNumbers from '../../HisNumbers'
import { etToday } from '../../../lib/freshness'
import { useLampPlayer, useLampBoardOnce } from '../../../lib/nhl/useLamp'
import VerdictHero from '../../VerdictHero'
import { SportTheme } from '../../SportTheme'
import StatStrip, { HitRateBoxes } from '../../StatStrip'
import { nhlTeam } from '../../../lib/nhl/teams'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { STATUS, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, StaleSeasonNote, fmtDay, fmtPuckDrop, zoneAbbrev, ageFrom, fmtHeight, fmtPct1, fmtPct3, fmt2, fmtSec, plusMinus, dash } from '../ui'
import WhyLines from '../../WhyLines'
import { goalWhy } from '../../../lib/nhl/goalWhy'
import { arenaOf } from '../../../lib/nhl/arenas'

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
  if (!id) return <EmptyState title="NO PLAYER PICKED" note="Open a player from a roster, the directory, a leaders table, or a goal."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!/^\d{7}$/.test(String(id))) return <EmptyState title="NO SUCH PLAYER" note={`“${String(id)}” is not an NHL player id -- the link may be old or cut short.`} tone={C.text3}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !p) return <Loading what="the player file" />
  if (!p) {
    const nobody = error?.status === 400 || error?.status === 404
    return <EmptyState title={nobody ? 'NO SUCH PLAYER' : 'LIVE DATA DELAYED'} note={nobody ? 'That is not a player id the league knows.' : 'We’re waiting on the league’s player feed.'} tone={nobody ? C.text3 : C.amber}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  }
  return <PlayerBody p={p} error={error} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} onBack={onBack} backLabel={backLabel} />
}

// HIS ROW ON TONIGHT'S BOARD (2026-09-28, plan C3): the header is MOONSHOT's
// player-card hero (components/VerdictHero.js) -- his face in the dial, the
// board's own score round it, the board's word for him as the badge
// (CALLED / ON THE BOARD / NOT ON THE BOARD, lib's STATUS), and the board's
// why or reason as the line. Not playing tonight -> an empty dial that says
// so; a goalie has no goal board and says that. Nothing is re-derived here.
function boardSpot(board, p) {
  if (!board?.games || p.goalie) return null
  const id = String(p.id)
  for (const g of board.games) {
    const r = (g.rows || []).find((x) => String(x.playerId) === id)
    if (r) return { r, g }
  }
  const g = board.games.find((x) => x.game.home.abbrev === p.team || x.game.away.abbrev === p.team)
  return g ? { r: null, g } : null
}

function PlayerBody({ p, error, onOpenTeam, onOpenGame, onBack, backLabel }) {
  const goalie = p.goalie
  const { data: board } = useLampBoardOnce()
  const spot = boardSpot(board, p)
  const row = spot?.r || null
  const opp = spot ? (spot.g.game.home.abbrev === p.team ? `vs ${spot.g.game.away.abbrev}` : `@ ${spot.g.game.home.abbrev}`) : null
  const called = row?.status === 'called'
  // The badge is short, like MOONSHOT's role codes (CALLED); the longer words
  // ride the market line so they never squeeze his name at 390px.
  const word = goalie ? 'GOALIE' : !board ? null : !spot ? 'NO GAME TONIGHT' : row ? STATUS[row.status] : STATUS.off
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
  // MOONSHOT's player-card pieces (2026-09-29, player cards step 6). LAMP's
  // theme goes to the shared parts (Follow, notes, the strip) through
  // SportTheme. Not CardShell's inline panel: its 20px padding cut "Connor
  // McDavid" to "Connor Mc…" at 390. The season's line leads its section as
  // MOONSHOT's StatStrip, a skater's recent goals as its HitRateBoxes (the
  // league's game log, newest first; the season box from the featured line),
  // under the kicker that names the season. Neutral colours: none of these
  // numbers is ranked against anyone. A stat the feed doesn't carry is dropped.
  const fr = f.regular
  const lineStats = !fr ? [] : (goalie ? [
    ['gp', 'GP', dash(fr.gp), 'Games played'], ['w', 'W', dash(fr.w), 'Wins'], ['svPct', 'SV%', fmtPct3(fr.svPct), 'Save percentage'],
    ['gaa', 'GAA', fmt2(fr.gaa), 'Goals against average'], ['so', 'SO', dash(fr.so), 'Shutouts'],
  ] : [
    ['g', 'G', dash(fr.g), 'Goals'], ['a', 'A', dash(fr.a), 'Assists'], ['pts', 'PTS', dash(fr.pts), 'Points'],
    ['shots', 'S', dash(fr.shots), 'Shots on goal'], ['shPct', 'S%', fmtPct1(fr.shPct), 'Shooting percentage'], ['toi', 'TOI', fmtSec(fr.toi), 'Average time on ice'],
  ]).filter(([, , text]) => text && text !== '—').map(([id, label, text, name]) => ({ id, label, text, title: `${name}, ${f.seasonLabel} regular season${stale ? ' (last season)' : ''}.` }))
  const logNewest = p.log?.rows || []
  const goalsIn = (n) => {
    const g = logNewest.slice(0, n)
    return g.length === n ? { num: g.reduce((t, r) => t + (Number(r.g) || 0), 0), den: n } : null
  }
  const goalBoxes = goalie ? [] : [
    ['l5', 'L5', goalsIn(5)], ['l10', 'L10', goalsIn(10)],
    ['szn', f.seasonLabel || 'Season', Number.isFinite(fr?.g) && fr?.gp > 0 ? { num: fr.g, den: fr.gp } : null],
  ].filter(([, , v]) => v).map(([id, label, v]) => ({ id, label, ...v, unit: 'GP' }))
  return (
    <SportTheme theme={C} accent={C.ice}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {onBack && <BackBtn onBack={onBack} label={backLabel} />}
      <DelayedBanner error={error} what="the league’s player feed" />
      <header>
        <h2 className="sr-only">{p.name}</h2>
        <VerdictHero theme={C} numFont={NUM_FONT}
          col={C.ice} score={row?.score ?? null} photo={p.headshot || null}
          dialTitle={row ? 'Tonight’s goal-board score: the mean of three percentile ranks tonight -- shots, goals and ice time per game over his last 82 NHL games.' : 'Not on tonight’s goal board, so no score.'}
          title={<>{p.number != null && <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT }}>#{p.number} </span>}{p.name}</>}
          badge={called ? STATUS.called : null}
          meta={<>
            {/* The club, tappable, on the hero's own line (was a row of its own under it). */}
            {p.team && (
              <button type="button" onClick={() => onOpenTeam?.(p.team)} title={team ? team.name : p.teamName} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit' }}>
                {p.teamLogo && <img src={p.teamLogo} alt="" width={14} height={14} style={{ width: 14, height: 14 }} />}
                <b style={{ font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>{p.team}</b>
              </button>
            )}
            {[p.team ? '' : null, p.pos, spot ? `${opp} · ${spot.g.game.state === 'pre' ? `${fmtPuckDrop(spot.g.game.startUtc)} ${zoneAbbrev()}` : spot.g.game.statusLine || spot.g.game.state}` : null, !p.active ? 'not active' : null].filter((x) => x != null && x !== false).join(' · ')}
          </>}
          market={[goalie ? 'LAMP · GOALIE' : 'LAMP', !goalie && word, spot && !goalie ? (spot.g.locked ? 'LOCKED' : spot.g.setting ? 'SETTING' : 'PREVIEW') : null].filter(Boolean).join(' · ')}
          line={row ? (row.why || (row.reason ? `Not on the board: ${row.reason}` : null)) : spot && !goalie && (spot.g.rows || []).length ? 'Not on tonight’s board: he isn’t in the posted lineup or on the club’s current roster.' : null}
          style={{ marginBottom: 10 }}
        />
        {/* The goal model's three legs, ranked against tonight's GOAL board
            (lib/nhl/goalWhy.js, BATCH-SIGNAL-WHY S3a) -- under the board's own
            why line, never instead of it. */}
        {row && !goalie && (() => {
          const w = goalWhy(row, board)
          return w ? <WhyLines theme={C} numFont={NUM_FONT} accent={C.ice} why={[w.why]} watch={w.watch} explain={w.explain} /> : null
        })()}
        <div style={{ minWidth: 0, borderBottom: `1px solid ${C.border2}`, paddingBottom: 12 }}>
          <div style={{ color: C.text3, fontSize: 11, lineHeight: 1.5 }}>{bio}</div>
          {!goalie && <MultiLine sport="nhl" playerId={p.id} words={{ G: 'multi-goal' }} color={C.ice} textColor={C.text2} />}
          {/* Follow, as on MOONSHOT's and TUDDY's cards (lib/dash/follow.js takes nhl). */}
          <div style={{ marginTop: 8, display: 'grid', gap: 6, justifyItems: 'start' }}><FollowButton sport="nhl" id={String(p.id)} name={p.name} team={p.team} position={p.pos} compact /><StarMemory sport="nhl" id={String(p.id)} /></div>
        </div>
      </header>

      <section aria-label="Season line">
        <Kicker>{goalie ? 'RECORD' : 'THE LINE'} · {f.seasonLabel}{stale ? ' (LAST SEASON)' : ''}</Kicker>
        {stale && <div style={{ marginBottom: 10 }}><StaleSeasonNote label={f.seasonLabel} opens={p.opens} what="line" /></div>}
        {lineStats.length > 0 && <StatStrip stats={lineStats} />}
        {goalBoxes.length > 0 && <HitRateBoxes boxes={goalBoxes} style={{ marginTop: 6 }}
          text={(b) => `${b.num} ${b.num === 1 ? 'goal' : 'goals'}`}
          tip={(b) => `${b.num} goal${b.num === 1 ? '' : 's'} in his last ${b.den} games${b.id === 'szn' ? ` (${f.seasonLabel} regular season)` : ''}.`} />}
        {(lineStats.length > 0 || goalBoxes.length > 0) && <div style={{ height: 10 }} />}
        {f.regular
          ? <LampTable rows={thisSeasonRows} columns={cols.filter((c) => c.key !== 'team')} maxHeight={9999} heatMode="none" />
          : <EmptyState title="NO NHL LINE YET" note="The league has no regular-season line for him. A camp invite or a prospect, most likely." />}
      </section>

      {p.last5.length > 0 && (
        <section aria-label="Last five">
          <Kicker>LAST FIVE</Kicker>
          {/* MOONSHOT's table (2026-09-29, the LAMP walk-through): the game log's
              own LampTable and columns, so the two read alike; a playoff game
              keeps its tag. */}
          <LampTable
            rows={p.last5.map((g) => ({ ...g, _key: g.gameId, vs: vs(g) }))}
            columns={(goalie ? G_LOG_COLS : SK_LOG_COLS).map((c) => (c.key === 'date'
              ? { ...c, fmt: (v, r) => <>{fmtDay(v)}{r.gameType === 3 ? <span style={{ marginLeft: 6, color: C.amber, fontSize: 8, letterSpacing: '.1em' }}>PLAYOFF</span> : null}</> , w: 118 }
              : c))}
            maxHeight={9999} maxRows={5} heatMode="standouts" onRowClick={(r) => onOpenGame?.(r.gameId)}
            caption="His last five games, newest first. Each row opens the game." />
        </section>
      )}

      {/* WHERE HE SHOOTS FROM (lamp research step 3): the shot archive's
          aggregate for him, season and last 10. Skaters only. */}
      {!goalie && (
        <section aria-label="Where he shoots from">
          <Kicker>WHERE HE SHOOTS FROM</Kicker>
          {/* the building: tonight's game's when he plays tonight, else his club's own */}
          <ShotPanel sel={{ player: p.id }} who="He" height={480} venue={arenaOf(spot?.g?.game?.home?.abbrev || p.team)?.name}
            opp={spot?.g?.game ? (spot.g.game.home?.abbrev === p.team ? spot.g.game.away?.abbrev : spot.g.game.home?.abbrev) || null : null} />
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
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={40} caption="His trophies"
            rows={p.awards.map((a) => ({ ...a, _key: a.trophy, times: a.seasons.length }))}
            columns={[
              { key: 'trophy', label: 'Trophy', heat: false, sticky: true, w: 200, fmt: (v) => <b>{v}</b> },
              { key: 'times', label: 'Won', w: 44, dp: 0, fmt: (v) => `${v} ×` },
              { key: 'seasons', label: 'Seasons', heat: false, numeric: false, w: 200, fmt: (v) => <span style={{ fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{v.map((x) => `${String(x).slice(0, 4)}-${String(x).slice(6, 8)}`).join(', ')}</span> },
            ]} />
        </section>
      )}
      {/* 🔢 His numbers (numerology step 7). Skaters: goals are LAMP's number.
          Next goal only from THIS season's line (a stale featured season would
          count last year's); career next from the league's career totals. */}
      <PlayerNotes playerId={String(p.id)} scope="nhl" accent={C.ice} />
      {!goalie && <HisNumbers name={p.name} jersey={p.number} birthDate={p.birthDate} next={!stale && Number.isFinite(f.regular?.g) ? f.regular.g + 1 : null} career={Number.isFinite(p.career?.regular?.g) ? p.career.regular.g + 1 : null} nextWord="goal" date={etToday()} theme={C} accent={C.ice} numFont={NUM_FONT} />}
      <SourceLine>Source: NHL player/{p.id}/landing and player/{p.id}/game-log/{'{season}'}/2 via /api/lamp/player, cached ten minutes. The featured season is the feed’s own.</SourceLine>
    </div>
    </SportTheme>
  )
}

function BackBtn({ onBack, label }) {
  if (!onBack) return null   // inside the player card (PlayerPeek) the card's × is the way out
  return <div><button type="button" onClick={onBack} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ {label}</button></div>
}
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const thr = { color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }
