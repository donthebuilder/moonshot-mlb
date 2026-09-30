'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampRecord } from '../../../lib/nhl/useLamp'
import { PanelTitle, Chip, WhatThis } from '../../ui'
import { SportTheme } from '../../SportTheme'
import { ModeBar, ViewRow } from '../../results/ResultsParts'
import LampTable from '../LampTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, fmtDay } from '../ui'
import { bandClaim } from '../../bands/BandTable'
import { bandTint } from '../../ScoreBands'
import { wilson } from '../../../lib/interval'

// 🏒 THE RECORD, MOONSHOT'S RESULTS FRAME (2026-09-30, Donovan: "upgrade the
// results pages to fit the mlb components for each sport"). MOONSHOT's
// Results (components/tabs/Results.js): the title with its chips, then the
// question buttons (components/results/ResultsParts.js) --
//   🌙 This night   one graded night: the calls, who scored, who got away
//   📈 All season   every graded night, one row each (tap one to open it)
//   📊 Score bands  what a rank in the game is actually worth
// -- one line saying what the view answers, and the tables on MOONSHOT's
// DenseTable (LampTable) instead of hand-built ones.
//
// Read off graded lamp_goal_log rows only (regular season + playoffs); a
// night with no grades is not here, and an empty record says why. The same
// public-record rule as /called. Void men (not dressed) are out of every
// denominator.
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')
const MODES = [
  ['night', '🌙 This night', 'how the calls graded'],
  ['season', '📈 All season', 'is the board any good'],
  ['bands', '📊 Score bands', 'what a rank in the game is worth'],
]

