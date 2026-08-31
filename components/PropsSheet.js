'use client'
import { useEffect, useMemo, useState } from 'react'

import useScrollLock from '../lib/useScrollLock'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, mlbId, txt } from '../lib/player'
import { alpha, verdictInk, verdictWash } from '../lib/scales'
import { thresholdRates, starterHands, streakRuns, MARKETS } from '../lib/gamelogs'
import StreakRibbon, { StreakLine } from './StreakRibbon'
import { quoteFor, gridQuote, fmtOdds, fairOdds, impliedPct } from '../lib/odds'
import { primaryRole, verdictFor, roleColor, sentenceFor, chipsFor } from '../lib/verdict'
import VerdictHero, { PeriodTiles } from './VerdictHero'
import { FilterPill } from './Filters'

// ══ THE PROPS SHEET — ONE PLAYER, WHOLE SCREEN, PHONE ONLY ══════════════════
//
// Donovan, 2026-08-23, after the Props page redraw:
//
//   "i like how the props is but possible have the open up to the props grid
//    as a full page that is clickable — thats what i've been trying to have
//    done, a full props grid page for mobile that is simple, have the same
//    capabilities as it does now with different props and splits just
//    dedicated for mobile use and simple easy."
//
// Tapping a Props card used to open the desktop player modal: nine tabs, a
// zone map, a spray chart, four tables and a compare tool, squeezed into a
// 430px column. Everything works there and almost none of it is what you
// opened the card to find out, which is a shorter question — *how often does
// he actually do this, and is the book paying enough for it.*
//
// So this is that question, full screen, with nothing else on it:
//
//   1. THE HERO — the same block the card wore, so tapping it feels like the
//      card grew rather than like a different page loaded.
//   2. ONE MARKET AT A TIME. Eight markets on a rail; pick one and the whole
//      screen is about that prop. The desktop grid shows all eight × four
//      windows at once, which is the right answer on a monitor and forty
//      numbers on a phone.
//   3. THE RATE, BIG. How often he clears this bar, over four windows, from
//      his real game log — not a model score. A score is not a probability
//      and the two must never be printed as though they were.
//   4. THE SPLITS THAT SPLIT — home/away and vs LHP/RHP, on THIS market,
//      computed from the same log (the arm's hand comes from the schedule's
//      probable pitcher, the way lib/gamelogs already does it for the grid).
//      Any split under 5 games says its own sample rather than pretending.
//   5. THE PRICE, WHEN IT IS THE SAME BET. The book's number only appears
//      when it is quoting this exact bar, with his own break-even beside it.
//   6. THE LAST TEN, as ten marks. Streaks are the one pattern a phone can
//      show honestly in one line.
//
// FULL RESEARCH IS ONE TAP AWAY, not gone: the button at the top opens the
// same player modal this replaces, for the zone map, the spray and the rest.

const WINDOWS = [['L5', 'L5'], ['L10', 'L10'], ['L20', 'L20'], ['Szn', 'Season']]

// The bar each market's label actually names. Every one is 1+ except total
// bases, which is 2+ — and gridQuote is asked for the price on THAT number, so
// a 2+ TB row can never wear a 1+ TB price.
const BAR = { hit: 1, tb2: 2, hr: 1, hrr: 1, run: 1, rbi: 1, bb: 1, k1: 1 }

