'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
  return <nav className={styles.leagueMobileNav}>{items.map(([route,icon,label])=>{const href=`/fantasy/league/${leagueId}/${route}`;const active=pathname===href;return <Link className={active?styles.leagueMobileActive:''} href={href} key={route}><span>{icon}</span><small>{label}</small></Link>})}</nav>
}
