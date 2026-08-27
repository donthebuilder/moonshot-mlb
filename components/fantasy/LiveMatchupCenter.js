'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const REFRESH_SECONDS=30

export default function LiveMatchupCenter({leagueId,live,lastUpdated}) {
  const router=useRouter()
  const [seconds,setSeconds]=useState(REFRESH_SECONDS)
  const [refreshing,setRefreshing]=useState(false)
  const busy=useRef(false)

  const refresh=useCallback(async()=>{
    if(busy.current)return
    busy.current=true;setRefreshing(true)
    try{await fetch(`/api/fantasy/scoring?leagueId=${encodeURIComponent(leagueId)}`,{method:'POST',cache:'no-store'});router.refresh();setSeconds(REFRESH_SECONDS)}
    finally{busy.current=false;setRefreshing(false)}
  },[leagueId,router])

  useEffect(()=>{
    const timer=setInterval(()=>setSeconds((value)=>{
      if(document.visibilityState!=='visible')return value
      if(value<=1){refresh();return REFRESH_SECONDS}
      return value-1
    }),1000)
    return()=>clearInterval(timer)
  },[refresh])

  return <section className={`liveMatchupControl ${live?'liveMatchupActive':''}`}>
    <span className="liveMatchupPulse"/>
    <div><small>{live?'LIVE GAME CENTER':'GAME CENTER'}</small><strong>{live?'Fantasy scores are updating':'Waiting for NFL action'}</strong><em>{lastUpdated?`Feed checked ${new Date(lastUpdated).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:'First update will run automatically'}</em></div>
    <button onClick={refresh} disabled={refreshing}>{refreshing?'Updating…':`Refresh · ${seconds}s`}</button>
  </section>
}
