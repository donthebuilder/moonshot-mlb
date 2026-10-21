'use client'
import { useEffect, useMemo, useState } from 'react'
import CallStatusBadge, { GatedCallBadge } from './CallStatusBadge'
import { useStoryLock } from './MemberGate'
import { TeamTap } from './EntityTap'
import { BRAND, ALL_SPORT_KEYS, appHref, playerHref } from '../lib/routes'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { TYPE } from '../lib/theme'

// THE TAPE (2026-10-20, Donovan picked prototype A: "this whole section ... that
// has the day regular season live all that needs to be the storylines jumping
// out so people can see them ... throughout the day in each sport").
// It takes the day hero's place on every product's home: one line saying the
// day, then every product's storylines rolling up in one tape -- the same rows
// as the Storylines page (/api/stories -> lib/stories), each with its product,
// the player's board word, the story type's record (HOW STORIES DID) and, once
// its game is final, whether it came true. Then one line per product for the
// day's games. The tape pauses under a finger or the mouse; with reduced motion
// it is a plain scroll box. The current product's stories lead.
const PER_SPORT = 8
const ROW_SECONDS = 3.2

const TYPE_WORD = {
  milestone: 'MILESTONE', hot: 'HOT', multi: 'MULTI', b2b: 'BACK TO BACK', due: 'DUE', redzone: 'RED ZONE',
  list_td: 'EVERY GAME', list_100: '100+ STREAK', revenge: 'REVENGE', rivalry: 'RIVALRY', defense: 'SOFT D',
  point_streak: 'POINT STREAK', goal_streak: 'GOAL STREAK', iron_man: 'IRON MAN', birthday: 'BIRTHDAY',
  streak: 'STREAK', matchup: 'MATCHUP', funfact: 'FUN FACT', duel: 'DUEL', history: 'HISTORY', model: 'MODEL',
}

