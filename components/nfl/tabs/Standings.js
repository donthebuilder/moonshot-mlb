'use client'
import NflNote from '../NflNote'
import { useEffect, useState } from 'react'
import PageHeader from '../../PageHeader'
import TeamMark from '../../TeamMark'
import NflTable from '../NflTable'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { fetchNflStandings } from '../../../lib/nfl/standings'

// 🏈 STANDINGS (2026-09-26, shell-parity step 3) -- the slot LAMP's bar has
// and TUDDY's didn't. Tables lead: one per division, the feed's own order,
// every column the feed publishes for a standings line. Club logos since
// 2026-10-01 (Donovan: "logo need to be on the standings"); the source line
// still names the kind of feed, not a brand.
// Data: lib/nfl/standings.js (public feed, read in the browser, 10 min).

export default function Standings({ onOpenTeam }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    fetchNflStandings().then((d) => { if (alive) { setData(d); setError(null) } }).catch((e) => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])
  const teams = (data?.conferences || []).flatMap((c) => c.divisions.flatMap((d) => d.teams))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="TUDDY · STANDINGS"
        title="NFL standings"
        note={<NflNote tab="standings" />}
        theme={C} numFont={NUM_FONT} accent={C.green}
        stats={data ? [{ value: teams.length, label: 'TEAMS', tone: C.text2 }, { value: (data.conferences || []).reduce((n, c) => n + c.divisions.length, 0), label: 'DIVISIONS', tone: C.text2 }] : null}
      />
      {error ? (
        <div role="status" style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.green || C.border2}`, color: C.text2, fontSize: 12 }}>
          <b style={{ fontFamily: NUM_FONT }}>LIVE DATA DELAYED</b> · Standings didn’t load. Try again in a minute.
        </div>
      ) : null}
      {!data && !error ? <div style={{ color: C.text3, fontSize: 11, fontFamily: NUM_FONT }}>Loading the standings…</div> : null}
      {(data?.conferences || []).map((conf) => (
        <section key={conf.name} aria-label={conf.name} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conf.divisions.map((div) => (
            <div key={div.name}>
              <div style={{ color: C.text3, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>{div.name.toUpperCase()}</div>
              {/* THE SHARED TABLE (2026-10-01, BATCH-TABLE-SKIN-V2 4b / R8): the
                  hand-rolled <table> is NflTable now -- every column sorts, the
                  sorted one is graded, the team stays pinned on a phone. The
                  feed's own order until you sort. The team is TUDDY's text
                  mark, not a logo (Donovan, this page: "no logos"). */}
              <NflTable rows={div.teams.map((t) => ({ ...t, _key: t.abbr, nick: t.nickname }))} columns={STAND_COLS(onOpenTeam)}
                heatMode="sorted" maxHeight={9999} maxRows={40} bare caption={`${div.name}: league order. Every column sorts.`} />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

const SG = {
  team: { key: 'team', label: 'Team', order: 0 }, rec: { key: 'rec', label: 'Record', order: 1 },
  pts: { key: 'pts', label: 'Points', order: 2 }, split: { key: 'split', label: 'Splits', order: 3 },
}
const STAND_COLS = (onOpenTeam) => [
  { key: 'nick', label: 'Team', heat: false, sticky: true, bold: true, w: 150, group: SG.team, fold: false,
    fmt: (v, t) => <span title={`${t.place} ${v} (${t.abbr})`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><TeamMark sport="nfl" abbr={t.abbr} variant="logo" px={18} /><span>{v}</span></span>,
    link: (t) => (onOpenTeam ? () => onOpenTeam(t.abbr) : null) },
  { key: 'w', label: 'W', w: 40, dp: 0, group: SG.rec }, { key: 'l', label: 'L', w: 40, dp: 0, invert: true, group: SG.rec },
  { key: 't', label: 'T', w: 36, dp: 0, group: SG.rec },
  { key: 'pct', label: 'PCT', w: 50, dp: 3, group: SG.rec, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')) },
  { key: 'pf', label: 'PF', w: 44, dp: 0, group: SG.pts }, { key: 'pa', label: 'PA', w: 44, dp: 0, invert: true, group: SG.pts },
  { key: 'diff', label: 'DIFF', w: 50, dp: 0, scale: 'div', anchor: 0, ceiling: 100, anchorLabel: 'even', group: SG.pts, fmt: (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v)) },
  { key: 'home', label: 'HOME', heat: false, mono: true, w: 52, group: SG.split }, { key: 'road', label: 'ROAD', heat: false, mono: true, w: 52, group: SG.split },
  { key: 'div', label: 'DIV', heat: false, mono: true, w: 48, group: SG.split }, { key: 'conf', label: 'CONF', heat: false, mono: true, w: 52, group: SG.split },
  { key: 'strk', label: 'STRK', heat: false, mono: true, w: 48, group: SG.split },
]
