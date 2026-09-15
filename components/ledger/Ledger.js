'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { btnStyle, WhatThis } from '../ui'
import DenseTable from '../DenseTable'

// ═══ THE CALLED LEDGER — ONE SHARED COMPONENT, ANY SPORT ═══════════════════
//
// Path to Victory A10 (MOONSHOT, "Homer Ledger, full season") and B10a
// (TUDDY, "Tuddy Ledger") are the same feature with different nouns: every
// night's CALLED events, running totals, per-player history, browsable by
// date. This component carries none of either sport's vocabulary — the
// caller supplies `eventLabel` ("HR" / "TD"), `baseRate` (the naive
// baseline to compare the record against) and pre-shaped rows; this file
// only knows how to lay a ledger out.
//
// A ROW'S `status` IS ONE OF THREE THINGS (Path to Victory item 14 / the
// notification audit — a called event and a random one must never look the
// same):
//   called — the model actually selected him (a real top-call designation).
//   board  — the model was tracking him but did not call him.
//   off    — he was never on the model's board at all.
//
// TABLES LEAD, ALWAYS (Donovan, verbatim: "I LIKE THE TABLES. FUCK NO" to
// cards). This renders through DenseTable, the site's own dense-table
// component — never a card grid, never a second table implementation.

const STATUS_META = {
  called: { label: 'CALLED', color: C.green },
  board: { label: 'ON BOARD', color: C.cyan },
  off: { label: 'NOT ON BOARD', color: C.text3 },
}

