// /m -- THE PHONE APP (2026-10-16, Phase 2 first slice; Donovan: a mobile-app-style shell with Today / Research / Record / Watch, the full site one tap away).
// Thin on purpose: it reuses what exists (the share card, the locked record, the full site's pages) and adds the shell around them. Each tab is its own
// address (/m?sport=mlb&tab=record), so Back goes where the person was and a shared link opens the same thing. Pages without a phone version open the full site.
// Public like the card page; reached by the Phone view pill or, once NEXT_PUBLIC_PHONE_SHELL=on, by any phone.
import Link from 'next/link'
import CardLandingImage from '../../components/CardLandingImage'
import CardSwipe from '../../components/CardSwipe'
import RankedHitters from '../../components/phone/RankedHitters'
import { PhoneSegment } from '../../components/ViewToggle'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { BRAND, SPORT_KEYS, sportKey, appHref, watchHash, playerHref } from '../../lib/routes'
import { RECORD_LINE } from '../../lib/record/publicLine'
import { mlbTodayCalls } from '../../lib/phone/todayCalls'
import { viewerIsMember } from '../../lib/members/viewer'
import { gateCalls, isOpenCall } from '../../lib/members/hide'
import { membersUrl } from '../../lib/members'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'DASH Network phone app', robots: { index: false } }

const TABS = [
  { key: 'today', label: 'Today', icon: '🌙' },
  { key: 'research', label: 'Research', icon: '🔬' },
  { key: 'record', label: 'Record', icon: '📋' },
  { key: 'watch', label: 'Watch', icon: '👁' },
]
// where Research opens on the full site, per product (a table, not a ternary)
// a sport's tonight list of called players, by sport key (a table, not a ternary); a sport without one shows its board card
const TODAY_CALLS = { mlb: mlbTodayCalls }
// the phone Research table a sport has, by sport key (a table, not a ternary); the others open the full site's tables
const RESEARCH_TABLE = { mlb: RankedHitters }
const RESEARCH_TAB = { mlb: 'fullboard', nfl: 'research', nhl: 'fullboard', nba: 'fullboard' }
const CARD_STATUS = ['called', 'board', 'off']
const one = (v) => String(Array.isArray(v) ? v[0] : v || '')
const href = (sport, tab) => `/m?sport=${sport}${tab && tab !== 'today' ? `&tab=${tab}` : ''}`

const tile = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 56, padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, color: C.text, textDecoration: 'none', fontWeight: 700, fontSize: TYPE.name }
const sub = { fontSize: TYPE.body, color: C.text2, fontWeight: 400, lineHeight: 1.4 }

function Tile({ to, title, note }) {
  return (
    <Link href={to} style={tile}>
      <span><span style={{ display: 'block' }}>{title}</span>{note ? <span style={sub}>{note}</span> : null}</span>
      <span aria-hidden="true" style={{ color: C.orange }}>→</span>
    </Link>
  )
}

