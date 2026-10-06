'use client'
// ONE TEAM DOOR PER PRODUCT (2026-10-01, 0g A2 / A4 / A9). Each dashboard
// provides how a team opens (TUDDY: its Players portal on that club; LAMP: the
// team page); every shared table reads it, so a club logo in any DenseTable
// cell is a link without each tab threading onOpenTeam by hand. MOONSHOT has
// no team page, so it provides nothing and its team cells stay plain.
import { createContext, useContext } from 'react'

export const TeamNav = createContext(null)
export const useTeamNav = () => useContext(TeamNav)

// A GAME AND A PITCHER GET THE SAME DOOR (2026-10-05, nav audit: "game tap opened
// nothing visible", "player name tap opened nothing"). A matchup line ("CWS vs
// CLE") or a starter's name in a hero / prose block used to be plain text; with
// these a shared piece asks the shell to open the game / the pitcher
// (components/EntityTap.js) and the shell decides how. A shell that provides
// nothing keeps the text plain, never a dead button.
export const GameNav = createContext(null)
export const useGameNav = () => useContext(GameNav)
export const PitcherNav = createContext(null)
export const usePitcherNav = () => useContext(PitcherNav)
