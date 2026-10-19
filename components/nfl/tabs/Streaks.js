'use client'
// 🔥 STREAKS — the NFL sibling of MOONSHOT's Runs page. See lib/nfl/streaks.js
// for what a streak is. The page: pick a market, pick your own line (chips
// around the bot's bar), and every slate player with a log ranks by
// consecutive games on the same side of that number. Hot at the top, or flip
// to Coldest for the fade board.
import NflNote from '../NflNote'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { streakMarkets, barChoices, rateRows } from '../../../lib/nfl/streaks'
import PageHeader from '../../PageHeader'
import { FilterPill } from '../../Filters'
import NflExplain from '../NflExplain'
import { HeatQuadrant, ValueBars } from '../StreakViews'
import NflTable from '../NflTable'
import { SportTheme } from '../../SportTheme'
import { useIsPhone } from '../../MobileFold'
import { roleLabel } from '../../../lib/nfl/roles'

const LABEL = { TD: 'Anytime TD', REC_YDS: 'Receiving yards', REC: 'Receptions', RUSH_YDS: 'Rushing yards', RUSH_ATT: 'Carries', PASS_YDS: 'Passing yards', KICK_PTS: 'Kicking points' }

// THE STREAKS PAGE, REDONE (Donovan 10-18: "this page is disgusting and it's old ... I don't track streaks like that ... the bar chart
// of the active runs looks ass"). He picked three views, all at the line you choose: D the heat quadrant (every player, season rate
// across, last 5 up), B one man's last 10 games as values against the dashed line, C the hot / cold ladder (L5 · L10 · Szn and which
// way he is going). The run histogram and the run cards are gone. lib/nfl/streaks.js rateRows does the arithmetic.

