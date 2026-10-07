'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, hrScore, playerId } from '../lib/player'
import { boardCompare } from '../lib/boardOrder'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { DEFAULT_SPORT, sportKey } from '../lib/routes'
import { useVisibleSports } from '../lib/useVisibleSports'
import { norm, searchAll } from '../lib/search/engine'
import { loadPlayers, loadGames } from '../lib/search/sources'
import useScrollLock from '../lib/useScrollLock'
import TeamMark from './TeamMark'

// What the roster file says about a man, in the words the search row shows.
// A slate hit is never routed here -- he is in tonight's lineup and has a
// row. This is everyone else: on the club but out of the lineup, on the IL,
// in the minors, or just moved (the file's team is where he is NOW).
const STATUS_WORD = { A: 'active · not in tonight’s lineup', RM: 'minors', D7: 'IL-7', D10: 'IL-10', D15: 'IL-15', D60: 'IL-60', PL: 'paternity', BRV: 'bereavement', SU: 'suspended' }
const statusWord = (p) => STATUS_WORD[String(p?.status || '')] || p?.status_word || p?.status || ''
const seasonWord = (s) => (s && s.pa ? `${s.avg != null ? String(s.avg.toFixed(3)).replace(/^0/, '') : '—'} · ${s.hr} HR · ${s.pa} PA` : 'no MLB plate appearances this season')

// ⌘K QUICK SEARCH — jump to any player from anywhere.
//
// The site is player-centric but reaching a specific hitter still meant
// finding whichever board he's on and scanning. Cmd/Ctrl-K (or just "/")
// opens this from any tab; three letters and Enter opens his modal.
// Arrow keys move, Escape closes, top 8 shown.

// League-wide fallback (2026-08-06): when nobody on the slate matches, the
// same box searches EVERY active MLB player via the StatsAPI (verified live,
// hydrate=currentTeam) and opens an API-only modal — props grid, splits, zone
// map, all live-pulled. The bot's slate stops being the edge of the site.
//
// ── ONE SEARCH FOR ALL FOUR PRODUCTS (2026-10-07) ───────────────────────────
// The same box now lives in every product's shell (`sport`): people, clubs
// (logo) and the day's games, the current product's first, the others after
// (lib/search/engine.js, indexes from lib/search/sources.js -- files each
// product already loads). MOONSHOT keeps its own rows exactly: its slate hits
// and roster hits open the card through `onPick`, as before. Every other
// result is a real link (#sport=..&tab=..&player=..): a tap, Enter, a shared
// copy of it and Back all go through the shells' own hash routing.
// The entry on a phone is the header's 🔍 (components/header/SearchButton.js),
// which opens this through the `dash-quicksearch` event.

// "Games today" is a week in football (the scoreboard is the week's slate)
const GAMES_WORD = { nfl: 'This week’s games' }
const gamesWord = (s) => GAMES_WORD[s] || 'Today’s games'

const tint = (acc, sport) => (sport === DEFAULT_SPORT ? 'rgba(249,115,22,.12)' : `color-mix(in srgb, ${acc} 14%, transparent)`)

function useViewport(active) {
  const [vp, setVp] = useState(null)
  useEffect(() => {
    if (!active) { setVp(null); return undefined }
    const vv = window.visualViewport
    const read = () => setVp({ top: vv ? vv.offsetTop : 0, h: vv ? vv.height : window.innerHeight, phone: window.matchMedia('(max-width: 760px)').matches })
    read()
    vv?.addEventListener('resize', read)
    vv?.addEventListener('scroll', read)
    window.addEventListener('resize', read)
    return () => { vv?.removeEventListener('resize', read); vv?.removeEventListener('scroll', read); window.removeEventListener('resize', read) }
  }, [active])
  return vp
}

