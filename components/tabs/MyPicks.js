'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf } from '../../lib/player'
import { groupGames } from '../../lib/data'
import { CATEGORIES } from '../BotPicksStrip'
import OddsLine from '../OddsLine'
import { readLedger, nightVerdict, coinTail } from '../../lib/myPicks'
import { quoteFor } from '../../lib/odds'
import {
  BAR, isLocked, getPicks, savePick, clearPick, setConviction, slotKey,
  CONVICTION, gradeSlate, recordNight, ledgerTotals, exportStore, importStore, clearAll,
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
//
// ── MADE A GAME OF IT (2026-08-15) ───────────────────────────────────────────
//
// Donovan: "my picks needs to be like a fun game area but serious business as
// well because it is still…". What was here was honest and dull: a row of four
// grey tiles, a row of three more, and a paragraph. Everything true, nothing
// you'd come back for.
//
// WHAT CHANGED, AND WHAT DIDN'T. The panel now opens on a SCORELINE and a
// standing — where you're beating it, the calls you got right, what you have
// riding tonight, and how far you are from the 25 contested slots the number
// needs. Every one of those is the same contested-slot arithmetic from
// lib/myPicks.js re-sliced; not one of them is a new, kinder way to win a
// slot. Voids and untracked slots are still dropped from both sides.
//
// AND IT'S SENTENCES, NOT TILES. The seven Stat boxes are gone — as boxes. The
// numbers they held (W–L–T, both contested rates, the edge in points, both
// full-card rates with their denominators, the all-time override count) are
// all still on screen, in prose, each with its k/n attached. This page had
// been told five times that tiles lose to sentences; a "fun game area" is
// stakes and a standing, not more boxes.
//
// THE ONE RULE THE GAME LAYER LIVES UNDER: nothing here may make the number
// look better than it is. The streak language says outright that it describes
// nights already played. The coin-flip line is a statement about guessing,
// printed with its denominator, and stays hidden until ten slots have actually
// been decided.

const pctTxt = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

// A category's colour and label, from the one CATEGORIES list the whole site
// ranks on — never a second table of role names in this file.
const ROLE_META = Object.fromEntries(CATEGORIES.map((c) => [c.role, c]))
const roleColor = (r) => ROLE_META[r]?.color || C.text2
const roleLabel = (r) => ROLE_META[r]?.label || r

// Ledger dates are YYYY-MM-DD. Noon avoids the timezone slip that makes a
// midnight-parsed date render as the day before west of UTC.
const shortDate = (d) => {
  const t = new Date(`${d}T12:00:00`)
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : String(d || '')
}

// A slot is cleared or it isn't — there is no margin in a binary outcome. So
// the reel ranks by the only size a call carries: how sure you said you were
// before first pitch. Said out loud in the UI rather than left to be guessed.
const CONV_WEIGHT = { lock: 3, strong: 2, lean: 1 }
const callRank = (c) => (CONV_WEIGHT[c?.c] || 2)

// The progress rail toward the 25-slot bar. A rail, not a tile: it's one fact
// (how far along you are) and it belongs on the same line as the sentence that
// explains it.
function Rail({ value, max, color }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  return (
    <span style={{
      display: 'inline-block', width: 120, height: 5, borderRadius: 999,
      background: 'rgba(255,255,255,.08)', overflow: 'hidden', verticalAlign: 'middle',
    }}>
      <span style={{
        display: 'block', width: `${pct * 100}%`, height: '100%',
        borderRadius: 999, background: color,
      }} />
    </span>
  )
}

// 🟩 YOUR NIGHTS, AS A STRIP (2026-08-15, "make the my pick page fun and
// interactive"). Each square is one graded night of head-to-head: green you
// beat the bot on contested slots, red it beat you, grey a push or a night
// you didn't contest.
//
// The verdict rule moved to lib/myPicks.js (nightVerdict) — this strip used to
// carry its own inline copy, and a second definition of "a night you won" is
// exactly the kind of drift that makes two surfaces disagree. The streak
// LABEL that used to sit here also moved, into the standing sentence below,
// which can say both the current run and the longest one; the glow on the
// trailing squares still marks the run itself.
function NightStrip({ bump }) {
  const rows = useMemo(() => readLedger().slice(-20), [bump])
  if (rows.length < 2) return null
  let streak = 0
  const last = nightVerdict(rows[rows.length - 1])
  if (last !== 0) {
    for (let i = rows.length - 1; i >= 0 && nightVerdict(rows[i]) === last; i--) streak += 1
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {rows.map((r, i) => {
          const v = nightVerdict(r)
          return (
            <span key={r.date || i}
              title={`${r.date} — you ${r.mw ?? 0}, bot ${r.bw ?? 0} on ${r.n ?? 0} contested (${r.w ?? 0}–${r.l ?? 0}–${r.t ?? 0})`}
              style={{
                width: 7, height: 7, borderRadius: 1.5,
                background: v > 0 ? C.green : v < 0 ? `${C.red}cc` : 'rgba(255,255,255,.14)',
                boxShadow: i >= rows.length - streak && last !== 0 && v === last
                  ? `0 0 4px ${last > 0 ? `${C.green}99` : `${C.red}88`}` : 'none',
              }} />
          )
        })}
      </span>
    </span>
  )
}

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

// One line of the standing. Not a tile — a sentence with a leading glyph, so
// the block reads top to bottom as a story instead of scanning as a grid.
function Line({ icon, children, color, dim }) {
  return (
    <div style={{
      display: 'flex', gap: 7, alignItems: 'baseline',
      fontSize: dim ? 10.5 : 11.5, color: dim ? C.text3 : C.text2,
      lineHeight: 1.6, marginTop: 6,
    }}>
      <span style={{ flex: '0 0 auto', color: color || C.text3 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}

// A number in the middle of a sentence still gets the numeral font — that's
// the house rule, and it's what makes a k/n readable at 11px.
function Num({ children, color }) {
  return <b style={{ fontFamily: NUM_FONT, color: color || C.text }}>{children}</b>
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

  // 🎮 WHAT'S RIDING TONIGHT. The record answers "how have I done"; nothing on
  // the page answered "what do I have on the line right now", which is the
  // question you actually open the tab with at 6pm. Live off the slate — none
  // of this is stored, and none of it touches the ledger: it's the same rows
  // gradeSlate already produced, counted by state.
  //
  // The four states are kept apart on purpose, because they mean different
  // things: still open to change, locked and waiting, graded, and the two
  // kinds of ungradeable (void = tracked but never batted, untracked = no line
  // in the file at all).
  const tonight = useMemo(() => {
    const mineRows = graded.rows.filter((r) => r.mine)
    const open = mineRows.filter((r) => !isLocked(r.game_time, now)).length
    const contested = mineRows.filter((r) => r.contested)
    const w = contested.filter((r) => r.mineOut && !r.botOut).length
    const l = contested.filter((r) => !r.mineOut && r.botOut).length
    return {
      rows: mineRows,
      games: new Set(mineRows.map((r) => r.game_pk)).size,
      open,
      locked: mineRows.length - open,
      contested: contested.length,
      w, l, t: contested.length - w - l,
      pending: mineRows.filter((r) => !reporting.has(r.game_pk)).length,
      voided: mineRows.filter((r) => r.mineOut === null).length,
      untracked: mineRows.filter((r) => reporting.has(r.game_pk) && r.mineOut === undefined).length,
    }
  }, [graded, reporting, now])

  function convict(slot, key) {
    setPicks({ ...setConviction(slateDate, slot.game_pk, slot.role, key) })
  }

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
          <NightStrip bump={bump} />
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

            {/* ── THE SCORELINE AND THE STANDING ──────────────────────────
                Everything the four tiles used to hold, said instead. The
                scoreline is the only thing here allowed to be big, because
                it's the one figure with a claim on anything: your record on
                slots you contested, where the game, the category and the bar
                were held fixed and only the name changed. */}
            {totals.n > 0 && (() => {
              const lead = totals.w - totals.l
              const leadCol = lead > 0 ? C.green : lead < 0 ? C.red : C.text
              // The coin line always describes the LEADING side, so it reads
              // as the same sentence whichever way the record is running.
              const tail = lead >= 0 ? coinTail(totals.w, totals.l) : coinTail(totals.l, totals.w)
              const tailTxt = tail == null ? null
                : tail < 0.001 ? 'under 0.1%' : `${(tail * 100).toFixed(tail < 0.1 ? 1 : 0)}%`
              const st = totals.streak || {}
              const roles = Object.entries(totals.role || {}).sort((a, b) => b[1].n - a[1].n)
              const calls = totals.calls || []
              const byRank = (a, b) => callRank(b) - callRank(a) || String(b.date).localeCompare(String(a.date))
              const best = calls.filter((c) => c.o).sort(byRank)[0]
              const worst = calls.filter((c) => !c.o).sort(byRank)[0]
              return (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 9,
                    flexWrap: 'wrap', marginTop: 11,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: C.text3,
                      letterSpacing: '.09em', textTransform: 'uppercase',
                    }}>You</span>
                    <span style={{
                      fontFamily: NUM_FONT, fontSize: 30, fontWeight: 900,
                      lineHeight: 1, color: leadCol, letterSpacing: '-.02em',
                    }}>
                      {totals.w}
                      <span style={{ color: C.text3, margin: '0 5px' }}>–</span>{totals.l}
                      <span style={{ color: C.text3, margin: '0 5px' }}>–</span>
                      <span style={{ color: C.text3 }}>{totals.t}</span>
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: C.text3,
                      letterSpacing: '.09em', textTransform: 'uppercase',
                    }}>the bot</span>
                    <span style={{ fontSize: 10, color: C.text3 }}>
                      wins – losses – pushes, contested slots only
                    </span>
                  </div>

                  <div style={{ fontSize: 11.5, color: C.text2, marginTop: 7, lineHeight: 1.65 }}>
                    <Num>{totals.n}</Num> contested slot{totals.n === 1 ? '' : 's'} over{' '}
                    <Num>{totals.nights}</Num> night{totals.nights === 1 ? '' : 's'} — every call where you
                    put a different name in the bot&apos;s seat and both names ended up judgeable.
                    You cleared the bar on <Num color={C.green}>{totals.mineWon}/{totals.n}</Num>{' '}
                    ({pctTxt(totals.minePct)}); it cleared the same slots on{' '}
                    <Num color={C.purple}>{totals.botWon}/{totals.n}</Num> ({pctTxt(totals.botPct)})
                    {edge != null && (
                      <> — <Num color={edge > 0 ? C.green : edge < 0 ? C.red : C.text3}>
                        {edge > 0 ? '+' : ''}{edge.toFixed(1)}pp
                      </Num>{' '}
                      {edge > 0 ? 'your way' : edge < 0 ? 'the bot’s way' : 'dead level'}</>
                    )}.
                  </div>

                  {/* 🎉 PROPORTIONATE, OR NOT AT ALL. The tone is a function of
                      the sample, not of the mood: under ten contested slots
                      this refuses to have an opinion, and it never claims the
                      record predicts anything. Confetti over a 1–0 is how a
                      serious page stops being one. */}
                  {totals.n < 10 ? (
                    <Line icon="🌱" color={C.text3}>
                      Ten contested slots is where this stops being noise, and you have{' '}
                      <Num>{totals.n}</Num>. Nothing to celebrate or worry about yet — keep swapping.
                    </Line>
                  ) : totals.n < 25 ? (
                    <Line icon={lead > 0 ? '📈' : lead < 0 ? '📉' : '➖'} color={leadCol}>
                      {lead > 0 ? (
                        <>You are ahead of it, <Num color={C.green}>{totals.w}–{totals.l}</Num> on decided
                          slots. Real, and still a read rather than a finding at this size.</>
                      ) : lead < 0 ? (
                        <>The bot is ahead, <Num color={C.red}>{totals.l}–{totals.w}</Num> on decided slots.
                          Worth sitting with, not yet worth changing your process over.</>
                      ) : (
                        <>Dead level at <Num>{totals.w}–{totals.l}</Num> on decided slots.</>
                      )}
                    </Line>
                  ) : (
                    <Line icon={lead > 0 ? '🏆' : lead < 0 ? '🤖' : '➖'} color={leadCol}>
                      {lead > 0 ? (
                        <>Past the bar and in front: <Num color={C.green}>{totals.w}–{totals.l}–{totals.t}</Num>{' '}
                          over <Num>{totals.n}</Num> contested slots. On the calls you actually argued, you
                          have been the better of the two.</>
                      ) : lead < 0 ? (
                        <>Past the bar and behind: the bot is <Num color={C.red}>{totals.l}–{totals.w}–{totals.t}</Num>{' '}
                          over <Num>{totals.n}</Num> contested slots. Overriding it has cost more slots than
                          it has won.</>
                      ) : (
                        <>Level over <Num>{totals.n}</Num> contested slots — <Num>{totals.w}–{totals.l}–{totals.t}</Num>.
                          Your overrides have neither helped nor hurt.</>
                      )}
                    </Line>
                  )}

                  {/* The 25-slot bar as PROGRESS, not as a scolding. The
                      caution itself still lives in the footnote below, word
                      for word — this is the same fact with a direction. */}
                  <Line icon="🎯" color={totals.n >= 25 ? C.green : C.yellow}>
                    {totals.n >= 25 ? (
                      <>Past the 25-slot bar (<Num>{totals.n}</Num> contested). The number has a floor
                        under it now — which is not the same as being a season.</>
                    ) : (
                      <><Num>{totals.n}</Num> of <Num>25</Num> contested slots{' '}
                        <Rail value={totals.n} max={25} color={C.yellow} />{' '}
                        <Num>{25 - totals.n}</Num> more before this is worth arguing with.</>
                    )}
                  </Line>

                  {totals.decided >= 10 && tailTxt && (
                    <Line icon="🎲" color={C.text3}>
                      {lead >= 0 ? (
                        <>Someone guessing blind goes <Num>{totals.w}–{totals.l}</Num> or better about{' '}
                          <Num>{tailTxt}</Num> of the time over <Num>{totals.decided}</Num> decided slots</>
                      ) : (
                        <>Someone guessing blind goes <Num>{totals.w}–{totals.l}</Num> or worse about{' '}
                          <Num>{tailTxt}</Num> of the time over <Num>{totals.decided}</Num> decided slots</>
                      )}
                      {' '}(pushes excluded). That is a fact about coin flips at this sample size, not a
                      forecast for tonight.
                    </Line>
                  )}

                  {st.len >= 2 ? (
                    <Line icon={st.dir > 0 ? '🔥' : '🧊'} color={st.dir > 0 ? C.green : C.red}>
                      {st.dir > 0 ? (
                        <><Num color={C.green}>{st.len}</Num> nights running you have taken the head-to-head</>
                      ) : (
                        <>The bot has taken it <Num color={C.red}>{st.len}</Num> nights running</>
                      )}
                      {' '}(longest on this record: <Num>{st.bestWin || 0}</Num> yours,{' '}
                      <Num>{st.bestLoss || 0}</Num> its). A run that happened — it says nothing about tonight.
                    </Line>
                  ) : (st.bestWin >= 2 || st.bestLoss >= 2) ? (
                    <Line icon="📆" dim>
                      Longest runs on this record: <Num>{st.bestWin || 0}</Num> nights over the bot,{' '}
                      <Num>{st.bestLoss || 0}</Num> under it. Nights you contested nothing break a run
                      rather than extend it.
                    </Line>
                  ) : null}

                  {/* 📊 WHERE YOU BEAT IT, BY CATEGORY. The question the single
                      number can't answer: you may be genuinely better than it
                      at picking a homer and plainly worse at picking a hit,
                      and the aggregate hides both. Each line prints its own
                      k/n — a 2–0 in HRR is two slots, and it says so. */}
                  {roles.length > 0 && (
                    <div style={{ marginTop: 9 }}>
                      <Line icon="📊">
                        By category
                        {totals.roleN < totals.n && (
                          <> — <Num>{totals.roleN}</Num> of your <Num>{totals.n}</Num> contested slots have a
                            category on file; the older nights were recorded before this split existed and
                            are counted in the scoreline only</>
                        )}:
                      </Line>
                      {roles.map(([k, v]) => {
                        // Clamped: w + l can only exceed n if a stored row was
                        // hand-edited or half-written, and a "–-2 push" is a
                        // worse thing to print than a silently dropped one.
                        const push = Math.max(0, v.n - v.w - v.l)
                        const col = v.w > v.l ? C.green : v.w < v.l ? C.red : C.text2
                        return (
                          <div key={k} style={{
                            display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                            fontSize: 11, color: C.text2, lineHeight: 1.7, marginLeft: 21,
                          }}>
                            <b style={{
                              fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900,
                              color: roleColor(k), border: `1px solid ${roleColor(k)}55`,
                              background: `${roleColor(k)}14`, borderRadius: 6,
                              padding: '1px 6px', minWidth: 58, textAlign: 'center',
                            }}>{roleLabel(k)}</b>
                            <span>
                              <Num color={col}>{v.w}–{v.l}{push ? `–${push}` : ''}</Num> on{' '}
                              <Num>{v.n}</Num> contested — you <Num color={C.green}>{v.mw}/{v.n}</Num>,
                              it <Num color={C.purple}>{v.bw}/{v.n}</Num>
                              {v.n >= 8 && v.l - v.w >= 3 && (
                                <span style={{ color: C.red }}> · the bot owns this one — worth leaving its pick alone</span>
                              )}
                              {v.n >= 8 && v.w - v.l >= 3 && (
                                <span style={{ color: C.green }}> · this is your category</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 🏅 THE REEL. Two calls, one each way. Only decided slots
                      are stored (lib/myPicks.js CALL_CAP), and the bot name is
                      the one snapshotted when you swapped — the name you
                      actually argued with, not whoever the slate landed on by
                      first pitch. */}
                  {best && (
                    <Line icon="🏅" color={C.green}>
                      Best call so far — <b style={{ color: C.text2 }}>{shortDate(best.date)}</b>, a{' '}
                      <b style={{ color: C.text2 }}>{best.c}</b> in{' '}
                      <b style={{ color: roleColor(best.r) }}>{roleLabel(best.r)}</b>: your{' '}
                      <b style={{ color: C.text }}>{best.m || 'pick'}</b> cleared the bar
                      {best.b ? <> and its <b style={{ color: C.text2 }}>{best.b}</b> did not</> : null}.
                    </Line>
                  )}
                  {worst && (
                    <Line icon="🧊" color={C.red}>
                      Worst — <b style={{ color: C.text2 }}>{shortDate(worst.date)}</b>, a{' '}
                      <b style={{ color: C.text2 }}>{worst.c}</b> in{' '}
                      <b style={{ color: roleColor(worst.r) }}>{roleLabel(worst.r)}</b>: its{' '}
                      <b style={{ color: C.text2 }}>{worst.b || 'pick'}</b> cleared and your{' '}
                      <b style={{ color: C.text }}>{worst.m || 'pick'}</b> did not.
                    </Line>
                  )}
                  {(best || worst) && (
                    <Line icon=" " dim>
                      Ranked by how sure you said you were before first pitch: a slot is cleared or it
                      is not, so conviction is the only size a call has.
                    </Line>
                  )}
                </>
              )
            })()}

            {/* The full card, in a sentence. Same three figures the tiles
                carried — your rate, the bot's, and the all-time override
                count — each still printed with its denominator. */}
            <Line icon="🗂">
              Your full card, meaning the bot&apos;s slate with your swaps applied, sits at{' '}
              <Num>{pctTxt(totals.cardMinePct)}</Num> (<Num>{totals.cardMineWon}/{totals.cardMineN}</Num>{' '}
              slots) against its untouched <Num>{pctTxt(totals.cardBotPct)}</Num>{' '}
              (<Num>{totals.cardBotWon}/{totals.cardBotN}</Num>). <Num>{totals.overrides}</Num> override
              {totals.overrides === 1 ? '' : 's'} made all time.
            </Line>

            {/* 🎚 DO YOUR TIERS MEAN ANYTHING — the only reason conviction
                exists. One sentence, in the page's own language, and it stays
                quiet until two tiers have five contested slots each; below
                that any comparison is a coin flip narrating itself. */}
            {(() => {
              const cv = totals.conv || {}
              const tiers = ['lock', 'strong', 'lean']
                .map((k) => ({ k, ...cv[k] }))
                .filter((t) => (t.n || 0) >= 5)
              if (tiers.length < 2) return null
              const rate = (t) => (100 * t.w) / t.n
              const hi = tiers[0], lo = tiers[tiers.length - 1]
              const gap = rate(hi) - rate(lo)
              return (
                <div style={{ fontSize: 11, color: C.text2, marginTop: 9, lineHeight: 1.6 }}>
                  🎚 {gap >= 10 ? (
                    <>Your tiers mean something: <b style={{ color: '#4ade80' }}>{hi.k}s</b> beat the bot{' '}
                      <b style={{ fontFamily: NUM_FONT }}>{rate(hi).toFixed(0)}%</b> of the time against{' '}
                      <b style={{ fontFamily: NUM_FONT }}>{rate(lo).toFixed(0)}%</b> for your {lo.k}s — trust the feeling.</>
                  ) : gap <= -10 ? (
                    <>Uncomfortable but real: your <b style={{ color: '#f87171' }}>{hi.k}s</b> do WORSE than your {lo.k}s
                      ({rate(hi).toFixed(0)}% vs {rate(lo).toFixed(0)}%). The stronger you feel, the more the bot is right.</>
                  ) : (
                    <>Your {hi.k}s and {lo.k}s beat the bot at about the same rate
                      ({rate(hi).toFixed(0)}% vs {rate(lo).toFixed(0)}%) — so far the tier is decoration, which is
                      worth knowing before you size a bet on one.</>
                  )}
                </div>
              )
            })()}

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

      {/* ── 🎮 WHAT'S RIDING TONIGHT ────────────────────────────────────────
          The record says how you've done. This says what is on the line right
          now, which is the question you actually open the tab with before
          first pitch — and it was the one thing the page never answered.

          It is a sentence and a row of names, not a tile strip: how many slots
          you've taken, how many are still yours to change, how many have
          frozen, and what has come back so far tonight. The four ungradeable
          states stay separate here too — a void is not a miss and an untracked
          name was never being watched. */}
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${tonight.rows.length ? C.cyan : C.border2}`,
        borderRadius: 12, padding: '11px 14px', marginBottom: 12,
      }}>
        {tonight.rows.length ? (
          <>
            <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.65 }}>
              <b style={{ fontSize: 12.5, color: C.text }}>🎮 Riding tonight</b> —{' '}
              <Num color={C.cyan}>{tonight.rows.length}</Num> slot
              {tonight.rows.length === 1 ? '' : 's'} across <Num>{tonight.games}</Num> game
              {tonight.games === 1 ? '' : 's'}: <Num>{tonight.locked}</Num> already frozen,{' '}
              <Num>{tonight.open}</Num> still open to change.
              {tonight.contested > 0 && (
                <> Graded so far: <Num color={C.green}>you {tonight.w}</Num>,{' '}
                  <Num color={C.purple}>the bot {tonight.l}</Num>
                  {tonight.t ? <>, <Num>{tonight.t}</Num> push{tonight.t === 1 ? '' : 'es'}</> : null}{' '}
                  on <Num>{tonight.contested}</Num> contested slot{tonight.contested === 1 ? '' : 's'}.</>
              )}
              {tonight.pending > 0 && (
                <> <Num>{tonight.pending}</Num> of your slots {tonight.pending === 1 ? 'is' : 'are'} in
                  games the graded file hasn&apos;t reported on yet.</>
              )}
              {tonight.voided > 0 && (
                <> <Num>{tonight.voided}</Num> void — tracked but never batted, dropped from both
                  sides rather than counted against you.</>
              )}
              {tonight.untracked > 0 && (
                <> <Num>{tonight.untracked}</Num> untracked — no line in tonight&apos;s file to score
                  against, so {tonight.untracked === 1 ? 'it' : 'they'} can never be contested.</>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {tonight.rows.map((r) => {
                const col = roleColor(r.role)
                const live = r.pool?.find((p) => String(p.player_id) === String(r.mine.pid))
                const mark = r.mineOut === true ? '✓' : r.mineOut === false ? '✗' : ''
                const markCol = r.mineOut === true ? C.green : r.mineOut === false ? C.red : C.text3
                return (
                  <button
                    key={slotKey(r.game_pk, r.role)}
                    onClick={() => live && onPlayerClick?.(live)}
                    disabled={!live}
                    title={`${roleLabel(r.role)} — needs ${BAR[r.role]}. Your ${r.mine.conviction || 'strong'}, in for ${r.mine.bot_name || 'the bot’s pick'}.`}
                    style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 6,
                      background: `${col}12`, border: `1px solid ${col}55`, borderRadius: 8,
                      padding: '3px 9px', cursor: live ? 'pointer' : 'default',
                      color: C.text, fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {r.mine.name}
                    <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, color: col, letterSpacing: '.05em' }}>
                      {roleLabel(r.role)} · {(r.mine.conviction || 'strong').toUpperCase()}
                    </span>
                    {mark && <span style={{ color: markCol, fontWeight: 900 }}>{mark}</span>}
                    {r.contested && (
                      <span style={{
                        fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900,
                        color: r.mineOut && !r.botOut ? C.green : !r.mineOut && r.botOut ? C.red : C.text3,
                      }}>
                        {r.mineOut && !r.botOut ? 'WON' : !r.mineOut && r.botOut ? 'LOST' : 'PUSH'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.65 }}>
            <b style={{ fontSize: 12.5, color: C.text2 }}>🎮 Nothing riding tonight</b> — every slot
            below is still the bot&apos;s. Swap one name in and tonight starts counting toward the
            head-to-head; leave them all and the night passes without asking you a question.
          </div>
        )}
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
                    {/* 🎚 HOW SURE ARE YOU. Three words, same as the NFL card,
                        because the payoff is comparing your own tiers later:
                        if your locks hit like your leans, the tier was
                        decoration — and the ledger below will say so. Chips,
                        not a dropdown: changing your mind should be one tap.
                        Frozen with the slot at first pitch. */}
                    {mine && !locked && (
                      <span style={{ display: 'inline-flex', gap: 3 }}>
                        {CONVICTION.map(([k, label, why]) => {
                          const on = (mine.conviction || 'strong') === k
                          return (
                            <button key={k} onClick={() => convict(s, k)} title={why} style={{
                              fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900, letterSpacing: '.05em',
                              padding: '1.5px 6px', borderRadius: 999, cursor: 'pointer',
                              border: `1px solid ${on ? cat.color : C.border}`,
                              background: on ? `${cat.color}22` : 'transparent',
                              color: on ? cat.color : C.text3,
                              textTransform: 'uppercase',
                            }}>{label}</button>
                          )
                        })}
                      </span>
                    )}
                    {mine && locked && (
                      <span title="How sure you were, frozen at first pitch with the slot" style={{
                        fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900, letterSpacing: '.05em',
                        padding: '1.5px 6px', borderRadius: 999, textTransform: 'uppercase',
                        border: `1px solid ${cat.color}66`, color: cat.color, background: `${cat.color}14`,
                      }}>{mine.conviction || 'strong'}</span>
                    )}

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
