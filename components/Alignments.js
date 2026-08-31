'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, mlbId, playerId } from '../lib/player'
import { easternToday } from '../lib/data'
import {
  usePeople, slateAlignments, AXIS_META, alignedWith,
  readAlignArchive, shiftDateKey, dateDigitRoot,
} from '../lib/alignments'

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 ALIGNMENTS — where the numerology fully lives and breathes
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan: "especially in combos, i think that's where it should fully live
// and breathe." So this is a VIEW in Combos, not a strip on someone else's
// panel: the whole slate through every axis at once — gematria-style digit
// roots over next homer, jersey, birth day, life path, batting order and
// fielding position, plus the name families — with the ledger's own honesty
// copy carried over word for word where it applies.
//
// AND IT FEEDS THE BUILDER. Every hitter here can be checked, and the button
// hands the checked names to the Builder view as anchors — the alignment is
// the reason you noticed him; the ticket is still built by the group engine
// under all its normal rules. The two claims never blur: alignment is watched,
// the ticket is measured.

const ROOT_COLORS = ['', '#f97316', '#f59e0b', '#22d3ee', '#4ade80', '#a78bfa', '#f87171', '#60a5fa', '#FCD34D', '#c084fc']

export default function Alignments({ players = [], watchIds = null, slateDate = '', onPlayerClick, onBuildAround }) {
  const { people, loaded } = usePeople(players)
  const [picked, setPicked] = useState(() => new Set())
  const [openRoot, setOpenRoot] = useState(null)

  const model = useMemo(() => slateAlignments(players, people), [players, people, loaded])
  const { rows, clubs, totalMemberships, braids, names } = model

  // ── THE ARCHIVE, READ (2026-08-18) ────────────────────────────────────────
  // Donovan: "show daily number for today and yesterday['s] number that hit a
  // lot or aligned the most the night before... help see if the players on
  // watch list are aligned or aligning number for today yesterday and the
  // next day." HomerLedger.js is the WRITER (it's the only place with real
  // graded homers to learn from); this reads back what it wrote. Polled
  // rather than read once, because HomerLedger keeps updating today's key all
  // night and this view has no other way to know that happened — it's a
  // localStorage read, not a subscription. 60s matches the cadence of the
  // site's other soft pollers (Games.js's lineup watch).
  const todayKey = slateDate || easternToday()
  const yesterdayKey = shiftDateKey(todayKey, -1)
  const tomorrowKey = shiftDateKey(todayKey, 1)
  const [archiveTick, setArchiveTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setArchiveTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const yesterdayArchive = useMemo(() => readAlignArchive(yesterdayKey), [yesterdayKey, archiveTick])
  const todayArchive = useMemo(() => readAlignArchive(todayKey), [todayKey, archiveTick])
  const tomorrowRoot = useMemo(() => dateDigitRoot(tomorrowKey), [tomorrowKey])
  // ── TONIGHT'S NUMBER, AND WHO CARRIES IT (2026-08-31) ─────────────────────
  // Donovan: "you mus give us preditcution using the numeroly reductions."
  // alignedWith() returns the expected counts in the same call as the actual
  // ones, which is the only way this can be shown without inventing a signal
  // out of long division. See its note in lib/alignments.js.
  const todayRoot = useMemo(() => dateDigitRoot(todayKey), [todayKey])
  const tonight = useMemo(() => alignedWith(todayRoot, rows), [todayRoot, rows])

  // Every watched hitter who's actually on tonight's slate, with the three
  // day-roots checked against his OWN axes (jersey/birthday/life-path — none
  // of which change day to day, so "does he line up with tomorrow" is
  // answerable before tomorrow's roster even exists).
  const watchedRows = useMemo(() => {
    if (!watchIds || !watchIds.size) return []
    return rows.filter((a) => watchIds.has(playerId(a.p))).map((a) => {
      const ownRoots = new Set(Object.values(a.axes).filter((v) => v != null))
      const hitsYesterday = yesterdayArchive?.topRoot && ownRoots.has(yesterdayArchive.topRoot.root)
      const hitsToday = todayArchive?.topRoot && ownRoots.has(todayArchive.topRoot.root)
      const hitsTomorrow = tomorrowRoot != null && ownRoots.has(tomorrowRoot)
      return { a, hitsYesterday, hitsToday, hitsTomorrow, any: hitsYesterday || hitsToday || hitsTomorrow }
    })
  }, [watchIds, rows, yesterdayArchive, todayArchive, tomorrowRoot])

  const toggle = (pid) => setPicked((v) => {
    const next = new Set(v)
    if (next.has(pid)) next.delete(pid); else next.add(pid)
    return next
  })
  const pickedRows = rows.filter((a) => picked.has(a.pid))

  // Concentration against the arithmetic share: each root's expected share of
  // memberships is ~1/9. Quoted as ×, with the count and denominator.
  const ranked = [...clubs].sort((a, b) => b.count - a.count)
  const expected = totalMemberships / 9

  if (!rows.length) return <div style={{ fontSize: 11.5, color: C.text3 }}>No slate loaded yet.</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>🔮 Tonight&apos;s alignments</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} hitters · seven axes, one reduction · {loaded ? 'birthdays + positions loaded' : 'loading birthdays + positions…'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.65, maxWidth: 860, marginBottom: 10 }}>
        Every number a hitter carries — the <b style={{ color: C.text2 }}>homers he is sitting on</b>, his{' '}
        <b style={{ color: C.text2 }}>next homer</b>, his{' '}
        <b style={{ color: C.text2 }}>jersey</b>, his <b style={{ color: C.text2 }}>birth day</b>, his{' '}
        <b style={{ color: C.text2 }}>life path</b>, where he <b style={{ color: C.text2 }}>bats</b> and where he{' '}
        <b style={{ color: C.text2 }}>fields</b> — reduced the same way: add the digits until one is left (17 → 8).
        {' '}Pattern watching, not evidence: ~{rows.length} hitters over nine roots put ~{Math.round(expected)} memberships
        in every club by arithmetic alone, so read the <b style={{ color: C.text2 }}>×</b> against that share, not the raw count.
        Fun to track, never a reason to bet — nothing here feeds any score. Check names as you go and hand them to the builder.
      </div>

      {/* ── TONIGHT'S NUMBER (2026-08-31) ─────────────────────────────────
          Donovan: "you mus give us preditcution using the numeroly
          reductions as well like the 1 can be differcn combos of season hr
          nummbers i like that it highlight the specific number like 10 but
          numberolgy speaking its a 1 or like 19th thats a 1."

          Two things in that, and both are here. The season-HR count is a new
          axis (lib/alignments.js) — it used to reduce only his NEXT homer,
          which is a different number and usually a different root, so a man on
          18 carried a 9 and was chasing a 1 and no club could see both. And
          every chip prints the RAW number beside the root, because 10 and 19
          reaching the same 1 IS the thing being looked at; a screen showing
          only the 1 has thrown away the half he wanted to see.

          The expected count sits in the same sentence as the actual one, on
          purpose. Seven axes over ~250 hitters is ~1,500 numbers across nine
          roots, so dozens of men carry two on the same root every single
          night — that is what division does, not a finding. This panel says
          who is aligned with tonight's number. It does not say who is going to
          homer, and nothing here feeds any score. */}
      {tonight && tonight.total > 0 && (
        <div style={{
          border: `1px solid ${ROOT_COLORS[todayRoot]}55`, borderRadius: 11,
          background: `${ROOT_COLORS[todayRoot]}0d`, padding: '9px 12px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: ROOT_COLORS[todayRoot] }}>
              🔮 TONIGHT&apos;S NUMBER IS {todayRoot}
            </span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              {todayKey} reduces to {todayRoot} · {tonight.twoPlus} hitter{tonight.twoPlus === 1 ? '' : 's'} carry
              it on two or more of their own numbers
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, margin: '4px 0 7px' }}>
            Expect about <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{Math.round(tonight.expectedTwoPlus)}</b>{' '}
            of those by arithmetic alone on a slate this size, so{' '}
            {tonight.twoPlus > tonight.expectedTwoPlus * 1.25
              ? <>tonight is running <b style={{ color: ROOT_COLORS[todayRoot] }}>above</b> its share</>
              : tonight.twoPlus < tonight.expectedTwoPlus * 0.8
                ? <>tonight is running <b style={{ color: C.text2 }}>below</b> its share</>
                : <>tonight is <b style={{ color: C.text2 }}>about normal</b></>}
            {' '}— which is the honest read on nearly every night. Raw number → root on every chip.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {tonight.members.filter((m) => m.strength >= 2).slice(0, 24).map(({ a, keys, strength }) => (
              <button key={a.pid} onClick={() => toggle(a.pid)}
                title={`${keys.map((k) => AXIS_META[k].why(a)).join(' · ')} — all reducing to ${todayRoot}. Bot HR score ${a.hrScore.toFixed(0)}. Click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list.`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                  border: `1px solid ${picked.has(a.pid) ? C.orange : `${ROOT_COLORS[todayRoot]}55`}`,
                  background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                }}>
                {a.name}
                <span style={{ color: ROOT_COLORS[todayRoot], fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900 }}>
                  {' '}{strength}×
                </span>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>
                  {' '}{keys.map((k) => {
                    const raw = AXIS_META[k].raw ? AXIS_META[k].raw(a) : null
                    return raw ? `${AXIS_META[k].label} ${raw}→${todayRoot}` : `${AXIS_META[k].label}→${todayRoot}`
                  }).join(' · ')}
                </span>
              </button>
            ))}
            {tonight.twoPlus > 24 && (
              <span style={{ fontSize: 9.5, color: C.text3 }}>+{tonight.twoPlus - 24} more</span>
            )}
          </div>
        </div>
      )}

      {/* ── THE DAYS — yesterday's actual root, today's so far, tomorrow's
          date (2026-08-18). Everything above this is the PREGAME slate,
          projecting who might align before a single ball has flown. This is
          the only place on the page looking at what actually happened —
          yesterday and tonight-so-far both come from HomerLedger's real
          graded homers, archived by date (see lib/alignments.js). Per-browser
          storage, said plainly rather than implied. */}
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2,
        padding: '9px 13px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: C.text2, marginBottom: 6 }}>
          📅 Yesterday · Today · Tomorrow
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Yesterday, actually</div>
            {yesterdayArchive?.topRoot ? (
              <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 2 }}>
                Root <b style={{ color: ROOT_COLORS[yesterdayArchive.topRoot.root], fontFamily: NUM_FONT, fontSize: 13 }}>{yesterdayArchive.topRoot.root}</b> hit
                the most — {yesterdayArchive.topRoot.names.slice(0, 6).join(', ')}
                {yesterdayArchive.topRoot.names.length > 6 && ` +${yesterdayArchive.topRoot.names.length - 6} more`}.
                {yesterdayArchive.aligned?.length > 0 && (
                  <> {yesterdayArchive.aligned.length} hitter{yesterdayArchive.aligned.length === 1 ? '' : 's'} aligned two ways or more.</>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: C.text3, marginTop: 2, lineHeight: 1.5 }}>
                No archive from yesterday on this browser — either nothing cleared the bar, or this browser
                wasn&apos;t open for it. It fills in on its own once a night runs with this tab open.
              </div>
            )}
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Tonight, so far</div>
            {todayArchive?.topRoot ? (
              <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 2 }}>
                Root <b style={{ color: ROOT_COLORS[todayArchive.topRoot.root], fontFamily: NUM_FONT, fontSize: 13 }}>{todayArchive.topRoot.root}</b> leads
                so far — {todayArchive.topRoot.names.slice(0, 6).join(', ')}
                {todayArchive.topRoot.names.length > 6 && ` +${todayArchive.topRoot.names.length - 6} more`}.
                {' '}(off {todayArchive.total} homer{todayArchive.total === 1 ? '' : 's'} — the HR Ledger has the live count.)
              </div>
            ) : (
              <div style={{ fontSize: 10, color: C.text3, marginTop: 2, lineHeight: 1.5 }}>
                Nothing&apos;s landed yet tonight — this fills in the moment the first ball leaves the yard
                (the HR Ledger, in Pairs &amp; Pools, tracks it live).
              </div>
            )}
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Tomorrow&apos;s date</div>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 2 }}>
              {tomorrowKey} reduces to root <b style={{ color: ROOT_COLORS[tomorrowRoot], fontFamily: NUM_FONT, fontSize: 13 }}>{tomorrowRoot}</b>.
              A hitter&apos;s jersey, birthday and life path don&apos;t change day to day, so anyone whose own
              numbers land on {tomorrowRoot} is worth a glance once tomorrow&apos;s slate loads — see your
              watchlist below.
            </div>
          </div>
        </div>
      </div>

      {/* ── YOUR WATCHLIST, CROSS-CHECKED (2026-08-18) ─────────────────────
          Donovan: "it also helps to see if the players on watch list are
          aligned or aligning number for today yesterday and the next day."
          Only renders with a watchlist AND at least one of those names on
          tonight's slate — an empty watchlist has nothing to cross-check. */}
      {watchIds && watchIds.size > 0 && (
        <div style={{
          border: `1px solid ${watchedRows.some((w) => w.any) ? C.orange + '77' : C.border}`,
          background: watchedRows.some((w) => w.any) ? 'rgba(249,115,22,.06)' : C.bg2,
          borderRadius: 10, padding: '9px 13px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.text2, marginBottom: 4 }}>
            ⭐ Your watchlist, aligning
          </div>
          {watchedRows.length === 0 ? (
            <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
              None of your starred hitters are on tonight&apos;s slate.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, marginBottom: 6 }}>
                Checked against his own jersey / birthday / life-path roots — <b style={{ color: C.orange }}>Y</b> = matches
                yesterday&apos;s leading root, <b style={{ color: C.orange }}>T</b> = today&apos;s so far, <b style={{ color: C.orange }}>+1</b> = tomorrow&apos;s date.
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {watchedRows.map(({ a, hitsYesterday, hitsToday, hitsTomorrow, any }) => (
                  <button key={a.pid} onClick={() => toggle(a.pid)}
                    title={`click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}
                    style={{
                      padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                      border: `1px solid ${picked.has(a.pid) ? C.orange : any ? C.orange + '55' : C.border}`,
                      background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                    }}>
                    {a.name}
                    {hitsYesterday && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5 }}>Y</span>}
                    {hitsToday && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>T</span>}
                    {hitsTomorrow && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>+1</span>}
                    {!any && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5 }}>·</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── THE CLUBS — nine roots, concentration stated ─────────────────── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {ranked.map((c) => {
          const x = expected > 0 ? c.count / expected : 0
          const on = openRoot === c.root
          return (
            <button key={c.root} onClick={() => setOpenRoot(on ? null : c.root)} style={{
              padding: '5px 12px', borderRadius: 9, cursor: 'pointer',
              border: `1px solid ${on ? ROOT_COLORS[c.root] : C.border}`,
              background: on ? `${ROOT_COLORS[c.root]}18` : C.bg2,
              color: C.text2, fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800,
            }}
              title={`Root ${c.root}: ${c.count} memberships across all seven axes, against ~${Math.round(expected)} expected by arithmetic. ${x >= 1.25 ? 'Running above its share tonight.' : x <= 0.8 ? 'Running below its share.' : 'About its arithmetic share.'}`}>
              <span style={{ color: ROOT_COLORS[c.root], fontSize: 13 }}>{c.root}</span>
              {' '}{c.count}
              <span style={{ color: x >= 1.25 ? ROOT_COLORS[c.root] : C.text3, fontSize: 9 }}> {x.toFixed(2)}×</span>
            </button>
          )
        })}
      </div>
      {openRoot && (() => {
        const c = clubs.find((k) => k.root === openRoot)
        const members = [...c.members].sort((a, b) => (b.axisKeys.length - a.axisKeys.length) || (b.a.hrScore - a.a.hrScore))
        return (
          <div style={{ border: `1px solid ${ROOT_COLORS[openRoot]}44`, background: `${ROOT_COLORS[openRoot]}0a`, borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: ROOT_COLORS[openRoot], marginBottom: 5 }}>
              THE {openRoot} CLUB · {members.length} hitters
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {members.slice(0, 40).map(({ a, axisKeys }) => (
                <button key={a.pid} onClick={() => toggle(a.pid)}
                  title={`${axisKeys.map((k) => AXIS_META[k].why(a)).join(' · ')} · bot HR score ${a.hrScore.toFixed(0)} · click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}
                  style={{
                    padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                    border: `1px solid ${picked.has(a.pid) ? C.orange : C.border}`,
                    background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                  }}>
                  {a.name}
                  {/* Raw number → root, not just the axis name. "season HR
                      19→1" is the read; "season HR" alone is a label. */}
                  <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>
                    {' '}{axisKeys.map((k) => {
                      const raw = AXIS_META[k].raw ? AXIS_META[k].raw(a) : null
                      return raw ? `${AXIS_META[k].label} ${raw}→${openRoot}` : AXIS_META[k].label
                    }).join(' · ')}
                  </span>
                </button>
              ))}
              {members.length > 40 && <span style={{ fontSize: 9.5, color: C.text3 }}>+{members.length - 40} more</span>}
            </div>
          </div>
        )
      })()}

      {/* ── FULL BRAIDS — his own numbers agree with each other ──────────── */}
      {braids.length > 0 && (
        <div style={{ border: `1px solid rgba(192,132,252,.3)`, background: 'rgba(192,132,252,.06)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#c084fc', marginBottom: 2 }}>
            🧬 FULL BRAIDS · {braids.length} hitters whose own numbers agree
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            Two or more of a man&apos;s OWN axes on one root — jersey, birthday, next homer, spot, position braided
            together. The rarest read here, and still arithmetic: click for every strand.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {braids.slice(0, 24).map(({ a, root, keys, strength }) => (
              <button key={a.pid} onClick={() => toggle(a.pid)}
                title={`Root ${root}: ${keys.map((k) => AXIS_META[k].why(a)).join(' · ')} · HR score ${a.hrScore.toFixed(0)} · click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                  border: `1px solid ${picked.has(a.pid) ? C.orange : strength >= 3 ? '#c084fc' : C.border}`,
                  background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                }}>
                {a.name}
                <span style={{ color: ROOT_COLORS[root], fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900 }}> {root}</span>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>×{strength}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── NAME CONNECTIONS ─────────────────────────────────────────────── */}
      {names.length > 0 && (
        <div style={{ border: `1px solid rgba(34,211,238,.28)`, background: 'rgba(34,211,238,.05)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.cyan, marginBottom: 2 }}>
            🔤 NAME CONNECTIONS · {names.length} families on the slate
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            Shared surnames (2+) and first names (3+ — pairs of a common first name are arithmetic, not a pattern).
            The ledger&apos;s echo panel grades these against the night once homers land; this is the pregame roster of them.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {names.slice(0, 8).map((f) => (
              <div key={`${f.kind}-${f.key}`} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6 }}>
                <b style={{ color: C.cyan, fontFamily: NUM_FONT }}>{f.key.toUpperCase()}</b>
                <span style={{ color: C.text3 }}> ({f.kind === 'first' ? 'first name' : 'surname'}, {f.list.length}) — </span>
                {f.list.map((a, i) => (
                  <span key={a.pid}>
                    {i > 0 && ' · '}
                    <span onClick={() => toggle(a.pid)}
                      style={{ cursor: 'pointer', fontWeight: 700, color: picked.has(a.pid) ? C.orange : C.text }}
                      title={`click to ${picked.has(a.pid) ? 'remove from' : 'add to'} your build list`}>
                      {a.name}
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HAND-OFF TO THE BUILDER ──────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        border: `1px solid ${pickedRows.length ? C.orange : C.border}`, borderRadius: 10,
        background: C.bg2, padding: '7px 11px',
      }}>
        <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: pickedRows.length ? C.orange : C.text3, fontWeight: 800 }}>
          {pickedRows.length ? `${pickedRows.length} PICKED` : 'CLICK NAMES TO COLLECT THEM'}
        </span>
        {pickedRows.map((a) => (
          <span key={a.pid} style={{ fontSize: 10, color: C.text2 }}>{a.name}</span>
        ))}
        <button
          disabled={!pickedRows.length}
          onClick={() => onBuildAround?.(pickedRows.map((a) => a.p))}
          style={{
            marginLeft: 'auto', padding: '5px 13px', borderRadius: 999,
            cursor: pickedRows.length ? 'pointer' : 'default', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${pickedRows.length ? C.orange : C.border}`,
            background: pickedRows.length ? 'rgba(249,115,22,.14)' : 'transparent',
            color: pickedRows.length ? C.orange : C.text3,
          }}>
          🧱 Build a ticket around {pickedRows.length ? `these ${pickedRows.length}` : 'them'} →
        </button>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.55 }}>
        The alignment is why you noticed him; the ticket is still built by the group engine under its normal
        measured rules. The two claims never mix — a braid is watched, a ticket is graded.
      </div>
    </div>
  )
}
