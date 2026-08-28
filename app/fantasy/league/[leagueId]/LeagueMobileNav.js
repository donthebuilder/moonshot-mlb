'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import styles from '../../fantasy.module.css'

const items=[
  ['','◈','Draft'],
  ['team','▣','Team'],
  ['matchup','⚔','Matchup'],
  ['league','▤','League'],
  ['wire','⚡','Wire'],
  ['coach','✦','Coach'],
  ['trades','⇄','Trades'],
  ['feed','◎','Feed'],
]

export default function LeagueMobileNav({leagueId}) {
  const pathname=usePathname()
  const [pendingRoute,setPendingRoute]=useState(null)
  // Without this the tapped item could stay stuck on "Opening…" after a Back.
  useEffect(()=>{setPendingRoute(null)},[pathname])
  return <nav aria-label="League sections" className={styles.leagueMobileNav}>{items.map(([route,icon,label])=>{const href=route?`/fantasy/league/${leagueId}/${route}`:`/fantasy/league/${leagueId}`;const active=pathname===href;const pending=pendingRoute?.from===pathname&&pendingRoute?.to===href&&!active;return <Link aria-busy={pending} aria-current={active?'page':undefined} className={active?styles.leagueMobileActive:''} href={href} key={route} onClick={()=>{if(!active)setPendingRoute({from:pathname,to:href})}} prefetch><span>{pending?'•':icon}</span><small>{pending?'Opening…':label}</small></Link>})}</nav>
}
