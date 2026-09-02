'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import OddsLine from '../../OddsLine'
import OddsStatus from '../../OddsStatus'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect, PillRow } from '../../Filters'
import {
  CONVICTION, CONVICTION_ORDER, slateKey, slotKey, isLocked,
  getPicks, savePick, setConviction, clearPick,
  gradeSlate, recordSlate, ledgerTotals, exportStore, importStore, clearAll,
} from '../../../lib/nfl/myPicks'

// 🎫 PICKS — the bot's card, and yours on top of it.
//
// Seven markets, five rungs each, ranked across the whole slate. Football props
// are shopped across the slate rather than within a game, which is why this
// isn't baseball's per-game grid — the reasoning lives in bots/nfl/nfl_picks.py.
//
// Every market wears its measured out-of-sample record. As of the 2024
// out-of-sample season NOT ONE of the seven beats a form-only baseline by more
// than its own error bar, and the card says so on every single market rather
// than ranking them as though the differences were real. The HIT RATE is the
// number that's actually solid and actually useful; the edge is the number
// people want to believe and shouldn't yet.

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const TRUST = () => ({
  holds: { label: 'holds up', color: C.green },
  leans: { label: 'leans good', color: C.lime },
  thin: { label: 'too thin to call', color: C.text3 },
  sinks: { label: 'leans bad', color: C.orange },
  fails: { label: 'fails', color: C.red },
})

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const CONV_COLOR = () => ({ lean: C.text3, strong: C.cyan, lock: C.purple })

const pctTxt = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