export default function Results({ onOpenPlayer }) {
  const { data, error, loading } = useLampRecord(60)
  const T = data?.total
  const [mode, setMode] = useState('night')
  const [picked, setPicked] = useState(null)
  const nights = data?.nights || []
  const newest = useMemo(() => [...nights].sort((a, b) => (a.date < b.date ? 1 : -1)), [nights])
  const night = newest.find((n) => n.date === picked) || newest[0] || null
  const open = (r) => { const id = (r?._raw ?? r)?.playerId; if (id) onOpenPlayer?.(id) }

  return (
    <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
    <div>
      <PanelTitle
        title="The record"
        sub={T ? `${nights.length} graded ${nights.length === 1 ? 'night' : 'nights'} · last ${data.days} days` : 'every graded night'}
        right={T ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip color={C.ice}>{pct(T.scorersCalled, T.scorers)} of scorers called</Chip>
            <Chip color={C.lamp}>{T.calledHits}/{T.calledN} calls hit</Chip>
          </div>
        ) : null}
        theme={C}
        numFont={NUM_FONT}
      />

      <ModeBar modes={MODES} mode={mode} setMode={setMode} />

      <WhatThis maxWidth={760}>
        {{
          night: 'one graded night — the three calls per game, who scored, and the scorers the board had lower or not at all.',
          season: 'every graded night in the window, one row each: of the skaters who scored, how many were called and how many were on the board. Tap a night to open it.',
          bands: 'is the rank separating outcomes — every dressed skater, banded by his rank in his own game, against the rate of all of them.',
        }[mode]}
      </WhatThis>

      <DelayedBanner error={error} what="the record" />
      {loading && !data ? <Loading what="the record" /> : null}
      {data && !data.dbReady && <EmptyState title="NO RECORD YET" note={data.note === 'record table not created yet' ? 'The record table has not been created on the database yet. The first night locks and grades once it exists.' : 'The record is not connected yet.'} />}
      {data?.dbReady && nights.length === 0 && (
        <EmptyState title="NO REGULAR-SEASON NIGHT GRADED YET" note="Preseason boards lock and grade too, but camp lineups are kept out of this number. The first regular-season night fills this in once its final is graded.">
          <div style={{ marginTop: 12 }}><a href="/called?sport=nhl" style={{ color: C.ice, fontSize: 11, fontWeight: 800 }}>See the preseason nights on CALLED IT →</a></div>
        </EmptyState>
      )}

      {mode === 'night' && night && (<>
        {/* The night picker belongs to This night and nothing else (MOONSHOT's rule). */}
        <ViewRow views={newest.slice(0, 8).map((n) => [n.date, fmtDay(n.date)])} value={night.date} onChange={setPicked} />
        <Kicker>{fmtDay(night.date)} · {night.games} {night.games === 1 ? 'game' : 'games'} · {night.scorers} scorers · {night.calledHits}/{night.calledN} calls hit</Kicker>
        <LampTable
          rows={night.called.map((c, i) => ({ ...c, _key: `${c.playerId}-${i}`, _raw: c, game: `${c.team} v ${c.opp}`, result: c.hit ? 1 : 0 }))}
          columns={[
            { key: 'result', label: '✓', flag: true, mark: '✓', w: 26, title: 'Did he score?' },
            { key: 'name', label: 'Called', w: 150, heat: false, bold: true, sticky: true },
            { key: 'rank', label: '#', w: 34, heat: false, mono: true, title: 'His rank in his own game — the top three are the calls' },
            { key: 'game', label: 'Game', w: 84, heat: false, mono: true, dim: true },
            { key: 'score', label: 'Score', w: 52, dp: 0, primary: true },
            { key: 'goals', label: 'G', w: 34, dp: 0 },
          ]}
          onRowClick={open}
          initialSort={{ key: 'score', dir: 'desc' }}
          maxHeight={9999}
          maxRows={Math.max(night.called.length, 1)}
          caption="The three calls in every game that night, locked before puck drop and graded after the final. Each row opens that skater."
        />
        {night.offScorers?.length > 0 && (<>
          <Kicker>SCORED, NOT CALLED · {night.offScorers.length}</Kicker>
          <LampTable
            rows={night.offScorers.map((s, i) => ({ ...s, _key: `${s.playerId || s.name}-${i}`, _raw: s, where: s.status === 'board' ? `#${s.rank} on the board` : 'not on the board' }))}
            columns={[
              { key: 'name', label: 'Scorer', w: 150, heat: false, bold: true, sticky: true },
              { key: 'team', label: 'Tm', w: 40, heat: false, mono: true, dim: true },
              { key: 'where', label: 'Where the board had him', w: 150, heat: false },
              { key: 'goals', label: 'G', w: 34, dp: 0 },
            ]}
            onRowClick={open}
            maxHeight={9999}
            maxRows={Math.max(night.offScorers.length, 1)}
            caption="Skaters who scored that night without a call — ranked lower in their game, or never on the board at all."
          />
        </>)}
      </>)}

      {mode === 'season' && nights.length > 0 && (
        <LampTable
          rows={newest.map((n) => ({ ...n, _key: n.date, day: fmtDay(n.date), calledPct: n.scorers ? (100 * n.scorersCalled) / n.scorers : null, hitRate: n.calledN ? (100 * n.calledHits) / n.calledN : null }))}
          columns={[
            { key: 'day', label: 'Night', w: 96, heat: false, bold: true, sticky: true },
            { key: 'games', label: 'GM', w: 38, heat: false, mono: true, dim: true },
            { key: 'scorers', label: 'Scorers', w: 56, heat: false, mono: true },
            { key: 'scorersCalled', label: 'Called', w: 52, heat: false, mono: true, title: 'Scorers who were one of the three calls in their game' },
            { key: 'calledPct', label: 'Called %', w: 62, dp: 0, title: 'Share of that night’s scorers the board called' },
            { key: 'scorersOnBoard', label: 'On board', w: 60, heat: false, mono: true },
            { key: 'scorersOff', label: 'Off', w: 40, heat: false, mono: true, dim: true },
            { key: 'hitRate', label: 'Calls hit', w: 64, dp: 0, fmt: (v, r) => `${r.calledHits}/${r.calledN}`, title: 'How many of the night’s calls scored' },
          ]}
          onRowClick={(r) => { setPicked((r?._raw ?? r).date); setMode('night') }}
          initialSort={null}
          maxHeight={620}
          maxRows={Math.max(nights.length, 1)}
          caption="Every graded night in the window. Tap a night for its calls and its scorers."
        />
      )}

      {mode === 'bands' && T && (() => {
        // MOONSHOT's score-bands cell treatment (components/ScoreBands.js via
        // components/bands/BandTable.js, parity plan D): each band's rate
        // tinted against every dressed skater's rate, grey when the bands
        // don't fall in order, top vs bottom is inside the noise, or the
        // band's own interval covers the base.
        const bands = [['1–3 (called)', T.bands.top3], ['4–8', T.bands.r4to8], ['9–15', T.bands.r9to15], ['16+', T.bands.r16plus]]
          .map(([label, b]) => ({ label, ok: b.hits, n: b.n }))
        const base = T.dressed ? (100 * T.scorers) / T.dressed : 0
        const { claims, z } = bandClaim(bands, -1)
        return (
          <section aria-label="Hit rate by rank">
            <Kicker>HIT RATE BY RANK · {data.days} DAYS</Kicker>
            <table style={tbl}>
              <thead><tr style={thr}><th style={th}>RANK IN GAME</th><th style={{ ...th, textAlign: 'right' }}>SKATERS</th><th style={{ ...th, textAlign: 'right' }}>SCORED</th><th style={{ ...th, textAlign: 'right' }}>RATE</th></tr></thead>
              <tbody>
                {bands.map((b) => {
                  const p = b.n ? (100 * b.ok) / b.n : null
                  const ci = wilson(b.ok, b.n)
                  const resolved = !!ci && !(ci[0] <= base && base <= ci[1])
                  const { bg, fg } = bandTint(p == null ? null : p - base, claims && resolved, C)
                  return (
                    <tr key={b.label} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={td}>{b.label}</td><td style={num}>{b.n}</td><td style={num}>{b.ok}</td>
                      <td title={ci ? `95% interval ${ci[0].toFixed(1)}–${ci[1].toFixed(1)}% · base ${base.toFixed(1)}%` : undefined}
                        style={{ ...num, fontWeight: 900, color: fg, background: bg, opacity: claims && !resolved ? 0.7 : 1 }}>{pct(b.ok, b.n)}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>all dressed</td><td style={num}>{T.dressed}</td><td style={num}>{T.scorers}</td>
                  <td style={{ ...num, fontWeight: 900, color: C.text }}>{pct(T.scorers, T.dressed)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 6, fontFamily: NUM_FONT }}>
              <b style={{ color: claims ? C.teal : C.text3 }}>{claims ? 'SEPARATES' : 'NO CLAIM'}</b> · z {z.toFixed(2)} top band vs 16+ · a grey rate has a number and no claim
            </div>
          </section>
        )
      })()}

      <SourceLine>Source: lamp_goal_log, graded rows only (dressed / goals / hit from gamecenter/{'{id}'}/boxscore after the final). Void men (not dressed) are out of every denominator.</SourceLine>
    </div>
    </SportTheme>
  )
}
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const thr = { color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }
