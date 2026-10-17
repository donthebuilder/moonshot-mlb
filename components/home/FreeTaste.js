'use client'
// THE FREE TASTE, AS TABLES (2026-10-17, front door rebuild). Tonight's called players, one MOONSHOT DenseTable per sport, in that
// sport's own theme and accent: the same table skin, name cell, CALLED stamp and role chips the boards use, not a look-alike.
//
// WHAT A VIEWER SEES WAS DECIDED ON THE SERVER (components/home/QuickPicks.js, lib/members/access.js previewOf): every row handed to this file is
// a row the viewer may read. The hidden names never leave the server, so nothing here (or in the page's RSC payload) can show more than the gate
// allows. `hidden` is only a count.
//
// The row under each table: a free visitor gets "+N more for members" (to the offer on this page); a member gets "N of M shown, all in the app".
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DenseTable from '../DenseTable'
import { Themed } from '../record/LadderBlock'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'
import { C as NFL_C, NUM_FONT as NFL_NUM } from '../../lib/nfl/theme'
import { C as NHL_C, NUM_FONT as NHL_NUM } from '../../lib/nhl/theme'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { BRAND, appHref } from '../../lib/routes'

// What each sport's taste carries: MOONSHOT's lock ledger and LAMP's locked goal board are CALLED (the table stamps CALLED through lib/callStatus); TUDDY's list is the
// week's anytime-TD board, which is a board and not a call, so it wears no stamp. Only MOONSHOT has a headshot id on its rows.
const SPEC = { mlb: { called: true, face: true }, nfl: { called: false, face: false }, nhl: { called: true, face: false } }
const calledOf = () => 'called'
const faceOfMlb = (r) => ({ sport: 'mlb', id: r.id, name: r.name })
const THEME = { mlb: { C: MLB_C, num: MLB_NUM }, nfl: { C: NFL_C, num: NFL_NUM }, nhl: { C: NHL_C, num: NHL_NUM } }

// The columns of each sport's taste. Every column carries a group, in order. Text columns only: a call list carries no stat to heat.
function columnsFor(sport, go) {
  const name = { key: 'name', label: 'Player', group: 'Player', sticky: true, heat: false, w: 150, link: (r) => (r.href ? () => go(r.href) : null) }
  if (sport === 'mlb') {
    return [
      name,
      { key: 'role', label: 'Called for', group: 'Call', heat: false, w: 130, title: 'The call types he was locked for tonight' },
      { key: 'first', label: 'First pitch', group: 'Call', heat: false, mono: true, w: 82, title: 'First pitch of his game' },
    ]
  }
  return [
    name,
    { key: 'team', label: 'Team', group: 'Matchup', heat: false, teamMark: sport, w: 40, link: (r) => (r.teamHref ? () => go(r.teamHref) : null) },
    { key: 'vs', label: 'Opp', group: 'Matchup', heat: false, w: 56, link: (r) => (r.vsHref ? () => go(r.vsHref) : null), title: 'Tonight’s opponent' },
    { key: 'pos', label: 'Pos', group: 'Matchup', heat: false, mono: true, w: 44 },
  ]
}

function Taste({ block, member }) {
  const router = useRouter()
  const { sport, rows, hidden, note } = block
  const T = THEME[sport].C
  const num = THEME[sport].num
  const accent = SPORT_ACCENT[sport]
  const go = (href) => router.push(href)
  const columns = columnsFor(sport, go)
  const spec = SPEC[sport]
  const shown = rows.length
  const link = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, padding: '0 14px',
    border: `1px solid ${T.border}`, borderTop: 0, borderRadius: '0 0 10px 10px', background: T.bg2, color: T.text,
    textDecoration: 'none', fontFamily: num, fontSize: 12, fontWeight: 800, letterSpacing: '.04em',
  }
  return (
    <section aria-label={`${BRAND[sport].name} called players`} style={{ margin: '0 0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', margin: '0 0 8px' }}>
        <span style={{ fontFamily: num, fontSize: 12, fontWeight: 900, letterSpacing: '.14em', color: accent }}>{BRAND[sport].name} · {BRAND[sport].league}</span>
        <span style={{ fontSize: 12, color: T.text2 }}>{note}</span>
      </div>
      <Themed sport={sport}>
        <DenseTable
          rows={rows} columns={columns} heatMode="none" bare maxHeight={9999} maxRows={rows.length || 1}
          accent={accent} nameCell="player" statusOf={spec.called ? calledOf : null}
          faceOf={spec.face ? faceOfMlb : null}
          caption={`${BRAND[sport].name} called players. Tap a name for his page.`} />
      </Themed>
      {hidden > 0 && !member ? (
        <a href="#offer" style={link}>
          <span>+{hidden} more for members</span>
          <span style={{ color: accent }}>JOIN →</span>
        </a>
      ) : null}
      {hidden > 0 && member ? (
        <Link href={appHref(sport)} style={link}>
          <span>{shown} of {shown + hidden} shown, all in the app</span>
          <span style={{ color: accent }}>OPEN →</span>
        </Link>
      ) : null}
    </section>
  )
}

export default function FreeTaste({ blocks, member = false }) {
  return <>{blocks.map((b) => <Taste key={b.sport} block={b} member={member} />)}</>
}

