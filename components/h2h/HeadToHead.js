'use client'
import { useMemo } from 'react'
import SectionView from '../team/SectionView'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useTeamNav } from '../../lib/teamNav'
import { h2hSection } from '../../lib/h2h/view'
import { rivalryOf } from '../../lib/h2h/config'

// HEAD TO HEAD (2026-10-13). ONE component for all four sports: it asks /api/h2h, turns the answer into a section
// (lib/h2h/view.js) and draws it with the shared section drawer in the SPORT'S OWN table (DenseTable on MOONSHOT,
// NflTable on TUDDY, LampTable on LAMP, BucketsTable on BUCKETS), passed in as `ui`. Nothing here names a sport's table,
// colour or word.
//
//   <HeadToHead sport="mlb" a="NYY" b="BOS" .../>   a game page: the pair's record, margin and meetings over three seasons
//   <HeadToHead sport="nhl" a="TOR" .../>           a team page: the club against every opponent this season
//
// It mounts only where the section is drawn (an open game, the Head to head chip), so a page that never opens it
// never asks. The league feeds are read once and held at the edge for hours; no polling.
export default function HeadToHead({ sport, a, b = null, ui, nav = {}, onOpenTeam = null, onOpenGame = null, theme, open = false, heading = true }) {
  const { C, NUM_FONT, accent } = theme
  const shellTeamNav = useTeamNav()   // the product's team door, when the page did not hand one in
  const navAll = { ...nav, onOpenTeam: nav.onOpenTeam || onOpenTeam || shellTeamNav || undefined, onOpenGame: nav.onOpenGame || onOpenGame || undefined }
  const url = a ? `/api/h2h?sport=${sport}&a=${encodeURIComponent(a)}${b ? `&b=${encodeURIComponent(b)}` : ''}` : null
  const { data, error, loading } = useLiveFetch(url, { enabled: Boolean(url) })
  const section = useMemo(() => (data ? h2hSection(data, { open }) : null), [data, open])
  const rivalry = b ? rivalryOf(sport, a, b) : null
  const { EmptyState, Kicker } = ui
  return (
    <section aria-label="Head to head" data-h2h={b ? 'pair' : 'club'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {heading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Kicker>HEAD TO HEAD</Kicker>
          {rivalry && <span style={{ border: `1px solid ${accent}88`, color: accent, borderRadius: 999, padding: '4px 10px', font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', textTransform: 'uppercase' }}>{rivalry.tag}</span>}
        </div>
      )}
      {!section && !error && <p style={{ margin: 0, color: C.text3, fontSize: 12 }}>{loading ? 'Reading the league’s schedule feed…' : ''}</p>}
      {!section && error && <EmptyState title="HEAD TO HEAD NOT AVAILABLE" note={error.status === 404 ? null : 'The league’s schedule feed is not answering right now. Nothing is estimated in its place.'} />}
      {section?.window && <p style={{ margin: 0, color: C.text3, font: `800 12px/1.4 ${NUM_FONT}`, letterSpacing: '.06em', textTransform: 'uppercase' }}>{section.window}</p>}
      {section && <SectionView section={{ ...section, window: null }} ui={ui} nav={navAll} theme={theme} />}
    </section>
  )
}
