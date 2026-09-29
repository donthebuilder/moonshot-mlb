'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { Segmented } from '../Filters'
import SeasonToggle from '../SeasonToggle'
import useDvpSeason from '../../lib/nfl/useDvpSeason'

// 🎯 THE RED ZONE, ONE DOT PER TOUCH (2026-09-29, queue batch 10; Donovan
// approved the bot publishing the touches). Every red-zone carry and target
// the bot counted, placed by how far from the goal line it happened (20 on
// the left, the goal on the right), filled when it scored. The shaded band is
// inside the 5, where carries turn into touchdowns. TD rate at the right is
// tds / touches -- the same two numbers the bot's own red_zone totals carry.
//
// SOURCE: nfl_matchup.json red_zone[gsis].plays, "12r,5pT,..." -- yard line,
// r(ush) / p(ass), T if it scored. Nothing here is estimated; a player with
// no plays string (an older payload) is simply not drawn, and the page falls
// back to the old field when no one has one (see RedZone.js).
//
// Also: the leader of each distance band ("inside 5: Gibbs, 9 touches"), a
// rush / pass / both switch, and the season switch (the other season comes
// from nfl_matchup_prev.json, fetched only when you flip it).

const BANDS = [[20, 11, '20–11'], [10, 6, '10–6'], [5, 1, 'inside 5']]
const PREVIEW = 5
const KINDS = [{ key: 'both', label: 'Both' }, { key: 'r', label: 'Rush' }, { key: 'p', label: 'Pass' }]

export function parsePlays(s) {
  if (!s) return []
  return String(s).split(',').map((t) => {
    const m = /^(\d+)([rp])(T?)$/.exec(t.trim())
    return m ? { yl: Number(m[1]), k: m[2], td: m[3] === 'T' } : null
  }).filter((x) => x && x.yl >= 1 && x.yl <= 20)
}

export function hasPlays(matchup) {
  return Object.values(matchup?.red_zone || {}).some((v) => typeof v?.plays === 'string')
}

const surname = (name) => String(name || '').split(' ').slice(1).join(' ') || name
// "J. Gibbs": the full name clipped to "Jahmyr Gib…" at 375.
const short = (name) => { const [f, ...rest] = String(name || '').split(' '); return rest.length ? `${f[0]}. ${rest.join(' ')}` : name }

function Row({ r, onOpen }) {
  // Touches at the same yard stack into up to three lanes so they stay countable.
  const lanes = {}
  return (
    <button type="button" onClick={onOpen} title={`${r.name}: ${r.touches.length} red-zone touches, ${r.tds} TD`} style={{
      display: 'grid', gridTemplateColumns: 'minmax(78px, 26%) 1fr 44px', alignItems: 'center', gap: 8,
      width: '100%', padding: '3px 0', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left', minHeight: 0,
    }}>
      <span style={{ fontSize: TYPE.body, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {short(r.name)}<span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro }}> {r.pos}</span>
      </span>
      <span style={{ position: 'relative', height: 22, borderRadius: 4, background: `linear-gradient(90deg, transparent ${(15 / 19) * 100}%, ${C.green}1c ${(15 / 19) * 100}%)`, borderRight: `2px solid ${C.text2}` }}>
        {r.touches.map((t, i) => {
          const lane = (lanes[t.yl] = (lanes[t.yl] ?? -1) + 1) % 3
          return (
            <i key={i} style={{
              position: 'absolute', left: `calc(${((20 - t.yl) / 19) * 100}% - 4px)`, top: 2 + lane * 6.5,
              width: 7, height: 7, borderRadius: '50%',
              background: t.td ? C.green : 'transparent', border: `1.5px solid ${t.td ? C.green : t.k === 'r' ? C.orange : C.cyan}`,
            }} />
          )
        })}
      </span>
      <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.body, fontWeight: 900, textAlign: 'right', color: r.tds ? C.green : C.text3 }}>
        {Math.round((100 * r.tds) / r.touches.length)}%
        <small style={{ display: 'block', fontSize: TYPE.label, fontWeight: 700, color: C.text3 }}>{r.tds}/{r.touches.length}</small>
      </span>
    </button>
  )
}