export default function StoryTape({ sport, theme: C, numFont, day = null, onSeeAll = null }) {
  // public products, plus the current one when it is a hidden product its viewer may see (BUCKETS on its own home)
  const sports = useMemo(() => {
    const pub = ALL_SPORT_KEYS.filter((k) => !BRAND[k]?.hidden || k === sport)
    return [sport, ...pub.filter((k) => k !== sport)]
  }, [sport])
  const [data, setData] = useState({})
  useEffect(() => {
    let alive = true
    for (const k of sports) {
      fetch(`/api/stories?sport=${k}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setData((d) => ({ ...d, [k]: j })) }).catch(() => {})
    }
    return () => { alive = false }
  }, [sports])

  // one members lock per product (a fixed list, so the hooks never change order)
  const locks = {}
  for (const k of ALL_SPORT_KEYS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locks[k] = useStoryLock({ sport: k, stories: data[k]?.stories, games: data[k]?.games })
  }

  // per product: one story per player, rarest first, mixed across story types; then interleaved, current product first
  const rows = useMemo(() => {
    const lists = sports.map((k) => {
      const j = data[k]
      if (!j) return []
      const rec = new Map((j.summary || []).map((s) => [s.type, s]))
      const seen = new Set()
      const byType = new Map()
      for (const s of (j.stories || []).filter((x) => x.type !== 'model')) {   // the long "priced for X, delivered Y" rows stay on the Storylines page
        if (!byType.has(s.type)) byType.set(s.type, [])
        byType.get(s.type).push(s)
      }
      const out = []
      while (out.length < PER_SPORT && [...byType.values()].some((l) => l.length)) {
        for (const l of byType.values()) {
          while (l.length) {
            const s = l.shift()
            const key = s.player_id || s.text
            if (seen.has(key)) continue
            seen.add(key)
            out.push({ ...s, sport: k, rec: rec.get(s.type) || null })
            break
          }
          if (out.length >= PER_SPORT) break
        }
      }
      return out
    })
    const mixed = []
    for (let i = 0; i < PER_SPORT; i++) for (const l of lists) if (l[i]) mixed.push(l[i])
    return mixed
  }, [data, sports])

  const dayLines = sports.map((k) => {
    const games = data[k]?.games || []
    if (!data[k]) return null
    const live = games.filter((g) => g.state === 'live').length
    const fin = games.filter((g) => g.state === 'final').length
    const pre = games.length - live - fin
    const parts = games.length
      ? [`${games.length} ${games.length === 1 ? 'game' : 'games'}`, live ? `${live} live` : null, fin ? `${fin} final` : null, pre && (live || fin) ? `${pre} to go` : null]
      : ['no games']
    return { k, text: parts.filter(Boolean).join(' · '), when: dayWord(data[k]) }
  }).filter(Boolean)

  const [paused, setPaused] = useState(false)
  const secs = Math.max(20, rows.length * ROW_SECONDS)

  const renderRow = (s, i, copy) => {
    const acc = SPORT_ACCENT[s.sport] || C.text
    const lockIn = locks[s.sport]
    const isPlayer = s.player_id && !String(s.player_id).startsWith('team:')
    const rec = s.rec && s.rec.n >= 5 ? s.rec : null
    const res = s.outcome?.base === 'hit' ? 'hit' : s.outcome?.base === 'miss' ? 'miss' : null
    return (
      <div key={`${copy ? 'c' : 'r'}-${s.sport}-${s.game_id}-${s.player_id}-${s.type}-${i}`} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}`, minHeight: 44 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: acc, flexShrink: 0, marginTop: 6 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: TYPE.body + 1, lineHeight: 1.4, color: C.text2 }}>
            <span style={{ marginRight: 4 }}>{s.icon}</span>
            {(s.parts || []).map((x, j) => (x.t === 'name'
              ? (isPlayer && x.v === s.name
                ? <a key={j} href={playerHref(s.sport, s.player_id)} tabIndex={copy ? -1 : undefined} style={{ color: C.text, fontWeight: 800, textDecoration: 'none' }}>{x.v}</a>
                : <b key={j} style={{ color: C.text }}><TeamTap abbr={x.v} sport={s.sport} px={14}>{x.v}</TeamTap></b>)
              : x.t === 'num' ? <b key={j} style={{ fontFamily: numFont, color: acc }}>{x.v}</b> : <span key={j}>{x.v}</span>))}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
            <a href={appHref(s.sport, 'storylines')} tabIndex={copy ? -1 : undefined} style={chip(C, numFont, acc, 'line')}>{BRAND[s.sport]?.name}</a>
            <span style={chip(C, numFont)}>{TYPE_WORD[s.type] || String(s.type || '').toUpperCase()}</span>
            {s.board ? (lockIn
              ? <GatedCallBadge lockIn={lockIn(s)} variant="text" status={s.board.status} score={s.board.score} theme={C} numFont={numFont} accent={acc} />
              : <CallStatusBadge variant="text" status={s.board.status} score={s.board.score} theme={C} numFont={numFont} accent={acc} />) : null}
            {res ? <span style={chip(C, numFont, res === 'hit' ? acc : C.text3, res === 'hit' ? 'fill' : 'line')}>{res === 'hit' ? 'CAME TRUE' : 'MISSED'}</span> : null}
            {rec ? <span title={`${TYPE_WORD[s.type] || s.type} stories since ${rec.since}: ${rec.hit} of ${rec.n} came true`} style={{ ...chip(C, numFont), color: C.text }}>{rec.hit}/{rec.n} HIT</span> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section aria-label="The tape: today's storylines" style={{ border: `1px solid ${C.border}`, borderRadius: 16, background: C.bg2, padding: '12px 14px 10px', marginBottom: 12 }}>
      <style>{`@keyframes dashTapeRoll{from{transform:translateY(0)}to{transform:translateY(-50%)}}
        .dash-tape-roll{animation:dashTapeRoll var(--tape-secs) linear infinite}
        .dash-tape-win[data-paused="1"] .dash-tape-roll,.dash-tape-win:hover .dash-tape-roll,.dash-tape-win:focus-within .dash-tape-roll{animation-play-state:paused}
        @media (prefers-reduced-motion: reduce){.dash-tape-roll{animation:none}.dash-tape-copy{display:none}.dash-tape-win{overflow-y:auto!important}}`}</style>
      {day ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {day.icon ? <span style={{ fontSize: 14 }}>{day.icon}</span> : null}
            <span style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: numFont }}>{day.eyebrow}</span>
            {day.live ? <span style={{ fontSize: TYPE.label, fontWeight: 900, color: SPORT_ACCENT[sport], letterSpacing: '.1em', fontFamily: numFont, border: `1px solid ${C.border2}`, borderRadius: 999, padding: '1px 8px' }}>● LIVE</span> : null}
          </div>
          <h2 style={{ fontSize: TYPE.title, fontWeight: 900, margin: '4px 0 0', lineHeight: 1.25, letterSpacing: '-.01em', color: C.text }}>
            {day.lead}{day.accentText ? <span style={{ color: SPORT_ACCENT[sport] }}>{' '}{day.accentText}</span> : null}
          </h2>
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: day ? `1px solid ${C.border}` : 'none', paddingTop: day ? 8 : 0 }}>
        <span style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800, letterSpacing: '.1em', fontFamily: numFont }}>THE TAPE{rows.length ? ` · ${rows.length} STORIES` : ''}</span>
        {onSeeAll ? (
          <button type="button" onClick={onSeeAll} style={{ marginLeft: 'auto', minHeight: 44, padding: '0 2px', border: 'none', background: 'transparent', color: SPORT_ACCENT[sport], font: 'inherit', fontSize: TYPE.body, fontWeight: 800, cursor: 'pointer' }}>All storylines ›</button>
        ) : null}
      </div>
      {rows.length ? (
        <div className="dash-tape-win" data-paused={paused ? '1' : '0'}
          onTouchStart={() => setPaused(true)} onTouchEnd={() => setTimeout(() => setPaused(false), 2500)}
          style={{ height: 236, overflow: 'hidden', position: 'relative', WebkitMaskImage: 'linear-gradient(transparent, black 5%, black 90%, transparent)', maskImage: 'linear-gradient(transparent, black 5%, black 90%, transparent)' }}>
          <div className="dash-tape-roll" style={{ '--tape-secs': `${secs}s` }}>
            <div>{rows.map((s, i) => renderRow(s, i, false))}</div>
            <div className="dash-tape-copy" aria-hidden="true">{rows.map((s, i) => renderRow(s, i, true))}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: TYPE.body, color: C.text3, padding: '10px 0' }}>{Object.keys(data).length < sports.length ? 'Loading the day’s storylines…' : 'No storylines on the day yet.'}</div>
      )}
      {dayLines.length ? (
        <div style={{ display: 'grid', gap: 2, borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 4 }}>
          {dayLines.map((d) => (
            <a key={d.k} href={appHref(d.k, 'home')} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', alignItems: 'center', gap: 8, minHeight: 30, fontSize: TYPE.body, color: C.text2, textDecoration: 'none' }}>
              <b style={{ fontFamily: numFont, fontSize: TYPE.label, letterSpacing: '.06em', color: SPORT_ACCENT[d.k] }}>{BRAND[d.k]?.name}</b>
              <span style={{ fontFamily: numFont }}>{d.when ? `${d.when} · ` : ''}{d.text}</span>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  )
}

// the day the product's stories are for: "Week 7", or the slate's weekday
function dayWord(j) {
  if (j?.week) return `Week ${j.week}`
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(j?.day || '')) ? new Date(`${j.day}T12:00:00Z`) : null
  return d ? d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : ''
}

// a small oval chip, one height everywhere
function chip(C, numFont, col = null, kind = 'plain') {
  return {
    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 999, whiteSpace: 'nowrap',
    fontFamily: numFont, fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textDecoration: 'none',
    color: kind === 'fill' ? C.bg : (col || C.text2),
    background: kind === 'fill' ? col : 'transparent',
    border: `1px solid ${kind === 'plain' ? C.border2 : col}`,
  }
}
