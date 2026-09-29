'use client'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { STATE, alpha } from '../../lib/scales'
import Sparkline, { GameStrip } from '../Sparkline'

// MOONSHOT'S RUN PIECES, SHARED (2026-09-29, queue batch 9/11). Lifted out of
// components/tabs/Runs.js unchanged so TUDDY's Streaks is drawn by the same
// card and row rather than a look-alike: the leader card (the run, his own
// best, the strip, L5-L30, the odds line) and the board row (run arrow, name,
// dense strip, L15, tap to open the labelled strip).
//
// `r` is lib/runs.js readRun()'s shape: run (signed: + cleared, - missed),
// strip [{date, opp, home, v, on}], l5/l10/l15/l30 {n, ok, pct}, n, and
// bestHit/prevBestHit/bestMiss/prevBestMiss/atBest when known.

// UNIVERSAL FILTER RECIPE (2026-08-23): tint through the theme accent via
// STATE/alpha, not a baked ember rgba — see components/Filters.js.
export const runChip = (on) => {
  const st = on ? STATE.on() : STATE.off()
  return {
    padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: TYPE.label,
    fontWeight: st.fontWeight, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
    border: `1px solid ${st.borderColor}`,
    background: on ? alpha(st.color, 0.14) : 'transparent',
    color: st.color,
  }
}
const chip = runChip

export const runPct = (w) => (w ? `${w.pct.toFixed(0)}%` : '—')
const pct = runPct

/**
 * How ordinary is this run?
 *
 * If he clears the bar at rate p, an active run of k is roughly a p^k event on
 * any given stretch — so a 5-game run for a 60% hitter happens about one
 * stretch in 13, which is to say most weeks. Saying so is the difference
 * between a board that finds signal and one that manufactures it.
 */
export function runOdds(run, base) {
  if (!base || run <= 1) return null
  const p = base.pct / 100
  if (!(p > 0 && p < 1)) return null
  const one = Math.pow(p, run)
  if (one <= 0) return null
  return Math.round(1 / one)
}

/** The same arithmetic as a sentence. Descriptive of his own past rate;
 *  nothing here says a run continues. */
export function RunOddsLine({ run, base, size = TYPE.body }) {
  const k = Math.abs(run)
  const odds = runOdds(k, base)
  if (!odds) return null
  return (
    <div style={{ fontSize: size, color: C.text3, marginTop: 3, lineHeight: 1.45 }}>
      At his own {pct(base)} rate, {k} in a row comes up about once every{' '}
      <b style={{ color: C.text2 }}>{odds}</b> stretches
      {odds <= 20 ? ' — which is to say regularly.' : ' — an unusual stretch at that rate, and still only a stretch.'}
    </div>
  )
}

/** A featured run: kicker line, name, the run and his own best, the strip,
 *  L5-L30, the odds line, then whatever the sport adds (children). */
export function RunLeaderCard({ r, name, label, kicker, onClick, children }) {
  const hot = r.run > 0
  return (
    <div onClick={onClick} className="tap-row"
      style={{
        border: `1px solid ${hot ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.28)'}`,
        borderRadius: 12, padding: '9px 12px', cursor: 'pointer',
        background: hot ? 'rgba(74,222,128,.05)' : 'rgba(248,113,113,.04)',
      }}>
      <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        {kicker}
      </div>
      <div style={{ fontSize: TYPE.name, fontWeight: 800, marginTop: 1 }}>{name}</div>
      <div style={{
        fontFamily: NUM_FONT, fontSize: TYPE.display, fontWeight: 900, marginTop: 2,
        color: hot ? C.green : C.red,
        display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap',
      }}>
        <span>{Math.abs(r.run)} game {hot ? 'run' : 'drought'}</span>
        {/* ── HOW BIG IS THIS FOR HIM (2026-08-31) ─────────────
            "13 game run" is a number, not a statement. Thirteen is
            enormous for a hitter whose best in the window is six
            and unremarkable for one who has done fourteen twice,
            and the board could not tell those apart — so every long
            run read the same. His own best over the same games is
            the cheapest honest context there is: it comes off rows
            already in hand, needs no request, and turns a length
            into a rank. */}
        {(() => {
          // "His longest" alone is a weak fact on a board sorted
          // by run length — a 13 in a 30-game window is almost
          // always his longest, so the badge fired on all six
          // leaders and said nothing. Caught in render. What
          // varies is the longest run he has that ISN'T this one.
          const best = hot ? r.bestHit : r.bestMiss
          const prev = hot ? r.prevBestHit : r.prevBestMiss
          const word = hot ? 'run' : 'drought'
          if (!best) return null
          if (r.atBest) {
            return (
              <span style={{ fontSize: TYPE.micro, fontWeight: 700, color: C.text3, fontFamily: NUM_FONT }}
                title={prev
                  ? `Nothing else in these ${r.n} games comes close: his next-longest ${word} is ${prev}. Strict consecutive, both measured the same way.`
                  : `The only ${word} of any length he has in these ${r.n} games.`}>
                {prev ? <>past a previous <b style={{ color: hot ? C.green : C.red }}>{prev}</b></> : 'his first of any length'}
              </span>
            )
          }
          return (
            <span style={{ fontSize: TYPE.micro, fontWeight: 700, color: C.text3, fontFamily: NUM_FONT }}
              title={`He has been on a longer ${word} inside these ${r.n} games — ${best}. Strict consecutive, the same rule this one is measured against, so the two numbers compare.`}>
              he has had <b style={{ color: C.text2 }}>{best}</b>
            </span>
          )
        })()}
      </div>
      <div style={{ margin: '5px 0 4px' }}
        title={`His last ${Math.min(r.strip.length, 30)} games for ${label} — oldest on the left, tonight would come next on the right. Bright green is the active run.`}>
        <Sparkline strip={r.strip} run={r.run} />
      </div>
      <div style={{ display: 'flex', gap: 10, fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3 }}>
        <span title={r.l5 ? `${r.l5.ok} of ${r.l5.n} games` : ''}>L5 <b style={{ color: C.text2 }}>{pct(r.l5)}</b></span>
        <span title={r.l10 ? `${r.l10.ok} of ${r.l10.n} games` : ''}>L10 <b style={{ color: C.text2 }}>{pct(r.l10)}</b></span>
        <span title={r.l15 ? `${r.l15.ok} of ${r.l15.n} games` : ''}>L15 <b style={{ color: C.text2 }}>{pct(r.l15)}</b></span>
        <span title={r.l30 ? `${r.l30.ok} of ${r.l30.n} games` : ''}>L30 <b style={{ color: C.text2 }}>{pct(r.l30)}</b></span>
      </div>
      {/* The one honest line on this page, at 9.5 rather than 9 —
          it is the reason to trust or discount the big green
          number directly above it, so it should not read as fine
          print. */}
      <RunOddsLine run={r.run} base={r.l30 || r.l15} size={TYPE.body} />
      {children}
    </div>
  )
}

/** One row of the full board; tap for the labelled strip. `onlyWord` names a
 *  split ("day", "home") when the board is restricted to one. */
export function RunBoardRow({ r, name, team, label, open, onToggle, onOpenCard, onlyWord = '' }) {
  const verb = r.run > 0 ? 'cleared' : 'missed'
  return (
    <div style={{
      border: `1px solid ${open ? `${C.orange}55` : C.border}`, borderRadius: 9,
      background: open ? 'rgba(249,115,22,.05)' : C.bg2,
      padding: '6px 9px', gridColumn: open ? '1 / -1' : 'auto',
    }}>
      <div onClick={onToggle} className="tap-row"
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}>
        <span
          title={`${name} ${verb} ${label} in each of his last ${Math.abs(r.run)} ${onlyWord ? `${onlyWord} ` : ''}games. Tap for the log.`}
          style={{
            fontFamily: NUM_FONT, fontSize: TYPE.body, fontWeight: 900, minWidth: 26, textAlign: 'right',
            color: r.run > 0 ? C.green : r.run < 0 ? C.red : C.text3,
          }}>{r.run > 0 ? `${r.run}▲` : `${-r.run}▼`}</span>
        <span style={{ fontSize: TYPE.name, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
          {name}
          <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3, marginLeft: 5 }}>{team}</span>
        </span>
        <Sparkline strip={r.strip} run={r.run} size={6} max={15} />
        <span title={r.l15 ? `${r.l15.ok} of his last ${r.l15.n} games cleared ${label}` : ''}
          style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3, minWidth: 30, textAlign: 'right' }}>
          {pct(r.l15)}
        </span>
      </div>
      {open && (
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 7, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3 }}>
            {[['L5', r.l5], ['L10', r.l10], ['L15', r.l15], ['L30', r.l30]].map(([l, w]) => (
              <span key={l} title={w ? `${w.ok} of ${w.n}` : ''}>
                {l} <b style={{ color: C.text, fontSize: TYPE.body }}>{pct(w)}</b>
              </span>
            ))}
            <button onClick={(e) => { e.stopPropagation(); onOpenCard?.() }}
              style={{ ...chip(false), marginLeft: 'auto' }}>open his card →</button>
          </div>
          <GameStrip strip={r.strip} max={15} />
          <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 5 }}>
            {label} · newest on the right · green cleared it
            {onlyWord ? ` · ${onlyWord} only` : ''}
          </div>
          <RunOddsLine run={r.run} base={r.l30 || r.l15} size={9.5} />
        </div>
      )}
    </div>
  )
}
