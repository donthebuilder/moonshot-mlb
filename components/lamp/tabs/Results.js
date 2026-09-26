'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampRecord } from '../../../lib/nhl/useLamp'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, LampDot, fmtDay } from '../ui'

// 🏒 THE RECORD — THE PLOT, hockey edition: of the skaters who actually
// scored, how many were CALLED and how many ON THE BOARD at lock. Read off
// graded lamp_goal_log rows only; a night with no grades is not here, and
// an empty record says why. Same public-record rule as /called.
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')

export default function Results({ onOpenPlayer }) {
  const { data, error, loading } = useLampRecord(60)
  const T = data?.total
  const [open, setOpen] = useState(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader eyebrow="LAMP · THE RECORD" title="Every graded night"
        note="The question the board is measured on: of the skaters who actually scored, how many were called, and how many were on the board, before puck drop. Base rate to beat is about 15% of dressed skaters scoring. Regular season and playoffs only; preseason nights are graded but kept out of this number. Nothing here is recomputed later."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={T ? [
          { value: T.scorers, label: 'SCORERS', tone: C.text2 },
          { value: pct(T.scorersCalled, T.scorers), label: 'CALLED', tone: C.ice },
          { value: pct(T.scorersCalled + T.scorersOnBoard, T.scorers), label: 'ON THE BOARD', tone: C.text2 },
          { value: pct(T.calledHits, T.calledN), label: 'CALLED HIT', tone: C.lamp },
        ] : null} />
      <DelayedBanner error={error} what="the record" />
      {loading && !data ? <Loading what="the record" /> : null}
      {data && !data.dbReady && <EmptyState title="NO RECORD YET" note={data.note === 'record table not created yet' ? 'The record table has not been created on the database yet. The first night locks and grades once it exists.' : 'The record is not connected on this deployment.'} />}
      {/* 2026-09-26 (Batch 5): the old note ("the first board locks … after
          this ships") went stale the night preseason boards started locking
          and grading. This number is regular season + playoffs only; the
          preseason nights are public on /called. */}
      {data?.dbReady && data.nights.length === 0 && (
        <EmptyState title="NO REGULAR-SEASON NIGHT GRADED YET" note="Preseason boards lock and grade too, but camp lineups are kept out of this number. The first regular-season night fills this in once its final is graded.">
          <div style={{ marginTop: 12 }}><a href="/called?sport=nhl" style={{ color: C.ice, fontSize: 11, fontWeight: 800 }}>See the preseason nights on CALLED IT →</a></div>
        </EmptyState>
      )}
      {T && (
        <section aria-label="Hit rate by rank">
          <Kicker>HIT RATE BY RANK · {data.days} DAYS</Kicker>
          <table style={tbl}>
            <thead><tr style={thr}><th style={th}>RANK IN GAME</th><th style={{ ...th, textAlign: 'right' }}>SKATERS</th><th style={{ ...th, textAlign: 'right' }}>SCORED</th><th style={{ ...th, textAlign: 'right' }}>RATE</th></tr></thead>
            <tbody>
              {[['1–3 (called)', T.bands.top3], ['4–8', T.bands.r4to8], ['9–15', T.bands.r9to15], ['16+', T.bands.r16plus], ['all dressed', { n: T.dressed, hits: T.scorers }]].map(([label, b]) => (
                <tr key={label} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{label}</td><td style={num}>{b.n}</td><td style={num}>{b.hits}</td>
                  <td style={{ ...num, fontWeight: 900, color: label.startsWith('1') ? C.lamp : C.text }}>{pct(b.hits, b.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {data?.nights?.length > 0 && (
        <section aria-label="Night by night">
          <Kicker>NIGHT BY NIGHT</Kicker>
          <table style={tbl}>
            <thead><tr style={thr}><th style={th}>NIGHT</th><th style={{ ...th, textAlign: 'right' }}>GM</th><th style={{ ...th, textAlign: 'right' }}>SCORERS</th><th style={{ ...th, textAlign: 'right' }}>CALLED</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>ON BOARD</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>OFF</th><th style={{ ...th, textAlign: 'right' }}>CALLED HIT</th></tr></thead>
            <tbody>
              {data.nights.map((n) => (
                <FragmentRow key={n.date}>
                  <tr onClick={() => setOpen(open === n.date ? null : n.date)} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
                    <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 11 }}>{fmtDay(n.date)} <span style={{ color: C.text3 }}>{open === n.date ? '▴' : '▾'}</span></td>
                    <td style={num}>{n.games}</td><td style={num}>{n.scorers}</td>
                    <td style={{ ...num, color: C.ice, fontWeight: 800 }}>{n.scorersCalled} <span style={{ color: C.text3, fontWeight: 600 }}>({pct(n.scorersCalled, n.scorers)})</span></td>
                    <td className="sm-hide" style={num}>{n.scorersOnBoard}</td><td className="sm-hide" style={num}>{n.scorersOff}</td>
                    <td style={{ ...num, color: C.lamp, fontWeight: 900 }}>{n.calledHits}/{n.calledN}</td>
                  </tr>
                  {open === n.date && (
                    <tr><td colSpan={7} style={{ padding: '4px 8px 10px', background: C.bg2 }}>
                      <div style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', margin: '4px 0 6px' }}>THE CALLS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '3px 14px' }}>
                        {n.called.map((c, i) => (
                          <div key={`${c.name}-${i}`} style={{ fontSize: 11.5, color: c.hit ? C.text : C.text3 }}>
                            {c.hit && <LampDot size={6} />}<b style={{ color: c.hit ? C.lamp : C.text2, fontFamily: NUM_FONT, marginRight: 6 }}>#{c.rank}</b>
                            <button type="button" onClick={() => onOpenPlayer?.(c.playerId)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>{c.name}</button>
                            <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}> {c.team} v {c.opp} · {c.score}{c.hit ? ` · ${c.goals} G` : ''}</span>
                          </div>
                        ))}
                      </div>
                      {n.offScorers?.length > 0 && <div style={{ marginTop: 8, color: C.text3, fontSize: 11 }}>Scored, not called: {n.offScorers.map((s) => `${s.name} (${s.status === 'board' ? `#${s.rank}` : 'not on the board'})`).join(', ')}</div>}
                    </td></tr>
                  )}
                </FragmentRow>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <SourceLine>Source: lamp_goal_log, graded rows only (dressed / goals / hit from gamecenter/{'{id}'}/boxscore after the final). Void men (not dressed) are out of every denominator.</SourceLine>
    </div>
  )
}
function FragmentRow({ children }) { return <>{children}</> }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const thr = { color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }
