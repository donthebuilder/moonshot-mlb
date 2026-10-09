'use client'
import { useEffect, useMemo, useState } from 'react'
import ShotPanel from '../ShotPanel'
import { TabBtn, Navigator } from '../../card/CardNav'
import CallStatusBadge from '../../CallStatusBadge'
import { hashParams, writeHash, cardViewPush } from '../../../lib/urlState'
import { DETAIL_MARK, PEEK_MARK, VIEWS_KEY } from '../../../lib/useShellRoute'
import { aggregate } from '../../../lib/nhl/splits'
import FollowButton from '../../FollowButton'
import CardButton from '../../CardButton'
import { downloadLampPlayerCard } from '../shareCard'
import StarMemory from '../../watch/StarMemory'
import PlayerNotes from '../../PlayerNotes'
import MultiLine from '../../ledger/MultiLine'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import HisNumbers from '../../HisNumbers'
import InTheLedger from '../../ledger/InTheLedger'
import { etToday } from '../../../lib/freshness'
import { useLampPlayer, useLampBoardOnce, useLampSplits } from '../../../lib/nhl/useLamp'
import { playerHref } from '../../../lib/routes'
import SharedSeasonToggle from '../../nfl/SeasonToggle'
import { SportTheme } from '../../SportTheme'
// THE SHARED PLAYER MODEL (components/player/): the verdict first, then ONE row of his numbers; LAMP's words in nhlAdapter.js
import VerdictBlock from '../../player/VerdictBlock'
import StatRow from '../../player/StatRow'
import ScrollHint from '../../player/ScrollHint'
import { nhlVerdict, nhlStatRow } from '../../player/nhlAdapter'
import { nhlTeam } from '../../../lib/nhl/teams'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { STATUS, Pills, EmptyState, DelayedBanner, Loading, Kicker, StaleSeasonNote, fmtDay, fmtPuckDrop, zoneAbbrev, ageFrom, fmtHeight, fmtPct1, fmtPct3, fmt2, fmtSec, plusMinus, dash } from '../ui'
import WhyLines from '../../WhyLines'
import { goalWhy } from '../../../lib/nhl/goalWhy'
import { arenaOf } from '../../../lib/nhl/arenas'
import PlayerSplits from '../PlayerSplits'
import GoalTracking from '../GoalTracking'
import { PlayerDepthToggle } from '../NhlDepth'

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

// games since his last goal, from the season's game log (newest first); '—' with no log
const droughtOf = (rows = []) => { if (!rows.length) return '—'; const i = rows.findIndex((r) => Number(r.g) > 0); return String(i < 0 ? rows.length : i) }

export default function Player({ id, onOpenTeam, onOpenGame, onBack, backLabel = 'Players', onStep = null, peek = false }) {
  const { data: p, error, loading } = useLampPlayer(id)
  if (!id) return <EmptyState title="NO PLAYER PICKED" note="Open a player from a roster, the directory, a leaders table, or a goal."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!/^\d{7}$/.test(String(id))) return <EmptyState title="NO SUCH PLAYER" note={`“${String(id)}” is not an NHL player id -- the link may be old or cut short.`} tone={C.text3}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !p) return <Loading what="the player file" />
  if (!p) {
    const nobody = error?.status === 400 || error?.status === 404
    return <EmptyState title={nobody ? 'NO SUCH PLAYER' : 'LIVE DATA DELAYED'} note={nobody ? 'We don’t know a player with that id.' : 'We’re still loading his file. Try again in a moment.'} tone={nobody ? C.text3 : C.amber}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  }
  return <PlayerBody key={p.id} p={p} error={error} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} onBack={onBack} backLabel={backLabel} onStep={onStep} peek={peek} />
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