export default function RedZoneDots({ data, matchup, team = 'all', onPlayerClick }) {
  const season = useDvpSeason(matchup)
  const [kind, setKind] = useState('both')
  const [all, setAll] = useState(false)
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [String(p.player_id), p])), [data])

  const rows = useMemo(() => {
    const out = []
    for (const [pid, v] of Object.entries(season.view?.red_zone || {})) {
      const p = byId.get(pid)
      if (team !== 'all' && p?.team !== team) continue
      const touches = parsePlays(v?.plays).filter((t) => kind === 'both' || t.k === kind)
      if (!touches.length) continue
      out.push({ pid, name: v.name || p?.name || pid, pos: v.position || p?.position || '', team: p?.team || null, touches, tds: touches.filter((t) => t.td).length, _raw: p })
    }
    return out.sort((a, b) => (b.touches.length - a.touches.length) || (b.tds - a.tds))
  }, [season.view, byId, team, kind])

  const leaders = useMemo(() => BANDS.map(([hi, lo, label]) => {
    let best = null
    for (const r of rows) {
      const n = r.touches.filter((t) => t.yl <= hi && t.yl >= lo).length
      if (n && (!best || n > best.n)) best = { r, n }
    }
    return { label, best }
  }), [rows])

  const shown = all ? rows : rows.slice(0, PREVIEW)
  const seasonShown = season.showing || matchup?.season

  return (
    <section aria-label="Red-zone touches, one dot each" style={{ margin: '0 0 12px', padding: '12px 12px 10px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.green, fontFamily: NUM_FONT }}>EVERY RED-ZONE TOUCH</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <Segmented value={kind} onChange={setKind} options={KINDS} />
          {season.hasToggle && <SeasonToggle seasons={[season.current, season.alt]} slateSeason={data?.season} value={season.showing} onPick={season.pick} loading={season.state === 'loading' ? season.showing : null} />}
        </span>
      </div>

      {leaders.some((l) => l.best) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
          {leaders.map(({ label, best }) => best && (
            <button type="button" key={label} onClick={() => best.r._raw && onPlayerClick?.(best.r._raw, 'TD')}
              style={{ border: 0, background: 'transparent', padding: 0, minHeight: 0, color: C.text3, font: 'inherit', cursor: 'pointer' }}>
              {label}: <b style={{ color: C.text }}>{surname(best.r.name)}</b>, {best.n} touch{best.n === 1 ? '' : 'es'}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(78px, 26%) 1fr 44px', gap: 8, fontFamily: NUM_FONT, fontSize: TYPE.label, color: C.text3 }}>
        <span>{seasonShown ? `${seasonShown}${season.showing && season.showing !== season.current ? ' · LAST SEASON' : ''}` : ''}</span>
        <span style={{ position: 'relative', height: 14 }}>{[[20, '20'], [10, '10'], [5, '5'], [1, 'G']].map(([y, t]) => <span key={t} style={{ position: 'absolute', left: `${((20 - y) / 19) * 100}%`, transform: y === 20 ? 'none' : y === 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{t}</span>)}</span>
        <span style={{ textAlign: 'right' }}>TD%</span>
      </div>
      {shown.length ? shown.map((r) => <Row key={r.pid} r={r} onOpen={() => r._raw && onPlayerClick?.(r._raw, 'TD')} />)
        : <div style={{ fontSize: TYPE.body, color: C.text3, padding: '8px 0' }}>No red-zone touches for this selection.</div>}
      {rows.length > PREVIEW && (
        <button type="button" onClick={() => setAll(!all)} style={{ marginTop: 6, padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 999, background: 'transparent', color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 800, cursor: 'pointer' }}>
          {all ? 'show fewer' : `show all ${rows.length}`}
        </button>
      )}
      <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        One dot per carry (orange ring) or target (blue ring) inside the 20; filled green when it scored. Shaded: inside the 5.
      </div>
    </section>
  )
}
