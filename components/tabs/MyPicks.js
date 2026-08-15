'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf } from '../../lib/player'
import { groupGames } from '../../lib/data'
import { CATEGORIES } from '../BotPicksStrip'
import OddsLine from '../OddsLine'
import { quoteFor } from '../../lib/odds'
import {
  BAR, isLocked, getPicks, savePick, clearPick, slotKey,
  gradeSlate, recordNight, ledgerTotals, exportStore, importStore, clearAll,
} from '../../lib/myPicks'

// 🎫 MY PICKS — put your guy in the bot's slot, get graded on it.
//
// 2026-08-14, Donovan: "mainly for me to hep me figure what i think goes and
// thien to compare hit rate to the bot to update scoing."
//
// The four categories, one slot per game, exactly the slots the bot fills.
// Swap whoever you want in; at first pitch the slot freezes; overnight it
// grades on the same bar the bot's own pick had to clear.
//
// TWO NUMBERS, AND THEY ANSWER DIFFERENT QUESTIONS. The headline is the
// head-to-head on slots you actually CONTESTED — that's the only figure with
// any claim on the scoring, because it holds the game, the category and the
// bar fixed and varies exactly one thing: the name. The full-card rate is
// underneath, softer on purpose: most of your card is the bot's own picks, so
// the two rates converge toward each other no matter who's right.
//
// The category list is imported, not re-declared. Two surfaces naming
// different hitters as "the bot's pick" is a failure this project has had.

const pctTxt = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