function Pill({ tone, children, title }) {
  const col = tone === 'won' ? C.green : tone === 'lost' ? C.red : C.text3
  return (
    <span title={title} style={{
      fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.05em',
      padding: '1.5px 6px', borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${col}66`, background: `${col}1a`, color: col,
    }}>{children}</span>
  )
}

function outcome(out, val) {
  if (out === true) return <Pill tone="won">HIT{val != null ? ` ${val}` : ''}</Pill>
  if (out === false) return <Pill tone="lost">MISS{val != null ? ` ${val}` : ''}</Pill>
  return null
}

function Stat({ label, value, sub, color, big }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '9px 13px', minWidth: 104,
    }}>
      <div style={{
        fontSize: 8.5, fontWeight: 800, color: C.text3,
        letterSpacing: '.09em', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: NUM_FONT, fontSize: big ? 20 : 14.5, fontWeight: 900,
        color: color || C.text, lineHeight: 1.2, marginTop: 2,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function Picks({ picks, results, data, onPlayerClick, odds, oddsStatus }) {
  const [mine, setMine] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const [msg, setMsg] = useState('')
  const [bump, setBump] = useState(0)
  const [openSlot, setOpenSlot] = useState(null)
  const [filterMarket, setFilterMarket] = useState('all')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterPosition, setFilterPosition] = useState('all')
  const [filterQuery, setFilterQuery] = useState('')
  const fileRef = useRef(null)

  const key = useMemo(
    () => (picks ? slateKey(picks.season, picks.week, picks.mode) : null),
    [picks],
  )

  useEffect(() => { setMine(getPicks(key)) }, [key])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Kickoff per game, so a Thursday rung locks while Sunday's stay open.
  const kickoff = useMemo(() => {
    const m = {}
    ;(data?.games || []).forEach((g) => {
      if (g.away) m[g.away] = g.kickoff
      if (g.home) m[g.home] = g.kickoff
    })
    return m
  }, [data])

  const card = picks?.card || {}
  const graded = useMemo(() => gradeSlate(card, mine, results), [card, mine, results])
  const byKey = useMemo(
    () => Object.fromEntries(graded.rows.map((r) => [slotKey(r.market, r.rank), r])),
    [graded],
  )

  useEffect(() => {
    if (!key || !results) return
    if (recordSlate(key, graded, results.exhibition)) setBump((b) => b + 1)
  }, [key, results, graded])

  const totals = useMemo(() => ledgerTotals(), [bump, mine])

  // A rung is a card entry, not a player row — it carries a name and a score,
  // not components/stats/splits. Resolve it back to the real row before opening
  // the modal, and hand over the market it came FROM so the modal opens on the
  // board you were reading rather than defaulting every pick to TD.
  const byPid = useMemo(
    () => Object.fromEntries((data?.players || []).map((p) => [String(p.player_id), p])),
    [data],
  )
  const open = (pid, market) => {
    const row = byPid[String(pid)]
    if (row) onPlayerClick?.(row, market)
  }

  // Who you can put on a rung: everyone on the slate eligible for that market.
  const eligible = useMemo(() => {
    const out = {}
    Object.entries(card).forEach(([market, blk]) => {
      const pos = new Set(blk.positions || [])
      out[market] = (data?.players || [])
        .filter((p) => pos.has(p.position) && Number.isFinite(p.scores?.[market]))
        .sort((a, b) => b.scores[market] - a.scores[market])
    })
    return out
  }, [card, data])

  function choose(market, rank, pid, bot) {
    const p = (eligible[market] || []).find((x) => String(x.player_id) === String(pid))
    const next = p
      ? savePick(key, market, rank, p, bot, mine[slotKey(market, rank)]?.conviction || 'strong')
      : clearPick(key, market, rank)
    setMine({ ...next })
    setOpenSlot(null)
  }

  function conviction(market, rank, level) {
    setMine({ ...setConviction(key, market, rank, level) })
  }

  function doExport() {
    try {
      const blob = new Blob([exportStore()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `moonshot-nfl-picks-${new Date().toISOString().slice(0, 10)}.json`
      a.click(); URL.revokeObjectURL(a.href); setMsg('Exported.')
    } catch { setMsg("Couldn't export.") }
  }

  function doImport(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const res = importStore(String(r.result || ''))
      setMsg(res.ok ? `Merged — ${res.added} new, ${res.slates} total.` : res.error)
      if (res.ok) { setMine(getPicks(key)); setBump((b) => b + 1) }
    }
    r.readAsText(f); e.target.value = ''
  }

  if (!Object.keys(card).length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>The pick card hasn&apos;t been published yet.</div>
    )
  }

  const edge = totals.n ? totals.minePct - totals.botPct : null
  const allRungs = Object.entries(card).flatMap(([market, blk]) => (
    (blk.rungs || []).map((rung) => ({ ...rung, market }))
  ))
  const countBy = (key) => allRungs.reduce((out, rung) => {
    const value = rung[key]
    if (value) out[value] = (out[value] || 0) + 1
    return out
  }, {})
  const teamCounts = countBy('team')
  const positionCounts = countBy('position')
  const teamOptions = [{ key: 'all', label: 'All teams', count: allRungs.length }, ...Object.keys(teamCounts).sort().map((key) => ({ key, label: key, count: teamCounts[key] }))]
  const positionOptions = [{ key: 'all', label: 'All positions', count: allRungs.length }, ...Object.keys(positionCounts).sort().map((key) => ({ key, label: key, count: positionCounts[key] }))]
  const marketOptions = [{ key: 'all', label: 'All markets', count: allRungs.length }, ...Object.entries(card).map(([key, blk]) => ({ key, label: blk.label || key, count: (blk.rungs || []).length }))]
  const needle = filterQuery.trim().toLowerCase()
  const filteredCard = Object.entries(card).map(([market, blk]) => [market, {
    ...blk,
    rungs: (blk.rungs || []).filter((rung) => (
      (filterMarket === 'all' || market === filterMarket)
      && (filterTeam === 'all' || rung.team === filterTeam)
      && (filterPosition === 'all' || rung.position === filterPosition)
      && (!needle || String(rung.name || '').toLowerCase().includes(needle))
    )),
  }]).filter(([, blk]) => blk.rungs.length)
  const shownRungs = filteredCard.reduce((sum, [, blk]) => sum + blk.rungs.length, 0)

  return (
    <div>
      {/* ── the record ─────────────────────────────────────────────────── */}
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.cyan}`, borderRadius: 12,
        padding: '13px 15px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>🎫 Your record vs the bot</span>
          <span style={{ fontSize: 10, color: C.text3 }}>
            {totals.slates} slate{totals.slates === 1 ? '' : 's'}
            {totals.exhibition > 0 && ` · ${totals.exhibition} preseason`} · this device only
          </span>
        </div>

        {totals.slates > 0 ? (
          <>
            {totals.n === 0 ? (
              <div style={{ fontSize: 11.5, color: C.text2, marginTop: 10, lineHeight: 1.6 }}>
                Slates are grading, but you haven&apos;t contested a rung yet — swap someone
                in below and the head-to-head starts.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
                <Stat label="Head to head" big value={`${totals.w}–${totals.l}–${totals.t}`}
                      sub={`${totals.n} rung${totals.n === 1 ? '' : 's'} contested`}
                      color={totals.w > totals.l ? C.green : totals.w < totals.l ? C.red : C.text} />
                <Stat label="You" value={pctTxt(totals.minePct)}
                      sub={`${totals.mineWon}/${totals.n}`} color={C.green} />
                <Stat label="Bot, same rungs" value={pctTxt(totals.botPct)}
                      sub={`${totals.botWon}/${totals.n}`} color={C.purple} />
                {edge != null && (
                  <Stat label="Your edge" value={`${edge > 0 ? '+' : ''}${edge.toFixed(1)}pp`}
                        color={edge > 0 ? C.green : edge < 0 ? C.red : C.text3} />
                )}
              </div>
            )}

            {/* THE POINT OF THE CONVICTION TAG. A flat rate blends your best
                reads with your shrugs; this is where a null result can turn
                out to have a finding inside it. */}
            {totals.n > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {CONVICTION.map(([k, label]) => {
                  const c = totals.conv[k]
                  return (
                    <Stat key={k} label={label}
                          value={c.n ? `${c.w}–${c.l}–${c.t}` : '—'}
                          sub={c.n ? `you ${pctTxt(c.minePct)} · bot ${pctTxt(c.botPct)}` : 'none yet'}
                          color={CONV_COLOR()[k]} />
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {/* With zero overrides "your card" IS the bot's card, and showing
                  the same 25/30 under both labels reads as a personal record
                  the person never built (08-29 outside review). No card until
                  they've actually changed something. */}
              {totals.overrides > 0 ? (
                <Stat label="Your full card" value={pctTxt(totals.cardMinePct)}
                      sub={`${totals.cardMineWon}/${totals.cardMineN}`} />
              ) : (
                <Stat label="Your full card" value="—"
                      sub="no card yet — swap a pick below to start one" />
              )}
              <Stat label="Bot's full card" value={pctTxt(totals.cardBotPct)}
                    sub={`${totals.cardBotWon}/${totals.cardBotN}`} />
              <Stat label="Overrides" value={totals.overrides} sub="all time" />
            </div>

            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10, lineHeight: 1.6 }}>
              Head to head is the number with a claim on the scoring — same market, same bar,
              same rung, only the name changed. Void legs (never played) drop from both sides.
              {totals.exhibition > 0 && (
                <> <b style={{ color: C.yellow }}>Preseason counts here</b> — starters play two
                  series, so those weeks are thin by nature. They&apos;re stamped in the record
                  so they can be split back out.</>
              )}
              {totals.n > 0 && totals.n < 30 && (
                <> <b style={{ color: C.yellow }}>Still thin</b> at {totals.n} contested —
                  a read, not a finding.</>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 9, lineHeight: 1.6 }}>
            Nothing graded yet. Take a rung off the bot below, tag how sure you are, and once
            the games finish both picks get scored against the same bar.
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 11 }}>
          <button onClick={doExport} style={btnStyle(C.cyan, false)}>Export record</button>
          <button onClick={() => fileRef.current?.click()} style={btnStyle(C.cyan, false)}>Import</button>
          <button onClick={() => {
            if (window.confirm('Delete every NFL pick and the whole record on this device?')) {
              clearAll(); setMine({}); setBump((b) => b + 1); setMsg('Cleared.')
            }
          }} style={{ ...btnStyle(C.red, false), color: C.red }}>Clear all</button>
          <input ref={fileRef} type="file" accept="application/json,.json"
                 onChange={doImport} style={{ display: 'none' }} />
          {msg && <span style={{ fontSize: 10.5, color: C.text3, alignSelf: 'center' }}>{msg}</span>}
        </div>
      </div>

      {/* ── the ladders ────────────────────────────────────────────────── */}
      {/* Says WHY a rung below carries no price, rather than every rung just
          silently carrying nothing — same discipline odds_status.json
          enforces on the MLB side. Silent once a fetch has actually
          succeeded; see components/OddsStatus.js's own TONE table. */}
      {oddsStatus && (
        <div style={{ marginBottom: 10 }}><OddsStatus status={oddsStatus} /></div>
      )}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11,
        padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12,
        background: C.bg2,
      }}>
        <PillRow label="Market" value={filterMarket} options={marketOptions} onChange={setFilterMarket} />
        <FilterBar>
          <FilterSearch value={filterQuery} onChange={setFilterQuery} placeholder="Search pick…" width={160} />
          <FilterSelect label="Team" value={filterTeam} options={teamOptions} onChange={setFilterTeam} />
          <FilterSelect label="Position" value={filterPosition} options={positionOptions} onChange={setFilterPosition} />
          <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>{shownRungs}/{allRungs.length} rungs</span>
        </FilterBar>
        <ActiveFilters
          filters={[
            filterQuery && { key: 'query', label: `Name: ${filterQuery}`, onClear: () => setFilterQuery('') },
            filterMarket !== 'all' && { key: 'market', label: card[filterMarket]?.label || filterMarket, onClear: () => setFilterMarket('all') },
            filterTeam !== 'all' && { key: 'team', label: `Team: ${filterTeam}`, onClear: () => setFilterTeam('all') },
            filterPosition !== 'all' && { key: 'position', label: `Position: ${filterPosition}`, onClear: () => setFilterPosition('all') },
          ]}
          onClearAll={() => { setFilterQuery(''); setFilterMarket('all'); setFilterTeam('all'); setFilterPosition('all') }}
        />
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 10, lineHeight: 1.6 }}>
        Five deep per market, ranked across the whole slate. Swap yourself onto any rung and
        tag how sure you are — <b style={{ color: C.text2 }}>rungs lock at kickoff.</b>
      </div>

      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))' }}>
        {filteredCard.map(([market, blk]) => {
          const e = blk.edge
          const t = TRUST()[e?.trust] || TRUST().thin
          return (
            <div key={market} style={{
              background: C.bg2, border: `1px solid ${C.border}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 13px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{blk.label}</span>
                  <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                    bar {blk.bar} · {(blk.positions || []).join('/')}
                  </span>
                </div>
                {e ? (
                  <div
                    title={`Out of sample, top ${e.depth} a week: the model's picks cleared the bar ${e.hit}% of the time versus ${e.form_hit}% for picking on recent form alone. That +${e.edge} gap carries a standard error of ${e.se}, so z = ${e.z}.`}
                    style={{ fontSize: 10, color: C.text3, marginTop: 5, lineHeight: 1.5 }}
                  >
                    <b style={{ color: C.text, fontFamily: NUM_FONT }}>{e.hit}%</b> cleared the bar
                    out of sample · vs form{' '}
                    <b style={{ fontFamily: NUM_FONT, color: t.color }}>
                      {e.edge > 0 ? '+' : ''}{e.edge}
                    </b>
                    <span style={{ fontFamily: NUM_FONT }}> ±{e.se}</span>{' '}
                    <span style={{ color: t.color, fontWeight: 800 }}>({t.label})</span>
                  </div>
                ) : (
                  /* #10: this used to read "No measured record yet" and sat
                     directly above rows carrying HIT 2 / MISS 0 / HIT 283.
                     Both were true and they are two different records: this
                     line is about the OUT-OF-SAMPLE BACKTEST for the market,
                     the chips below are this season's live grading of
                     individual calls. Saying which is missing costs six words
                     and stops the card contradicting itself. */
                  <div style={{ fontSize: 10, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
                    No out-of-sample backtest for this market yet — any HIT/MISS below is
                    this season&apos;s live grading, which is a different measurement.
                  </div>
                )}
              </div>

              {(blk.rungs || []).map((rung) => {
                const sk = slotKey(market, rung.rank)
                const row = byKey[sk]
                const my = mine[sk]
                const locked = isLocked(kickoff[rung.team], now)
                const picking = openSlot === sk
                const g = gradeFor(rung.score)
                return (
                  <div key={rung.rank} style={{
                    borderTop: `1px solid ${C.bg}`, padding: '8px 13px',
                    background: my ? `${CONV_COLOR()[my.conviction]}0d` : 'transparent',
                    opacity: rung.low_sample && !my ? 0.62 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: NUM_FONT, fontSize: 10, fontWeight: 900,
                        color: C.text3, minWidth: 14,
                      }}>{rung.rank}</span>
                      <span style={{
                        fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900,
                        color: g.color, minWidth: 30,
                      }}>{Math.round(rung.score)}</span>
                      <button
                        onClick={() => open(rung.player_id, market)}
                        style={{
                          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                          textAlign: 'left', fontSize: 12, flex: 1, minWidth: 120,
                          color: my ? C.text3 : C.text,
                          textDecoration: my ? 'line-through' : 'none',
                        }}
                      >
                        {rung.name}{' '}
                        <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
                          {rung.position} {rung.team}{rung.opp ? ` vs ${rung.opp}` : ''}
                        </span>
                      </button>
                      {/* The book's line on the bot's own rung — renders
                          nothing when this player has none (a normal,
                          per-player state; the banner above says whether the
                          fetch found anything at all). */}
                      {odds && (
                        <OddsLine
                          quote={quoteFor(odds, { player_id: rung.player_id, name: rung.name }, market)}
                          compact
                        />
                      )}
                      {rung.questionable && (
                        <span style={{ fontSize: 9, fontWeight: 900, color: C.yellow }}>Q</span>
                      )}
                      {rung.low_sample && (
                        <span title="Below the sample the model wants — it backfilled this rung."
                              style={{ fontSize: 9, fontWeight: 900, color: C.text3 }}>~</span>
                      )}
                      {row && outcome(row.botOut, row.botVal)}
                      {!locked && (
                        <button onClick={() => setOpenSlot(picking ? null : sk)} style={{
                          ...btnStyle(C.cyan, open), fontSize: 9.5, padding: '3px 8px',
                        }}>{my ? 'change' : 'take it'}</button>
                      )}
                      {locked && !my && (
                        <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>🔒</span>
                      )}
                    </div>

                    {my && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                        marginTop: 6, paddingLeft: 22,
                      }}>
                        <span style={{ color: C.text3, fontSize: 11 }}>→</span>
                        <span style={{
                          fontSize: 12, fontWeight: 800, color: CONV_COLOR()[my.conviction],
                        }}>{my.name}</span>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
                          {my.position} {my.team}
                        </span>
                        {row && outcome(row.mineOut, row.mineVal)}
                        {row?.contested && (
                          <Pill tone={row.mineOut && !row.botOut ? 'won'
                            : !row.mineOut && row.botOut ? 'lost' : 'void'}>
                            {row.mineOut && !row.botOut ? 'YOU WIN'
                              : !row.mineOut && row.botOut ? 'BOT WINS' : 'PUSH'}
                          </Pill>
                        )}
                        {locked ? (
                          <span style={{
                            fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900,
                            color: CONV_COLOR()[my.conviction], letterSpacing: '.08em',
                          }}>{my.conviction.toUpperCase()} 🔒</span>
                        ) : (
                          <span style={{ display: 'flex', gap: 3 }}>
                            {CONVICTION.map(([k, label, blurb]) => (
                              <button key={k} title={blurb}
                                      onClick={() => conviction(market, rung.rank, k)}
                                      style={{
                                        fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900,
                                        padding: '2px 7px', borderRadius: 6, cursor: 'pointer',
                                        letterSpacing: '.06em',
                                        border: `1px solid ${my.conviction === k ? CONV_COLOR()[k] : C.border}`,
                                        background: my.conviction === k ? `${CONV_COLOR()[k]}22` : 'transparent',
                                        color: my.conviction === k ? CONV_COLOR()[k] : C.text3,
                                      }}>{label}</button>
                            ))}
                          </span>
                        )}
                      </div>
                    )}

                    {picking && (
                      <div style={{ marginTop: 7, paddingLeft: 22 }}>
                        <select
                          value={my?.pid ?? ''}
                          onChange={(ev) => choose(market, rung.rank, ev.target.value, rung)}
                          style={{
                            background: C.bg, color: C.text2, border: `1px solid ${C.border2}`,
                            borderRadius: 7, padding: '5px 8px', fontSize: 11,
                            cursor: 'pointer', maxWidth: 330, width: '100%',
                          }}
                        >
                          <option value="">— leave the bot&apos;s pick —</option>
                          {(eligible[market] || []).map((p) => (
                            <option key={p.player_id} value={p.player_id}>
                              {p.name} · {p.position} {p.team} · {Math.round(p.scores[market])}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {!filteredCard.length && (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24,
          textAlign: 'center', color: C.text3, fontSize: 11,
        }}>No published pick matches these filters.</div>
      )}
    </div>
  )
}
