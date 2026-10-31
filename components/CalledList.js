'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
import DenseTable from './DenseTable'
import { fmtOdds } from '../lib/odds'
import { BRAND } from '../lib/routes'
import { tagIdentity } from '../lib/tableTags'
import { HELD_LINE } from '../lib/card/reveal'
import { LIST_STATUS_WORD } from '../lib/card/listRows'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'

// 📋 THE CALLED LIST (batch member-requests 2A, 2026-10-25: "members can't find where the called picks are"; on football the site showed cards only).
// A TABLE of the day's locked Card, one row per leg: player, game and time, market, the price the lock froze, status (waiting / live / hit / miss /
// scratched) and the one-line angle. Board order. Cards stay for picking; they never sit above or replace this. ONE component for every sport:
// the product hands its own theme, accent, table skin and openers, like Longshots / TrendingAll. The rows come from /api/card/list, which applies the
// Card's own who-sees-what rule on the server (a viewer who may not read a play is only told how many are held).
//   preview={n}  the Home strip: the first n rows and a link to the full list (`onOpenList`).
const getJSON = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const timeWords = (iso) => {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return '—'
  try { return `${new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET` } catch { return '—' }
}
const dayWords = (d) => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() } catch { return d || '' } }

export default function CalledList({ sport, theme: C, numFont: NUM_FONT, accent, Table = DenseTable, onOpenPlayer = null, onOpenGame = null, preview = 0, onOpenList = null }) {
  const [res, setRes] = useState(undefined)   // undefined = reading, null = unreadable, else the route's answer
  // ONE GAME (2026-10-30, Donovan: a post's link should land on "the specific called picks for that game"): #...&tab=calledlist&game=<id> filters the
  // table to that game, with a chip to see them all. Read once at mount, before the app's router rewrites the hash; never on the Home strip.
  const [gameOnly, setGameOnly] = useState(() => {
    if (preview || typeof window === 'undefined') return null
    try { return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('game') || null } catch { return null }
  })
  useEffect(() => {
    let live = true
    setRes(undefined)
    getJSON(`/api/card/list?sport=${encodeURIComponent(sport)}`).then((j) => { if (live) setRes(j && j.available ? j : null) })
    return () => { live = false }
  }, [sport])

  const rows = useMemo(() => (res?.entries || []).map((e) => ({
    _key: e.key, _raw: e, name: e.name, team: e.team, opp: e.opp || '—', game: e.startAt, play: e.play + (e.withName ? ` · with ${e.withName}` : ''),
    market: e.marketShort || e.marketWords, marketLong: e.marketWords, price: e.price, status: e.status, angle: e.angle || '—',
  })), [res])
  const inGame = gameOnly ? rows.filter((r) => String(r._raw.gameId) === String(gameOnly)) : rows
  const gameLabel = inGame[0] ? `${inGame[0].team} vs ${inGame[0].opp}` : null
  const shown = preview ? rows.slice(0, preview) : inGame

  const word = (s) => LIST_STATUS_WORD[s] || s.toUpperCase()
  const tone = (s) => (s === 'hit' || s === 'live' ? accent : s === 'miss' || s === 'scratched' || s === 'pushed' ? C.text3 : C.text2)
  // THE PHONE'S ORDER: who, what, the price, where it stands first (390px shows about the first four); the game and the angle scroll in
  const columns = [
    { key: 'name', label: 'Player', group: 'Play', w: 116, sticky: true, bold: true, numeric: false, heat: false, link: onOpenPlayer ? (r) => () => onOpenPlayer(r._raw) : undefined },
    { key: 'market', label: 'Market', group: 'Bet', w: 92, numeric: false, heat: false, fmt: (v, r) => <span title={r._raw.marketWords}>{v}</span> },
    { key: 'price', label: 'At lock', group: 'Bet', w: 58, heat: false, mono: true, fmt: (v) => (v == null ? '—' : fmtOdds(v)), title: 'The price the lock froze with the pick' },
    { key: 'status', label: 'Status', group: 'Status', w: 86, numeric: false, heat: false, fmt: (v) => <span style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', color: tone(v) }}>{word(v)}</span> },
    { key: 'team', label: 'Tm', group: 'Game', w: 44, numeric: false, heat: false },
    { key: 'opp', label: 'Opp', group: 'Game', w: 44, numeric: false, heat: false },
    { key: 'game', label: 'Game', group: 'Game', w: 104, numeric: false, heat: false, fmt: (v) => timeWords(v), link: onOpenGame ? (r) => () => onOpenGame(r._raw.gameId) : undefined },
    { key: 'play', label: 'Play', group: 'Game', w: 210, numeric: false, heat: false },
    { key: 'angle', label: 'Angle', group: 'Why', w: 640, numeric: false, heat: false, title: 'Why the model likes him here' },
  ]
  const cols = useMemo(() => tagIdentity(columns, sport, rows), [rows])   // eslint-disable-line react-hooks/exhaustive-deps
  const counts = res?.counts || {}
  const stateLine = ['live', 'waiting', 'hit', 'miss', 'scratched', 'pushed'].filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(' · ')

  if (preview && (res === undefined || res === null || !rows.length)) return null   // the Home strip is silent until there is something to show
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {preview ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: accent }}>{`${BRAND[sport]?.name || ''} · CALLED LIST`}</span>
          <span style={{ font: `700 11px/1 ${NUM_FONT}`, color: C.text3 }}>{stateLine}</span>
          {onOpenList ? <button type="button" className={FLAT_CHIP_CLASS} onClick={onOpenList} style={{ ...flatChip(false, accent, C, NUM_FONT), marginLeft: 'auto' }}>{`Full list${rows.length > shown.length ? ` (${rows.length})` : ''} →`}</button> : null}
        </div>
      ) : (
        <PageHeader eyebrow={`${BRAND[sport]?.name || ''} · CALLED LIST`} title="Called list" theme={C} numFont={NUM_FONT} accent={accent}
          sub={res?.date ? `${dayWords(res.date)}${res.live ? '' : ' · LAST CARD'}` : null}
          note="Every play the lock froze, in board order, with the price it was locked at." />
      )}
      {res === undefined ? <div style={{ fontSize: 12, color: C.text3 }}>Reading the card…</div> : null}
      {res === null ? <div style={{ fontSize: 12, color: C.text3 }}>LIST DELAYED. The card could not be read just now.</div> : null}
      {res && !rows.length && !res.held ? <div style={{ fontSize: 12, color: C.text3 }}>Waiting for tonight’s board</div> : null}
      {res && !rows.length && res.held > 0 && !preview ? <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{`${res.held} ${res.held === 1 ? 'play is' : 'plays are'} held back. ${HELD_LINE}`}</div> : null}
      {res && rows.length ? (
        <>
          {!preview && stateLine ? <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3 }}>{`${rows.length} ${rows.length === 1 ? 'PLAY' : 'PLAYS'} · ${stateLine.toUpperCase()}`}</div> : null}
          {gameOnly && !preview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2 }}>{inGame.length ? `THIS GAME · ${gameLabel}` : 'NO CALLED PLAYS IN THIS GAME'}</span>
              <button type="button" className={FLAT_CHIP_CLASS} onClick={() => setGameOnly(null)} style={{ ...flatChip(false, accent, C, NUM_FONT), marginLeft: 'auto' }}>{`All plays (${rows.length})`}</button>
            </div>
          ) : null}
          {shown.length ? <Table rows={shown} columns={cols} maxHeight={9999} maxRows={shown.length} heatMode="standouts" initialSort={null} accent={accent} /> : null}
          {res.held > 0 && !preview ? <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{`${res.held} more ${res.held === 1 ? 'play is' : 'plays are'} held back. ${HELD_LINE}`}</div> : null}
        </>
      ) : null}
    </div>
  )
}
