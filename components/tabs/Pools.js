'use client'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, arr } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import PairBuilder from '../PairBuilder'

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
function LivePools({ results }) {
  const pools = (results?.pair_pool_results?.graded_pools) || []
  if (!pools.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Live pools</div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8 }}>
        The bot&apos;s group tickets for today, graded as games finish. A pool clears only when every
        member goes deep, so most of these end the night unfinished — that&apos;s the shape of the bet,
        not a failure of the picks.
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {pools.map((pl, i) => {
          const hit = n(pl.hr_count, 0)
          const tot = Math.max(1, n(pl.total_count, 0))
          const done = hit >= tot
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
                width: `${(100 * hit) / tot}%`, background: col,
                boxShadow: `0 0 8px ${col}`, transition: 'width .3s',
              }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{pl.label}</span>
                <span style={{
                  marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 12,
                  fontWeight: 800, color: col === C.border ? C.text3 : col,
                }}>{hit}/{tot} HR</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                {(pl.players || []).map((mb, j) => {
                  const gone = homered.has(String(mb?.name || '').toLowerCase())
                  return (
                    <span key={j} style={{
                      fontSize: 10.5,
                      color: gone ? '#4ade80' : C.text3,
                      fontWeight: gone ? 700 : 400,
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
function SlatePools({ pairBuilder }) {
  const all = [
    ...arr(pairBuilder?.recommended_3mans).map((p) => ({ ...p, kind: '3-man' })),
    ...arr(pairBuilder?.pools_4man).map((p) => ({ ...p, kind: '4-man' })),
    ...arr(pairBuilder?.pools_6man).map((p) => ({ ...p, kind: '6-man' })),
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
              {arr(pl.players).map((mb, j) => (
                <span key={j} style={{ fontSize: 10.5, color: C.text3 }}>{mb?.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Pools({ players = [], results, pairBuilder, pairHistorySummary, onPlayerClick }) {
  const hasGraded = (results?.pair_pool_results?.graded_pools || []).length > 0

  return (
    <div>
      <PanelTitle
        title="Pools"
        sub="The bot's group tickets, graded live · build your own pair below"
      />

      {hasGraded ? <LivePools results={results} /> : <SlatePools pairBuilder={pairBuilder} />}

      {!hasGraded && !arr(pairBuilder?.pools_4man).length && !arr(pairBuilder?.pools_6man).length
        && !arr(pairBuilder?.recommended_3mans).length && (
        <Empty text="No pools published for this slate yet." />
      )}

      {/* The pair builder — moved here from the Pairs tab. Pairs is the bot's
          opinion; this is where you build your own around an anchor, with
          same-game history on every partner it offers. */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <PairBuilder summary={pairHistorySummary} players={players} onPlayerClick={onPlayerClick} />
      </div>
    </div>
  )
}