// ── THE CARD (2026-10-06, Donovan: "when you open it, it should look just like how MLB does") ──
// MLB's player card is one header and a row of pill tabs, each tab one screen.
// LAMP's player is now that: a sticky header (face, name, club, the word the
// board gives him, his key numbers, the star) over MOONSHOT's own pill tabs
// (components/card/CardNav TabBtn). The tab is in the address as view=
// (lib/urlState cardViewPush, the way MLB's card writes it) so a refresh, a
// shared link and Back all land on the same tab.
const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'splits', label: '📅 Splits', skater: true },
  { key: 'shotmap', label: '🗺 Shot map', skater: true },
  { key: 'vs', label: '🆚 VS', skater: true },
  { key: 'log', label: '📋 Game log' },
  { key: 'goals', label: '🥅 Goals', skater: true },
  { key: 'career', label: '🏆 Career' },
]
const readView = () => { try { const v = hashParams().get('view'); return VIEWS.some((x) => x.key === v) ? v : 'overview' } catch { return 'overview' } }

// THIS SEASON | LAST SEASON | LAST 2 SEASONS: the one shared toggle (components/nfl/SeasonToggle.js,
// the row MOONSHOT's splits and TUDDY wear), in LAMP's theme. Offered only when last season is on file.
function SeasonToggle({ value, onChange, p }) {
  const a = p.featured?.seasonLabel; const b = p.logPrev?.seasonLabel
  if (!a || !b) return null
  const options = [
    { key: 'this', label: 'This season', years: [a] },
    { key: 'last', label: 'Last season', years: [b] },
    { key: 'both', label: 'Last 2 seasons', years: [b, a] },
  ]
  return <SharedSeasonToggle options={options} value={value} onChange={onChange} theme={C} numFont={NUM_FONT} accent={C.ice} />
}