export default function QuickSearch({ players = [], onPick = null, sport: sportProp = DEFAULT_SPORT }) {
  const sport = sportKey(sportProp)
  const hasSlate = Boolean(onPick)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [apiHits, setApiHits] = useState([])
  const [indexes, setIndexes] = useState({})   // sport -> { players, games } as each loads
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const debounceRef = useRef(null)
  // useVisibleSports() answers a fresh array each render; the list's contents are what matter
  const visibleRaw = useVisibleSports()
  const visKey = visibleRaw.join(',')
  const visible = useMemo(() => (visKey ? visKey.split(',') : []), [visKey])
  const vp = useViewport(open)
  useScrollLock(open)

  useEffect(() => {
    const onKey = (e) => {
      const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(true); setQ(''); setSel(0)
      } else if (e.key === '/' && !inField && !open) {
        e.preventDefault(); setOpen(true); setQ(''); setSel(0)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => {
      inputRef.current?.focus()
      // the header button's keyboard bridge (SearchButton) has done its job
      try { window.__qsProxy?.remove(); window.__qsProxy = null } catch { /* gone already */ }
    }, 30)
    return () => clearTimeout(t)
  }, [open])

  // Opened from the header's search button, or from the Controls search's
  // "search every active player" button, with whatever was typed there.
  useEffect(() => {
    const onOpen = (e) => { setOpen(true); setQ(String(e?.detail?.q || '')); setSel(0) }
    window.addEventListener('dash-quicksearch', onOpen)
    return () => window.removeEventListener('dash-quicksearch', onOpen)
  }, [])

  // BACK / FORWARD CLOSES IT. A result that is a link changes the hash; the box has done its job.
  useEffect(() => {
    if (!open) return undefined
    const shut = () => setOpen(false)
    window.addEventListener('hashchange', shut)
    window.addEventListener('popstate', shut)
    return () => { window.removeEventListener('hashchange', shut); window.removeEventListener('popstate', shut) }
  }, [open])

  // Each product's index loads the first time two letters are typed, not on page load (the roster
  // file alone is ~400 KB): the current product first, then the rest. Nothing is stored or polled.
  const typed = norm(q).length >= 2
  const order = useMemo(() => [sport, ...visible.filter((k) => k !== sport)], [sport, visible])
  useEffect(() => {
    if (!open || !typed) return undefined
    let alive = true
    for (const s of order) {
      const put = (key) => (rows) => { if (alive) setIndexes((ix) => ({ ...ix, [s]: { ...ix[s], [key]: rows } })) }
      loadPlayers(s).then(put('players'))
      loadGames(s).then(put('games'))
    }
    return () => { alive = false }
  }, [open, typed, order])

  const k = norm(q)
  const hits = useMemo(() => {
    if (!hasSlate || k.length < 2) return []
    return players
      .filter((p) => norm(nameOf(p)).includes(k) || norm(teamOf(p)) === k)
      .sort(boardCompare)   // 2026-09-25: board order
      .slice(0, 8)
  }, [q, k, players, hasSlate])

  const onSlateIds = useMemo(() => new Set(players.map((p) => String(p?.player_id ?? p?.id ?? ''))), [players])

  const groups = useMemo(() => searchAll({
    q, sport, indexes, visible,
    // a man already in tonight's slate list is not listed again as a roster hit
    slateSkip: hasSlate ? (p) => onSlateIds.has(String(p.id)) : null,
  }), [q, sport, indexes, visible, hasSlate, onSlateIds])

  const here = groups[0]
  const rosterHits = here?.players || []
  const nothingHere = !hits.length && !rosterHits.length

  // API fallback — only fires when the slate AND the roster come up empty, debounced so we
  // aren't hammering a public endpoint per keystroke. (The host that can open an api-only card.)
  useEffect(() => {
    const t = q.trim()
    setApiHits([])
    if (!hasSlate || t.length < 3 || !nothingHere) return undefined
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(t)}&sportIds=1&active=true&hydrate=currentTeam`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const ppl = (j?.people || []).filter((x) => x?.isPlayer !== false).slice(0, 6)
          setApiHits(ppl.map((x) => ({
            api_only: true,
            player_id: x.id,
            name: x.fullName,
            team: x.currentTeam?.name || '',
            bats: x.batSide?.code || '?',
            position: x.primaryPosition?.abbreviation || '',
          })))
        })
        .catch(() => {})
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [q, nothingHere, hasSlate])

  // ONE FLAT LIST for the arrow keys, in the order the rows are drawn.
  const flat = useMemo(() => {
    const out = []
    hits.forEach((p) => out.push({ type: 'slate', p }))
    rosterHits.forEach((r) => out.push({ type: 'roster', r }))
    ;(here?.teams || []).forEach((r) => out.push({ type: 'link', r }))
    ;(here?.games || []).forEach((r) => out.push({ type: 'link', r }))
    if (nothingHere) apiHits.forEach((p) => out.push({ type: 'api', p }))
    groups.slice(1).forEach((g) => { [...g.teams, ...g.games, ...g.players].forEach((r) => out.push({ type: 'link', r })) })
    return out
  }, [hits, rosterHits, here, groups, apiHits, nothingHere])

  useEffect(() => { if (sel > flat.length - 1) setSel(Math.max(0, flat.length - 1)) }, [flat.length, sel])
  useEffect(() => { listRef.current?.querySelector(`#qs-row-${sel}`)?.scrollIntoView?.({ block: 'nearest' }) }, [sel])

  const pick = (p) => { setOpen(false); onPick?.(p) }
  const rosterPlayer = (r) => {
    const p = r.raw || {}
    return {
      api_only: true, roster: true,
      player_id: p.player_id ?? r.id, name: p.name ?? r.name, team: p.team ?? r.team, team_name: p.team_name,
      bats: p.bats || '?', position: p.pos || r.pos || '', status: p.status, status_word: statusWord(p),
      season_line: p.season || null,
    }
  }
  const go = (item) => {
    if (!item) return
    if (item.type === 'slate') pick(item.p)
    else if (item.type === 'roster' && hasSlate && item.r.sport === sport) pick(rosterPlayer(item.r))
    else if (item.type === 'api') pick(item.p)
    else {
      const href = (item.r || {}).href
      setOpen(false)
      if (href && window.location.hash !== href) window.location.hash = href.replace(/^#/, '')
    }
  }

  if (!open) return null

  const phone = Boolean(vp?.phone)
  const acc = SPORT_ACCENT[sport]
  let idx = -1
  const rowProps = (i, s) => ({
    id: `qs-row-${i}`, role: 'option', 'aria-selected': i === sel, className: 'qs-row',
    onMouseEnter: () => setSel(i),
    style: {
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 16px', cursor: 'pointer',
      background: i === sel ? tint(SPORT_ACCENT[s], s) : 'transparent',
      borderLeft: `3px solid ${i === sel ? SPORT_ACCENT[s] : 'transparent'}`,
      color: 'inherit', textDecoration: 'none',
    },
  })
  const head = (text, extra = {}) => (
    <div className="qs-head" role="presentation" style={{ padding: '7px 16px 3px', fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800, ...extra }}>{text}</div>
  )
  const linkRow = (r) => {
    idx += 1
    const i = idx
    const common = { ...rowProps(i, r.sport), href: r.href, onClick: () => setOpen(false), key: `${r.kind}-${r.sport}-${r.id}`, 'data-qs': `${r.kind}:${r.sport}:${r.id}` }
    if (r.kind === 'team') {
      return (
        <a {...common} style={{ ...common.style, alignItems: 'center' }}>
          <TeamMark sport={r.sport} abbr={r.code} variant="logo" px={22} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
          <span className="qs-num" style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{r.code}</span>
          <span className="qs-num" style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>team</span>
        </a>
      )
    }
    if (r.kind === 'game') {
      return (
        <a {...common} style={{ ...common.style, alignItems: 'center' }}>
          <TeamMark sport={r.sport} abbr={r.away} variant="logo" px={22} />
          <span className="qs-num" style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>@</span>
          <TeamMark sport={r.sport} abbr={r.home} variant="logo" px={22} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{r.away} @ {r.home}</span>
          <span className="qs-num" style={{ marginLeft: 'auto', fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{r.status}</span>
        </a>
      )
    }
    // a person: another product's, or this product's when it has no slate card to open
    return (
      <a {...common}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
        <span className="qs-num" style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{r.team}{r.pos ? ` · ${r.pos}` : ''}</span>
        <span className="qs-num" style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>player</span>
      </a>
    )
  }

  const anyRows = flat.length > 0
  const loadingMore = typed && order.some((s) => !indexes[s]?.players)

  return (
    <div
      onClick={() => setOpen(false)}
      className="qs-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 400, /* above the dock (390) */
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'center', paddingTop: '14vh',
        ...(phone ? { top: vp.top, bottom: 'auto', height: vp.h, paddingTop: 'max(8px, env(safe-area-inset-top))' } : {}),
      }}
    >
      <style>{`
        .qs-row:focus-visible { outline: 2px solid ${acc}; outline-offset: -2px; }
        .qs-list { overscroll-behavior: contain; }
        @media (max-width: 760px) {
          .qs-panel { width: calc(100% - 16px) !important; display: flex !important; flex-direction: column; max-height: calc(var(--qs-h) - 16px - env(safe-area-inset-top)); }
          .qs-in { font-size: 16px !important; min-height: 48px; padding-right: 8px !important; }
          .qs-close { display: inline-flex !important; }
          .qs-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
          .qs-row { min-height: 44px; align-items: center !important; padding-top: 6px !important; padding-bottom: 6px !important; flex-wrap: wrap; row-gap: 0; }
          .qs-row span { font-size: 14px; }
          .qs-row .qs-num { font-size: 12px !important; }
          .qs-head { font-size: 12px !important; padding-top: 10px !important; }
          .qs-note { font-size: 12px !important; }
        }
        @media (min-width: 761px) { .qs-list { max-height: calc(100vh - 14vh - 80px); overflow-y: auto; } }
      `}</style>
      <div
        className="qs-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Search players, teams and games"
        style={{
          width: 'min(480px, 92vw)', height: 'fit-content',
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 18px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
          ...(vp ? { '--qs-h': `${vp.h}px` } : {}),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: anyRows ? `1px solid ${C.border}` : 'none' }}>
          <input
            ref={inputRef}
            className="qs-in"
            role="combobox" aria-expanded={anyRows} aria-controls="qs-list" aria-autocomplete="list"
            aria-activedescendant={anyRows ? `qs-row-${sel}` : undefined}
            aria-label="Search players, teams and games"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              if (e.key === 'Enter' && flat[sel]) { e.preventDefault(); go(flat[sel]) }
            }}
            placeholder="Jump to any player, team or game… (Esc to close)"
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none',
              padding: '13px 16px', fontSize: 14, color: C.text, outline: 'none',
              fontFamily: NUM_FONT,
            }}
          />
          <button type="button" className="qs-close" onClick={() => setOpen(false)} aria-label="Close search"
            style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flex: 'none', border: 0, background: 'transparent', color: C.text2, fontSize: 18, cursor: 'pointer' }}>{'✕'}</button>
        </div>
        <div className="qs-list" id="qs-list" role="listbox" ref={listRef}>
        {hits.map((p, i) => (
          <div
            key={playerId(p)}
            {...rowProps(i, sport)}
            onClick={() => pick(p)}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>{nameOf(p)}</span>
            <span className="qs-num" style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(p)} vs {oppOf(p)}
            </span>
            {String(p?.game_pick_role || '').trim() && (
              <span className="qs-num" style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
                🤖 {String(p.game_pick_role).split('/')[0]}
              </span>
            )}
            <span className="qs-num" style={{ marginLeft: 'auto', fontSize: 11, fontFamily: NUM_FONT, fontWeight: 800, color: C.orange }}>
              {hrScore(p).toFixed(0)}
            </span>
          </div>
        ))}
        {(idx = hits.length - 1, null)}
        {rosterHits.length > 0 && (
          <>
            {head(hasSlate ? (hits.length ? 'Also on a roster — not in tonight’s lineup' : 'On a roster — not in tonight’s lineup') : 'Players')}
            {rosterHits.map((r) => {
              idx += 1
              const i = idx
              const mine = hasSlate
              const common = { ...rowProps(i, r.sport), key: `r${r.id}`, 'data-qs': `player:${r.sport}:${r.id}` }
              const onClick = mine ? () => pick(rosterPlayer(r)) : () => setOpen(false)
              const meta = mine
                ? `${r.team}${r.pos ? ` · ${r.pos}` : ''} · ${statusWord(r.raw || r)}`
                : `${r.team}${r.pos ? ` · ${r.pos}` : ''}`
              const Tag = mine ? 'div' : 'a'
              return (
                <Tag {...common} {...(mine ? {} : { href: r.href })} onClick={onClick}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                  <span className="qs-num" style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{meta}</span>
                  {mine && (
                    <span className="qs-num" style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                      {r.pos === 'P' ? 'pitcher' : seasonWord(r.raw?.season)}
                    </span>
                  )}
                </Tag>
              )
            })}
          </>
        )}
        {here?.teams.length > 0 && head('Teams')}
        {(here?.teams || []).map((r) => linkRow(r))}
        {here?.games.length > 0 && head(gamesWord(sport))}
        {(here?.games || []).map((r) => linkRow(r))}
        {q.trim().length >= 2 && !anyRows && !loadingMore && (
          <div className="qs-note" style={{ padding: '10px 16px', fontSize: 11, color: C.text3 }}>
            {hasSlate
              ? <>Nobody on tonight&apos;s slate matches{q.trim().length >= 3 ? ' — searching the whole league…' : '.'}</>
              : <>No player, team or game matches &ldquo;{q.trim()}&rdquo;.</>}
          </div>
        )}
        {typed && !anyRows && loadingMore && (
          <div className="qs-note" style={{ padding: '10px 16px', fontSize: 11, color: C.text3 }}>Reading the rosters…</div>
        )}
        {nothingHere && apiHits.length > 0 && (
          <>
            {head('Not on the slate — live API')}
            {apiHits.map((p) => {
              idx += 1
              const i = idx
              return (
                <div key={p.player_id} {...rowProps(i, sport)} onClick={() => pick(p)}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                  <span className="qs-num" style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                    {p.team}{p.position ? ` · ${p.position}` : ''} · {p.bats}HB
                  </span>
                  <span className="qs-num" style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>API</span>
                </div>
              )
            })}
          </>
        )}
        {groups.slice(1).map((g) => {
          const rows = [...g.teams, ...g.games, ...g.players]
          if (!rows.length) return null
          return (
            <div key={g.sport}>
              {head(<><span style={{ color: SPORT_ACCENT[g.sport] }}>{g.label}</span> {'·'} {g.league}</>, { marginTop: 2, borderTop: `1px solid ${C.border}`, paddingTop: 9 })}
              {rows.map((r) => linkRow(r))}
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