const pctOf = (row) => (row && row.n ? (100 * row.ok) / row.n : null)
const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(0)}%`)

// Warm = he clears it often, cool = he does not. The site-wide verdict pair,
// by intensity — never a green/amber/red ladder, which is four hues saying
// one thing.
const rateInk = (pct) => (pct == null ? C.text3 : pct >= 40 ? verdictInk(true).color : pct >= 25 ? C.text2 : verdictInk(false).color)
const rateWash = (pct) => (pct == null ? 'transparent' : pct >= 60 ? verdictWash(true, 0.16) : pct >= 40 ? verdictWash(true, 0.09) : pct >= 25 ? 'transparent' : verdictWash(false, 0.08))

function Tile({ label, value, sub, pct, wide }) {
  return (
    <span style={{
      flex: wide ? '1 1 100%' : 1, minWidth: 0, textAlign: 'center', padding: '8px 4px',
      borderRadius: 12, border: `1px solid ${C.border}`, background: rateWash(pct) === 'transparent' ? C.glass : rateWash(pct),
    }}>
      <span style={{
        display: 'block', fontSize: 8, fontWeight: 800, letterSpacing: '.1em',
        color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        display: 'block', fontSize: 16, fontWeight: 900, fontFamily: NUM_FONT,
        color: pct == null ? C.text3 : rateInk(pct), lineHeight: 1.15,
      }}>{value}</span>
      {sub && (
        <span style={{ display: 'block', fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>{sub}</span>
      )}
    </span>
  )
}

// ── THE BAR (2026-08-23) ────────────────────────────────────────────────────
// Donovan: "i want to see the actuall grid like visually full bars if possoible
// for the props grid."
//
// A rate in a box is a number you have to read and then rank in your head. A
// bar is the ranking, already done — which is the whole reason this page exists
// on a phone. Same lesson the arm tiles taught this morning: prose loses to
// tiles for a comparison, and tiles lose to bars.
//
// The track is always the full width, so 20% and 70% are read against the SAME
// zero and the SAME hundred. A bar that scales its own track — "relative to the
// best one here" — flatters a bad row into looking like a good one, which on a
// props page is the difference between a bet and a mistake.
function Bar({ label, pct, sub, n = null, thin = false, active, onClick }) {
  const ink = thin ? C.text2 : rateInk(pct)
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0,
        padding: '6px 8px', borderRadius: 10, textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        border: `1px solid ${active ? alpha(C.orange, 0.55) : 'transparent'}`,
        background: active ? alpha(C.orange, 0.08) : 'transparent',
      }}
    >
      <span style={{
        flexShrink: 0, width: 58, fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT,
        color: active ? C.orange : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
      <span style={{
        flex: 1, minWidth: 0, height: 12, borderRadius: 999, overflow: 'hidden',
        background: C.glass, border: `1px solid ${C.border}`, position: 'relative',
      }}>
        {/* the 50% mark — a bar with no reference is a shape, not a reading */}
        <span style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
          background: C.border2,
        }} />
        <span style={{
          display: 'block', height: '100%', width: `${w}%`,
          background: pct == null ? 'transparent' : alpha(ink, thin ? 0.28 : 0.55),
          borderRight: w > 0 ? `2px solid ${ink}` : 'none',
        }} />
      </span>
      <span style={{
        flexShrink: 0, width: 34, textAlign: 'right', fontSize: 12, fontWeight: 900,
        fontFamily: NUM_FONT, color: pct == null ? C.text3 : ink,
      }}>{pct == null ? '—' : `${pct.toFixed(0)}%`}</span>
      <span style={{
        flexShrink: 0, width: 42, textAlign: 'right', fontSize: 8.5,
        fontFamily: NUM_FONT, color: C.text3, whiteSpace: 'nowrap',
      }}>{sub || (n != null ? `${n}g` : '')}</span>
    </button>
  )
}

function Section({ title, note, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase',
          color: C.text3, whiteSpace: 'nowrap',
        }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: C.border, minWidth: 8 }} />
        {note && <span style={{ fontSize: 8.5, color: C.text3, whiteSpace: 'nowrap' }}>{note}</span>}
      </div>
      {children}
    </div>
  )
}

export default function PropsSheet({ player, odds = null, onClose, onFullResearch, onWatch, watched }) {
  useScrollLock(Boolean(player))
  const [market, setMarket] = useState(null)
  const [win, setWin] = useState('Szn')
  const [data, setData] = useState(undefined)   // undefined = loading, null = none
  const [hands, setHands] = useState(null)

  const pid = mlbId(player)

  // The body must not scroll behind a full-screen sheet — on iOS that is the
  // difference between closing the sheet and losing your place on the board.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    let alive = true
    setData(undefined)
    setHands(null)
    if (!pid) { setData(null); return undefined }
    thresholdRates(pid).then((d) => { if (alive) setData(d || null) })
    // The hand of every arm he has faced is a second, slower fetch chain, so
    // the sheet never waits on it — the platoon split fills itself in.
    starterHands(pid).then((h) => { if (alive) setHands(h || null) })
    return () => { alive = false }
  }, [pid])

  const role = primaryRole(player) || 'NONE'
  const v = verdictFor(role)
  const col = roleColor(role)

  // Default the rail to the market his badge is actually about, so the sheet
  // opens on the bet the card was recommending rather than on 1+ Hit for
  // everybody.
  const defaultMarket = role === 'HR' || role === 'TOP' || role === 'WATCH' ? 'hr'
    : role === 'HIT' ? 'hit' : role === 'HRR' ? 'hrr' : role === 'CONTACT' ? 'tb2' : 'hit'
  const mk = market || defaultMarket
  const meta = MARKETS.find((m) => m.key === mk) || MARKETS[0]

  const row = data?.markets?.[mk] || null
  const seasonPct = pctOf(row?.Szn)

  // The splits, on THIS market, out of the same log the rates come from.
  const splits = useMemo(() => {
    const games = data?.logAll || []
    if (!games.length) return null
    const tally = (list) => ({ ok: list.filter(meta.test).length, n: list.length })
    const home = tally(games.filter((g) => g.home))
    const away = tally(games.filter((g) => !g.home))
    let vsL = null, vsR = null
    if (hands) {
      vsL = tally(games.filter((g) => hands[g.gamePk] === 'L'))
      vsR = tally(games.filter((g) => hands[g.gamePk] === 'R'))
    }
    return { home, away, vsL, vsR }
  }, [data, hands, meta])

  const last10 = useMemo(() => (data?.logAll || []).slice(0, 10), [data])

  // Tonight's matchup columns. Read off the slate row, not the game log — and
  // absent on every slate published before they shipped, which is why every
  // consumer below is guarded rather than defaulted.
  // "missing" means no Statcast pitch data for this arm; the note then reads
  // "not a cold matchup, an unmeasured one" and is worth showing. An absent
  // note is a slate that predates the field and shows nothing.
  const mbNote = String(player?.meatball_fit_status || '') === 'missing'
    ? '' : txt(player?.meatball_fit_note)
  const mbFit = n(player?.meatball_fit_score, null)
  const stealScore = String(player?.steal_risk_status || '') === 'no_runner'
    ? null : n(player?.steal_risk_score, null)

  // ⚡ THE RUN (2026-08-23, Donovan: "adds breask in streaks"). "Last 10" above
  // shows ten marks; this shows the whole season as runs, so the SHAPE is
  // readable — a bat that alternates every other night and a bat that goes on
  // seven-game tears can hold the same 50% and are not the same bet. Computed
  // off the log the sheet already fetched; the market rail retargets it, same
  // as every other section here.
  const streak = useMemo(
    () => streakRuns(data?.logAll || [], meta.test),
    [data, meta],
  )

  // THE GRID, as bars: every market at once in one window. The desktop version
  // is eight markets × four windows on a heat matrix; a phone gets one window
  // at a time and a full-width track, which is the same comparison without the
  // forty numbers.
  const gridRows = useMemo(() => {
    if (!data?.markets) return []
    return MARKETS.map((m) => {
      const w = data.markets[m.key]?.[win]
      return { key: m.key, label: m.label, pct: pctOf(w), n: w?.n || 0, ok: w?.ok || 0 }
    })
  }, [data, win])

  // The book, only when it is quoting this exact bar. A 2+ TB price beside a
  // 1+ HR rate would be scoring a different bet.
  const q = gridQuote(odds, player, mk, BAR[mk] ?? 1)
  const priced = q && q.matches
  const need = priced ? (q.implied ?? impliedPct(q.over)) : null
  const fair = seasonPct != null ? fairOdds(seasonPct) : null
  const edge = priced && need != null && seasonPct != null ? seasonPct - need : null

  const heroPrice = (() => {
    const cat = role === 'WATCH' ? 'HR' : role === 'NONE' ? null : role
    if (!odds || !cat) return null
    const hq = quoteFor(odds, player, cat)
    if (!hq || !hq.matches) return null
    const s = fmtOdds(hq.over)
    return s === '—' ? null : s
  })()

  const arm = txt(player?.pitcher_name).trim()
  const hand = txt(player?.pitcher_throws).trim()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120, background: C.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* the bar you close from — always there, never scrolls away */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px calc(10px)', borderBottom: `1px solid ${C.border}`,
        background: C.bg,
      }}>
        <button onClick={onClose} aria-label="Close" style={{
          background: 'transparent', border: `1px solid ${C.border}`, color: C.text2,
          borderRadius: 9, padding: '4px 11px', fontSize: 14, lineHeight: 1, cursor: 'pointer',
        }}>✕</button>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 900,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{nameOf(player)}</span>
        {onWatch && (
          // The sticky bar you close from is the one thing that's always on
          // screen here, so it's also where the watch control belongs
          // (2026-08-24, Donovan: "click a player to add to watch list,
          // nothing happens"). This sheet is what actually opens on a phone
          // tap — PropsGrid's cards go straight here, not to the player
          // modal — and it had no watch control of its own, only an
          // indirect route through "full research" into that modal.
          <button onClick={() => onWatch(player)} title={watched ? 'Remove from watchlist' : 'Add to watchlist'} style={{
            flexShrink: 0, background: watched ? 'rgba(249,115,22,.14)' : 'transparent',
            border: `1px solid ${watched ? C.orange : C.border2}`,
            color: watched ? C.orange : C.text2, borderRadius: 9, padding: '4px 10px', fontSize: 12.5,
            fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{watched ? '★ Watching' : '☆ Watch'}</button>
        )}
        {onFullResearch && (
          <button onClick={() => onFullResearch(player)} style={{
            flexShrink: 0, background: 'transparent', border: `1px solid ${C.border2}`,
            color: C.text2, borderRadius: 9, padding: '4px 10px', fontSize: 9.5,
            fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>full research →</button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px 12px 28px' }}>
        <VerdictHero
          col={col}
          score={v.score(player)}
          title={nameOf(player)}
          badge={role === 'WATCH' ? '👀 WATCH' : role === 'NONE' ? 'NO BADGE' : role}
          badgeQuiet={role === 'WATCH' || role === 'NONE'}
          meta={`${teamOf(player)} vs ${oppOf(player)}${arm ? ` · ${arm}${hand ? ` (${hand})` : ''}` : ''}`}
          metaRight={heroPrice}
          line={sentenceFor(player, role)}
          chips={chipsFor(player, role)}
          footer={<PeriodTiles tiles={v.tiles(player)} />}
        />

        <Section title="the prop" note="tap one">
          <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MARKETS.map((m) => (
              <FilterPill key={m.key} active={mk === m.key} onClick={() => setMarket(m.key)}>{m.label}</FilterPill>
            ))}
          </div>
        </Section>

        {/* ── TONIGHT — ABOVE THE GAME-LOG GATE, DELIBERATELY ─────────────
            Everything below this point is HIS OWN GAME LOG, fetched live from
            StatsAPI. These two are slate columns and do not depend on it.

            It was written inside the log branch first, and rendering the sheet
            proved that wrong: a hitter with no published log — a September
            call-up, or any night the fetch fails — got "no game log published"
            and lost the two facts that were about tonight rather than about his
            season. The gate belongs around the rates, not around the matchup.

            Both render nothing at all when the fields are absent, which is
            every slate published before they shipped. */}
        {(mbNote || (stealScore != null && stealScore > 0)) && (
          <Section title="tonight" note="the matchup, not his log">
            {mbNote && (
              <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.5, marginBottom: 6 }}>
                <b style={{ color: C.text }}>🍝 The mistake</b>{' '}
                <span style={{ color: C.text3 }}>{mbNote}</span>
                {mbFit != null && mbFit > 0 && (
                  <b style={{
                    marginLeft: 6, fontFamily: NUM_FONT,
                    color: mbFit >= 65 ? verdictInk(true).color
                      : mbFit <= 35 ? verdictInk(false).color : C.text2,
                  }}>{mbFit.toFixed(0)}</b>
                )}
              </div>
            )}
            {stealScore != null && stealScore > 0 && (
              <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.5 }}>
                <b style={{ color: C.text }}>🏃 The run</b>{' '}
                <b style={{
                  fontFamily: NUM_FONT,
                  color: stealScore >= 60 ? verdictInk(true).color
                    : stealScore <= 35 ? verdictInk(false).color : C.text2,
                }}>{stealScore.toFixed(0)}</b>
                <span style={{ color: C.text3 }}> · {txt(player?.steal_risk_note)}</span>
              </div>
            )}
          </Section>
        )}

        {data === undefined ? (
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 16 }}>Reading his game log…</div>
        ) : !data ? (
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 16, lineHeight: 1.6 }}>
            No game log published for him this season yet, so there is no hit rate to show.
            Everything above is tonight&apos;s slate; the full research page has his model numbers.
          </div>
        ) : (
          <>
            <Section title={`${meta.label} — how often`} note={`${data.games} games logged`}>
              {WINDOWS.map(([k, label]) => {
                const w = row?.[k]
                const p = pctOf(w)
                return <Bar key={k} label={label} pct={p} sub={w ? `${w.ok}/${w.n}` : '—'} />
              })}
              {row?.streak ? (
                <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT }}>
                  <b style={{ color: row.streak > 0 ? verdictInk(true).color : verdictInk(false).color }}>
                    {row.streak > 0 ? `hit ${row.streak} straight` : `missed ${Math.abs(row.streak)} straight`}
                  </b>
                  <span style={{ color: C.text3 }}> — his current run on this bar</span>
                </div>
              ) : null}
            </Section>

            <Section title="last 10" note="most recent first">
              <div style={{ display: 'flex', gap: 4 }}>
                {last10.map((g, i) => {
                  const ok = meta.test(g)
                  return (
                    <span key={`${g.iso}-${i}`} title={`${g.date} vs ${g.opp || '—'} · ${g.h}H ${g.tb}TB ${g.hr}HR ${g.r}R ${g.rbi}RBI`}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'center', padding: '5px 2px', borderRadius: 8,
                        border: `1px solid ${ok ? alpha(verdictInk(true).color, 0.45) : C.border}`,
                        background: ok ? verdictWash(true, 0.14) : 'transparent',
                        fontSize: 9, fontFamily: NUM_FONT, fontWeight: 800,
                        color: ok ? verdictInk(true).color : C.text3,
                      }}>{ok ? '✓' : '·'}</span>
                  )
                })}
              </div>
            </Section>

            {streak && (
              <Section title="the run" note="newest on the left · warm cleared, cool missed">
                <StreakLine streak={streak} label={meta.label} />
                <div style={{ marginTop: 8 }}>
                  <StreakRibbon streak={streak} label={meta.label} height={15} max={44} />
                </div>
              </Section>
            )}

            <Section title="splits" note={hands ? 'home/away · arm side' : 'arm side loading…'}>
              {[['Home', splits?.home], ['Away', splits?.away], ['vs LHP', splits?.vsL], ['vs RHP', splits?.vsR]]
                .map(([label, t]) => {
                  // Under five games is not a split, it is a rumour. It prints
                  // its sample and keeps a washed-out bar rather than shading a
                  // 2-for-2 like a pattern.
                  const thin = !t || t.n < 5
                  return <Bar key={label} label={label} pct={t && t.n ? pctOf(t) : null}
                    thin={thin} sub={t && t.n ? `${t.ok}/${t.n}${t.n < 5 ? '·thin' : ''}` : '—'} />
                })}
            </Section>

            <Section title="the price" note={priced ? 'same bar' : 'not quoted'}>
              {priced ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Tile label="Book" value={fmtOdds(q.over)} sub="over" pct={null} />
                  <Tile label="Needs" value={need == null ? '—' : `${need.toFixed(0)}%`} sub="to break even" pct={null} />
                  <Tile label="He does" value={fmtPct(seasonPct)} sub="season" pct={seasonPct} />
                  <Tile label="His price" value={fair == null ? '—' : fmtOdds(fair)} sub="break-even"
                    pct={edge == null ? null : edge >= 5 ? 100 : edge <= -5 ? 0 : 30} />
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6 }}>
                  No book price on this exact bar yet. A price for a different number is a
                  different bet, so nothing is shown rather than something close.
                  {fair != null && <> His own break-even at {fmtPct(seasonPct)} would be <b style={{ color: C.text2 }}>{fmtOdds(fair)}</b>.</>}
                </div>
              )}
            </Section>

            <Section title="the whole grid" note="tap a row">
              <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {WINDOWS.map(([k, label]) => (
                  <FilterPill key={k} active={win === k} onClick={() => setWin(k)}>{label}</FilterPill>
                ))}
              </div>
              {gridRows.map((g) => (
                <Bar key={g.key} label={g.label} pct={g.pct} sub={g.n ? `${g.ok}/${g.n}` : '—'}
                  active={g.key === mk} onClick={() => setMarket(g.key)} />
              ))}
            </Section>

            <div style={{ marginTop: 16, fontSize: 9.5, color: C.text3, lineHeight: 1.65 }}>
              Rates are his own game log this season — measured, not modelled. A rate is not
              a prediction and the score above is not a probability; they answer different
              questions and are never mixed. Splits under five games print their sample and
              keep a washed-out bar. Every track is the full 0–100% with a mark at 50, so two bars are always read against the same scale.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
