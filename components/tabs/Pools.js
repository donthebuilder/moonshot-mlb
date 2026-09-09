'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, arr } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import PairBuilder from '../PairBuilder'
// Defined in the Pairs tab and shared, not duplicated. The two tabs are asking
// the same question at two sizes — a pair is a two-leg pool — and a second
// copy of this logic is how the two would end up disagreeing about what a
// group's measured rate is. Pairs does not import Pools, so there is no cycle.
import { GroupTicketBuilder } from './Pairs'
import { downloadPoolsCard } from '../shareCard'

// Pools — the bot's group tickets, plus the pair builder.
//
// THE TICKET BUILDER THAT USED TO FILL THIS PAGE IS GONE (2026-08-04, on
// request). It deserved to go: its calibration bands were honest but too
// coarse to be usable — the HR band table mapped scores 55–70 to one flat
// 15.3%, so the candidate list showed twenty hitters in a row with identical
// "hit rates" and a sort on that column did nothing. Honest data presented at
// a resolution where it stops informing anything is indistinguishable from a
// broken page, and it read as one.
//
// What stays is what the bot actually publishes: its 3/4/6-man pools, graded
// live as games finish, and the pair builder (moved here from Pairs) for
// constructing your own two-man around an anchor.

// Live graded pools — pair_pool_results.graded_pools carries members and
// homer_names, same structure Results shows.
// pool members carry names (and sometimes ids); resolve back to the slate
// row so a tap opens the full modal (2026-08-08, Donovan: "make sure on the
// live pools I can click the players to see their modal")
const _pnorm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const makeResolver = (players) => {
  const byId = new Map(players.map((p) => [String(p?.player_id ?? p?.id), p]))
  const byName = new Map(players.map((p) => [_pnorm(p?.name || p?.player_name), p]))
  return (mb) => byId.get(String(mb?.player_id ?? '')) || byName.get(_pnorm(mb?.name)) || null
}

function PoolLadder({ hit = 0, total = 4, estimated2 = null, live = false }) {
  const tot = Math.max(1, Number(total) || 4)
  // A 3-man pool's "3+" and its "3/3" are the same event, and drawing them as
  // two rungs makes the ladder claim a step that does not exist. The strong
  // rung only appears when there is something above it.
  const steps = [
    { key: '1+', label: '1+', sub: 'tracked', on: hit >= 1, color: C.orange },
    { key: '2+', label: '2+', sub: 'target', on: hit >= Math.min(2, tot), color: C.green },
    ...(tot > 3 ? [{ key: '3+', label: '3+', sub: 'strong', on: hit >= 3, color: C.cyan }] : []),
    { key: 'perfect', label: `${tot}/${tot}`, sub: 'perfect', on: hit >= tot, color: C.yellow },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 4, marginTop: 8 }}>
      {steps.map((step) => (
        <div key={step.key} title={step.key === '2+' && Number.isFinite(estimated2) ? `Pregame estimate for 2+: ${(100 * estimated2).toFixed(1)}%` : `${step.label} ${step.sub}`}
          style={{
            minHeight: 34, borderRadius: 7, border: `1px solid ${step.on ? step.color + '88' : C.border}`,
            background: step.on ? `${step.color}18` : 'rgba(255,255,255,.025)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          }}>
          <b style={{ fontSize: 10.5, color: step.on ? step.color : C.text3, fontFamily: NUM_FONT }}>{step.label}</b>
          <span style={{ fontSize: 7.5, color: C.text3, fontFamily: NUM_FONT }}>
            {step.key === '2+' && Number.isFinite(estimated2) && !live ? `${(100 * estimated2).toFixed(1)}%` : step.sub}
          </span>
        </div>
      ))}
    </div>
  )
}

