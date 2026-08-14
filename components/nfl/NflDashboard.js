'use client'
import { useEffect, useRef, useState } from 'react'
import { C } from '../../lib/nfl/theme'
import { fetchNfl, nflSlatePaths, nflReportPaths, nflMetaPaths, nflSlateLooksReal } from '../../lib/nfl/dataSource'
import { initialHashParams } from '../../lib/sport'
import NflHeader from './NflHeader'
import NflPlayerModal from './NflPlayerModal'
import MobileCSS from '../MobileCSS'

import Games from './tabs/Games'
import Boards from './tabs/Boards'
import Research from './tabs/Research'
import Report from './tabs/Report'
import Guide from './tabs/Guide'

// The NFL shell. Thin on purpose — state and routing only, same as the MLB
// Dashboard. Everything with an opinion lives in a tab file.
//
// Polls slower than the MLB side by design: baseball reprices every half
// inning, football gives you one slate a week and three score changes an hour.
// 45s while anything is live, 10 minutes otherwise.

export default function NflDashboard() {
  const [tab, setTab] = useState('games')
  const [data, setData] = useState(null)
  const [report, setReport] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)      // { player, market }
  const [refreshKey, setRefreshKey] = useState(0)

  // Deep links: #sport=nfl&tab=boards is a real address, same contract the
  // MLB side honours.
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    // initialHashParams(), not window.location.hash — see lib/sport.js.
    const t = initialHashParams().get('tab')
    if (t && ['games', 'boards', 'research', 'report', 'guide'].includes(t)) setTab(t)
  }, [])

  useEffect(() => {
    let alive = true
    if (refreshKey === 0) setLoading(true)
    Promise.allSettled([
      fetchNfl(nflSlatePaths(), nflSlateLooksReal).then((j) => { if (alive) setData(j) }),
      fetchNfl(nflReportPaths()).then((j) => { if (alive) setReport(j) }),
      fetchNfl(nflMetaPaths()).then((j) => { if (alive) setMeta(j) }),
    ]).then(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refreshKey])

  useEffect(() => {
    const live = (data?.games || []).some((g) => g.state === 'in')
    const id = setInterval(() => setRefreshKey((k) => k + 1), live ? 45_000 : 10 * 60_000)
    return () => clearInterval(id)
  }, [data])

  const openPlayer = (player, market = 'TD') => setModal({ player, market })

  return (
    <>
      <MobileCSS />
      <NflHeader tab={tab} setTab={setTab} data={data} meta={meta} />
      <main className="dashboard-main"
            style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px' }}>
        {loading ? (
          <div style={{
            border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
            textAlign: 'center', color: C.text3, fontSize: 12.5,
          }}>Loading slate…</div>
        ) : (
          <>
            {tab === 'games' && <Games data={data} onPlayerClick={openPlayer} />}
            {tab === 'boards' && <Boards data={data} onPlayerClick={openPlayer} />}
            {tab === 'research' && <Research data={data} onPlayerClick={openPlayer} />}
            {tab === 'report' && <Report report={report} />}
            {tab === 'guide' && <Guide />}
          </>
        )}
      </main>
      <NflPlayerModal
        player={modal?.player}
        market={modal?.market}
        markets={data?.markets}
        onClose={() => setModal(null)}
      />
    </>
  )
}
