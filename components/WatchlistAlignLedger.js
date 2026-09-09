'use client'
import { useEffect, useMemo, useState } from 'react'
import { C } from '../lib/theme'
import MobileFold from './MobileFold'
import { playerId } from '../lib/player'
import { easternToday } from '../lib/data'
import {
  usePeople, slateAlignments,
  readAlignArchive, shiftDateKey, dateDigitRoot, AXIS_META,
} from '../lib/alignments'

// 🔮 MINI ALIGNMENT LEDGER, ON THE WATCHLIST ITSELF (2026-08-18, on request)
//
// Donovan: "if we can get a mini ledger to help show if any of my watchlist
// are starting to align that would be fire." The real cross-check already
// existed — Alignments.js's "⭐ Your watchlist, aligning" panel does exactly
// this — but it only lived inside Combos → 🔮 Alignments, a tab away from
// the watchlist it's checking. This is the SAME cross-check (same engine,
// same day-archive, same Y/T/+1 read), sized down and mounted where the
// watchlist actually lives, so you see it without leaving the tab.
//
// Deliberately NOT wired into Alignments' "build a ticket around these"
// hand-off — that's a Combos-only feature (the alignment justifies a
// ticket the group engine still has to build). Here, clicking a name just
// opens his card, matching how every other row on this tab behaves.
//
// PATTERN WATCHING, NOT EVIDENCE — same rule as the full Alignments view.
// Nothing computed here feeds any score; it's a "some of your names are
// showing the same numbers the last homer run showed" glance, nothing more.
export default function WatchlistAlignLedger({ players = [], watchIds = null, slateDate = '', onPlayerClick }) {
  const { people, loaded } = usePeople(players)
  const model = useMemo(() => slateAlignments(players, people), [players, people, loaded])
  const rows = model?.rows || []
  // 2026-08-30, Donovan: "make the watchlist align better." The panel only
  // ever checked a watched name against ONE daily number (the archive's
  // single leading root) -- everything else about him was invisible. His
  // own BRAID (2+ of his own numbers agreeing with each other -- jersey,
  // birthday, life path, next-HR count, lineup spot, position) is a signal
  // that needs no archive at all and was already computed by
  // slateAlignments for the full Alignments view; it just never made it to
  // this mini panel. Indexed by pid for an O(1) lookup per watched row.
  const braidByPid = useMemo(() => {
    const m = new Map()
    ;(model?.braids || []).forEach((b) => m.set(b.a.pid, b))
    return m
  }, [model])

  // Same 60s soft-poll as Alignments.js — HomerLedger keeps writing today's
  // archive key all night, and a localStorage read has no other way to know
  // that happened.
  const todayKey = slateDate || easternToday()
  const yesterdayKey = shiftDateKey(todayKey, -1)
  const tomorrowKey = shiftDateKey(todayKey, 1)
  const [archiveTick, setArchiveTick] = useState(0)
  // 2026-09-05, Donovan: "I don't understand the Y and the other
  // thing... make it take up less of the page." Quiet names (nothing
  // lit up) carry zero signal by this panel's own rule -- pattern
  // watching, not evidence -- so they default to hidden instead of
  // padding the page as 30-odd dimmed chips. One tap reveals them.
  const [showQuiet, setShowQuiet] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setArchiveTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const yesterdayArchive = useMemo(() => readAlignArchive(yesterdayKey), [yesterdayKey, archiveTick])
  const todayArchive = useMemo(() => readAlignArchive(todayKey), [todayKey, archiveTick])
  const tomorrowRoot = useMemo(() => dateDigitRoot(tomorrowKey), [tomorrowKey])

  const watchedRows = useMemo(() => {
    if (!watchIds || !watchIds.size || !rows.length) return []
    return rows.filter((a) => watchIds.has(playerId(a.p))).map((a) => {
      // Which axis actually explains each hit, not just that one exists --
      // "Y" used to mean nothing more than "some number of his matched
      // something" with no way to know which. axisFor() finds the first
      // axis key whose value equals the given root, for the tooltip.
      const axisFor = (root) => Object.entries(a.axes).find(([, v]) => v === root)?.[0]
      const yAxis = yesterdayArchive?.topRoot ? axisFor(yesterdayArchive.topRoot.root) : null
      const tAxis = todayArchive?.topRoot ? axisFor(todayArchive.topRoot.root) : null
      const p1Axis = tomorrowRoot != null ? axisFor(tomorrowRoot) : null
      const hitsYesterday = !!yAxis
      const hitsToday = !!tAxis
      const hitsTomorrow = !!p1Axis
      const braid = braidByPid.get(a.pid) || null
      return {
        a, hitsYesterday, hitsToday, hitsTomorrow, braid,
        any: hitsYesterday || hitsToday || hitsTomorrow || !!braid,
        tip: [
          yAxis && `Y: ${AXIS_META[yAxis]?.why(a) || yAxis}`,
          tAxis && `T: ${AXIS_META[tAxis]?.why(a) || tAxis}`,
          p1Axis && `+1: ${AXIS_META[p1Axis]?.why(a) || p1Axis}`,
          braid && `own numbers agree: ${braid.keys.map((k) => AXIS_META[k]?.label || k).join(' + ')} all root to ${braid.root}`,
        ].filter(Boolean).join(' · ') || 'no alignment yet',
      }
    })
  }, [watchIds, rows, yesterdayArchive, todayArchive, tomorrowRoot, braidByPid])

  // No watchlist, or no slate loaded to check it against — nothing to show,
  // and unlike the full Alignments view this is a secondary panel, so it
  // stays silent rather than posting an explainer with nothing behind it.
  if (!watchIds || !watchIds.size || !rows.length) return null

  const anyAligning = watchedRows.some((w) => w.any)
  const aligningCount = watchedRows.filter((w) => w.any).length

  // 2026-09-05, Donovan: "make it better and collapsible." Two problems with
  // the old panel: it was an always-open wall of every watched name, quiet
  // ones and hits mixed together in whatever order the slate happened to
  // list them; and it had no fold at all, so a 36-name watchlist cost you a
  // full screen of chips even on a dead night. Fixed both:
  //   · richest hit first — sort by how many things actually lit up (Y/T/+1
  //     plus the braid), so the names worth looking at aren't buried in the
  //     "·" rows
  //   · MobileFold (same component every other board on the site folds
  //     with) — its summary line carries the headline ("3 of 36 aligning
  //     tonight") whether the panel is open or closed, and it opens itself
  //     automatically the moment there's something to see, closed the rest
  //     of the time. rememberKey means a manual open/close survives past
  //     that default on the next visit.
  const hitCount = (w) => (w.hitsYesterday ? 1 : 0) + (w.hitsToday ? 1 : 0) + (w.hitsTomorrow ? 1 : 0) + (w.braid ? 1 : 0)
  const sortedRows = [...watchedRows]
    .map((w) => ({ ...w, hits: hitCount(w) }))
    .sort((x, y) => y.hits - x.hits || x.a.name.localeCompare(y.a.name))

  const summary = watchedRows.length === 0
    ? 'no saved hitters on tonight’s slate'
    : aligningCount > 0
      ? `${aligningCount} of ${watchedRows.length} aligning tonight`
      : `${watchedRows.length} watched · none aligning yet`

  return (
    <MobileFold
      title="🔮 Alignment ledger"
      summary={summary}
      count={aligningCount || null}
      accent={anyAligning ? C.orange : C.text3}
      always
      defaultOpen={aligningCount > 0}
      rememberKey="moonshot_watch_align_fold_v1"
    >
    <div style={{
      border: `1px solid ${anyAligning ? C.orange + '77' : C.border}`,
      background: anyAligning ? 'rgba(249,115,22,.06)' : C.bg2,
      borderRadius: 10, padding: '9px 13px', marginBottom: 10,
    }}>
      <div style={{ fontSize: 9, color: C.text3, marginBottom: 4 }}>pattern watching, not evidence — feeds no score</div>
      {watchedRows.length === 0 ? (
        <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
          None of your saved hitters are on tonight&apos;s slate — nothing to cross-check yet.
        </div>
      ) : (
        <>
          {/* PLAIN ENGLISH, NO LETTER CODES (2026-09-05). The old legend
              spelled out Y / T / +1 / 🧬 as if they were a key you had to
              memorize before the panel meant anything; Donovan: "I don't
              understand the Y and the other thing." The exact match still
              lives in each name's hover title — this just stops requiring
              you to learn a code to read the row at a glance. */}
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5, marginBottom: 6 }}>
            A name lights up when his own jersey / birthday / life-path numbers echo something from
            the last few days — hover a name for exactly which. More dots, more of them lining up.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {(showQuiet ? sortedRows : sortedRows.filter((w) => w.any)).map(({ a, any, tip, hits }) => (
              <button key={a.pid} onClick={() => onPlayerClick?.(a.p)}
                title={`${a.name} — ${tip} — click to open his card`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                  border: `1px solid ${any ? C.orange + '55' : C.border}`,
                  background: any ? 'rgba(249,115,22,.08)' : 'transparent', color: C.text2,
                  opacity: any ? 1 : 0.6,
                }}>
                {a.name}
                {any && (
                  <span style={{ color: C.orange, fontSize: 8, marginLeft: 5, letterSpacing: '1px' }}>
                    {'●'.repeat(Math.min(hits, 3))}
                  </span>
                )}
              </button>
            ))}
            {aligningCount < watchedRows.length && (
              <button onClick={() => setShowQuiet((v) => !v)} style={{
                padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5, fontWeight: 700,
                border: `1px dashed ${C.border2}`, background: 'transparent', color: C.text3,
              }}>
                {showQuiet ? '– hide the quiet ones' : `+${watchedRows.length - aligningCount} quiet, not shown`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
    </MobileFold>
  )
}
