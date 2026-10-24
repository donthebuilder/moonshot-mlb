'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { bvpSplits } from '../lib/situational'

// BATTER vs PITCHER — the head-to-head, live from the API.
//
// This was deliberately left off the site during the PropFinder teardown,
// because BvP is the most over-quoted number in baseball: 3-for-7 lifetime is
// a coin flip wearing a batting average. It's here now because the user asked
// and because hidden data is worse than caveated data — but the panel grades
// its own sample size and says so out loud. Under 10 PA the verdict line
// literally calls it noise.
//
// Career block from vsPlayerTotal (or summed client-side when they first met
// this year), season chips underneath when there's more than one.

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0)

// ── VS HIM, IN THE EV LOG'S BOX (2026-10-23, Donovan: "add the verse picture with the EV log ... form fitted together, or at
// least like a toggle, so that way you can just see that real quick ... that can be removed from the pitches") ──────────────
// The card's EV log panel toggles to this: tonight's pitcher's face and name, his line against him in one row of tiles, then
// every ball he's hit off him (Statcast since 2015) in the EV log's own table. Few words: the sample size IS the caveat, so
// it's printed as a number (PA) and greyed under 10.
export function VsHimLog({ batterId, pitcherId, pitcherName, pitcherHand = null, face = null }) {
  const [data, setData] = useState(undefined)
  const [career, setCareer] = useState(undefined)
  const [Log, setLog] = useState(null)
  useEffect(() => {
    let alive = true
    setData(undefined); setCareer(undefined)
    if (!batterId || !pitcherId) { setData(null); setCareer([]); return undefined }
    bvpSplits(batterId, pitcherId).then((d) => { if (alive) setData(d || null) })
    import('../lib/savant').then(({ savantBattedBalls }) => savantBattedBalls(batterId, { pitcherId, career: true }))
      .then((rows) => { if (alive) setCareer(rows || []) }).catch(() => { if (alive) setCareer([]) })
    import('./tabs/EVLog').then((m) => { if (alive) setLog(() => m.BlendedLog) })
    return () => { alive = false }
  }, [batterId, pitcherId])
  if (!pitcherId) return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>No starter named for tonight yet.</div>
  const t = data?.total || null
  const pa = num(t?.plateAppearances)
  const thin = pa < 10
  const tiles = t ? [
    ['PA', pa], ['H/AB', `${num(t.hits)}/${num(t.atBats)}`], ['AVG', t.avg ?? '—'], ['OPS', t.ops ?? '—'],
    ['HR', num(t.homeRuns)], ['K', num(t.strikeOuts)], ['BB', num(t.baseOnBalls)],
  ] : []
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, minWidth: 0 }}>
        {face && <img src={face} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: C.bg3 || C.bg2, border: `1px solid ${C.border2}`, flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {pitcherName || 'tonight’s starter'}{pitcherHand ? <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT, fontSize: 11 }}> {pitcherHand}HP</span> : null}</div>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>career · {data === undefined ? 'loading…' : t ? (thin ? `${pa} PA · a small sample` : `${pa} PA`) : 'they haven’t met'}</div>
        </div>
      </div>
      {tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 4, marginBottom: 10 }}>
          {tiles.map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: 7, border: `1px solid ${k === 'HR' && Number(v) > 0 ? C.orange : C.border}`, background: 'rgba(255,255,255,.03)', minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: NUM_FONT, color: thin ? C.text2 : (k === 'HR' && Number(v) > 0 ? C.orange : C.text) }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {career === undefined || !Log
        ? <div style={{ fontSize: 11, color: C.text3, padding: '6px 0' }}>Pulling every ball he’s hit off him…</div>
        : <Log balls={career} keepYear title={`${career.length} result${career.length === 1 ? '' : 's'} off him since 2015 · newest first`} empty="No tracked balls off him." />}
    </div>
  )
}