function LivePools({ results, players = [], onPlayerClick }) {
  const pools = (results?.pair_pool_results?.graded_pools) || []
  const resolve = makeResolver(players)
  if (!pools.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Live pools</div>
        {/* 📸 SHARE (2026-08-23) — zero-backend PNG export, same canvas
            mechanism as the Watchlist/Player cards. */}
        <button onClick={() => downloadPoolsCard(pools, { title: 'LIVE POOLS', graded: true })}
          title="Download the live pools as a PNG for posting"
          aria-label="Download pools as image"
          style={{
            marginLeft: 'auto', background: 'rgba(249,115,22,.10)', border: `1px solid ${C.border}`,
            color: C.orange, borderRadius: 7, padding: '2px 9px', fontSize: 10.5, fontWeight: 700,
            cursor: 'pointer',
          }}>📸</button>
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
        The bot&apos;s group tickets, graded as games finish. A pool now needs{' '}
        <b style={{ color: C.text2 }}>at least two homers</b> to hit. The full ladder stays visible:
        {' '}2-of-4 is a hit, 3-of-4 is strong, and 4-of-4 is perfect. One homer is tracked,
        but it is not graded as a win.
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {pools.map((pl, i) => {
          const hit = n(pl.hr_count, 0)
          // Show the published roster denominator. `total_count` is the
          // number of active/finished legs and made a four-name pool display
          // as 0/1 while games were still in progress.
          const tot = Math.max(1, (pl.players || []).length || n(pl.total_count, 0))
          const bar = n(pl.bar, Math.min(2, tot))
          const done = hit >= bar
          const perfect = hit >= tot
          const grade = perfect ? 'PERFECT' : hit >= 3 ? `3/${tot} STRONG` : done ? `2/${tot} HIT` : ''
          const col = done ? '#4ade80' : hit > 0 ? C.orange : C.border
          const homered = new Set((pl.homer_names || []).map((x) => String(x || '').toLowerCase()))
          return (
            <div key={i} style={{
              background: hit > 0
                ? `linear-gradient(155deg, ${col}14, ${col}04)`
                : C.bg2,
              border: `1px solid ${col}55`, borderRadius: 10, padding: '9px 12px',
              boxShadow: hit > 0 ? `0 0 16px ${col}22` : 'none',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* progress bar along the bottom edge — the pool's pulse */}
              <div style={{
                position: 'absolute', left: 0, bottom: 0, height: 3,
                width: `${Math.min(100, (100 * hit) / tot)}%`, background: col,
                boxShadow: `0 0 8px ${col}`, transition: 'width .3s',
              }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{pl.label}</span>
                {done && (
                  <span title={perfect ? 'Every member went deep' : `Cleared the bar: ${bar}+ of ${tot}`}
                    style={{ fontSize: 9, fontWeight: 900, color: '#4ade80' }}>
                    {grade}
                  </span>
                )}
                <span title={`${hit} of ${tot} homered · the bar is ${bar}+`} style={{
                  marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 12,
                  fontWeight: 800, color: col === C.border ? C.text3 : col,
                }}>{hit}/{tot} HR <span style={{ fontSize: 9, color: C.text3, fontWeight: 600 }}>· need {bar}</span></span>
              </div>
              <PoolLadder hit={hit} total={tot} live />
              {/* GRID, not flow (2026-08-06): inline-wrapped names broke mid-
                  list and left orphans hanging off the line. Two even columns,
                  every name on its own line slot. */}
              {/* .pool-names is a phone hook only. Two columns of names is the
                  right desktop density; on a portrait phone each column is
                  ~165px and the names — the entire content of a pool — start
                  ellipsising. MobileCSS stacks them to one column and gives
                  each clickable name a thumb-sized row. */}
              <div className="pool-names" style={{ display: 'grid', gap: '3px 10px', marginTop: 6, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {(pl.players || []).map((mb, j) => {
                  const gone = homered.has(String(mb?.name || '').toLowerCase())
                  const row = resolve(mb)
                  return (
                    <span key={j}
                      onClick={row ? () => onPlayerClick?.(row) : undefined}
                      title={row ? 'open his card' : undefined}
                      style={{
                        fontSize: 10.5, lineHeight: 1.5, minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        color: gone ? '#4ade80' : row ? C.text2 : C.text3,
                        fontWeight: gone ? 700 : 400,
                        cursor: row ? 'pointer' : 'default',
                        textDecoration: row ? 'underline dotted rgba(255,255,255,.18)' : 'none',
                        textUnderlineOffset: 3,
                      }}>{gone ? '💥 ' : ''}{mb?.name}</span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PRE-LOCK POOL CHANGE TRACKING (2026-08-19, Donovan: "the pools should
// show who changed around if they changed before the firstpitch lock...
// [I saw a] picture of the page in action same day [and] you see how they
// are different[.] that cant happen. how and why[?] then fix.") ───────────
//
// It CAN happen, and here's the why: SlatePools renders whatever
// pair_builder_latest.json says RIGHT NOW. The bot re-picks these pools as
// its own inputs move pre-lock — odds shift, a lineup posts, a signal flips
// — and Dashboard.js polls that same "latest" file every 45s while a game
// is live and every 5 minutes otherwise (plus fresh on every page load). So
// two honest screenshots of "today's pools," taken minutes apart before
// first pitch, can legitimately show different rosters because the bot
// changed its own pick, not because anything here is broken or stale.
//
// What was actually missing was any SIGN that had happened — a card just
// silently swapped names between one look and the next, which reads exactly
// like a bug even though the data behind it is correct at every instant.
// This remembers each pool's last-seen roster (localStorage, keyed by date
// + pool_key so yesterday's snapshot can never be compared against today's)
// and flags a card the moment a poll brings back a different lineup for the
// same slot — with the old names shown struck through, so "how it's
// different" is answered right on the card instead of requiring two
// screenshots side by side. Stops mattering once a pool grades — LivePools
// takes over after lock, when rosters can no longer move.
const POOL_SNAPSHOT_KEY = 'ms_pool_snapshot_v1'
const rosterSig = (pl) => arr(pl.players).map((mb) => _pnorm(mb?.name)).sort().join(',')

function usePoolSnapshots(all, dayKey) {
  // null = "haven't checked localStorage yet" — deliberately distinct from
  // {} ("checked, nothing saved yet") so the very first render of a brand
  // new day never flags every pool as "changed" against nothing.
  const [prevByKey, setPrevByKey] = useState(null)
  const sig = all.map((pl, i) => `${pl.pool_key || `${pl.kind}-${i}`}=${rosterSig(pl)}`).join('|')

  useEffect(() => {
    if (!all.length || !dayKey) return
    let store = {}
    try { store = JSON.parse(localStorage.getItem(POOL_SNAPSHOT_KEY) || '{}') } catch { /* ignore */ }
    const dayStore = store[dayKey] || {}
    const prev = {}
    const next = {}
    all.forEach((pl, i) => {
      const k = String(pl.pool_key || `${pl.kind}-${i}`)
      prev[k] = dayStore[k]
      next[k] = { sig: rosterSig(pl), names: arr(pl.players).map((mb) => mb?.name).filter(Boolean) }
    })
    setPrevByKey(prev)
    try {
      // Only today's key is rewritten; older days already sitting in the
      // blob are left alone rather than pruned — same "small enough to keep
      // forever" call Alignments' own archive makes (ms_align_archive_*).
      localStorage.setItem(POOL_SNAPSHOT_KEY, JSON.stringify({ ...store, [dayKey]: next }))
    } catch { /* storage full or unavailable — page still works, just won't flag */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` IS the content of `all`
  }, [sig, dayKey])

  return prevByKey
}

// Pre-game fallback: before anything grades, show the same pools from the
// pair-builder file so the page never reads empty. Ungraded on purpose — no
// fake 0/4 progress before first pitch, just the rosters.
function SlatePools({ pairBuilder, players = [], onPlayerClick, slateDate = '' }) {
  const resolve = makeResolver(players)
  const all = [
    ...arr(pairBuilder?.recommended_3mans).map((p) => ({ ...p, kind: '3-man' })),
    ...arr(pairBuilder?.pools_4man).map((p) => ({ ...p, kind: '4-man' })),
    // 6-man retired 2026-08-09 (0 for 320 all-or-nothing); the bot now
    // publishes two 3-mans in its place. Older payloads still carry
    // pools_6man, so it is read and relabelled rather than dropped.
    ...arr(pairBuilder?.pools_3man).map((p) => ({ ...p, kind: '3-man' })),
    ...arr(pairBuilder?.pools_6man).map((p) => ({ ...p, kind: '6-man (retired)' })),
  ]
  const prevByKey = usePoolSnapshots(all, slateDate || 'unknown')
  if (!all.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Tonight&apos;s pools</div>
        {/* 📸 SHARE (2026-08-23) — zero-backend PNG export. */}
        <button onClick={() => downloadPoolsCard(all, { title: "TONIGHT'S POOLS" })}
          title="Download tonight's pools as a PNG for posting"
          aria-label="Download pools as image"
          style={{
            marginLeft: 'auto', background: 'rgba(249,115,22,.10)', border: `1px solid ${C.border}`,
            color: C.orange, borderRadius: 7, padding: '2px 9px', fontSize: 10.5, fontWeight: 700,
            cursor: 'pointer',
          }}>📸</button>
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
        The bot&apos;s group tickets for the slate. Grading appears here live once games start.
        {' '}These re-pick as the bot&apos;s own inputs move before lock — odds, lineups, signals —
        so a name can change here between two visits on the same day. If a pool below has changed
        since you last had this page open, it&apos;s marked <b style={{ color: C.orange }}>🔄 changed</b> with
        who came out.
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {all.map((pl, i) => {
          const k = String(pl.pool_key || `${pl.kind}-${i}`)
          const p2 = Number(pl?.estimated_grade_probability?.['2plus'])
          const prevSnap = prevByKey?.[k]
          const changed = !!(prevSnap && prevSnap.sig !== undefined && prevSnap.sig !== rosterSig(pl))
          const currNorm = new Set(arr(pl.players).map((mb) => _pnorm(mb?.name)))
          const droppedOut = changed ? (prevSnap.names || []).filter((nm) => !currNorm.has(_pnorm(nm))) : []
          return (
          <div key={pl.pool_key || i} style={{
            background: changed ? `linear-gradient(155deg, ${C.orange}12, ${C.bg2})` : C.bg2,
            border: `1px solid ${changed ? C.orange + '66' : C.border}`, borderRadius: 10, padding: '9px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>
                {clean(pl.name || pl.label, `${pl.kind} pool`)}
              </span>
              {changed && (
                <span title={droppedOut.length ? `Since you last looked, out: ${droppedOut.join(', ')}` : 'Roster changed since you last looked'}
                  style={{ fontSize: 9, fontWeight: 900, color: C.orange }}>
                  🔄 changed
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                {pl.kind} · need 2{Number.isFinite(p2) ? ` · est ${(100 * p2).toFixed(1)}%` : ''}
              </span>
            </div>
            <PoolLadder hit={0} total={arr(pl.players).length || (pl.kind === '3-man' ? 3 : 4)} estimated2={Number.isFinite(p2) ? p2 : null} />
            <div style={{ display: 'grid', gap: '3px 10px', marginTop: 6, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {arr(pl.players).map((mb, j) => {
                const row = resolve(mb)
                return (
                  <span key={j}
                    onClick={row ? () => onPlayerClick?.(row) : undefined}
                    title={row ? 'open his card' : undefined}
                    style={{
                      fontSize: 10.5, lineHeight: 1.5, minWidth: 0, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      color: row ? C.text2 : C.text3, cursor: row ? 'pointer' : 'default',
                      textDecoration: row ? 'underline dotted rgba(255,255,255,.18)' : 'none',
                      textUnderlineOffset: 3,
                    }}>{mb?.name}</span>
                )
              })}
            </div>
            {droppedOut.length > 0 && (
              <div style={{ marginTop: 5, fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>
                was also: {droppedOut.map((nm, j) => (
                  <span key={j} style={{ textDecoration: 'line-through', marginRight: 6 }}>{nm}</span>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}

// `odds` and `slateDate` are NEW AND OPTIONAL (2026-08-16) — Dashboard passes
// neither to this tab, and the group builder falls back to fetching the same
// odds_latest.json itself and reading the date off the rows. Existing callers
// are unaffected.
export default function Pools({ players = [], results, pairBuilder, pairHistorySummary, onPlayerClick, odds = null, slateDate = '' }) {
  const hasGraded = (results?.pair_pool_results?.graded_pools || []).length > 0

  return (
    <div>
      <PanelTitle
        title="Pools"
        sub="The bot's group tickets, graded live · build your own below, with a spot reserved for a signal"
      />

      {hasGraded
        ? <LivePools results={results} players={players} onPlayerClick={onPlayerClick} />
        : <SlatePools pairBuilder={pairBuilder} players={players} onPlayerClick={onPlayerClick} slateDate={slateDate} />}

      {!hasGraded && !arr(pairBuilder?.pools_4man).length && !arr(pairBuilder?.pools_3man).length
        && !arr(pairBuilder?.pools_6man).length && !arr(pairBuilder?.recommended_3mans).length && (
        <Empty text="No pools published for this slate yet." />
      )}

      {/* 🧱 THE GROUP BUILDER (2026-08-16, Donovan: "Pairing logic for pairs
          and pools using 2 of the groups or more pick based on the high rate
          signals like the back to back").

          It sits ABOVE the anchor-based PairBuilder rather than replacing it,
          because the two answer different questions and neither is redundant.
          PairBuilder starts from a man and finds him a partner; this starts
          from the MARKETS — cross the bot's HIT designation with its HRR
          designation, narrowed to the hitters carrying a verified signal — and
          it defaults to three legs here because a pool is what this tab is.
          Nothing that was on this page has been removed.

          ROUND TWO, SAME DAY. Donovan: "i feel like a few of the players or
          spots should be dedicated to those specifically... all three to be
          honest i want them incorporated because they holding true." So the
          shared builder now reserves one spot on every pool for a hitter
          carrying a signal, publishes a second pool built entirely out of
          them, and ranks legs by how many they carry before it looks at any
          score. All three live in the shared component and in
          lib/pairEvidence.js, so this tab and Pairs cannot drift apart on what
          a signal is or on what it has measured — which for back-to-back is
          nothing, and the legs say so. */}
      {/* ── BOTH BUILDERS LEFT THIS PAGE (2026-08-17) ───────────────────────
          They are one component now — components/Builder.js — living on its own
          🧱 Builder tab inside Combos. GroupTicketBuilder was mounted here AND
          on Pairs, which meant two copies of one widget that could not see each
          other; PairBuilder was buried under both. Nothing was deleted: both
          are in the Builder tab, as its two modes.
          This page is what it says it is again — the bot's published pools. */}
    </div>
  )
}