function PlayerBody({ p, error, onOpenTeam, onOpenGame, onBack, backLabel, onStep, peek }) {
  const goalie = p.goalie
  const { data: board } = useLampBoardOnce()
  const spot = boardSpot(board, p)
  const row = spot?.r || null
  const opp = spot ? (spot.g.game.home.abbrev === p.team ? `vs ${spot.g.game.away.abbrev}` : `@ ${spot.g.game.home.abbrev}`) : null
  const called = row?.status === 'called'
  const f = p.featured
  const stale = Boolean(p.current && f.season && f.season < p.current)
  const fr = f.regular

  // ── the tab, in the address ──
  const tabs = VIEWS.filter((v) => !v.skater || !goalie)
  const [view, setViewState] = useState(readView)
  useEffect(() => {
    const on = () => setViewState(readView())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const shown = tabs.some((t) => t.key === view) ? view : 'overview'
  const pick = (k) => {
    setViewState(k)
    try {
      const h = hashParams()
      if (k === 'overview') h.delete('view'); else h.set('view', k)
      const mark = window.history.state?.[PEEK_MARK] || h.get('pm') ? PEEK_MARK : DETAIL_MARK
      writeHash(h, { push: true, state: cardViewPush(mark, VIEWS_KEY) })
    } catch { /* the tab still switches without the address */ }
  }

  // ── which seasons the Splits, Shot map, VS, Game log and Goals tabs read ──
  // Under 20 games this season there is little to read: open on the last two.
  const [season, setSeason] = useState((Number(fr?.gp) || 0) < 20 && p.logPrev?.seasonLabel ? 'both' : 'this')
  const logThis = p.log?.rows || []
  const logLast = p.logPrev?.rows || []
  const seasonLabels = (() => {
    const a = f.seasonLabel; const b = p.logPrev?.seasonLabel
    return season === 'this' ? `${a} regular season` : season === 'last' ? `${b || 'Last season'} regular season` : `${[b, a].filter(Boolean).join(' + ')}`
  })()

  const [whyOpen, setWhyOpen] = useState(false)
  const nhlSeasons = p.seasons.filter((s) => s.league === 'NHL' && s.gameType === 2).slice().reverse()
  const otherLeagues = p.seasons.filter((s) => s.league !== 'NHL')
  const playoffSeasons = p.seasons.filter((s) => s.league === 'NHL' && s.gameType === 3)
  const logSrc = season === 'last' ? logLast : season === 'both' ? [...logThis, ...logLast] : logThis
  const logRows = logSrc.map((r) => ({ ...r, vs: vs(r), _id: r.gameId }))
  const log = usePreview(logRows, 10)
  const seasonPrev = usePreview(nhlSeasons.map((s, i) => ({ ...s, _id: `${s.season}-${i}` })), 6)
  const awardsPrev = usePreview(p.awards.map((a) => ({ ...a, _key: a.trophy, times: a.seasons.length })), 5)
  const team = nhlTeam(p.team)
  const bio = [
    p.pos && `${goalie ? 'Goalie' : { C: 'Centre', L: 'Left wing', R: 'Right wing', D: 'Defence' }[p.pos] || p.pos}`,
    p.shoots && `${goalie ? 'catches' : 'shoots'} ${p.shoots}`,
    fmtHeight(p.heightIn) && `${fmtHeight(p.heightIn)}, ${dash(p.weightLb)} lb`,
    ageFrom(p.birthDate) != null && `age ${ageFrom(p.birthDate)}`,
    p.birthCity && `${p.birthCity}${p.birthCountry ? `, ${p.birthCountry}` : ''}`,
    p.draft ? `drafted ${p.draft.year} by ${p.draft.team}, round ${p.draft.round} (#${p.draft.overall} overall)` : 'undrafted',
  ].filter(Boolean).join(' · ')
  const seasonLine = (r, label) => (r ? { ...r, seasonLabel: label, team: r.team || '' } : null)
  const thisSeasonRows = [
    seasonLine(f.regular, `${f.seasonLabel} reg.`),
    f.playoffs ? seasonLine(f.playoffs, `${f.seasonLabel} playoffs`) : null,
    seasonLine(p.career.regular, 'Career reg.'),
    p.career.playoffs?.gp ? seasonLine(p.career.playoffs, 'Career playoffs') : null,
  ].filter(Boolean).map((r, i) => ({ ...r, _id: i }))
  const cols = goalie ? G_SEASON_COLS : SK_SEASON_COLS
  const logNewest = p.log?.rows || []
  const goalsIn = (n) => {
    const g = logNewest.slice(0, n)
    return g.length === n ? { num: g.reduce((t, r) => t + (Number(r.g) || 0), 0), den: n } : null
  }

  // ‹ › walk tonight's board in its own order (the ranking is what he was reading)
  const peers = useMemo(() => {
    const out = []
    for (const g of board?.games || []) for (const r of g.rows || []) if (r.status !== 'off' && r.score != null) out.push({ id: String(r.playerId), name: r.name, team: r.team, score: r.score, game_pk: g.game?.id })
    return out.sort((a, b) => b.score - a.score)
  }, [board])
  const cur = peers.find((x) => x.id === String(p.id)) || { id: String(p.id), name: p.name, team: p.team }
  const whyLine = row ? (row.why || (row.reason ? `Not on the board: ${row.reason}` : null)) : spot && !goalie && (spot.g.rows || []).length ? 'Not on tonight’s board: he isn’t in the posted lineup or on the club’s current roster.' : null
  const w = row && !goalie ? goalWhy(row, board) : null
  const keyNums = !fr ? [] : goalie ? [['W', dash(fr.w)], ['SV%', fmtPct3(fr.svPct)], ['GAA', fmt2(fr.gaa)]] : [['G', dash(fr.g)], ['A', dash(fr.a)], ['PTS', dash(fr.pts)]]
  const gamePos = spot ? `${opp} · ${spot.g.game.state === 'pre' ? `${fmtPuckDrop(spot.g.game.startUtc)} ${zoneAbbrev()}` : spot.g.game.statusLine || spot.g.game.state}` : null

  return (
    <SportTheme theme={C} accent={C.ice}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onBack && <BackBtn onBack={onBack} label={backLabel} />}
      <DelayedBanner error={error} what="his file" />
      {onStep && peers.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Navigator peers={peers} cur={cur} noun="player" onNavigate={(x) => onStep(x.id)} />
        </div>
      )}
      {/* THE STICKY HEADER: who, which club, the board's word and his numbers never scroll away. */}
      <header style={{ position: 'sticky', top: peek ? 0 : 'var(--lamp-sticky, 0px)', zIndex: 20, background: C.bg2, margin: '0 -2px', padding: '8px 2px 0', borderBottom: `1px solid ${C.border2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flex: '0 0 auto', background: C.bg3, border: `2px solid ${called ? C.ice : C.border2}` }}>
            {p.headshot ? <img src={p.headshot} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: 'cover' }} /> : null}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: C.text }}>
              {p.number != null && <span style={{ color: C.text3, fontFamily: NUM_FONT }}>#{p.number} </span>}<a href={playerHref('nhl', p.id)} style={{ color: 'inherit', textDecoration: 'none' }}>{p.name}</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', fontSize: 12, color: C.text2, marginTop: 2 }}>
              {p.team && (
                <button type="button" onClick={() => onOpenTeam?.(p.team)} title={team ? team.name : p.teamName} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, margin: '-12px 0', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit' }}>
                  {p.teamLogo && <img src={p.teamLogo} alt="" width={18} height={18} style={{ width: 18, height: 18 }} />}
                  <b style={{ font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>{p.team}</b>
                </button>
              )}
              <span>{[{ C: 'Centre', L: 'Left wing', R: 'Right wing', D: 'Defence' }[p.pos] || p.pos, goalie ? 'Goalie' : null, !p.active ? 'not active' : null].filter(Boolean).join(' · ')}</span>
              <span style={{ color: C.text3 }}>NHL</span>
            </div>
          </div>
          <div style={{ flex: '0 0 auto' }}><FollowButton sport="nhl" id={String(p.id)} name={p.name} team={p.team} position={p.pos} compact /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', margin: '6px 0 2px' }}>
          {goalie ? <span style={{ color: C.text2, fontSize: 12 }}>Goalie</span> : (
            <>
              {board && shown !== 'overview' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CallStatusBadge status={row ? row.status : 'off'} accent={C.ice} size={11} variant="stamp" />
                  {row?.score != null && <b style={{ font: `900 14px/1 ${NUM_FONT}`, color: called ? C.ice : C.text }}>{Math.round(row.score)}</b>}
                </span>
              )}
              {shown !== 'overview' && <button type="button" aria-expanded={whyOpen} onClick={() => setWhyOpen((v) => !v)} style={{ minHeight: 44, margin: '-10px 0', padding: '0 6px', background: 'transparent', border: 'none', color: C.ice, font: `800 12px/1 ${NUM_FONT}`, cursor: 'pointer', textDecoration: 'underline dotted' }}>Why?</button>}
            </>
          )}
          {gamePos && <span style={{ color: C.text3, fontSize: 12 }}>{gamePos}</span>}
          <span style={{ display: 'inline-flex', gap: 10, marginLeft: 'auto' }}>
            {keyNums.map(([k, v]) => <span key={k} style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text3 }}><b style={{ color: C.text, fontSize: 15, fontWeight: 900 }}>{v}</b> {k}</span>)}
          </span>
        </div>
        {whyOpen && shown !== 'overview' && (
          <div role="region" aria-label="Why this word" style={{ maxHeight: '38vh', overflowY: 'auto', margin: '4px 0 6px', padding: '8px 10px', border: `1px solid ${C.border2}`, borderRadius: 10, background: C.bg, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
            {goalie ? 'Goalies are not on the goal board.' : !board ? 'Loading tonight’s board…' : !spot ? 'No game tonight, so he is not on the board.' : (
              <>
                <div>{whyLine || (row ? 'On tonight’s board.' : 'Not on tonight’s board.')}</div>
                {w && <WhyLines theme={C} numFont={NUM_FONT} accent={C.ice} why={[w.why]} watch={w.watch} explain={w.explain} />}
              </>
            )}
          </div>
        )}
        <div className="chip-row" role="tablist" aria-label="Player tabs" style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', padding: '6px 2px 8px' }}>
          {tabs.map((t) => <TabBtn key={t.key} active={shown === t.key} onClick={() => pick(t.key)}>{t.label}</TabBtn>)}
        </div>
      </header>

      {shown === 'overview' && (
        <>
          {/* ONE HEADER (2026-10-07, Donovan: "the player shows twice"): the sticky header above is the player's
              face, name, club and the board's word. The big hero that repeated them is gone; its one line stays. */}
          {/* LAMP ON HIM (components/player/): the board's word and score, why, the night rank; a goalie or a man with no game says so in one line. */}
          <VerdictBlock sport="nhl" {...nhlVerdict({ goalie, board, spot, row, w, whyLine })} />
          {w && row && spot?.g && <PlayerDepthToggle row={row} game={spot.g} />}
          <section aria-label="Season line">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Kicker>{goalie ? 'RECORD' : 'THE LINE'} · {f.seasonLabel}{stale ? ' (LAST SEASON)' : ''}</Kicker>
              {/* 📸 his card as a PNG (fix15): the board's word, score and night rank, his rates, season line, form and drought. It sits on
                  the line, not in the sticky header (no room beside Watch at 360 without wrapping his name); a goalie has no goal board, so no card. */}
              {!goalie && <CardButton sport="nhl" label="Download his card as an image" onDownload={() => downloadLampPlayerCard({
                p, row, g: spot?.g || null, fr, l5: goalsIn(5)?.num ?? null, l10: goalsIn(10)?.num ?? null,
                drought: /^\d+$/.test(droughtOf(p.log?.rows)) ? Number(droughtOf(p.log?.rows)) : null,
                where: opp || '', board: Boolean(board), seasonLabel: f.seasonLabel || '', day: board?.date || '' })} />}
            </div>
            {stale && <div style={{ marginBottom: 10 }}><StaleSeasonNote label={f.seasonLabel} opens={p.opens} what="line" /></div>}
            <StatRow noun="skaters" stats={nhlStatRow({ goalie, fr, board, row, l10: goalsIn(10)?.num ?? null, drought: /^\d+$/.test(droughtOf(p.log?.rows)) ? Number(droughtOf(p.log?.rows)) : null, seasonLabel: f.seasonLabel, stale })} />
            {!fr && <EmptyState title="NO NHL LINE YET" note="No regular-season line for him yet. A camp invite or a prospect, most likely." />}
          </section>
          {p.last5.length > 0 && (
            <section aria-label="Last five">
              <Kicker>LAST FIVE</Kicker>
              <LampTable
                rows={p.last5.map((g) => ({ ...g, _key: g.gameId, vs: vs(g) }))}
                columns={(goalie ? G_LOG_COLS : SK_LOG_COLS).map((c) => (c.key === 'date'
                  ? { ...c, fmt: (v, r) => <>{fmtDay(v)}{r.gameType === 3 ? <span style={{ marginLeft: 6, color: C.amber, fontSize: 9, letterSpacing: '.1em' }}>PLAYOFF</span> : null}</>, w: 118 }
                  : c))}
                maxHeight={9999} maxRows={5} heatMode="standouts" onRowClick={(r) => onOpenGame?.(r.gameId)}
                caption="His last five games, newest first. Each row opens the game." />
            </section>
          )}
          <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{bio}</div>
          {!goalie && <MultiLine sport="nhl" playerId={p.id} words={{ G: 'multi-goal' }} color={C.ice} textColor={C.text2} />}
          <StarMemory sport="nhl" id={String(p.id)} />
          {!goalie && <InTheLedger sport="nhl" id={p.id} name={p.name} jersey={p.number} birthDate={p.birthDate} next={!stale && Number.isFinite(f.regular?.g) ? f.regular.g + 1 : null} date={etToday()} />}
          {!goalie && <HisNumbers name={p.name} jersey={p.number} birthDate={p.birthDate} next={!stale && Number.isFinite(f.regular?.g) ? f.regular.g + 1 : null} career={Number.isFinite(p.career?.regular?.g) ? p.career.regular.g + 1 : null} nextWord="goal" date={etToday()} theme={C} accent={C.ice} numFont={NUM_FONT} />}
          <PlayerNotes playerId={String(p.id)} scope="nhl" accent={C.ice} />
        </>
      )}

      {shown === 'splits' && !goalie && (
        <>
          <SeasonToggle value={season} onChange={setSeason} p={p} />
          <PlayerSplits id={p.id} onOpenTeam={onOpenTeam} season={season} />
        </>
      )}

      {shown === 'shotmap' && !goalie && (
        <>
          <SeasonToggle value={season} onChange={setSeason} p={p} />
          <ShotPanel compact sel={{ player: p.id, name: p.name }} who="He" height={480} season={season} venue={arenaOf(spot?.g?.game?.home?.abbrev || p.team)?.name}
            opp={spot?.g?.game ? (spot.g.game.home?.abbrev === p.team ? spot.g.game.away?.abbrev : spot.g.game.home?.abbrev) || null : null} />
        </>
      )}

      {shown === 'vs' && !goalie && <VsTab p={p} spot={spot} season={season} setSeason={setSeason} seasonLabels={seasonLabels} />}

      {shown === 'log' && (
        <section aria-label="Game log">
          {!goalie && <SeasonToggle value={season} onChange={setSeason} p={p} />}
          <div style={{ height: 8 }} />
          <Kicker>GAME LOG · {logRows.length} GAMES</Kicker>
          {logRows.length
            ? <>
                <ScrollHint><LampTable rows={log.shown} columns={goalie ? G_LOG_COLS : SK_LOG_COLS} maxHeight={9999} maxRows={100} heatMode="standouts" onRowClick={(r) => onOpenGame?.(r.gameId)} /></ScrollHint>
                <ShowMoreButton open={log.open} restN={log.restN} toggle={log.toggle} itemWord="games" />
              </>
            : <EmptyState title="NO GAMES LOGGED" note="No regular-season games for him in that span yet. Try another season above." />}
        </section>
      )}

      {shown === 'goals' && !goalie && (
        <>
          <SeasonToggle value={season} onChange={setSeason} p={p} />
          <GoalTracking p={p} spot={spot} row={row} board={board} season={season} />
        </>
      )}

      {shown === 'career' && (
        <>
          <section aria-label="Career">
            <Kicker>CAREER</Kicker>
            {f.regular
              ? <LampTable rows={thisSeasonRows.filter((r) => /^Career/.test(r.seasonLabel))} columns={cols.filter((c) => c.key !== 'team')} maxHeight={9999} heatMode="none" />
              : <EmptyState title="NO NHL LINE YET" note="No regular-season line for him yet." />}
          </section>
          {nhlSeasons.length > 0 && (
            <section aria-label="Season by season">
              <Kicker>SEASON BY SEASON · NHL REGULAR SEASON</Kicker>
              <ScrollHint><LampTable rows={seasonPrev.shown} columns={cols} maxHeight={9999} maxRows={100} heatMode="standouts" /></ScrollHint>
              <ShowMoreButton open={seasonPrev.open} restN={seasonPrev.restN} toggle={seasonPrev.toggle} itemWord="seasons" />
              {(playoffSeasons.length > 0 || otherLeagues.length > 0) && (
                <div style={{ color: C.text3, fontSize: 12, marginTop: 6 }}>
                  Also on file: {playoffSeasons.length ? `${playoffSeasons.length} NHL playoff run${playoffSeasons.length === 1 ? '' : 's'}` : ''}{playoffSeasons.length && otherLeagues.length ? ' and ' : ''}{otherLeagues.length ? `${otherLeagues.length} season${otherLeagues.length === 1 ? '' : 's'} in ${[...new Set(otherLeagues.map((s) => s.league))].join(', ')}` : ''}.
                </div>
              )}
            </section>
          )}
          {p.awards.length > 0 && (
            <section aria-label="Awards">
              <Kicker tone={C.cream}>AWARDS</Kicker>
              <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={100} caption="His trophies"
                rows={awardsPrev.shown}
                columns={[
                  { key: 'trophy', label: 'Trophy', heat: false, sticky: true, w: 200, fmt: (v) => <b>{v}</b> },
                  { key: 'times', label: 'Won', w: 44, dp: 0, fmt: (v) => `${v} ×` },
                  { key: 'seasons', label: 'Seasons', heat: false, numeric: false, w: 200, fmt: (v) => <span style={{ fontFamily: NUM_FONT, color: C.text3, fontSize: 11 }}>{v.map((x) => `${String(x).slice(0, 4)}-${String(x).slice(6, 8)}`).join(', ')}</span> },
                ]} />
              <ShowMoreButton open={awardsPrev.open} restN={awardsPrev.restN} toggle={awardsPrev.toggle} itemWord="trophies" />
            </section>
          )}
        </>
      )}
    </div>
    </SportTheme>
  )
}

// 🆚 ONE RESEARCH CONTROL: PLAYER vs GOALIE or PLAYER vs TEAM. The same ShotPanel under both
// (it flips in place); the team side limits the drawn shots to the games he played against that club.
function VsTab({ p, spot, season, setSeason, seasonLabels }) {
  const [mode, setMode] = useState('goalie')
  const [pickedTeam, setPickedTeam] = useState('')
  const { data, loading } = useLampSplits(p.id, mode === 'team', season)
  const games = data?.games || []
  const g0 = spot?.g?.game
  const tonightOpp = g0 ? (g0.home?.abbrev === p.team ? g0.away?.abbrev : g0.home?.abbrev) || null : null
  const teams = useMemo(() => {
    const m = new Map()
    for (const x of games) if (x.type === 2 && x.opp) m.set(x.opp, (m.get(x.opp) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [games])
  const oppTeam = pickedTeam && teams.some(([t]) => t === pickedTeam) ? pickedTeam : (tonightOpp && teams.some(([t]) => t === tonightOpp) ? tonightOpp : teams[0]?.[0] || '')
  const vsGames = useMemo(() => games.filter((x) => x.type === 2 && x.opp === oppTeam), [games, oppTeam])
  const dates = useMemo(() => new Set(vsGames.map((x) => x.date)), [vsGames])
  const sum = useMemo(() => (vsGames.length ? aggregate(vsGames) : null), [vsGames])
  return (
    <>
      <Pills ariaLabel="Versus what" value={mode} onChange={setMode} options={[{ key: 'goalie', text: 'Player vs goalie' }, { key: 'team', text: 'Player vs team' }]} />
      <SeasonToggle value={season} onChange={setSeason} p={p} />
      {mode === 'team' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{p.name} <span style={{ color: C.ice, fontFamily: NUM_FONT, letterSpacing: '.1em', fontSize: 12 }}>VS</span> {oppTeam || 'a club'}</div>
          {teams.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text3, fontFamily: NUM_FONT }}>
              <span>TEAM</span>
              <select aria-label="Team" value={oppTeam} onChange={(e) => setPickedTeam(e.target.value)} style={{ minHeight: 44, background: C.bg2, color: C.text, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '0 8px', font: `700 13px/1 ${NUM_FONT}` }}>
                {teams.map(([t, n]) => <option key={t} value={t}>{t} · {n} {n === 1 ? 'game' : 'games'}</option>)}
              </select>
            </label>
          )}
          {loading && !data ? <div style={{ color: C.text3, fontSize: 13 }}>Reading his games…</div>
            : !teams.length ? <div style={{ color: C.text3, fontSize: 13 }}>No games in {seasonLabels || 'these seasons'} yet. Try another season above.</div>
            : sum && (
              <div style={{ fontSize: 14, lineHeight: 1.5, color: C.text2 }}>
                <b style={{ color: C.text, fontFamily: NUM_FONT }}>{sum.gp}</b> {sum.gp === 1 ? 'game' : 'games'} · <b style={{ color: C.text, fontFamily: NUM_FONT }}>{sum.g}</b> {sum.g === 1 ? 'goal' : 'goals'} · <b style={{ color: C.text, fontFamily: NUM_FONT }}>{sum.pts}</b> points · <b style={{ color: C.text, fontFamily: NUM_FONT }}>{sum.shots}</b> shots{sum.shPct != null ? ` (${fmtPct1(sum.shPct)} shooting)` : ''}
                {sum.thin && <span style={{ color: C.amber }}> · few games, read it lightly</span>}
              </div>
            )}
        </div>
      )}
      {mode === 'team' && teams.length > 0 && dates.size === 0 ? null : (
        <ShotPanel compact sel={{ player: p.id, name: p.name }} who="He" height={480} season={season} onlyDates={mode === 'team' ? dates : null} startView={mode === 'goalie' ? 'goalie' : 'dots'}
          venue={arenaOf(g0?.home?.abbrev || p.team)?.name} opp={tonightOpp} />
      )}
    </>
  )
}

function BackBtn({ onBack, label }) {
  if (!onBack) return null   // inside the player card (PlayerPeek) the card's × is the way out
  return <div><button type="button" onClick={onBack} style={{ minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ {label}</button></div>
}
