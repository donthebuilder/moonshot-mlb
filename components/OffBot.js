'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { teamAbbrs } from '../lib/gamelogs'

// PLAYING TONIGHT, OFF THE BOT — the slate's blind spot, made visible.
//
// The bot scores ~9 hitters a side; real lineups carry pinch-threat benches,
// call-ups and guys it skipped. This panel diffs tonight's POSTED lineups
// (live boxscores — battingOrder appears the moment a lineup posts, which is
// why the schedule's lineups hydrate was empty pregame and this uses
// boxscores instead) against the slate, and lists everyone batting tonight
// the bot didn't score. Click one → the API-only modal: props record, splits,
// zone map, all live.
//
// Fetches on expand only (one schedule call + one boxscore per game), never
// on page load.

export default function OffBot({ players = [], onPlayerClick }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle') // idle | loading | done | none | early
  const [rows, setRows] = useState([])

  const load = async () => {
    setState('loading')
    try {
      const abbrs = (await teamAbbrs()) || {}
      const today = new Date().toLocaleDateString('en-CA')
      const sched = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&fields=dates,games,gamePk`)
        .then((r) => (r.ok ? r.json() : null))
      const games = sched?.dates?.[0]?.games || []
      if (!games.length) { setState('none'); return }
      const slateIds = new Set(players.map((p) => String(p?.player_id ?? p?.id)).filter(Boolean))
      const out = []
      let anyLineup = false
      await Promise.all(games.map(async (gm) => {
        const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${gm.gamePk}/boxscore?fields=teams,home,away,team,id,players,person,fullName,battingOrder,position,abbreviation`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        if (!box?.teams) return
        ;['home', 'away'].forEach((side) => {
          const t = box.teams[side]
          const oppId = box.teams[side === 'home' ? 'away' : 'home']?.team?.id
          Object.values(t?.players || {}).forEach((pl) => {
            const bo = parseInt(pl?.battingOrder, 10)
            if (!bo) return
            anyLineup = true
            if (pl?.position?.abbreviation === 'P') return
            const id = pl?.person?.id
            if (!id || slateIds.has(String(id))) return
            out.push({
              id, name: pl.person.fullName,
              team: abbrs[t?.team?.id] || '', opp: abbrs[oppId] || '',
              spot: Math.round(bo / 100),
            })
          })
        })
      }))
      out.sort((a, b) => a.team.localeCompare(b.team) || a.spot - b.spot)
      setRows(out)
      setState(!anyLineup ? 'early' : out.length ? 'done' : 'none')
    } catch { setState('none') }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && state === 'idle') load()
  }

  return (
    <div style={{ margin: '10px 0 14px' }}>
      <button onClick={toggle}
        title="Hitters in posted lineups the bot didn't score — every one opens live via the API."
        style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        background: open ? C.bg2 : 'rgba(255,255,255,.02)', cursor: 'pointer',
        border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px',
      }}>
        {/* ONE LINE (2026-08-23). Title plus a full sentence of explanation
            wrapped to three lines on a phone, for a panel that is shut. The
            sentence is the button's tooltip and it is repeated in full inside
            the panel when it opens, so nothing is lost by not shouting it at
            somebody who has not asked. */}
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>🕳 Off the bot</span>
        <span style={{
          fontSize: 9.5, color: C.text3, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        }}>in tonight&apos;s lineups, never scored</span>
        <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
          {state === 'done' ? `${rows.length} found` : ''} {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{
          border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px',
          padding: '10px 12px', background: 'rgba(255,255,255,.015)',
        }}>
          {state === 'loading' && (
            <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>Reading tonight&apos;s lineups…</span>
          )}
          {state === 'early' && (
            <span style={{ fontSize: 10.5, color: C.text3 }}>
              No lineups posted yet — this fills in as managers post them, usually 2–4 hours before first pitch.
            </span>
          )}
          {state === 'none' && (
            <span style={{ fontSize: 10.5, color: C.text3 }}>
              Every hitter in tonight&apos;s posted lineups is already on the bot&apos;s slate — no blind spots right now.
            </span>
          )}
          {state === 'done' && (
            <>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {rows.map((r) => (
                  <button key={r.id}
                    onClick={() => onPlayerClick?.({ api_only: true, player_id: r.id, name: r.name, team: r.team, bats: '?' })}
                    title={`#${r.spot} for ${r.team} vs ${r.opp} — open live API profile`}
                    style={{
                      display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer',
                      border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px',
                      background: 'transparent',
                    }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{r.name}</span>
                    <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{r.team} #{r.spot} vs {r.opp}</span>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.5 }}>
                In a posted lineup tonight, not in the bot&apos;s run — no model scores exist for these
                hitters, so what opens is the live-API profile: props record, situational splits, zone map.
                Refreshes each time you re-open the panel after a reload.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
