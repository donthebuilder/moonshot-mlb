'use client'
// ONE TEAM DOOR PER PRODUCT (2026-10-01, 0g A2 / A4 / A9). Each dashboard
// provides how a team opens (TUDDY: its Players portal on that club; LAMP: the
// team page); every shared table reads it, so a club logo in any DenseTable
// cell is a link without each tab threading onOpenTeam by hand. MOONSHOT has
// no team page, so it provides nothing and its team cells stay plain.
import { createContext, useContext } from 'react'

export const TeamNav = createContext(null)
export const useTeamNav = () => useContext(TeamNav)
