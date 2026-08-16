'use client'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, arr } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import PairBuilder from '../PairBuilder'
// Defined in the Pairs tab and shared, not duplicated. The two tabs are asking
// the same question at two sizes — a pair is a two-leg pool — and a second
// copy of this logic is how the two would end up disagreeing about what a
// group's measured rate is. Pairs does not import Pools, so there is no cycle.
import { GroupTicketBuilder } from './Pairs'

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

function LivePools({ results, players = [], onPlayerClick }) {
  const pools = (results?.pair_pool_results?.graded_pools) || []
  const resolve = makeResolver(players)
  if (!pools.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Live pools</div>
      {/* 2026-08-09. This blurb used to explain that a pool "clears only when
          every member goes deep" and that most end unfinished. That was true
          and it was also hiding the number: across 40 graded nights, all-or-
          nothing cleared 0 times in 320 pools. Not rarely. Never.

          The legs were never the problem — a pool leg homers 17.5% against a
          14.9% slate baseline, and at least one goes on about half of all
          nights. The BAR was the problem, so the bot moved it (1+ of a 3- or
          4-man) and retired the 6-man. This copy now says what the bar is and
          what the record actually was. */}
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
        The bot&apos;s group tickets, graded as games finish. The bar is{' '}
        <b style={{ color: C.text2 }}>1+ of 3 or 4</b> — one member going deep is a hit.
        {' '}Across 40 graded nights that landed about half the time, and two members landed 13%.
        {' '}<b style={{ color: C.text2 }}>All members homering has happened 0 times in 320 pools</b>,
        which is why it stopped being the bar and the 6-man was retired.
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {pools.map((pl, i) => {
          const hit = n(pl.hr_count, 0)
          const tot = Math.max(1, n(pl.total_count, 0))
          // The bar the bot publishes, with a fallback for older payloads that
          // predate it: 1+ on a small pool, 2+ on anything bigger.
          const bar = n(pl.bar, tot <= 4 ? 1 : 2)
          const done = hit >= bar
          const perfect = hit >= tot
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
                // Progress runs to the BAR, not to every member. A bar that
                // fills to 1/6 on a hit nobody can reach reads as failure; the
                // same hit filling to 1/1 reads as what it is.
                width: `${Math.min(100, (100 * hit) / bar)}%`, background: col,
                boxShadow: `0 0 8px ${col}`, transition: 'width .3s',
              }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{pl.label}</span>
                {done && (
                  <span title={perfect ? 'Every member went deep' : `Cleared the bar: ${bar}+ of ${tot}`}
                    style={{ fontSize: 9, fontWeight: 900, color: '#4ade80' }}>
                    {perfect ? 'PERFECT' : 'HIT'}
                  </span>
                )}
                <span title={`${hit} of ${tot} homered · the bar is ${bar}+`} style={{
                  marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 12,
                  fontWeight: 800, color: col === C.border ? C.text3 : col,
                }}>{hit}/{tot} HR <span style={{ fontSize: 9, color: C.text3, fontWeight: 600 }}>· need {bar}</span></span>
              </div>
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

// Pre-game fallback: before anything grades, show the same pools from the
// pair-builder file so the page never reads empty. Ungraded on purpose — no
// fake 0/4 progress before first pitch, just the rosters.
function SlatePools({ pairBuilder, players = [], onPlayerClick }) {
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
  if (!all.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Tonight&apos;s pools</div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8 }}>
        The bot&apos;s group tickets for the slate. Grading appears here live once games start.
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {all.map((pl, i) => (
          <div key={pl.pool_key || i} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>
                {clean(pl.name || pl.label, `${pl.kind} pool`)}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                {pl.kind}
              </span>
            </div>
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
          </div>
        ))}
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
        : <SlatePools pairBuilder={pairBuilder} players={players} onPlayerClick={onPlayerClick} />}

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
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <GroupTicketBuilder
          players={players}
          odds={odds}
          slateDate={slateDate}
          defaultSize={3}
          onPlayerClick={onPlayerClick}
        />
      </div>

      {/* The anchor pair builder — moved here from the Pairs tab. Pairs is the
          bot's opinion; this is where you build your own around an anchor, with
          same-game history on every partner it offers. */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <PairBuilder summary={pairHistorySummary} players={players} onPlayerClick={onPlayerClick} />
      </div>
    </div>
  )
}
