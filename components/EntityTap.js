'use client'
// A game (by its pk) or a pitcher (by his id) as a link, through the shell's
// door (lib/teamNav GameNav / PitcherNav). No door or no id -> the plain text.
import Tap from './Tap'
import { useGameNav, usePitcherNav, useTeamNav } from '../lib/teamNav'

export function GameTap({ pk, children, style }) {
  const go = useGameNav()
  return <Tap onClick={go && pk ? () => go(pk) : null} style={style}>{children}</Tap>
}

export function PitcherTap({ id, children, style }) {
  const go = usePitcherNav()
  return <Tap onClick={go && id ? () => go(id) : null} style={style}>{children}</Tap>
}

// A club code (or its logo) as a link to the club's page, through the shell's team door.
export function TeamTap({ abbr, children, style }) {
  const go = useTeamNav()
  const code = String(abbr || '')
  return <Tap onClick={go && /^[A-Z]{2,4}$/.test(code) ? () => go(code) : null} style={style}>{children ?? code}</Tap>
}
