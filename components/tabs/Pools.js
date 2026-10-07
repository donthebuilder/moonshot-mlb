'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { arr } from '../../lib/player'
import { legacyPoolRows, poolAsCard, LEGACY_LABEL } from '../../lib/pools'
import { PanelTitle, Empty } from '../ui'
import DenseTable from '../DenseTable'
import { LegCell } from '../PairBlock'
import { downloadPoolsCard } from '../shareCard'

// Pools -- the OLD-RECIPE three-man pools, and nothing else (owner decision,
// 2026-10-07, final). The bot publishes eight pools of three (A1..D2, the
// halves of its four legacy six-man parents); they were cashing all season, so
// they lead this page: a table of the eight, then each pool's own reasoning
// with every player and club a link. The current-recipe 3-man pools, the 4-man
// pools, the retired 6-man and the six-man legacy parents are NOT shown (the
// keys stay in the files, for the record; see lib/pools.js).
//
// No raw model probability is printed: the bot's estimated_grade_probability
// rides along in the file and stays there. A missing or empty pools_3man_legacy
// is "not published yet", said plainly -- never a made-up pool.
//
// History: the builder that used to fill this page left 2026-08-04 (its
// calibration bands were too coarse to inform anything); the pair builder
// moved to the Builder tab 2026-08-17.

// pool members carry names (and sometimes ids); resolve back to the slate row so
// a tap opens the full card (2026-08-08: "on the live pools I can click the
// players to see their modal")
const _pnorm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const makeResolver = (players) => {
  const byId = new Map(players.map((p) => [String(p?.player_id ?? p?.id), p]))
  const byName = new Map(players.map((p) => [_pnorm(p?.name || p?.player_name), p]))
  return (mb) => byId.get(String(mb?.player_id ?? '')) || byName.get(_pnorm(mb?.name)) || null
}


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


const ACCENT = SPORT_ACCENT.mlb

