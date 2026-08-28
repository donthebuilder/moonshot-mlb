'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import styles from '../../fantasy.module.css'

const items=[
  ['team','▣','Team'],
  ['matchup','⚔','Matchup'],
  ['league','▤','League'],
  ['wire','⚡','Wire'],
  ['coach','✦','Coach'],
]

export default function LeagueMobileNav({leagueId}) {
  const pathname=usePathname()
  const [pendingRoute,setPendingRoute]=useState(null)
  return <nav className={styles.leagueMobileNav}>{items.map(([route,icon,label])=>{const href=`/fantasy/league/${leagueId}/${route}`;const active=pathname===href;const pending=pendingRoute?.from===pathname&&pendingRoute?.to===href&&!active;return <Link aria-busy={pending} className={active?styles.leagueMobileActive:''} href={href} key={route} onClick={()=>{if(!active)setPendingRoute({from:pathname,to:href})}} prefetch><span>{pending?'•':icon}</span><small>{pending?'Opening…':label}</small></Link>})}</nav>
}
