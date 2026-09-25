'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, hrScore, playerId } from '../lib/player'
import { boardCompare } from '../lib/boardOrder'
import { fetchRosters } from '../lib/dataSource'

// What the roster file says about a man, in the words the search row shows.
// A slate hit is never routed here -- he is in tonight's lineup and has a
// row. This is everyone else: on the club but out of the lineup, on the IL,
// in the minors, or just moved (the file's team is where he is NOW).
const STATUS_WORD = { A: 'active \u00b7 not in tonight\u2019s lineup', RM: 'minors', D7: 'IL-7', D10: 'IL-10', D15: 'IL-15', D60: 'IL-60', PL: 'paternity', BRV: 'bereavement', SU: 'suspended' }
const statusWord = (p) => STATUS_WORD[String(p?.status || '')] || p?.status_word || p?.status || ''
const seasonWord = (s) => (s && s.pa ? `${s.avg != null ? String(s.avg.toFixed(3)).replace(/^0/, '') : '\u2014'} \u00b7 ${s.hr} HR \u00b7 ${s.pa} PA` : 'no MLB plate appearances this season')

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
export default function QuickSearch({ players = [], onPick }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [apiHits, setApiHits] = useState([])
  const [roster, setRoster] = useState(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

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

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])

  // Opened from the header search's "search every active player" button
  // (Controls.js) with whatever was typed there -- the only way in on a phone.
  useEffect(() => {
    const onOpen = (e) => { setOpen(true); setQ(String(e?.detail?.q || '')); setSel(0) }
    window.addEventListener('dash-quicksearch', onOpen)
    return () => window.removeEventListener('dash-quicksearch', onOpen)
  }, [])

  // The cached roster loads the first time the box opens, not on page load:
  // ~400 KB nobody needs until they type a name.
  useEffect(() => {
    if (!open || roster) return
    let alive = true
    fetchRosters().then((d) => { if (alive && Array.isArray(d?.players)) setRoster(d.players) })
    return () => { alive = false }
  }, [open, roster])

  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')

  const hits = useMemo(() => {
    const k = norm(q).trim()
    if (k.length < 2) return []
    return players
      .filter((p) => norm(nameOf(p)).includes(k) || norm(teamOf(p)) === k)
      .sort(boardCompare)   // 2026-09-25: board order
      .slice(0, 8)
  }, [q, players])

  // Roster hits: everyone on a 40-man who is NOT on tonight's slate. Hitters
  // first (a pitcher is searchable too -- he just has no hitting line).
  const rosterHits = useMemo(() => {
    const k = norm(q).trim()
    if (k.length < 2 || !roster) return []
    const onSlate = new Set(players.map((p) => String(playerId(p))))
    return roster
      .filter((p) => !onSlate.has(String(p.player_id)) && (norm(p.name).includes(k) || norm(p.team) === k))
      .sort((a, b) => (a.is_pitcher - b.is_pitcher) || ((b.season?.pa || 0) - (a.season?.pa || 0)))
      .slice(0, 8)
      .map((p) => ({
        api_only: true, roster: true,
        player_id: p.player_id, name: p.name, team: p.team, team_name: p.team_name,
        bats: p.bats || '?', position: p.pos || '', status: p.status, status_word: statusWord(p),
        season_line: p.season || null,
      }))
  }, [q, roster, players])

  // API fallback — only fires when the slate AND the roster come up empty, debounced so we
  // aren't hammering a public endpoint per keystroke.
  useEffect(() => {
    const k = q.trim()
    setApiHits([])
    if (k.length < 3 || hits.length || rosterHits.length) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(k)}&sportIds=1&active=true&hydrate=currentTeam`)
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
  }, [q, hits.length, rosterHits.length])

  const pick = (p) => { setOpen(false); onPick?.(p) }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'center', paddingTop: '14vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 92vw)', height: 'fit-content',
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 18px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0) }}
          onKeyDown={(e) => {
            const list = [...hits, ...rosterHits, ...(hits.length || rosterHits.length ? [] : apiHits)]
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
            if (e.key === 'Enter' && list[sel]) pick(list[sel])
          }}
          placeholder="Jump to any player… (Esc to close)"
          style={{
            width: '100%', background: 'transparent', border: 'none',
            borderBottom: hits.length ? `1px solid ${C.border}` : 'none',
            padding: '13px 16px', fontSize: 14, color: C.text, outline: 'none',
            fontFamily: NUM_FONT,
          }}
        />
        {hits.map((p, i) => (
          <div
            key={playerId(p)}
            onClick={() => pick(p)}
            onMouseEnter={() => setSel(i)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 16px',
              cursor: 'pointer',
              background: i === sel ? 'rgba(249,115,22,.12)' : 'transparent',
              borderLeft: `3px solid ${i === sel ? C.orange : 'transparent'}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>{nameOf(p)}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(p)} vs {oppOf(p)}
            </span>
            {String(p?.game_pick_role || '').trim() && (
              <span style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
                🤖 {String(p.game_pick_role).split('/')[0]}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: NUM_FONT, fontWeight: 800, color: C.orange }}>
              {hrScore(p).toFixed(0)}
            </span>
          </div>
        ))}
        {rosterHits.length > 0 && (
          <>
            <div style={{ padding: '7px 16px 3px', fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
              {hits.length ? 'Also on a roster \u2014 not in tonight\u2019s lineup' : 'On a roster \u2014 not in tonight\u2019s lineup'}
            </div>
            {rosterHits.map((p, i) => {
              const idx = hits.length + i
              return (
                <div
                  key={`r${p.player_id}`}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setSel(idx)}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 16px', cursor: 'pointer',
                    background: idx === sel ? 'rgba(249,115,22,.12)' : 'transparent',
                    borderLeft: `3px solid ${idx === sel ? C.orange : 'transparent'}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                    {p.team}{p.position ? ` \u00b7 ${p.position}` : ''}{' \u00b7 '}{p.status_word}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                    {p.position === 'P' ? 'pitcher' : seasonWord(p.season_line)}
                  </span>
                </div>
              )
            })}
          </>
        )}
        {q.trim().length >= 2 && !hits.length && !rosterHits.length && !apiHits.length && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: C.text3 }}>
            Nobody on tonight&apos;s slate matches{q.trim().length >= 3 ? ' — searching the whole league…' : '.'}
          </div>
        )}
        {!hits.length && !rosterHits.length && apiHits.length > 0 && (
          <>
            <div style={{ padding: '7px 16px 3px', fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
              Not on the slate — live API
            </div>
            {apiHits.map((p, i) => (
              <div
                key={p.player_id}
                onClick={() => pick(p)}
                onMouseEnter={() => setSel(i)}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 16px',
                  cursor: 'pointer',
                  background: i === sel ? 'rgba(249,115,22,.12)' : 'transparent',
                  borderLeft: `3px solid ${i === sel ? C.orange : 'transparent'}`,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                  {p.team}{p.position ? ` · ${p.position}` : ''} · {p.bats}HB
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>API</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
