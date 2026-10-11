'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { Segmented } from '../Filters'
import SeasonToggle from '../SeasonToggle'
import useDvpSeason from '../../lib/nfl/useDvpSeason'
import { chipColor } from '../Heatmap'
import { RedZoneStrip } from './RedZoneField'
import { ChartCard, ChartLegend } from '../charts'
import { useIsPhone } from '../MobileFold'
import { playerHref } from '../../lib/routes'
import NflTable from './NflTable'
import { roleLabel } from '../../lib/nfl/roles'

// 🔴 EVERY RED-ZONE TOUCH, ON THE FIELD (2026-09-30, Donovan: "make something
// I can visually understand, football field wise ... I want to be able to see
// the field"). Was one dot strip per player. Now MOONSHOT's spray-chart page
// (components/SprayField.js): a row of name chips, the red zone drawn as a
// field in a framed panel (components/nfl/FootballField.js mode 'redzone'),
// every touch at the yard line it started -- carries in the running lane,
// targets across, green when it scored -- and on the right the readout, the
// three bands as lane bars (20-11 / 10-6 / inside 5, share + TDs, like the
// spray chart's LF/CF/RF + HR), and the totals. Under it every player as a
// table; a row puts him on the field.
//
// Source: nfl_matchup.json red_zone[pid].plays ("5rT,11r,20r,14p": yards to
// go, r = carry / p = target, T = touchdown). Where a touch sat side to side
// is not published.
//
// ONE PICTURE PER TRUTH (2026-10-01, BATCH-2D-CORE flag 1+4): the field is now
// RedZoneStrip rows -- one lane per player, each touch at the yard line it
// started -- instead of FootballField's redzone mode, which spread touches
// across the field at side-to-side spots that were never published. A target
// that did not score is drawn hollow: the plays string doesn't say whether it
// was caught.

const BANDS = [[20, 11, '20–11'], [10, 6, '10–6'], [5, 1, 'inside 5']]
const KINDS = [{ key: 'both', label: 'Both' }, { key: 'r', label: 'Rush' }, { key: 'p', label: 'Pass' }]
const CHIPS = 16

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

