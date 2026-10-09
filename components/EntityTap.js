'use client'
// A game (by its pk) or a pitcher (by his id) as a link, through the shell's
// door (lib/teamNav GameNav / PitcherNav). No door or no id -> the plain text.
import Tap from './Tap'
import { useGameNav, usePitcherNav, useTeamNav } from '../lib/teamNav'
import { teamHref } from '../lib/routes'

export function GameTap({ pk, children, style }) {
  const go = useGameNav()
  return <Tap onClick={go && pk ? () => go(pk) : null} style={style}>{children}</Tap>
}

export function PitcherTap({ id, children, style }) {
  const go = usePitcherNav()
  return <Tap onClick={go && id ? () => go(id) : null} style={style}>{children}</Tap>
}

// A club code (or its logo) as a link to the club's page, through the shell's team door.
// `sport`: where no shell provides a door (a public page such as /start), the code is a real
// link to the club's address (#sport=..&tab=team&team=XXX) instead of plain text -- so a tap
// never falls through to the player row it sits in.
export function TeamTap({ abbr, children, style, sport = null }) {
  const go = useTeamNav()
  const code = String(abbr || '')
  const ok = /^[A-Z]{2,4}$/.test(code)
  if (!go && ok && sport) {
    const href = teamHref(sport, code)
    if (href) return <a className="tap-link" href={href} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none', ...style }}>{children ?? code}</a>
  }
  return <Tap onClick={go && ok ? () => go(code) : null} style={style}>{children ?? code}</Tap>
}
