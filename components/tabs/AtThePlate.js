'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, clean, n, hrScore } from '../../lib/player'
import { fetchLiveSlate } from '../../lib/liveSlate'
import { fetchLiveGame, parseLiveGame } from '../../lib/livePitches'
import { Empty } from '../ui'
import ZoneMap from '../ZoneMap'
import SprayField from '../SprayField'

// 🎤 AT THE PLATE — the live batter's room.
//
// WHAT THIS ANSWERS: the man batting RIGHT NOW — where he does damage in the
// zone against this arm, where tonight's pitches have actually gone, and where
// the ball is leaving the bat — while the pitch is still in the pitcher's
// hand. And then: who's coming after him.
//
// 2026-08-10 rebuild (Donovan: "there's no way to just use the spray and
// strike map we already have as the live ones as well? ... also maybe be able
// to look at other players in the game who are coming up. but visually it
// looks bad"). Three changes:
//
//   1. ONE VISUAL LANGUAGE. The standalone live plot is gone. The live feed is
//      parsed once in lib/livePitches and handed to the SAME ZoneMap and
//      SprayField the player card uses, which now draw tonight's dots on their
//      own grid and their own field.
//   2. THE WHOLE LINEUP. On deck, in the hole, and the rest of the batting
//      order as the boxscore actually has it, each with his slate score and
//      his line tonight. Tap any of them and the two charts follow him —
//      without leaving the page.
//   3. LAYOUT. Labelled sections, one card treatment, room to breathe.
//
// Only possible since 2026-08-09: the schedule `fields` whitelist had been
// stripping `offense.batter` out of every response, so "who's up" was null
// league-wide.

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
const ROLE_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
const LIVE = '#4ade80'