function Pill({ tone, children, title }) {
  const col = tone === 'won' ? C.green || '#4ade80'
    : tone === 'lost' ? '#f87171'
      : tone === 'void' ? C.text3 : C.text3
  return (
    <span title={title} style={{
      fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.04em',
      padding: '1.5px 7px', borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${col}66`, background: `${col}1a`, color: col,
    }}>{children}</span>
  )
}

// Three outcomes plus "nothing yet" — see the verdict block in lib/myPicks.js.
function outcomePill(out, pending) {
  if (out === true) return <Pill tone="won">HIT</Pill>
  if (out === false) return <Pill tone="lost">MISS</Pill>
  if (out === null) return <Pill tone="void" title="Tracked, but never batted — void, not a miss. Dropped from both sides.">VOID</Pill>
  if (pending) return null
  return (
    <Pill tone="void" title="The graded file has no line for him — he isn't one of the ~90 candidates the bot tracks, so there's nothing to score him against.">
      UNTRACKED
    </Pill>
  )
}

function Stat({ label, value, sub, color, big }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '9px 13px', minWidth: 110,
    }}>
      <div style={{
        fontSize: 8.5, fontWeight: 800, color: C.text3,
        letterSpacing: '.09em', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: NUM_FONT, fontSize: big ? 21 : 15, fontWeight: 900,
        color: color || C.text, lineHeight: 1.2, marginTop: 2,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function MyPicks({ players = [], results, odds, slateDate, onPlayerClick }) {
  const [picks, setPicks] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const [msg, setMsg] = useState('')
  const [bump, setBump] = useState(0)          // forces a ledger re-read
  const fileRef = useRef(null)

  // localStorage is client-only — read after mount, never during render.
  useEffect(() => { setPicks(getPicks(slateDate)) }, [slateDate])

  // Lock state is a function of wall-clock, so it has to tick on its own or a
  // slot stays editable until something else happens to re-render the page.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const games = useMemo(() => groupGames(players), [players])

  // The whole card: one entry per game per category, with the bot's designated
  // pick and your override if you made one.
  const slots = useMemo(() => {
    const out = []
    games.forEach((g) => {
      CATEGORIES.forEach((cat) => {
        const pool = g.players.filter((p) => String(p?.game_pick_role || '')
          .split('/').map((s) => s.trim()).includes(cat.role))
        // Supposed to be exactly one per role per game since the bot's
        // 2026-08-06 fix. If an older payload has two, rank by the category's
        // own score rather than taking whichever came first out of the file.
        const bot = pool.sort((a, b) => cat.score(b) - cat.score(a))[0] || null
        out.push({
          game_pk: g.game_pk,
          game_time: g.game_time,
          away: g.away, home: g.home,
          role: cat.role,
          bot,
          mine: picks[slotKey(g.game_pk, cat.role)] || null,
          pool: g.players,
        })
      })
    })
    return out
  }, [games, picks])

  const graded = useMemo(() => gradeSlate(slots, results), [slots, results])
  const byKey = useMemo(
    () => Object.fromEntries(graded.rows.map((r) => [slotKey(r.game_pk, r.role), r])),
    [graded],
  )

  // Which games the graded file has started reporting on. Before a game shows
  // up there, an ungraded slot means "not yet", not "this man is untracked" —
  // two very different things to put in front of you.
  const reporting = useMemo(() => {
    const s = new Set()
    graded.rows.forEach((r) => {
      if (typeof r.botOut !== 'undefined' || typeof r.mineOut !== 'undefined') s.add(r.game_pk)
    })
    return s
  }, [graded])

  // Record the night as it grades. Idempotent by date — see lib/myPicks.js.
  useEffect(() => {
    if (!slateDate || !results) return
    if (recordNight(slateDate, graded)) setBump((b) => b + 1)
  }, [slateDate, results, graded])

  const totals = useMemo(() => ledgerTotals(), [bump, picks])

  function choose(slot, pid) {
    const next = pid
      ? savePick(slateDate, slot.game_pk, slot.role,
        slot.pool.find((p) => String(p.player_id) === String(pid)), slot.bot)
      : clearPick(slateDate, slot.game_pk, slot.role)
    setPicks({ ...next })
  }

  function doExport() {
    try {
      const blob = new Blob([exportStore()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `moonshot-my-picks-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg('Exported.')
    } catch { setMsg("Couldn't export.") }
  }

  function doImport(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const res = importStore(String(r.result || ''))
      setMsg(res.ok ? `Merged — ${res.added} new night${res.added === 1 ? '' : 's'}, ${res.nights} total.` : res.error)
      if (res.ok) { setPicks(getPicks(slateDate)); setBump((b) => b + 1) }
    }
    r.readAsText(f)
    e.target.value = ''
  }

  if (!games.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>No slate loaded, so there are no slots to fill yet.</div>
    )
  }

  const edge = totals.n ? (totals.minePct - totals.botPct) : null

  return (
    <div>
      {/* ── the record ─────────────────────────────────────────────────── */}
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.orange || '#f97316'}`,
        borderRadius: 12, padding: '13px 15px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>🎫 Your record vs the bot</span>
          <span style={{ fontSize: 10, color: C.text3 }}>
            {totals.nights} night{totals.nights === 1 ? '' : 's'} · saved on this device only
          </span>
        </div>

        {totals.nights > 0 ? (
          <>
            {totals.n === 0 && (
              <div style={{
                fontSize: 11.5, color: C.text2, marginTop: 10, lineHeight: 1.6,
                background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                borderRadius: 9, padding: '8px 11px',
              }}>
                Nights are grading, but you haven&apos;t contested a slot yet — swap someone
                in below and the head-to-head starts.
              </div>
            )}

            {totals.n > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
              <Stat
                label="Head to head" big
                value={`${totals.w}–${totals.l}–${totals.t}`}
                sub={`${totals.n} slot${totals.n === 1 ? '' : 's'} you contested`}
                color={totals.w > totals.l ? '#4ade80' : totals.w < totals.l ? '#f87171' : C.text}
              />
              <Stat label="You, contested" value={pctTxt(totals.minePct)}
                    sub={`${totals.mineWon}/${totals.n}`} color="#4ade80" />
              <Stat label="Bot, same slots" value={pctTxt(totals.botPct)}
                    sub={`${totals.botWon}/${totals.n}`} color="#a78bfa" />
              {edge != null && (
                <Stat
                  label="Your edge"
                  value={`${edge > 0 ? '+' : ''}${edge.toFixed(1)}pp`}
                  sub="on contested slots"
                  color={edge > 0 ? '#4ade80' : edge < 0 ? '#f87171' : C.text3}
                />
              )}
            </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <Stat label="Your full card" value={pctTxt(totals.cardMinePct)}
                    sub={`${totals.cardMineWon}/${totals.cardMineN} slots`} />
              <Stat label="Bot's full card" value={pctTxt(totals.cardBotPct)}
                    sub={`${totals.cardBotWon}/${totals.cardBotN} slots`} />
              <Stat label="Overrides made" value={totals.overrides} sub="all time" />
            </div>

            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10, lineHeight: 1.6 }}>
              <b style={{ color: C.text2 }}>Head to head</b> is the number that means something —
              same game, same category, same bar, only the name changed. The full-card rates
              are mostly the bot&apos;s own picks on both sides, so they drift together whoever&apos;s
              right. Void legs (never batted) are dropped from both sides, not counted as misses.
              {totals.n > 0 && totals.n < 25 && (
                <> <b style={{ color: '#facc15' }}>Still thin</b> — {totals.n} contested slot
                  {totals.n === 1 ? '' : 's'} is a read, not a finding. Nothing should touch
                  scoring off this yet.</>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 9, lineHeight: 1.6 }}>
            Nothing graded yet. Swap yourself into a slot below — once that game finishes,
            your pick and the bot&apos;s get scored against the same bar and the head-to-head
            starts here.
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 11 }}>
          <button onClick={doExport} style={btn()}>Export record</button>
          <button onClick={() => fileRef.current?.click()} style={btn()}>Import</button>
          <button
            onClick={() => {
              if (window.confirm('Delete every pick and the whole record on this device?')) {
                clearAll(); setPicks({}); setBump((b) => b + 1); setMsg('Cleared.')
              }
            }}
            style={{ ...btn(), color: '#f87171', borderColor: '#f8717155' }}
          >Clear all</button>
          <input ref={fileRef} type="file" accept="application/json,.json"
                 onChange={doImport} style={{ display: 'none' }} />
          {msg && <span style={{ fontSize: 10.5, color: C.text3, alignSelf: 'center' }}>{msg}</span>}
        </div>
      </div>

      {/* ── tonight's card ─────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 9, lineHeight: 1.6 }}>
        Four slots a game, the same four the bot fills. Swap anyone in that game into a slot —
        he&apos;s graded on that slot&apos;s bar, not his own. <b style={{ color: C.text2 }}>Slots
        freeze at first pitch.</b> Deep-bench names may come back{' '}
        <b style={{ color: C.text2 }}>untracked</b> — the graded file only carries the
        ~90 candidates the bot watches, and there&apos;s nothing to score the rest against.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {games.map((g) => {
          const locked = isLocked(g.game_time, now)
          const t = g.game_time ? new Date(g.game_time) : null
          return (
            <div key={g.game_pk} style={{
              background: C.bg2, border: `1px solid ${C.border}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
                padding: '9px 13px', borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900 }}>
                  {g.away} <span style={{ color: C.text3, fontWeight: 600 }}>@</span> {g.home}
                </span>
                <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                  {t ? t.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'TBD'}
                </span>
                {locked && <Pill tone="void" title="First pitch has passed — these slots are frozen.">🔒 LOCKED</Pill>}
              </div>

              {CATEGORIES.map((cat) => {
                const s = slots.find((x) => x.game_pk === g.game_pk && x.role === cat.role)
                if (!s) return null
                const row = byKey[slotKey(g.game_pk, cat.role)]
                const mine = s.mine
                const ranked = [...s.pool].sort((a, b) => cat.score(b) - cat.score(a))
                return (
                  <div key={cat.role} style={{
                    display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
                    padding: '8px 13px', borderTop: `1px solid ${C.bg}`,
                    background: mine ? `${cat.color}0d` : 'transparent',
                  }}>
                    <span
                      title={BAR[cat.role]}
                      style={{
                        fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900,
                        color: cat.color, border: `1px solid ${cat.color}55`,
                        background: `${cat.color}16`, borderRadius: 6,
                        padding: '2px 7px', minWidth: 66, textAlign: 'center',
                      }}
                    >{cat.label}</span>

                    {/* the bot's pick */}
                    <button
                      onClick={() => s.bot && onPlayerClick?.(s.bot)}
                      disabled={!s.bot}
                      style={{
                        background: 'transparent', border: 'none', padding: 0,
                        cursor: s.bot ? 'pointer' : 'default', textAlign: 'left',
                        fontSize: 11.5, minWidth: 148,
                        color: mine ? C.text3 : C.text,
                        textDecoration: mine ? 'line-through' : 'none',
                      }}
                    >
                      {s.bot ? `${nameOf(s.bot)} ` : <span style={{ color: C.text3 }}>no bot pick</span>}
                      {s.bot && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>
                        {teamOf(s.bot)}
                      </span>}
                    </button>
                    {row && s.bot && outcomePill(row.botOut, !reporting.has(g.game_pk))}
                    {/* THE PRICE, next to the pick it belongs to. A board that
                        ranks by score and never shows what the market charges
                        is a research tool; this is the one column that makes it
                        a decision. No verdict chip here — that needs a real
                        historical rate, and a SCORE is not a probability. */}
                    {s.bot && <OddsLine quote={quoteFor(odds, s.bot, cat.role)} compact />}

                    <span style={{ color: C.text3, fontSize: 11 }}>→</span>

                    {/* yours */}
                    {locked ? (
                      <span style={{ fontSize: 11.5, fontWeight: mine ? 800 : 400, color: mine ? cat.color : C.text3 }}>
                        {mine ? `${mine.name} ${mine.team}` : 'no change'}
                      </span>
                    ) : (
                      <select
                        value={mine?.pid ?? ''}
                        onChange={(e) => choose(s, e.target.value)}
                        style={{
                          background: C.bg, color: mine ? cat.color : C.text2,
                          border: `1px solid ${mine ? cat.color + '77' : C.border}`,
                          borderRadius: 7, padding: '4px 7px', fontSize: 11,
                          fontWeight: mine ? 800 : 500, cursor: 'pointer', maxWidth: 230,
                        }}
                      >
                        <option value="">— keep the bot&apos;s pick —</option>
                        {ranked.map((p) => (
                          <option key={p.player_id} value={p.player_id}>
                            {nameOf(p)} · {teamOf(p)} · {Math.round(cat.score(p) || 0)}
                          </option>
                        ))}
                      </select>
                    )}
                    {row && mine && outcomePill(row.mineOut, !reporting.has(g.game_pk))}
                    {mine && <OddsLine quote={quoteFor(odds, { player_id: mine.pid, name: mine.name }, cat.role)} compact />}

                    {row?.contested && (
                      <Pill tone={row.mineOut && !row.botOut ? 'won' : !row.mineOut && row.botOut ? 'lost' : 'void'}>
                        {row.mineOut && !row.botOut ? 'YOU WIN'
                          : !row.mineOut && row.botOut ? 'BOT WINS' : 'PUSH'}
                      </Pill>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function btn() {
  return {
    border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.035)',
    color: C.text2, borderRadius: 999, padding: '5px 11px',
    fontSize: 10.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
