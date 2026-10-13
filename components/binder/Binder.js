'use client'
// THE BINDER (2026-10-12; Donovan: "they can see the cards that happen, collectors get them when they have them on their watchlist", "a binder page: yes, this is what I'm talking about").
// One page per sport shell (registry: lib/routes.js, tab `binder`), the same component on MOONSHOT, TUDDY and LAMP; the sport's colours come from the sport theme.
//   MY CARDS   the special cards (lib/cards/moments.js) earned by the players on MY watchlist (dash_follow_v1), from /api/card/binder (real stored history)
//   ALL CARDS  every recent card in the league (30 days, 200 cards), from /api/card/recent
// RAREST FIRST: sections LEGEND, ELITE, STAR (newest first inside each); BASE cards are folded under "Base cards (N)". A progress strip counts them. Filters: sport, rarity,
// player, this week (they ride the address: bv= bs= br= bp= bw=). Tap a card to open the sheet (flip to the stat table, save, links to the player and the game).
// NEW = a card not seen on an earlier visit (localStorage, works signed out; the first visit marks nothing NEW). Nothing is invented: an empty binder says how to collect and
// names three real players from today's board. Phone first: the first screen is the strip and the LEGEND / ELITE tiles; long sections preview two rows and say "+N more".
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../PageHeader'
import AlertsEntry from '../AlertsEntry'
import { useSportTheme } from '../SportTheme'
import { useFollowing } from '../../lib/dash/follow'
import { useHashFilter } from '../../lib/filterHash'
import { BRAND, playerHref, teamHref, gameHref, isHiddenSport } from '../../lib/routes'
import { etToday } from '../../lib/freshness'
import CardSheet, { specialUrl } from '../player/CardSheet'
import { RARITY_COPY, SEEN_KEY, cardKey, followKeysOf, onlyWatched, filterCards, groupByRarity, progress, playersOf, parseSeen, isNew, markSeen, emptyState, mergeCards, rarestFirst } from '../../lib/cards/binder'
import { CARD_SPORTS } from '../../lib/card/core'

const SPORTS = ['mlb', 'nhl', 'nfl'].filter((s) => CARD_SPORTS.includes(s) && !isHiddenSport(s))
const RARITIES = ['legend', 'elite', 'star', 'base']
const PREVIEW = 6          // two rows of three tiles
const BASE_PREVIEW = 6

const readSeen = () => { try { return parseSeen(localStorage.getItem(SEEN_KEY)) } catch { return null } }
const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)) } catch { /* private mode: NEW simply starts over */ } }