const CARD = {
  background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.025))`,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: '13px 15px',
  marginBottom: 14,
}
const LABEL = {
  fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.text3, fontFamily: NUM_FONT,
}

export default function AtThePlate({ players = [], watchIds, mode = 'today', slateMode, onPlayerClick }) {
  const [snap, setSnap] = useState(null)
  const [pinnedGame, setPinnedGame] = useState(null)   // gamePk the user locked onto
  const [pinnedHitter, setPinnedHitter] = useState(null)   // mlb id driving the charts
  const [auto, setAuto] = useState(true)
  const [feed, setFeed] = useState(undefined)   // undefined = loading, null = failed
  const timer = useRef(null)
  const feedTimer = useRef(null)

  const isTomorrow = mode === 'tomorrow'

  const pullSlate = async () => {
    const s = await fetchLiveSlate()
    if (s) setSnap(s)
  }
  useEffect(() => {
    if (isTomorrow) return undefined
    pullSlate()
    clearInterval(timer.current)
    // 25s: an at-bat runs ~3-4 minutes, so this lands inside it comfortably
    // while a hidden tab does nothing.
    if (auto) timer.current = setInterval(() => { if (!document.hidden) pullSlate() }, 25000)
    return () => clearInterval(timer.current)
  }, [auto, isTomorrow])

  const byId = useMemo(
    () => new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p])),
    [players],
  )

  // every live game that has somebody at the plate, joined back to the slate
  const liveGames = useMemo(() => {
    if (!snap?.games) return []
    return snap.games
      .filter((g) => g.state === 'Live' && g.upBatter)
      .map((g) => {
        const p = byId.get(Number(g.upBatter)) || null
        return {
          g,
          p,
          pk: g.pk,
          pid: Number(g.upBatter),
          name: p ? nameOf(p) : clean(g.upBatterName, `#${g.upBatter}`),
          role: p ? primaryRole(p) : '',
          watched: p ? watchIds?.has(`${clean(p?.player_id || p?.id, '')}-${clean(p?.game_pk || p?.team, '')}`) : false,
        }
      })
      // your skin first: picks, then watchlist, then everyone else
      .sort((a, b) => (b.role ? 2 : 0) + (b.watched ? 1 : 0) - ((a.role ? 2 : 0) + (a.watched ? 1 : 0)))
  }, [snap, byId, watchIds])

  const active = useMemo(() => {
    if (pinnedGame) {
      const hit = liveGames.find((x) => x.pk === pinnedGame)
      if (hit) return hit
    }
    return liveGames[0] || null
  }, [liveGames, pinnedGame])

  const gamePk = active?.pk || null

  // ── the live feed for the one game on screen ──────────────────────────────
  // One call, one parse, both charts. Scoped to this game only, refreshed on
  // the same cadence as the slate and only while the tab is visible.
  const pullFeed = async (pk) => {
    if (!pk) return
    const j = await fetchLiveGame(pk)
    setFeed(j ? parseLiveGame(j) : null)
  }
  useEffect(() => {
    setFeed(undefined)
    if (!gamePk) return undefined
    pullFeed(gamePk)
    clearInterval(feedTimer.current)
    if (auto) feedTimer.current = setInterval(() => { if (!document.hidden) pullFeed(gamePk) }, 25000)
    return () => clearInterval(feedTimer.current)
  }, [gamePk, auto])

  // the current batter of the selected game resets the hitter selection
  useEffect(() => { setPinnedHitter(null) }, [gamePk])

  const refresh = () => { pullSlate(); pullFeed(gamePk) }

  // ── the batting order, as the boxscore has it right now ───────────────────
  const lineup = useMemo(() => {
    const g = active?.g
    if (!g?.lineup) return []
    const sides = ['away', 'home']
    // Which side is hitting: the one whose lineup contains the man at the
    // plate. Derived rather than inferred from inningState, which says
    // "Middle" between halves and would name the wrong dugout.
    const side = sides.find((s) => (g.lineup[s] || []).some((r) => Number(r.id) === Number(g.upBatter)))
      || sides.find((s) => (g.lineup[s] || []).length && (s === 'away' ? g.awayId : g.homeId) === g.battingTeamId)
      || null
    if (!side) return []
    return (g.lineup[side] || []).map((r) => {
      const p = byId.get(Number(r.id)) || null
      return {
        ...r,
        p,
        name: p ? nameOf(p) : clean(r.name, `#${r.id}`),
        role: p ? primaryRole(p) : '',
        score: p ? hrScore(p) : null,
        line: snap?.lines?.[Number(r.id)] || null,
        isUp: Number(r.id) === Number(g.upBatter),
        isDeck: Number(r.id) === Number(g.onDeck),
        isHole: Number(r.id) === Number(g.inHole),
      }
    })
  }, [active, byId, snap])

  // Who the charts are pointed at: the pinned hitter if he's still in this
  // game, otherwise whoever is at the plate.
  const selectedId = useMemo(() => {
    if (pinnedHitter && lineup.some((r) => Number(r.id) === pinnedHitter)) return pinnedHitter
    return active?.pid || null
  }, [pinnedHitter, lineup, active])

  const selected = useMemo(
    () => lineup.find((r) => Number(r.id) === Number(selectedId)) || null,
    [lineup, selectedId],
  )
  const selP = selected?.p || (Number(selectedId) === active?.pid ? active?.p : null) || null
  const selName = selected?.name || active?.name || ''
  const selLine = snap?.lines?.[Number(selectedId)] || null

  const livePitchesFor = useMemo(
    () => (feed?.pitches || []).filter((p) => Number(p.batterId) === Number(selectedId)),
    [feed, selectedId],
  )
  // memoized so the spray chart isn't handed a fresh array every render
  const liveBalls = useMemo(() => feed?.balls || [], [feed])

  if (isTomorrow) {
    return <Empty text="At the Plate is a tonight instrument — flip back to Today once games start." />
  }
  if (!snap) return <Empty text="Finding tonight's live at-bats…" />
  if (!liveGames.length) {
    return (
      <div>
        <Header auto={auto} setAuto={setAuto} refresh={refresh} count={0} />
        <Empty text={snap.games?.some((g) => g.state === 'Live')
          ? 'Games are live but nobody is at the plate this second — between innings. It refreshes on its own.'
          : 'No games in progress. This page wakes up at first pitch.'} />
      </div>
    )
  }

  const a = active
  const bats = String(selP?.bats || '').toUpperCase().slice(0, 1)
  const watchingSomeoneElse = Number(selectedId) !== Number(a.pid)

  return (
    <div>
      <Header auto={auto} setAuto={setAuto} refresh={refresh} count={liveGames.length} />

      {/* ── 1 · WHICH GAME ─────────────────────────────────────────────── */}
      {liveGames.length > 1 && (
        <div style={{ ...CARD, padding: '11px 13px' }}>
          <div style={{ ...LABEL, marginBottom: 7 }}>Live at-bats · {liveGames.length} games</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {liveGames.map((x) => {
              const on = x.pk === a.pk
              const col = ROLE_COLOR[x.role] || (x.watched ? '#a78bfa' : C.border2)
              return (
                <button key={x.pk} onClick={() => setPinnedGame(x.pk)} className="tap-row" style={{
                  display: 'flex', gap: 7, alignItems: 'baseline', cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${on ? col : C.border}`,
                  background: on ? `${col}1c` : 'rgba(255,255,255,.02)',
                  borderRadius: 10, padding: '6px 12px',
                  boxShadow: on ? `0 0 14px ${col}30` : 'none',
                }}>
                  <span style={{ fontSize: 10 }}>🎤</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: on ? C.text : C.text2 }}>{x.name}</span>
                  {x.role && <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[x.role] }}>🤖 {x.role}</span>}
                  {x.watched && <span style={{ fontSize: 9 }}>★</span>}
                  <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {String(x.g.half || '').slice(0, 3)}{x.g.inning}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2 · NOW BATTING ────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        background: `linear-gradient(155deg, ${C.bg2}, rgba(74,222,128,.05))`,
        border: '1px solid rgba(74,222,128,.28)',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ ...LABEL, color: LIVE }}>● Now batting</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: NUM_FONT, color: LIVE, fontWeight: 800 }}>
            {a.g.half} {a.g.inning}
            {a.g.awayScore != null && a.g.homeScore != null && (
              <span style={{ color: C.text3, fontWeight: 600 }}> · {a.g.awayScore}–{a.g.homeScore}</span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span
            onClick={() => a.p && onPlayerClick?.(a.p)}
            style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-.01em', cursor: a.p ? 'pointer' : 'default' }}
          >{a.name}</span>
          {a.role && (
            <span style={{
              fontSize: 9.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[a.role],
              border: `1px solid ${ROLE_COLOR[a.role]}55`, background: `${ROLE_COLOR[a.role]}14`,
              borderRadius: 999, padding: '2px 9px',
            }}>🤖 {a.role} PICK</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT, marginTop: 5, lineHeight: 1.7 }}>
          {a.p ? <>
            {teamOf(a.p)} vs {oppOf(a.p)} · {String(a.p?.bats || '?').toUpperCase().slice(0, 1)}HB · vs{' '}
            {clean(a.p?.pitcher_name, 'TBD')}
            {n(a.p?.pitcher_hr9, 0) > 0 && <> · <b style={{ color: n(a.p.pitcher_hr9, 0) >= 1.4 ? '#f87171' : C.text3 }}>{n(a.p.pitcher_hr9, 0).toFixed(2)} HR/9</b></>}
            {' · '}board <b style={{ color: C.orange }}>{hrScore(a.p).toFixed(0)}</b>
          </> : <span style={{ color: C.text3 }}>Not on tonight&apos;s published slate — no board card for him.</span>}
        </div>
        <div style={{ fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT, marginTop: 2 }}>
          {snap.lines?.[a.pid]
            ? <>Tonight: <b style={{ color: C.text }}>{snap.lines[a.pid].h}-{snap.lines[a.pid].ab}</b>
              {snap.lines[a.pid].hr ? ` · ${snap.lines[a.pid].hr} HR` : ''}
              {snap.lines[a.pid].tb > 1 ? ` · ${snap.lines[a.pid].tb} TB` : ''}
              {snap.lines[a.pid].k ? ` · ${snap.lines[a.pid].k} K` : ''}</>
            : 'First plate appearance tonight.'}
        </div>
      </div>

      {/* ── 3 · COMING UP ──────────────────────────────────────────────── */}
      <ComingUp
        game={a.g}
        lineup={lineup}
        selectedId={Number(selectedId)}
        onPick={(id) => setPinnedHitter(Number(id))}
        onOpen={(p) => onPlayerClick?.(p)}
      />

      {/* ── 4 · THE CHARTS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={LABEL}>Zone &amp; spray</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{selName || '—'}</span>
        {watchingSomeoneElse && (
          <button onClick={() => setPinnedHitter(null)} style={{
            fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 999,
            padding: '2px 10px', border: `1px solid ${LIVE}66`, background: 'rgba(74,222,128,.10)', color: LIVE,
          }}>← back to the hitter at the plate</button>
        )}
        {selLine && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            tonight {selLine.h}-{selLine.ab}{selLine.hr ? ` · ${selLine.hr} HR` : ''}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {feed === undefined ? 'loading tonight’s feed…'
            : feed === null ? 'live feed unavailable — nothing to plot'
            : `${feed.pitches.length} pitches · ${feed.balls.length} balls in play this game`}
        </span>
      </div>

      {feed && livePitchesFor.length === 0 && (
        <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
          {selName || 'He'} hasn&apos;t seen a tracked pitch tonight yet, so the zone map below has no dots
          on it — just the heat and the starter&apos;s usage as background. They appear the moment he
          steps in.
        </div>
      )}

      {/* .chart-cols: the two charts sit side by side from ~700px up. Their
          320px flex basis already wraps them on a phone, but only because the
          basis happens to exceed the viewport — an implicit stack that a wider
          phone or a landscape turn would silently undo, putting two dense
          charts in 180px columns. The class makes the stack explicit. */}
      <div className="chart-cols" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {/* liveOnly (2026-08-10, Donovan: "for the spray and the strike map I
              want those to be at-the-plate specific, no outside data on those.
              Besides like percents and heat matches and such — I like where
              it's at"). The heat, the percentages and the matchup shading stay
              as background; the season value inside each cell is off, so the
              only markers are tonight's pitches. */}
          <ZoneMap
            playerId={Number(selectedId)}
            bats={bats}
            liveOnly
            livePitches={livePitchesFor}
            liveLabel={selName}
          />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{
            background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
            border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>🗺 Spray chart</span>
              {liveBalls.length > 0 && (
                <span title={`${liveBalls.length} tracked balls in play in this game, plotted on the same field`} style={{
                  fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.08em',
                  color: LIVE, border: `1px solid ${LIVE}70`, background: 'rgba(74,222,128,.10)',
                  borderRadius: 999, padding: '2px 8px',
                }}>● LIVE {liveBalls.length}</span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
                tonight only
              </span>
            </div>
            {/* liveOnly — same request as the zone map above. The field, the
                real wall, the arcs and the result colours stay; the season
                batted balls, the window chips and the lane shares are off, so
                the only dots on the field are the ones hit in this game. */}
            <SprayField
              player={selP}
              slateMode={slateMode}
              height={320}
              liveOnly
              liveBalls={liveBalls}
              liveFocusId={Number(selectedId)}
              liveLabel={selName}
            />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 10, lineHeight: 1.65, maxWidth: 760 }}>
        The same zone map and spray chart the player card uses, in their <b style={{ color: C.text2 }}>tonight-only</b>{' '}
        skin: every dot on this page comes from this game and nothing else. Tonight&apos;s pitches are the
        feed&apos;s own pX/pZ laid on the zone grid; tonight&apos;s batted balls are its own hit coordinates
        laid on this park&apos;s real wall. The zone cells keep their heat, the starter&apos;s usage
        percentages and the matchup shading as background, and the season number that normally sits
        inside each cell is one hover away rather than painted over the dots. Tap anyone in the batting
        order above to point both charts at him without leaving the page. Refreshes every 25s while this
        tab is visible.
      </div>
    </div>
  )
}

// ── who's coming ────────────────────────────────────────────────────────────
//
// On deck and in the hole come from the linescore's own offense block; the
// rest of the order comes from the boxscore's `battingOrder`, which is the
// lineup as it actually stands after every substitution. Nobody is invented:
// a slot with no published hitter simply isn't drawn, and a hitter who isn't
// on tonight's slate shows his name with an honest dash where the score goes.
function ComingUp({ game, lineup, selectedId, onPick, onOpen }) {
  const deck = lineup.find((r) => r.isDeck) || null
  const hole = lineup.find((r) => r.isHole) || null

  if (!lineup.length) {
    return (
      <div style={{ ...CARD, padding: '11px 13px' }}>
        <div style={{ ...LABEL, marginBottom: 5 }}>Coming up</div>
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6 }}>
          {game?.onDeckName || game?.inHoleName ? <>
            On deck <b style={{ color: C.text2 }}>{clean(game.onDeckName, '—')}</b>
            {game?.inHoleName && <> · in the hole <b style={{ color: C.text2 }}>{clean(game.inHoleName, '—')}</b></>}.
            {' '}The full batting order hasn&apos;t come back from this game&apos;s boxscore yet.
          </> : 'No batting order published for this game yet.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...CARD, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 9 }}>
        <span style={LABEL}>Coming up</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          tap anyone to point the charts at him
        </span>
      </div>

      {/* The two that matter most, given their own row.
          .atplate-deck is a phone hook: these two cards are minWidth 168, so at
          a 390px portrait viewport they total 345px inside 346px of card — they
          "fit" by one pixel, and then the text inside them (name + "board 87 ·
          🤖 HR") has nowhere to go. On a phone they get a row each. */}
      {(deck || hole) && (
        <div className="atplate-deck" style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['ON DECK', deck, '#FCD34D'], ['IN THE HOLE', hole, '#a78bfa']].map(([tag, row, col]) => (
            row ? (
              <button key={tag} onClick={() => onPick(row.id)} className="tap-row" style={{
                display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
                cursor: 'pointer', textAlign: 'left', minWidth: 168,
                border: `1px solid ${Number(row.id) === selectedId ? col : C.border}`,
                background: Number(row.id) === selectedId ? `${col}18` : 'rgba(255,255,255,.02)',
                borderRadius: 10, padding: '7px 12px',
              }}>
                <span style={{ ...LABEL, color: col, fontSize: 7.5 }}>{tag}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{row.name}</span>
                <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                  {row.slot ? `${row.slot} hole` : ''}
                  {row.score != null ? ` · board ${row.score.toFixed(0)}` : ' · not on the slate'}
                  {row.role ? ` · 🤖 ${row.role}` : ''}
                </span>
              </button>
            ) : null
          ))}
        </div>
      )}

      {/* the whole order, in order */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {lineup.map((r) => {
          const on = Number(r.id) === selectedId
          const tag = r.isUp ? ['AT BAT', LIVE] : r.isDeck ? ['ON DECK', '#FCD34D'] : r.isHole ? ['IN HOLE', '#a78bfa'] : null
          return (
            <div key={r.id} className="tap-row" onClick={() => onPick(r.id)} style={{
              display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', minWidth: 0,
              padding: '5px 9px', borderRadius: 8,
              background: on ? 'rgba(249,115,22,.10)' : 'transparent',
              border: `1px solid ${on ? 'rgba(249,115,22,.45)' : 'transparent'}`,
              borderLeft: `2px solid ${tag ? tag[1] : 'transparent'}`,
            }}>
              <span style={{ width: 14, flexShrink: 0, fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{r.slot || '—'}</span>
              <span style={{
                fontSize: 11.5, fontWeight: on ? 800 : 600, color: on ? C.text : C.text2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto',
              }}>
                {r.name}
                {r.sub && <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}> (sub)</span>}
              </span>
              {tag && (
                <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: '.08em', color: tag[1], fontFamily: NUM_FONT, flexShrink: 0 }}>
                  {tag[0]}
                </span>
              )}
              {r.role && (
                <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[r.role] || C.text3, flexShrink: 0 }}>
                  🤖 {r.role}
                </span>
              )}
              <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0, minWidth: 62, textAlign: 'right' }}>
                {r.line ? `${r.line.h}-${r.line.ab}${r.line.hr ? ` ${r.line.hr}HR` : ''}` : '—'}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); if (r.p) onOpen(r.p) }}
                title={r.p ? `Open ${r.name}'s card` : 'Not on tonight’s published slate'}
                style={{
                  fontSize: 10.5, fontWeight: 900, fontFamily: NUM_FONT, flexShrink: 0,
                  minWidth: 30, textAlign: 'right',
                  color: r.score != null ? C.orange : C.text3,
                  cursor: r.p ? 'pointer' : 'default',
                }}
              >{r.score != null ? r.score.toFixed(0) : '—'}</span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
        The order is the boxscore&apos;s own <code>battingOrder</code> as it stands after substitutions;
        on deck and in the hole are the linescore&apos;s. The number on the right is his board score
        tonight — a dash means he isn&apos;t on the published slate, and tapping his name still points
        the charts at him. The middle column is his line so far tonight.
      </div>
    </div>
  )
}

function Header({ auto, setAuto, refresh, count }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.01em' }}>🎤 At the Plate</span>
        <span style={{ fontSize: 10.5, color: C.text3 }}>
          {count > 0 ? `${count} hitter${count === 1 ? '' : 's'} batting right now` : 'live batters, as they step in'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setAuto((v) => !v)} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 7, padding: '3px 10px',
            border: `1px solid ${auto ? LIVE : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
            color: auto ? LIVE : C.text3,
          }}>{auto ? '● auto 25s' : '○ auto'}</button>
          <button onClick={refresh} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 7, padding: '3px 10px',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}>↻</button>
        </span>
      </div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginTop: 4, maxWidth: 760 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> the man hitting right now — where he does
        damage in the zone, where tonight&apos;s pitches have actually gone, and where the ball is
        leaving the bat — plus who is coming up behind him.
      </div>
    </div>
  )
}