export default async function PhoneApp({ searchParams }) {
  const params = (await searchParams) || {}
  const sport = SPORT_KEYS.includes(one(params.sport).toLowerCase()) ? one(params.sport).toLowerCase() : sportKey('mlb')
  // 'card' is a screen, not a tab: one player's card (what a name in a table opens). It highlights Research.
  const tab = TABS.some((t) => t.key === one(params.tab)) || one(params.tab) === 'card' ? one(params.tab) : 'today'
  const cardId = /^\d{4,8}$/.test(one(params.id)) ? one(params.id) : null
  const brand = BRAND[sport]
  const line = RECORD_LINE[sport] ? await RECORD_LINE[sport]() : null
  const ResearchTable = RESEARCH_TABLE[sport]
  const on = (key) => key === tab || (tab === 'card' && key === 'research')
  const rawCalls = tab === 'today' && TODAY_CALLS[sport] ? await TODAY_CALLS[sport]() : null
  // TONIGHT'S CALLS, FOR THIS VISITOR (2026-10-17): the real hiding, on the server, like the front door. A non-member gets the first four (the front page's four) and
  // every call whose game has started; the rest are counted, never sent. A member sees the list as before.
  const member = rawCalls ? await viewerIsMember() : false
  const gated = rawCalls ? gateCalls(rawCalls.items, { member, byPlace: true, isPublic: (it) => !isOpenCall({ status: 'called', startMs: it.firstPitch }) }) : null
  const calls = rawCalls ? { ...rawCalls, items: gated.items } : null
  const hiddenCalls = gated ? gated.hidden : 0
  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100dvh', paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', paddingTop: 'calc(10px + env(safe-area-inset-top))', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: TYPE.label, letterSpacing: '.14em' }}>DASH <span style={{ color: C.orange }}>NETWORK</span></span>
        <PhoneSegment sport={sport} />
      </header>
      <nav aria-label="Sport" style={{ display: 'flex', gap: 8, padding: '10px 14px', overflowX: 'auto' }}>
        {SPORT_KEYS.map((k) => (
          <Link key={k} href={href(k, tab)} aria-current={k === sport ? 'page' : undefined}
            style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 999, textDecoration: 'none', fontFamily: NUM_FONT, fontWeight: 900, fontSize: TYPE.label, letterSpacing: '.1em', border: `1px solid ${k === sport ? C.orange : C.border}`, background: k === sport ? C.orange : C.bg2, color: k === sport ? C.bg : C.text2 }}>
            {BRAND[k].name}
          </Link>
        ))}
      </nav>
      <section style={{ maxWidth: 480, margin: '0 auto', padding: '4px 14px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {tab === 'today' ? (
          <>
            {calls ? <CardSwipe sport={sport} items={calls.items} /> : <CardLandingImage src={`/api/card/share?kind=ranked&sport=${sport}&w=720`} alt={`${brand.name} ${brand.league} board card`} />}
            <p style={{ margin: '6px 2px 0', fontWeight: 800, fontSize: TYPE.title }}>{brand.icon} {brand.name}: {calls ? `${calls.items.length + hiddenCalls} calls tonight, locked before the game.` : "tonight's calls, locked before the game."}</p>
            {hiddenCalls > 0 ? (
              <p data-pm="hidden-called" style={{ margin: '0 2px', ...sub }}>
                {hiddenCalls} more called {hiddenCalls === 1 ? 'pick is' : 'picks are'} for members.{' '}
                <a href={membersUrl()} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44, padding: '0 8px', fontWeight: 900, color: C.text, textDecoration: 'underline' }}>Join</a>
              </p>
            ) : null}
            <Tile to={appHref(sport)} title="Open tonight's full board" note="Opens the full site" />
          </>
        ) : null}
        {tab === 'card' && cardId ? (
          <>
            <CardSwipe sport={sport} items={[{ id: cardId, name: one(params.name).slice(0, 80) || 'Player', roles: [], status: CARD_STATUS.includes(one(params.status)) ? one(params.status) : null, gameId: null, firstPitch: null }]} />
            <Tile to={playerHref(sport, cardId)} title="His full page" note="Opens the full site" />
            <Tile to={href(sport, 'research')} title="Back to Research" />
          </>
        ) : null}
        {tab === 'research' ? (
          <>
            {ResearchTable ? <ResearchTable /> : <p style={{ margin: '4px 2px', ...sub }}>The tables for {brand.name} are on the full site for now.</p>}
            <Tile to={appHref(sport, RESEARCH_TAB[sport])} title={`${brand.name} rankings and research`} note="Every hitter, every column. Opens the full site" />
            <Tile to={appHref(sport, 'ledger')} title="The ledger" note="Every call, graded. Opens the full site" />
          </>
        ) : null}
        {tab === 'record' ? (
          <>
            <p style={{ margin: '4px 2px', fontWeight: 800, fontSize: TYPE.title }}>The record, in public</p>
            <p style={{ margin: '0 2px', ...sub }}>{line ? `${line}.` : 'Every call is locked before the game and graded after, hits and misses both.'}</p>
            <Tile to={`/called?sport=${sport}`} title={`${brand.name} public record`} note="Night by night" />
          </>
        ) : null}
        {tab === 'watch' ? (
          <>
            <p style={{ margin: '4px 2px', ...sub }}>Follow a player anywhere and he lands here. Alerts are free.</p>
            <Tile to={`/app${watchHash(sport)}`} title="Your players and alerts" note="Opens the full site" />
            <Tile to="/members" title="Founding members" note="Every game's write-up, plus the board at lock and its grade" />
          </>
        ) : null}
      </section>
      <nav aria-label="Phone app" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, padding: '0 10px calc(8px + env(safe-area-inset-bottom))' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `1px solid ${C.border}`, borderRadius: 16, background: C.bg2 }}>
          {TABS.map((t) => (
            <Link key={t.key} href={href(sport, t.key)} aria-current={on(t.key) ? 'page' : undefined}
              style={{ minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, textDecoration: 'none', color: on(t.key) ? C.orange : C.text2, fontFamily: NUM_FONT, fontSize: TYPE.micro, fontWeight: 900, borderBottom: `2px solid ${on(t.key) ? C.orange : 'transparent'}` }}>
              <span aria-hidden="true" style={{ fontSize: 18 }}>{t.icon}</span>{t.label}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}