export default function Streaks({ data, logs, onPlayerClick }) {
  const markets = useMemo(() => streakMarkets(logs), [logs])
  const [mk, setMk] = useState(markets[0]?.key || 'REC_YDS')
  const market = markets.find((m) => m.key === mk) || markets[0]
  const [bar, setBar] = useState(null)
  const [side, setSide] = useState('over')
  const [pos, setPos] = useState('ALL')
  const [picked, setPicked] = useState(null)
  const phone = useIsPhone()
  const line = bar ?? market?.bar ?? 0
  const chips = useMemo(() => (market ? barChoices(market.key, market.bar) : []), [market])

  // THE LADDER (10-18): every player the bot scores in this market, playing this week, with 3+ games this season, at the line
  const ladder = useMemo(() => {
    if (!market) return []
    // Only positions the bot scores in this market (a quarterback's receiving yards are true and worthless); a man on a bye
    // is carried in the payload, but "who is hot right now" is a question about people who are playing.
    const eligible = new Set((data?.markets || []).find((m) => m.key === market.key)?.positions || [])
    const players = (data?.players || []).filter((p) => !p.on_bye && (!eligible.size || eligible.has(p.position)) && (pos === 'ALL' || p.position === pos))
    const rows = rateRows(logs, players, market.field, line, market.key)
    const dir = side === 'over' ? 1 : -1
    // hottest = clearing it most right now: last 5, then last 10, then the season (coldest: the other way)
    return rows.sort((a, b) => dir * ((b.l5.pct - a.l5.pct) || (b.l10.pct - a.l10.pct) || (b.szn.pct - a.szn.pct)))
  }, [logs, data, market, line, side, pos])
  const pickedRow = ladder.find((r) => r.player.player_id === picked) || ladder[0] || null

  if (!markets.length) return <div className="ts-empty">No game logs yet. They appear once the season starts.</div>

  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
    <div className="ts">
      <PageHeader
        eyebrow="TUDDY · STREAKS"
        title={side === 'over' ? 'Who is hot' : 'Who is cold'}
        note={<NflNote tab="streaks" />}
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
        right={(
          <div style={{ display: 'flex', gap: 7 }}>
            <FilterPill active={side === 'over'} onClick={() => setSide('over')}>🔥 Hottest</FilterPill>
            <FilterPill active={side === 'under'} onClick={() => setSide('under')}>🧊 Coldest</FilterPill>
          </div>
        )}
      />

      {/* THE HOUSE CONTROLS (2026-09-18). These three rows used to be a private
          .ts-row button system with its own hardcoded hex, a fourth control
          vocabulary on TUDDY. Same FilterPill every other board uses now; the
          list below keeps its own .ts-* styling, which is this page's real
          visual work. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {markets.map((m) => (
            <FilterPill key={m.key} active={m.key === market.key}
              onClick={() => { setMk(m.key); setBar(null); setPos('ALL'); setPicked(null) }}>
              {LABEL[m.key] || m.key}
            </FilterPill>
          ))}
        </div>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}><NflExplain label="Line" /></span>
          {chips.map((c) => (
            <FilterPill key={c} active={c === line} onClick={() => setBar(c)}
              title={c === market.bar ? "TUDDY's bar for this market." : `Your own line: ${c}.`}>
              {c}{c === market.bar ? ' · bar' : ''}
            </FilterPill>
          ))}
        </div>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Pos</span>
          {['ALL', ...((data?.markets || []).find((m) => m.key === market.key)?.positions || ['QB', 'RB', 'WR', 'TE', 'K'])].map((k) => (
            <FilterPill key={k} active={k === pos} onClick={() => setPos(k)}>
              {k === 'ALL' ? 'Everyone' : k}
            </FilterPill>
          ))}
        </div>
      </div>

      {!ladder.length && <div className="ts-empty">Nobody on this slate is on a run at {line} {LABEL[market.key]?.toLowerCase()}.</div>}
      {ladder.length > 0 && (() => {
        const label = `${line}+ ${(LABEL[market.key] || market.key).toLowerCase()}`
        const pct = (o) => (o.pct == null ? '—' : `${o.pct}%`)
        const tableRows = ladder.map((r) => ({
          _key: r.player.player_id, _raw: r, name: r.player.name, team: r.player.team, pos: roleLabel(r.player),
          l5: r.l5.pct, l10: r.l10.pct, szn: r.szn.pct, trend: r.trend, run: r.run, q: r.questionable ? 1 : 0,
          _l5: r.l5, _l10: r.l10, _szn: r.szn,
        }))
        const G1 = { key: 'p', label: 'Player', order: 0 }, G2 = { key: 'rate', label: `Cleared ${label}`, order: 1 }, G3 = { key: 'way', label: 'Which way', order: 2 }
        const cols = [
          { key: 'name', label: 'Player', sticky: true, heat: false, w: 140, group: G1 },
          { key: 'pos', label: 'Pos', heat: false, w: 40, fold: true, group: G1 },
          { key: 'team', label: 'Tm', heat: false, w: 34, teamMark: 'nfl', fold: true, group: G1 },
          { key: 'l5', label: 'L5', w: 50, scale: 'seq', domain: [0, 100], group: G2, fmt: (v, r) => pct(r._l5), title: 'Share of his last 5 games over the line' },
          { key: 'l10', label: 'L10', w: 50, scale: 'seq', domain: [0, 100], group: G2, fmt: (v, r) => pct(r._l10), title: 'Share of his last 10 games over the line (may reach into last season)' },
          { key: 'szn', label: 'Szn', w: 50, scale: 'seq', domain: [0, 100], group: G2, fmt: (v, r) => pct(r._szn), title: 'Share of this season\'s games over the line' },
          { key: 'trend', label: 'Trend', w: 58, heat: false, numeric: true, group: G3, title: 'Last 5 against the season, in points: ▲ heating, ▼ cooling',
            fmt: (v) => (v > 0 ? <b style={{ color: C.green }}>▲ {v}</b> : v < 0 ? <span style={{ color: C.text3 }}>▼ {-v}</span> : <span style={{ color: C.text3 }}>even</span>) },
          { key: 'run', label: 'Run', w: 44, heat: false, numeric: true, group: G3, title: 'Games in a row over the line, newest back', fmt: (v) => (v > 0 ? `${v}` : '—') },
        ]
        const pr = pickedRow
        return (
          <>
            {/* D + B side by side on a wide screen, stacked on a phone: the field at a glance, then one man's games */}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
              <section aria-label="Heat quadrant" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
                <HeatQuadrant rows={ladder} picked={pr?.player.player_id} onPick={setPicked} side={side} labels={phone ? 5 : 8} />
              </section>
              {pr && (
                <section aria-label={`${pr.player.name}: value against the line`} style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <button type="button" className="tap-box" onClick={() => onPlayerClick?.(pr.player, market.key)}
                      style={{ border: 0, background: 'transparent', padding: 0, color: C.text, font: `900 15px/1.2 ${NUM_FONT}`, cursor: 'pointer' }}>{pr.player.name} ›</button>
                    <span style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text3 }}>L5 <b style={{ color: C.text }}>{pct(pr.l5)}</b> · L10 {pct(pr.l10)} · Szn {pct(pr.szn)}</span>
                  </div>
                  <ValueBars row={pr} bar={line} />
                  <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>his last {pr.last.length} games · dashed = {line}</div>
                </section>
              )}
            </div>
            {/* C: the ladder, every player, sorted hottest (or coldest) first; a tap on a row draws his games above */}
            <NflTable rows={tableRows} columns={cols} maxRows={20} maxHeight={9999} heatMode="sorted"
              initialSort={{ key: 'l5', dir: side === 'over' ? 'desc' : 'asc' }} key={`${market.key}-${line}-${side}-${pos}`}
              onRowClick={(r) => { setPicked(r?._raw?.player?.player_id ?? r?.player?.player_id); try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { /* ignore */ } }} />
          </>
        )
      })()}

      <style>{`
      .ts{display:flex;flex-direction:column;gap:12px}
      .ts-empty{padding:26px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      `}</style>
    </div>
    </SportTheme>
  )
}