function StatusChip({ status, title }) {
  const m = STATUS_META[status] || STATUS_META.off
  return (
    <span title={title} style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: '.04em', padding: '1.5px 7px',
      borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${m.color}66`,
      background: status === 'off' ? 'transparent' : `${m.color}18`,
      color: m.color,
    }}>{m.label}</span>
  )
}

function Tile({ label, value, color, sub }) {
  return (
    <div style={{ background: `${color}0d`, border: `1px solid ${color}33`, borderRadius: 9, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 19, fontFamily: NUM_FONT, fontWeight: 900, color, marginTop: 1, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

const panel = (accent) => ({
  background: C.bg2, border: `1px solid ${C.border}`,
  borderLeft: `3px solid ${accent}`, borderRadius: 14,
  padding: '13px 16px', marginBottom: 12,
})

const prettyDate = (d) => {
  const t = new Date(`${d}T12:00:00Z`)
  return Number.isNaN(t.getTime()) ? d
    : t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function Ledger({
  eventLabel = 'EVENT',
  eventLabelLong = 'Event',
  accent = C.orange,
  baseRate = null,
  date, onPrevDate, onNextDate, onToday, canGoNext = false,
  night = null,             // { totals: {total,called,board,off}, rows: [...] } | null
  nightLoading = false,
  nightNote = null,         // an honest reason the night is empty/unavailable
  season = null,            // { from, to, nightsCount, totalEvents, called, board, off, perNight } | null
  hitterRows = [],
  seasonLoading = false,
  seasonMessage = '',
  onLoadSeason,             // (days) => void
  onPlayerClick,
  view: viewProp,
  onViewChange,
}) {
  const [viewState, setViewState] = useState('night')
  const view = viewProp || viewState
  const setView = onViewChange || setViewState

  const open = (row) => onPlayerClick?.(row._raw || row)

  const nameCell = (v, r) => (
    <span onClick={() => open(r)} style={{ cursor: onPlayerClick ? 'pointer' : 'default', borderBottom: onPlayerClick ? `1px dotted ${C.border2}` : 'none' }}>{v}</span>
  )

  const nightColumns = [
    { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 130, fmt: nameCell },
    { key: 'team', label: 'Team', heat: false, w: 46 },
    { key: 'value', label: eventLabel, w: 40, dp: 0, primary: true, title: `${eventLabelLong}s that night` },
    { key: 'score', label: 'Score', w: 50, dp: 0, blankWhen: (n) => !Number.isFinite(n), title: "The model's score for him that night, where it had one" },
    {
      key: 'statusLabel', label: 'Status', heat: false, w: 100,
      fmt: (v, r) => (
        <StatusChip
          status={r.status}
          title={r.status === 'called' ? `Wore ${r.statusLabel} — a real call`
            : r.status === 'board' ? (r.statusLabel === 'on sheet' ? 'Tracked by the model, no top-call badge' : `Wore ${r.statusLabel} — not the top call`)
            : 'Never on the model’s board at all'}
        />
      ),
    },
    { key: 'detail', label: 'Detail', heat: false, w: 150, dim: true },
    { key: 'wasOn', label: 'Was on', w: 54, blankWhen: (n) => !Number.isFinite(n), title: `Season ${eventLabel} total as the board knew it that night — not added to` },
  ]

  const hitterColumns = [
    { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 130, fmt: nameCell },
    { key: 'team', label: 'Team', heat: false, w: 46 },
    { key: 'value', label: eventLabel, w: 44, dp: 0, primary: true, title: `Total ${eventLabelLong}s in this window` },
    { key: 'statusLabel', label: 'Record', heat: false, w: 118 },
    { key: 'score', label: 'Avg score', w: 62, dp: 0, blankWhen: (n) => !Number.isFinite(n) },
    { key: 'detail', label: 'Detail', heat: false, w: 160, dim: true },
    { key: 'last', label: 'Last', heat: false, w: 64, fmt: (v) => (v ? prettyDate(v) : '—') },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {[['night', 'One night'], ['season', `Season · ${eventLabel}`]].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={btnStyle(accent, view === k)}>{label}</button>
        ))}
      </div>

      {view === 'night' && (
        <div style={panel(accent)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={onPrevDate} style={btnStyle(C.text3, false)} disabled={nightLoading}>← Prev</button>
            <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13 }}>{date ? prettyDate(date) : '—'}</span>
            <button onClick={onNextDate} style={btnStyle(C.text3, false)} disabled={nightLoading || !canGoNext}>Next →</button>
            <button onClick={onToday} style={{ ...btnStyle(accent, false), marginLeft: 'auto' }} disabled={nightLoading}>Tonight</button>
          </div>

          {nightLoading && <div style={{ fontSize: 11.5, color: C.text3 }}>Reading {date}…</div>}

          {!nightLoading && night && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 7, marginBottom: 11 }}>
                <Tile label={`${eventLabelLong}s`} value={night.totals.total} color={accent} />
                <Tile label="Called" value={night.totals.called} color={C.green} />
                <Tile label="On board" value={night.totals.board} color={C.cyan} />
                <Tile label="Not on board" value={night.totals.off} color={C.text3} />
              </div>
              {night.rows.length ? (
                <DenseTable
                  rows={night.rows}
                  columns={nightColumns}
                  heatMode="none"
                  maxRows={100}
                  caption={`Every ${eventLabelLong.toLowerCase()} on the board that night, tagged called / on board / not on board.`}
                />
              ) : (
                <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 2px', lineHeight: 1.6 }}>
                  No {eventLabelLong.toLowerCase()}s recorded for {date}. Games may not have finished, or nothing has published yet.
                </div>
              )}
            </>
          )}

          {!nightLoading && !night && (
            <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.6 }}>
              {nightNote || `Waiting for ${date}’s board.`}
            </div>
          )}
        </div>
      )}

      {view === 'season' && (
        <>
          <div style={panel(accent)}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 900 }}>Season ledger</span>
              <span style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT }}>
                {season ? `${season.nightsCount} night${season.nightsCount === 1 ? '' : 's'} · ${prettyDate(season.from)} → ${prettyDate(season.to)}` : 'nothing loaded this session yet'}
              </span>
            </div>
            {season ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 7 }}>
                <Tile label={`${eventLabelLong}s`} value={season.totalEvents} color={accent} sub={season.perNight != null ? `${season.perNight}/night` : ''} />
                <Tile label="Called" value={season.called} color={C.green} sub={season.totalEvents ? `${Math.round((1000 * season.called) / season.totalEvents) / 10}%` : ''} />
                <Tile label="On board" value={season.board} color={C.cyan} />
                <Tile label="Not on board" value={season.off} color={C.text3} />
                {baseRate && (
                  <Tile
                    label={baseRate.label}
                    value={typeof baseRate.value === 'number' ? baseRate.value.toFixed(2) : baseRate.value}
                    color="#c084fc"
                    sub={baseRate.unit}
                  />
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.7 }}>
                Nothing loaded for this session yet — load the season below and it fills in.
              </div>
            )}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11, alignItems: 'center' }}>
              <button disabled={seasonLoading} onClick={() => onLoadSeason?.(30)} style={btnStyle(accent, false)}>{seasonLoading ? 'Loading…' : 'Load 30 nights'}</button>
              <button disabled={seasonLoading} onClick={() => onLoadSeason?.(90)} style={btnStyle(accent, false)}>Load 90 nights</button>
              <button disabled={seasonLoading} onClick={() => onLoadSeason?.(150)} style={btnStyle(accent, false)}>Load full season</button>
              {seasonMessage && <span style={{ fontSize: 10, color: C.text3 }}>{seasonMessage}</span>}
            </div>
            <WhatThis label="what this counts and where it comes from" maxWidth={720}>
              Every {eventLabelLong.toLowerCase()} here is read fresh off the model&apos;s own published record for that
              night — the same file the record/results page grades from — on every load of this page, on any
              device. Nothing is stored only in a browser.
              {baseRate ? ` ${baseRate.label} (${baseRate.note}) is shown for scale, not as a claim about these picks.` : ''}
              {' '}Some earlier nights this season were published in an older format with no full capture report —
              those are skipped here rather than counted as zero, and the load button says how many of the nights it
              checked actually had one.
            </WhatThis>
          </div>

          {season && (
            <div style={panel(C.green)}>
              <div style={{ fontSize: 12.5, fontWeight: 900, marginBottom: 8 }}>Per-player history</div>
              {hitterRows.length ? (
                <DenseTable
                  rows={hitterRows}
                  columns={hitterColumns}
                  heatMode="none"
                  maxRows={150}
                  caption="Every player with at least one in this window. Tap a name to open his card."
                />
              ) : (
                <div style={{ fontSize: 11.5, color: C.text3 }}>Nobody to show yet.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
