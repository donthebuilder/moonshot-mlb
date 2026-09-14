'use client'
// 💥 HOMER EVENT CARDS (2026-09-14) — MOONSHOT batch 2, Live/Scoreboard.
//
// Donovan, approved off the brand audit: "Live layer rendered as a
// spreadsheet ... a homer is an event ... homer = event card: name, lane
// chip (PICKS/BOARD/RATED), distance + EV big, one line of why it was on
// the board." Plus: "the bot mark should show up on a called homer" — the
// one place the audit found the bot had no symbol at all, only a row colour.
//
// This does not replace the 12-column research table — that's still one tap
// away in the Fold Scoreboard.js wraps around it now. This is what a reader
// actually looks at between innings: who went deep, was the model already
// on him, and how hard did he hit it.
//
// Distance / EV / launch angle need no bot work — `longest_ft`, `max_ev_mph`
// and `launch_angle` already ride on every hr_capture_report entry since the
// 08-11 backfill (get_all_homers_from_game in live_results_tracker.py); this
// component only needed Scoreboard.js to carry those three fields onto the
// goneYard rows, which it now does.
import { C, NUM_FONT } from '../lib/theme'
import { hrShapeMeta } from '../lib/hrShape'

const LANE_COLOR = {
  picks: C.orange,
  board: C.green,
  rated: C.text2,
  miss: C.red,
}

const whyLine = (r) => {
  if (r.laneKey === 'miss') return 'Off tonight’s slate — the model never rated him.'
  return r.roleTitle || r.role || '—'
}

export default function HomerEventCards({ rows = [], onPlayerClick }) {
  if (!rows.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
      {rows.map((r) => {
        const laneColor = LANE_COLOR[r.laneKey] || C.text3
        const called = r.laneKey === 'picks'
        const tracked = r.longestFt != null || r.maxEv != null
        const shape = tracked
          ? hrShapeMeta({ total_distance: r.longestFt, launch_speed: r.maxEv, launch_angle: r.launchAngle })
          : null
        return (
          <button
            key={r._key}
            onClick={() => r._raw && onPlayerClick?.(r._raw)}
            title={whyLine(r)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left',
              width: 178, padding: '9px 11px', borderRadius: 10,
              background: C.bg2, cursor: r._raw ? 'pointer' : 'default',
              border: `1px solid ${called ? 'rgba(249,115,22,.5)' : C.border}`,
            }}
          >
            {/* kicker: lane chip + bot mark on a CALLED homer + board rank */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <b style={{ fontFamily: NUM_FONT, fontSize: 9, letterSpacing: '.06em', color: laneColor }}>
                {r.lane}
              </b>
              {called && (
                <span title="CALLED — the bot's TOP/HR pick before the game started" style={{ fontSize: 10, lineHeight: 1 }}>
                  🤖
                </span>
              )}
              {r.rank != null && (
                <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginLeft: 'auto' }}>#{r.rank}</span>
              )}
            </div>

            {/* name */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.name}</span>
              {r.team && <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}>{r.team}</span>}
              {r.hr > 1 && <span style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, color: C.orange, marginLeft: 'auto' }}>×{r.hr}</span>}
            </div>

            {/* the hero number: distance + EV, big */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 19, fontWeight: 900, color: tracked ? C.text : C.text3 }}>
                {r.longestFt != null ? `${Math.round(r.longestFt)}ft` : '—'}
              </span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3 }}>
                {r.maxEv != null ? `${Number(r.maxEv).toFixed(1)} mph` : 'not tracked'}
              </span>
            </div>

            {shape && (
              <span title={shape.blurb} style={{
                alignSelf: 'flex-start', fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900, letterSpacing: '.04em',
                color: shape.color, border: `1px solid ${shape.color}55`, borderRadius: 4, padding: '1px 4px',
              }}>{shape.short}</span>
            )}

            {/* one line: why it was (or wasn't) on the board */}
            <div style={{
              fontSize: 9.5, color: C.text3, lineHeight: 1.3, marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {whyLine(r)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
