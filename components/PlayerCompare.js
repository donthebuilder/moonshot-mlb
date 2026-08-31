'use client'
import { useMemo, useState } from 'react'

import useScrollLock from '../lib/useScrollLock'
import { C, NUM_FONT } from '../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  avgEV, maxEV, hardHitRate, barrelRate, launchAngle,
  recent375, recent400, ihrVal, avgVsRHP, avgVsLHP,
} from '../lib/player'
import Explain from './Explain'
import { findPairHistory } from '../lib/pairHistory'

// ⚖ PLAYER COMPARE (2026-08-21, Phase 4).
//
// Nothing like this existed anywhere in the codebase before this — confirmed
// by a full recon pass: the "Pair" family (PairBuilder/PairMe/PairTray/
// Pairs/PairHistory) is a same-game-parlay correlation tool (do these two
// hitters homering on the SAME NIGHT track together), not a stat-by-stat
// comparison, and Watchlist's DenseTable is a ranked list of however many
// saved hitters, not a synchronized two-player view. PlayerModal's own
// Navigator (‹ › 🔍) only ever holds one player at a time — its own comment
// names "compare two hitters" as the exact pain point it did NOT solve.
//
// SCOPE, DELIBERATELY MINIMAL: every stat below reads straight off the
// slate row already sitting in memory (peers/anchor) — the same fields
// RankedBoard's scoreFor() and BoardFilters' BAND_STATS already read
// directly off unmerged player rows, and the same set PlayerModal's own
// "The numbers" grid uses for its non-async rows. No new fetch, no new
// field, nothing that isn't already proven safe to read this way elsewhere.
// Left OUT on purpose, to keep this a real v1 rather than a rebuild of
// PlayerModal: the three self-fetching context rows (venue/wall/opp
// defense), the reconstructed whiff/swstr rate, and anything living only in
// the per-player detail file (spray, pitch mix matchup, batted-ball log).
//
// WINNER HIGHLIGHT is the one new use of colour here — informational, not
// decorative, same rule as everywhere else on the site: orange marks
// whichever side is ahead on THAT stat, for the stats that have an
// unambiguous higher-is-better direction. Launch angle has a sweet spot
// rather than a "more is better" direction (12–20° is the homer window),
// so it renders with no winner at all rather than color a number that isn't
// actually better for being bigger.

function CompareStat({ label, term, a, b, fmt, higherBetter = true }) {
  const av = typeof a === 'number' && !Number.isNaN(a) ? a : null
  const bv = typeof b === 'number' && !Number.isNaN(b) ? b : null
  let win = null
  if (higherBetter && av != null && bv != null && av !== bv) win = av > bv ? 'a' : 'b'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 108px 1fr', alignItems: 'center',
      gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{
        fontSize: 13, fontFamily: NUM_FONT, fontWeight: 700, textAlign: 'right',
        color: win === 'a' ? C.orange : C.text,
      }}>{fmt(a)}</span>
      <span style={{ fontSize: 9.5, color: C.text3, textAlign: 'center', whiteSpace: 'nowrap' }}>
        <Explain label={label} term={term} />
      </span>
      <span style={{
        fontSize: 13, fontFamily: NUM_FONT, fontWeight: 700, textAlign: 'left',
        color: win === 'b' ? C.orange : C.text,
      }}>{fmt(b)}</span>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: C.text3, fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: .5, padding: '12px 0 4px', textAlign: 'center',
    }}>{children}</div>
  )
}