function useCards(view, sports, followRows) {
  const [state, setState] = useState({ cards: [], loading: true, error: false })
  const key = view === 'all'
    ? `all|${sports.join(',')}`
    : `my|${followRows.filter((r) => sports.includes(r.sport)).map((r) => `${r.sport}:${r.id}`).sort().join(',')}`
  useEffect(() => {
    let on = true
    setState((s) => ({ ...s, loading: true, error: false }))
    const run = async () => {
      if (view === 'all') {
        const lists = await Promise.all(sports.map((s) => fetch(`/api/card/recent?sport=${s}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('recent')))).then((j) => j.cards || [])))
        return mergeCards(...lists)
      }
      const follows = key.slice(3)
      if (!follows) return []
      const r = await fetch(`/api/card/binder?follows=${encodeURIComponent(follows)}`)
      if (!r.ok) throw new Error('binder')
      return (await r.json()).cards || []
    }
    run().then((cards) => { if (on) setState({ cards, loading: false, error: false }) }).catch(() => { if (on) setState({ cards: [], loading: false, error: true }) })
    return () => { on = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

export default function Binder({ sport = 'mlb', board = [] }) {
  const { C, accent, NUM_FONT } = useSportTheme()
  const brand = BRAND[sport] || BRAND.mlb
  const [viewRaw, setView] = useHashFilter('bv')
  const [sportRaw, setSportF] = useHashFilter('bs')
  const [rarity, setRarity] = useHashFilter('br')
  const [playerRaw, setPlayer] = useHashFilter('bp')
  const [weekRaw, setWeek] = useHashFilter('bw')
  const [panel, setPanel] = useState(false)
  const [open, setOpen] = useState(null)
  const [fold, setFold] = useState({})        // tier -> true when the user has opened / closed a section
  const [more, setMore] = useState({})        // tier -> show everything
  const [seenAtOpen, setSeenAtOpen] = useState(undefined)
  const [today, setToday] = useState(null)
  const fol = useFollowing(null)

  const view = viewRaw === 'all' ? 'all' : 'my'
  const sportF = sportRaw === 'all' ? 'all' : SPORTS.includes(sportRaw) ? sportRaw : (SPORTS.includes(sport) ? sport : SPORTS[0])
  const sports = sportF === 'all' ? SPORTS : [sportF]
  const week = weekRaw === '1'
  const rar = RARITIES.includes(rarity) ? rarity : null
  useEffect(() => { setSeenAtOpen(readSeen()); setToday(etToday()) }, [])

  const { cards: loaded, loading, error } = useCards(view, sports, fol.rows)
  const followKeys = useMemo(() => followKeysOf(fol.rows), [fol.rows])
  const mine = useMemo(() => (view === 'my' ? onlyWatched(loaded, followKeys) : loaded).filter((c) => sports.includes(c.sport)), [loaded, followKeys, view, sports.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const players = useMemo(() => playersOf(mine), [mine])
  const playerF = players.some((p) => p.key === playerRaw) ? playerRaw : ''
  const [pSport, pId] = playerF ? playerF.split(':') : [null, null]
  const base = useMemo(() => filterCards(mine, { playerId: pId, week, today }).filter((c) => !pSport || c.sport === pSport), [mine, pId, pSport, week, today])
  const shownCards = useMemo(() => filterCards(base, { rarity: rar }), [base, rar])
  const sections = useMemo(() => groupByRarity(shownCards), [shownCards])
  const strip = useMemo(() => progress(base), [base])

  // everything that was just looked at is "seen" from now on (after the NEW badges were drawn for this visit)
  useEffect(() => {
    if (loading || error || seenAtOpen === undefined) return
    const next = markSeen(seenAtOpen, loaded, Date.now())
    if (next.ids.length !== (seenAtOpen?.ids || []).length || !seenAtOpen) writeSeen(next)
  }, [loading, error, loaded, seenAtOpen])

  const active = [sportRaw ? 1 : 0, rar ? 1 : 0, playerF ? 1 : 0, week ? 1 : 0].reduce((a, b) => a + b, 0)
  const chip = (on) => ({ minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? accent : C.border}`, background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : C.bg2, color: on ? accent : C.text2, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.05em' })
  const clearAll = () => { setSportF(''); setRarity(''); setPlayer(''); setWeek('') }

  const empty = !loading && !error && mine.length === 0
  const es = empty ? emptyState({ board, followKeys, sport, hasFollows: fol.rows.length > 0 }) : null

  return (
    <div data-binder style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PageHeader eyebrow={`${brand.name} · BINDER`} title={view === 'all' ? 'All cards' : 'Your binder'}
        note={view === 'all' ? `Every card earned in the league in the last 30 days. ${RARITY_COPY}` : `Cards earned by the players on your watchlist. ${RARITY_COPY}`}
        theme={C} numFont={NUM_FONT} accent={accent} style={{ marginBottom: 2 }} />

      <div role="tablist" aria-label="Which cards" style={{ display: 'flex', gap: 8 }}>
        <button type="button" role="tab" aria-selected={view === 'my'} onClick={() => setView('')} style={{ ...chip(view === 'my'), flex: 1 }}>MY CARDS</button>
        <button type="button" role="tab" aria-selected={view === 'all'} onClick={() => setView('all')} style={{ ...chip(view === 'all'), flex: 1 }}>ALL CARDS</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div data-binder-strip aria-live="polite" style={{ flex: '1 1 180px', minWidth: 0, color: C.text, font: `800 13px/1.35 ${NUM_FONT}`, letterSpacing: '.03em' }}>
          {loading ? 'Opening the binder…' : error ? 'The binder could not load' : strip.text}
        </div>
        <button type="button" aria-expanded={panel} onClick={() => setPanel((v) => !v)} style={chip(panel || active > 0)}>{active ? `Filters · ${active}` : 'Filters'}</button>
      </div>

      {panel ? (
        <div data-binder-filters style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
          <div role="group" aria-label="Sport" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[...SPORTS, 'all'].map((s) => <button key={s} type="button" aria-pressed={sportF === s} onClick={() => setSportF(s === (SPORTS.includes(sport) ? sport : SPORTS[0]) ? '' : s)} style={chip(sportF === s)}>{s === 'all' ? 'All sports' : (BRAND[s]?.league || s.toUpperCase())}</button>)}
          </div>
          <div role="group" aria-label="Rarity" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" aria-pressed={!rar} onClick={() => setRarity('')} style={chip(!rar)}>Any rarity</button>
            {RARITIES.map((t) => <button key={t} type="button" aria-pressed={rar === t} onClick={() => setRarity(rar === t ? '' : t)} style={chip(rar === t)}>{t.toUpperCase()}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 180px', display: 'flex' }}>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Player</span>
              <select value={playerF} onChange={(e) => setPlayer(e.target.value)} aria-label="Player" style={{ minHeight: 44, width: '100%', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg3, color: C.text, padding: '0 10px', font: `700 13px/1 ${NUM_FONT}` }}>
                <option value="">All players</option>
                {players.map((p) => <option key={p.key} value={p.key}>{`${p.name} (${p.n})`}</option>)}
              </select>
            </label>
            <button type="button" aria-pressed={week} onClick={() => setWeek(week ? '' : '1')} style={chip(week)}>This week</button>
            {active ? <button type="button" onClick={clearAll} style={chip(false)}>Clear</button> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text2, fontSize: 13, lineHeight: 1.45 }}>
          The cards could not be loaded just now. Nothing is lost: try again in a minute.
        </div>
      ) : null}

      {empty && es ? (
        <div data-binder-empty style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
          <div style={{ color: accent, font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{view === 'all' ? 'NO CARDS FOR THIS FILTER' : es.title}</div>
          <p style={{ margin: '8px 0 0', color: C.text2, fontSize: 13, lineHeight: 1.5 }}>
            {view === 'all' ? 'No card matches these filters in the last 30 days. Cards are earned in real games only.' : es.note}
          </p>
          {view === 'my' && es.suggestions.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: C.text3, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.08em', marginBottom: 6 }}>FROM TONIGHT'S BOARD</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {es.suggestions.map((s) => (
                  <a key={`${s.sport}:${s.id}`} href={playerHref(s.sport, s.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, padding: '0 12px', border: `1px solid ${C.border2}`, borderRadius: 10, color: C.text, textDecoration: 'none', font: `700 14px/1.2 inherit` }}>
                    <span>{s.name}{s.team ? <em style={{ marginLeft: 8, color: C.text3, fontStyle: 'normal', font: `800 11px/1 ${NUM_FONT}` }}>{s.team}</em> : null}</span>
                    <span aria-hidden="true" style={{ color: accent }}>{'☆ ›'}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          {view === 'my' ? <button type="button" onClick={() => setView('all')} style={{ ...chip(false), marginTop: 10 }}>See all cards in the league</button> : null}
        </div>
      ) : null}

      {sections.map((sec) => {
        const isBase = sec.tier === 'base'
        const folded = fold[sec.tier] === undefined ? isBase : fold[sec.tier]
        const lim = isBase ? BASE_PREVIEW : PREVIEW
        const list = folded ? [] : (more[sec.tier] ? sec.cards : sec.cards.slice(0, lim))
        const hidden = sec.cards.length - list.length
        return (
          <section key={sec.tier} aria-label={sec.title} data-binder-section={sec.tier}>
            <button type="button" aria-expanded={!folded} onClick={() => setFold((f) => ({ ...f, [sec.tier]: !folded }))}
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, padding: '0 2px', border: 0, borderBottom: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', color: isBase ? C.text2 : accent, font: `900 13px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>
              <span>{isBase ? sec.title.toUpperCase() : sec.title}</span>
              <span aria-hidden="true" style={{ color: C.text3 }}>{folded ? (isBase ? 'Show' : '▸') : '▾'}</span>
            </button>
            {!folded ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                {list.map((c) => <Tile key={cardKey(c)} c={c} C={C} accent={accent} NUM_FONT={NUM_FONT} fresh={isNew(c, seenAtOpen === undefined ? null : seenAtOpen)} onOpen={() => setOpen(c)} />)}
              </div>
            ) : null}
            {!folded && hidden > 0 ? (
              <button type="button" onClick={() => setMore((m) => ({ ...m, [sec.tier]: true }))} style={{ ...chip(false), marginTop: 8 }}>{`+${hidden} more`}</button>
            ) : null}
          </section>
        )
      })}

      {!loading && !error && mine.length ? (
        <p style={{ margin: '4px 0 0', color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
          {view === 'all'
            ? 'The league view shows the last 30 days. A player’s own page shows his whole season. Every card is drawn from a real game.'
            : 'Players you follow with the star. A card is kept for each game a player earned one, his rarest. Every card is drawn from a real game.'}
        </p>
      ) : null}
      {/* ALERTS, FROM THE BINDER (2026-10-13): collectors get a note when a player they follow earns a card; the switch is one tap from here. It sits at the END so the
          first row of the binder is exactly where it was (no extra scroll on a phone). */}
      <AlertsEntry C={C} accent={accent} NUM_FONT={NUM_FONT} />
      {open ? <CardSheet c={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

export function Tile({ c, C, accent, NUM_FONT, fresh, onOpen }) {
  const gHref = c.game ? gameHref(c.sport, c.game) : null
  const tHref = c.team ? teamHref(c.sport, c.team) : null
  const small = { color: C.text2, fontSize: 12, lineHeight: 1.25 }
  return (
    <div data-binder-tile={c.tier} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={`Open the ${c.tierWord} card: ${c.name}, ${c.kicker}, ${c.dayWord}`}
        style={{ position: 'relative', display: 'block', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
        <img src={specialUrl(c, 360)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 5', display: 'block', borderRadius: 8, background: C.bg3, border: `1px solid ${C.border2}` }} />
        {fresh ? <b data-binder-new style={{ position: 'absolute', top: 6, left: 6, padding: '3px 6px', borderRadius: 6, background: accent, color: C.bg, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>NEW</b> : null}
      </button>
      <a href={playerHref(c.sport, c.playerId)} style={{ display: 'flex', alignItems: 'center', minHeight: 44, color: C.text, fontSize: 13, fontWeight: 800, lineHeight: 1.2, textDecoration: 'none', overflowWrap: 'anywhere' }}>{c.name}</a>
      <span style={small}>{`${c.kicker}`}</span>
      {gHref
        ? <a href={gHref} style={{ ...small, display: 'flex', alignItems: 'center', minHeight: 44, color: accent, textDecoration: 'none' }}>{`${c.dayWord} · ${c.team}${c.opp ? `-${c.opp}` : ''}`}</a>
        : (tHref
          ? <a href={tHref} style={{ ...small, display: 'flex', alignItems: 'center', minHeight: 44, color: accent, textDecoration: 'none' }}>{`${c.dayWord} · ${c.team}${c.opp ? `-${c.opp}` : ''}`}</a>
          : <span style={{ ...small, display: 'flex', alignItems: 'center', minHeight: 44 }}>{c.dayWord}</span>)}
    </div>
  )
}