export default function RedZoneDots({ data, matchup, team = 'all', onPlayerClick }) {
  const season = useDvpSeason(matchup)
  const [kind, setKind] = useState('both')
  const [who, setWho] = useState(null)          // pid, or null = everyone
  const [pick, setPick] = useState(null)
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [String(p.player_id), p])), [data])

  const rows = useMemo(() => {
    const out = []
    for (const [pid, v] of Object.entries(season.view?.red_zone || {})) {
      const p = byId.get(pid)
      if (team !== 'all' && p?.team !== team) continue
      const touches = parsePlays(v?.plays).filter((t) => kind === 'both' || t.k === kind)
      if (!touches.length) continue
      const tds = touches.filter((t) => t.td).length
      out.push({
        pid, _key: pid, name: v.name || p?.name || pid, pos: p ? roleLabel(p) : (v.position || ''), team: p?.team || '',
        touches, n: touches.length, tds, tdPct: (100 * tds) / touches.length,
        in10: touches.filter((t) => t.yl <= 10).length, in5: touches.filter((t) => t.yl <= 5).length,
        _raw: p || null,
      })
    }
    return out.sort((a, b) => (b.n - a.n) || (b.tds - a.tds))
  }, [season.view, byId, team, kind])

  const phone = useIsPhone()
  const STRIP_ROWS = phone ? 6 : 10
  const focus = who ? rows.find((r) => r.pid === who) : null
  // RedZoneStrip's row shape: { key, name, player, href, touches: [{ d, kind, res }] }
  const stripOf = (r) => ({
    key: r.pid, name: r.name, player: r._raw, href: playerHref('nfl', r.pid),
    touches: r.touches.map((t, i) => ({ d: t.yl, kind: t.k === 'r' ? 'rush' : 'pass', res: t.td ? 'td' : t.k === 'r' ? 'carry' : 'target', seed: i })),
  })
  const stripRows = focus ? [stripOf(focus)] : rows.slice(0, STRIP_ROWS).map(stripOf)
  const touches = focus ? focus.touches.map((t, i) => ({ ...t, who: focus })) : rows.flatMap((r) => r.touches.map((t) => ({ ...t, who: r })))
  const plays = touches.map((t, i) => ({ key: `${t.who.pid}-${i}`, yd: t.yl, kind: t.k, td: t.td, t,
    title: `${t.who.name} · ${t.yl}-yard ${t.k === 'r' ? 'carry' : 'target'}${t.td ? ' · touchdown' : ''}` }))
  const picked = plays.find((p) => p.key === pick)
  const nTd = touches.filter((t) => t.td).length
  const bands = BANDS.map(([hi, lo, label]) => {
    const inB = touches.filter((t) => t.yl <= hi && t.yl >= lo)
    return { label, n: inB.length, td: inB.filter((t) => t.td).length, pct: touches.length ? (100 * inB.length) / touches.length : 0 }
  })
  const top = rows.slice(0, CHIPS)
  const maxN = Math.max(1, ...top.map((r) => r.n))
  const seasonShown = season.showing || matchup?.season

  return (
    <section aria-label="Red-zone touches on the field" style={{ margin: '0 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.green, fontFamily: NUM_FONT }}>EVERY RED-ZONE TOUCH</span>
        {seasonShown && <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{seasonShown}{season.showing && season.showing !== season.current ? ' · LAST SEASON' : ''}</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <Segmented value={kind} onChange={(k) => { setKind(k); setPick(null) }} options={KINDS} />
          {season.hasToggle && <SeasonToggle seasons={[season.current, season.alt]} slateSeason={data?.season} value={season.showing} onPick={season.pick} loading={season.state === 'loading' ? season.showing : null} />}
        </span>
      </div>

      {/* the name chips, MOONSHOT's spray-page row: heat by red-zone touches */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" onClick={() => { setWho(null); setPick(null) }} style={chip(!who, null)}>Everyone · {rows.reduce((a, r) => a + r.n, 0)}</button>
        {top.map((r) => (
          <button key={r.pid} type="button" onClick={() => { setWho(who === r.pid ? null : r.pid); setPick(null) }}
            title={`${r.name}: ${r.n} red-zone touches, ${r.tds} TD`} style={chip(who === r.pid, chipColor(r.n, 0, maxN))}>
            {surname(r.name)}
          </button>
        ))}
      </div>

      <ChartCard theme={C}>
        {/* A real minimum: the strip's lanes hold absolutely placed marks, so
            their content width is zero and a flex row would crush them. */}
        <div style={{ flex: '1 1 380px', minWidth: 'min(100%, 300px)', maxWidth: '100%' }}>
          <RedZoneStrip rows={stripRows} rulerLabel="YARDS OUT" phone={phone} onPlayerClick={onPlayerClick} />
          {!focus && rows.length > STRIP_ROWS && (
            <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>+{rows.length - STRIP_ROWS} more below, in the table</div>
          )}
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: '100%' }}>
          <div style={{ fontSize: TYPE.name, fontWeight: 900 }}>
            {focus ? <>{focus.name} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro }}>{focus.pos} · {focus.team}</span></> : `Everyone${team !== 'all' ? ` · ${team}` : ''}`}
          </div>
          <div aria-live="polite" style={{ minHeight: 40, fontFamily: NUM_FONT, fontSize: 10.5, lineHeight: 1.6, color: C.text2, marginTop: 2 }}>
            {picked ? <>
              <b style={{ color: picked.td ? C.green : C.text }}>{picked.t.yl}-YARD {picked.t.k === 'r' ? 'CARRY' : 'TARGET'}{picked.td ? ' · TOUCHDOWN' : ''}</b>
              {!focus && <div>{picked.t.who.name} · {picked.t.who.team}</div>}
            </> : <span style={{ color: C.text3 }}>Showing {touches.length} touch{touches.length === 1 ? '' : 'es'}{focus ? '' : ` across ${rows.length} player${rows.length === 1 ? '' : 's'}`}. Tap a name to put one player on the strip.</span>}
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bands.map((b) => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                <span style={{ width: 52, color: C.text3, fontFamily: NUM_FONT }}>{b.label}</span>
                <div style={{ flex: 1, height: 11, background: C.bg3, borderRadius: 2 }}>
                  <div style={{ width: `${Math.max(2, b.pct)}%`, height: '100%', background: chipColor(b.pct, 0, 60), borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: NUM_FONT, color: C.text2, minWidth: 58, textAlign: 'right' }}>
                  {Math.round(b.pct)}%{b.td > 0 && <span style={{ color: C.green }}> {b.td}TD</span>}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontFamily: NUM_FONT }}>
            <span style={{ fontSize: 10, color: C.text3 }}><b style={{ color: C.text, fontSize: 12.5 }}>{touches.length}</b> touches</span>
            <span style={{ fontSize: 10, color: C.text3 }}><b style={{ color: C.green, fontSize: 12.5 }}>{nTd}</b> TD</span>
            <span style={{ fontSize: 10, color: C.text3 }}><b style={{ color: C.text, fontSize: 12.5 }}>{touches.length ? Math.round((100 * nTd) / touches.length) : 0}%</b> scored</span>
          </div>
          <ChartLegend theme={C} style={{ marginTop: 8 }} items={[
            { key: 'td', mark: <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />, label: 'touchdown' },
            { key: 'carry', mark: <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: C.green }} />, label: 'carry' },
            { key: 'target', mark: <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', border: `1.5px solid ${C.text2}`, boxSizing: 'border-box' }} />, label: 'target' },
          ]} />
          <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
            Each mark sits at the yard line the play started; up and down in a row is only spacing, not where on the field.
          </div>
          {focus?._raw && onPlayerClick && (
            <button type="button" onClick={() => onPlayerClick(focus._raw, 'TD')} style={{ marginTop: 8, padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 999, background: 'transparent', color: C.text2, fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 800, cursor: 'pointer' }}>
              Open his card →
            </button>
          )}
        </div>
      </ChartCard>

      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <NflTable
            rows={rows}
            columns={[
              { key: 'name', label: 'Player', w: 150, heat: false, bold: true, sticky: true },
              { key: 'pos', label: 'Pos', w: 38, heat: false, mono: true, dim: true },
              { key: 'team', label: 'Tm', w: 44, heat: false, mono: true, dim: true, teamMark: 'nfl' },
              { key: 'n', label: 'RZ touches', w: 68, dp: 0, primary: true },
              { key: 'in10', label: 'Inside 10', w: 60, dp: 0 },
              { key: 'in5', label: 'Inside 5', w: 58, dp: 0 },
              { key: 'tds', label: 'TD', w: 40, dp: 0 },
              { key: 'tdPct', label: 'TD%', w: 50, dp: 0 },
            ]}
            onRowClick={(r) => { const x = rows.find((q) => q._raw === r || q === r || q.pid === r?.player_id); if (x) { setWho(x.pid); setPick(null); if (typeof window !== 'undefined') window.scrollBy({ top: -1, behavior: 'smooth' }) } }}
            initialSort={{ key: 'n', dir: 'desc' }}
            maxHeight={420}
            maxRows={12}
            caption="Every player with a red-zone touch. Tap a row to put him on the field above."
          />
        </div>
      )}
    </section>
  )
}

function chip(on, heat) {
  return {
    padding: '3px 10px', borderRadius: 7, cursor: 'pointer', fontSize: TYPE.label, fontWeight: 800,
    fontFamily: NUM_FONT, whiteSpace: 'nowrap', minHeight: 0,
    border: `1px solid ${on ? C.text : C.border}`,
    background: heat || 'transparent', color: heat ? C.bg : C.text2,
    boxShadow: on ? `0 0 0 1px ${C.text}` : 'none',
  }
}