export default function Pools({ players = [], results, pairBuilder, onPlayerClick, slateDate = '' }) {
  const rows = useMemo(() => legacyPoolRows(pairBuilder, results), [pairBuilder, results])
  const resolve = useMemo(() => makeResolver(players), [players])
  const prevByKey = usePoolSnapshots(rows.map((r) => ({ pool_key: r.tag, players: r.players })), slateDate || 'unknown')
  const open = onPlayerClick ? (p) => onPlayerClick(resolve(p) || p) : null

  const view = useMemo(() => rows.map((r) => {
    const prev = prevByKey?.[r.tag]
    const changed = !r.locked && !!(prev && prev.sig !== undefined && prev.sig !== rosterSig({ players: r.players }))
    const now = new Set(r.players.map((mb) => _pnorm(mb?.name)))
    const out = changed ? (prev.names || []).filter((nm) => !now.has(_pnorm(nm))) : []
    const leg = (j) => r.players[j] || null
    return {
      ...r, changed, out, _key: r.tag,
      _l0: leg(0), _l1: leg(1), _l2: leg(2),
      label: r.tag, p0: leg(0)?.name || '—', p1: leg(1)?.name || '—', p2: leg(2)?.name || '—',
      hrText: r.graded ? r.hr : -1,
    }
  }), [rows, prevByKey])

  const gradedN = rows.filter((r) => r.graded).length
  const hitN = rows.filter((r) => r.hit || (r.graded && r.hr >= r.need)).length
  const anyLocked = rows.some((r) => r.locked)

  const legCell = (k) => (_v, r) => {
    const mb = r[k]
    if (!mb) return '—'
    const key = String(mb?.name || '').toLowerCase()
    return <LegCell player={mb} onOpen={open} hit={r.homered.has(key)} voided={r.voided.has(key)} />
  }

  return (
    <div>
      <PanelTitle
        title="Pools"
        sub="The old-recipe three-man pools · two homers is a hit"
      />

      {!rows.length && <Empty text="The old-recipe three-man pools aren't published for this slate yet." />}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 22, fontWeight: 900, color: ACCENT, lineHeight: 1.1 }}>
              {gradedN ? `${hitN} of ${rows.length}` : rows.length}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
              {gradedN ? `old-recipe pools have two homers` : `old-recipe pools of three tonight`}
            </span>
            <span style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>
              {anyLocked ? 'Locked at first pitch.' : 'Rosters can still change until first pitch; a pool that changed is marked.'}
            </span>
            <button onClick={() => downloadPoolsCard(rows.map(poolAsCard), { title: 'OLD-RECIPE 3-MAN POOLS', graded: gradedN > 0 })}
              title="Download the pools as a PNG for posting" aria-label="Download pools as image"
              style={{ marginLeft: 'auto', minHeight: 44, minWidth: 44, background: 'transparent', border: `1px solid ${C.border}`, color: ACCENT, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📸</button>
          </div>
          <DenseTable
            rows={view}
            accent={ACCENT}
            title="Old-recipe three-man pools"
            bare
            maxHeight={9999}
            initialSort={{ key: 'label', dir: 'asc' }}
            columns={[
              { key: 'label', label: 'Pool', group: 'Pool', sticky: true, heat: false, w: 74, bold: true,
                fmt: (v, r) => <span>{v}{r.changed ? <span title={r.out.length ? `Out since you last looked: ${r.out.join(', ')}` : 'Roster changed since you last looked'} style={{ color: C.orange, marginLeft: 4 }}>🔄</span> : null}</span> },
              { key: 'parent', label: 'Parent', group: 'Pool', heat: false, w: 74, dim: true },
              { key: 'p0', label: 'Player 1', group: 'Players', heat: false, w: 170, fmt: legCell('_l0') },
              { key: 'p1', label: 'Player 2', group: 'Players', heat: false, w: 170, fmt: legCell('_l1') },
              { key: 'p2', label: 'Player 3', group: 'Players', heat: false, w: 170, fmt: legCell('_l2') },
              { key: 'hrText', label: 'HR', group: 'Result', heat: false, w: 56, mono: true, title: 'Homers so far out of the pool’s players. Two is a hit.',
                fmt: (v, r) => (v < 0 ? '—' : <b style={{ color: r.hr >= r.need ? C.green : r.hr > 0 ? C.orange : 'inherit' }}>{r.hr}/{r.total}</b>) },
              { key: 'barLabel', label: 'Bar', group: 'Result', heat: false, w: 90, dim: true, fmt: (v) => v || 'need 2' },
              { key: 'score', label: 'Pool score', group: 'MOONSHOT read', w: 70, dp: 1, title: 'MOONSHOT’s own pool score. A rank, not a probability.' },
              { key: 'risk', label: 'Risk', group: 'MOONSHOT read', heat: false, w: 64, dim: true },
            ]}
          />

          {/* The reasoning, in prose -- and the way to every name on a phone, where
              the table scrolls sideways under its pinned first column. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 6, color: ACCENT }}>Pool by pool</div>
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11 }}>
              {view.map((r, i) => (
                <div key={r._key} style={{ padding: '10px 13px', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>Pool {r.tag}</span>
                    {r.parent && <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{r.parent}</span>}
                    {r.changed && <span style={{ fontSize: 12, fontWeight: 800, color: C.orange }}>🔄 changed</span>}
                    {r.locked && <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>locked</span>}
                    {r.graded && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT, color: r.hr >= r.need ? C.green : C.text2 }}>{r.hr}/{r.total} HR</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 5, fontSize: 13 }}>
                    {r.players.map((mb, j) => {
                      const key = String(mb?.name || '').toLowerCase()
                      return <LegCell key={j} player={mb} onOpen={open} hit={r.homered.has(key)} voided={r.voided.has(key)} />
                    })}
                  </div>
                  {r.out.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 12, color: C.text3 }}>
                      was also: {r.out.map((nm, j) => <span key={j} style={{ textDecoration: 'line-through', marginRight: 6 }}>{nm}</span>)}
                    </div>
                  )}
                  {(r.reason || r.tags) && (
                    <div style={{ fontSize: 12, color: C.text2, marginTop: 4, lineHeight: 1.55 }}>
                      {r.reason}
                      {r.tags && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 11 }}>{r.reason ? ' — ' : ''}{r.tags}</span>}
                    </div>
                  )}
                  {r.voidNames.length > 0 && <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>did not play (void, not a miss): {r.voidNames.join(', ')}</div>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
              {LEGACY_LABEL.toLowerCase()} pools: eight pools of three, each half of one of MOONSHOT&apos;s older six-man tickets. A pool hits with at least two homers; a player who did not play is void, not a miss.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