const num = (v) => (v == null || Number.isNaN(v) ? '—' : v)
const oneDp = (v) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(1))
const pctFmt = (v) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(1)}%`)

function Head({ p }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {nameOf(p)}
      </div>
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
        {teamOf(p)} vs {oppOf(p)}
      </div>
    </div>
  )
}

// The picker step — same search-by-name pattern as PlayerModal's own
// Navigator (filter peers, cap 8), so choosing an opponent for the
// comparison feels like the same gesture as jumping to any other hitter.
function Picker({ peers, exclude, onPick }) {
  const [q, setQ] = useState('')
  const hits = q.trim().length < 1 ? [] : peers.filter((x) => {
    const id = String(x?.player_id ?? x?.id)
    if (id === String(exclude?.player_id ?? exclude?.id)) return false
    return nameOf(x).toLowerCase().includes(q.trim().toLowerCase())
  }).slice(0, 8)
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>
        Compare <b style={{ color: C.text }}>{nameOf(exclude)}</b> against —
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search a hitter on tonight's slate…"
        style={{
          width: '100%', background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 8,
          padding: '8px 11px', fontSize: 12, color: C.text, outline: 'none', fontFamily: NUM_FONT,
        }} />
      <div style={{ marginTop: 6 }}>
        {hits.map((x) => (
          <button key={String(x?.player_id ?? x?.id)} onClick={() => onPick(x)}
            className="tap-row"
            style={{
              display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', color: C.text2, fontSize: 12,
              padding: '7px 8px', cursor: 'pointer', borderRadius: 6,
            }}>
            <span>{nameOf(x)}</span>
            <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{teamOf(x)}</span>
          </button>
        ))}
        {q.trim().length >= 1 && !hits.length && (
          <div style={{ fontSize: 10.5, color: C.text3, padding: '8px 6px 2px' }}>Nobody on tonight&apos;s slate by that name.</div>
        )}
      </div>
    </div>
  )
}

export default function PlayerCompare({ anchor, peers = [], pairHistorySummary = null, onClose, onOpenPairHistory = null }) {
  // Mounted only while open, and it opens ON TOP of a player card -- which is
  // the case the reference count in the hook exists for.
  useScrollLock(true)
  const [other, setOther] = useState(null)
  const hist = other ? findPairHistory(pairHistorySummary, anchor, other) : null
  const together = n(hist?.repeat_count, 0)

  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-box"
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text2 }}>⚖ Compare</div>
            <button onClick={onClose} aria-label="Close" style={{
              background: 'transparent', border: 'none', color: C.text3, fontSize: 20,
              cursor: 'pointer', lineHeight: 1, padding: '4px 10px', margin: '-4px -10px 0 0',
            }}>✕</button>
          </div>

          {!other ? (
            <Picker peers={peers} exclude={anchor} onPick={setOther} />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 108px 1fr', alignItems: 'center', marginBottom: 4 }}>
                <Head p={anchor} />
                <span style={{ textAlign: 'center', fontSize: 9, color: C.text3 }}>vs</span>
                <Head p={other} />
              </div>
              <button onClick={() => setOther(null)} style={{
                display: 'block', margin: '4px auto 0', background: 'transparent', border: 'none',
                color: C.text3, fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline',
              }}>change opponent</button>

              <SectionLabel>Model Scores</SectionLabel>
              <CompareStat label="HR Score" a={hrScore(anchor)} b={hrScore(other)} fmt={oneDp} />
              <CompareStat label="HRR Score" a={prodScore(anchor)} b={prodScore(other)} fmt={oneDp} />
              <CompareStat label="Hit Score" a={hitScore(anchor)} b={hitScore(other)} fmt={oneDp} />
              <CompareStat label="TB Score" a={tbScore(anchor)} b={tbScore(other)} fmt={oneDp} />
              <CompareStat label="Pitch Mix" a={pitchMixScore(anchor)} b={pitchMixScore(other)} fmt={oneDp} />

              <SectionLabel>Batted Ball</SectionLabel>
              <CompareStat label="Avg EV" a={avgEV(anchor)} b={avgEV(other)} fmt={(v) => (v ? `${v.toFixed(1)} mph` : '—')} />
              <CompareStat label="Max EV" a={maxEV(anchor)} b={maxEV(other)} fmt={(v) => (v ? `${v.toFixed(1)} mph` : '—')} />
              <CompareStat label="Barrel %" a={barrelRate(anchor)} b={barrelRate(other)} fmt={pctFmt} />
              <CompareStat label="Hard Hit %" a={hardHitRate(anchor)} b={hardHitRate(other)} fmt={pctFmt} />
              <CompareStat label="Launch Angle" a={launchAngle(anchor)} b={launchAngle(other)}
                fmt={(v) => (v ? `${v.toFixed(1)}°` : '—')} higherBetter={false} />

              <SectionLabel>Recent Distance</SectionLabel>
              <CompareStat label="375+ count" a={recent375(anchor)} b={recent375(other)} fmt={num} />
              <CompareStat label="400+ count" a={recent400(anchor)} b={recent400(other)} fmt={num} />
              <CompareStat label="Ideal HR %" a={ihrVal(anchor)} b={ihrVal(other)} fmt={pctFmt} />

              <SectionLabel>Season</SectionLabel>
              <CompareStat label="AVG" a={n(anchor?.season_avg, null)} b={n(other?.season_avg, null)}
                fmt={(v) => (v == null ? '—' : v.toFixed(3))} />
              <CompareStat label="HR" a={n(anchor?.season_hr, null)} b={n(other?.season_hr, null)} fmt={num} />
              <CompareStat label="PA" a={n(anchor?.season_pa, null)} b={n(other?.season_pa, null)} fmt={num} higherBetter={false} />
              <CompareStat label="L5 HR" a={n(anchor?.last5_hr, 0)} b={n(other?.last5_hr, 0)} fmt={num} />
              {(avgVsRHP(anchor) > 0 || avgVsRHP(other) > 0) && (
                <CompareStat label="vs RHP" a={avgVsRHP(anchor) || null} b={avgVsRHP(other) || null}
                  fmt={(v) => (v == null ? '—' : v.toFixed(3))} />
              )}
              {(avgVsLHP(anchor) > 0 || avgVsLHP(other) > 0) && (
                <CompareStat label="vs LHP" a={avgVsLHP(anchor) || null} b={avgVsLHP(other) || null}
                  fmt={(v) => (v == null ? '—' : v.toFixed(3))} />
              )}

              {/* 🔗 PAIR HISTORY (2026-08-21, Phase 5). This is the one gap
                  recon found: pair_history_summary was never reachable from
                  ANY two-hitter view, including this one, which lands on
                  exactly "hitter A vs hitter B" already. Read-only via the
                  new shared findPairHistory() helper — no new fetch, same
                  already-loaded payload the Games page's Pair Tray reads.
                  DELIBERATELY NOT a lift/edge claim: the archive (see
                  lib/pairEvidence.js) found same-day co-HR is 1.00 to within
                  noise — two independent coin flips — so this states the
                  raw count as history, never as a forecast. */}
              {pairHistorySummary && (
                <>
                  <SectionLabel>Pair History</SectionLabel>
                  <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, padding: '2px 4px 4px', textAlign: 'center' }}>
                    {together > 0 ? (
                      <>Both homered the same day <b style={{ color: C.text }}>{together}×</b> this season
                        {hist?.last_hit_date ? ` (last ${String(hist.last_hit_date).slice(5)})` : ''}. History, not
                        a forecast — the archive found same-day co-HR runs at about the same rate as two
                        unrelated hitters, so this counts what happened rather than predicting it happens again.</>
                    ) : (
                      <>No recorded co-HR history for these two — true of most pairs, and not itself a signal
                        either way.</>
                    )}
                  </div>
                  {onOpenPairHistory && (
                    <button onClick={onOpenPairHistory} style={{
                      display: 'block', margin: '6px auto 0', background: 'transparent',
                      border: `1px dashed ${C.border2}`, borderRadius: 999, padding: '4px 12px',
                      color: C.text2, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    }}>Full pair history →</button>
                  )}
                </>
              )}

              <div style={{ fontSize: 9, color: C.text3, marginTop: 12, lineHeight: 1.5 }}>
                Orange marks whichever side is ahead on a stat — only where more is
                unambiguously better. Launch Angle has a sweet spot (roughly 12–20°
                is the homer window), not a "bigger is better" direction, so neither
                side is marked there. Scores are rankings, not percentages — see
                each label&apos;s ⓘ.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
