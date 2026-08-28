'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { setSport, useSport } from '../lib/sport'

const products=[
  {key:'mlb',name:'MOONSHOT',meta:'MLB',href:'/#sport=mlb&tab=home',color:'#f97316'},
  {key:'nfl',name:'TUDDY',meta:'NFL',href:'/#sport=nfl&tab=home',color:'#22c55e'},
  {key:'fantasy',name:'FRANCHISE',meta:'FANTASY',href:'/fantasy',color:'#ff633e'},
]

const STORAGE_KEY='dash-network-nav-v1'
const EDGE=14

const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max))

export default function DashNetworkNav() {
  const pathname=usePathname()
  const sport=useSport()
  const [open,setOpen]=useState(false)
  const [collapsed,setCollapsed]=useState(false)
  const [position,setPosition]=useState(null)
  const switcherRef=useRef(null)
  const dragRef=useRef(null)
  const current=pathname.startsWith('/fantasy')?'fantasy':sport
  const switchProduct=(event,key)=>{if(pathname==='/'&&key!=='fantasy'){event.preventDefault();setSport(key)}setOpen(false)}
  const save=useCallback((nextPosition,nextCollapsed=collapsed)=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({position:nextPosition,collapsed:nextCollapsed}))}catch{}
  },[collapsed])

  const fitToViewport=useCallback((candidate=position)=>{
    if(!candidate||!switcherRef.current)return candidate
    const rect=switcherRef.current.getBoundingClientRect()
    return {
      x:clamp(candidate.x,EDGE,window.innerWidth-rect.width-EDGE),
      y:clamp(candidate.y,EDGE,window.innerHeight-rect.height-EDGE),
    }
  },[position])

  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')
      if(saved?.position)setPosition(saved.position)
      if(typeof saved?.collapsed==='boolean')setCollapsed(saved.collapsed)
    }catch{}
  },[])

  useEffect(()=>{
    const handleResize=()=>setPosition((value)=>value?fitToViewport(value):value)
    window.addEventListener('resize',handleResize)
    return ()=>window.removeEventListener('resize',handleResize)
  },[fitToViewport])

  // At its default corner the switcher can sit directly over a row action on
  // short screens. If the uncovered page beneath it is interactive, move the
  // launcher to the opposite edge. A position chosen by the user always wins.
  useEffect(()=>{
    if(position||!switcherRef.current)return
    const timer=window.setTimeout(()=>{
      const rect=switcherRef.current.getBoundingClientRect()
      const underneath=document.elementsFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)
        .find((node)=>!switcherRef.current.contains(node))
      if(underneath?.closest?.('a,button,input,select,textarea,tr,[role="row"],[data-dash-nav-dodge]')){
        const next={x:window.innerWidth-rect.width-EDGE,y:rect.top}
        setPosition(next)
      }
    },350)
    return ()=>window.clearTimeout(timer)
  },[position,pathname])

  const startDrag=(event)=>{
    if(event.button!==0)return
    const rect=switcherRef.current.getBoundingClientRect()
    dragRef.current={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,moved:false}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag=(event)=>{
    const drag=dragRef.current
    if(!drag||drag.pointer!==event.pointerId)return
    const dx=event.clientX-drag.startX
    const dy=event.clientY-drag.startY
    if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true
    if(!drag.moved)return
    event.preventDefault()
    const next=fitToViewport({x:drag.x+dx,y:drag.y+dy})
    drag.next=next
    setPosition(next)
  }
  const endDrag=(event)=>{
    const drag=dragRef.current
    if(!drag||drag.pointer!==event.pointerId)return
    dragRef.current=null
    if(drag.moved){save(drag.next||{x:drag.x,y:drag.y});return}
    setOpen((value)=>!value)
  }
  const toggleCollapsed=()=>{
    const next=!collapsed
    setCollapsed(next)
    setOpen(false)
    save(position,next)
  }

  const positionStyle=position?{left:position.x,top:position.y,bottom:'auto'}:undefined
  return <div ref={switcherRef} style={positionStyle} className={`dash-network-switcher ${pathname.startsWith('/fantasy')?'dash-network-fantasy':''} ${collapsed?'dash-network-collapsed':''}`}>
    {open&&<div className="dash-network-menu"><div className="dash-network-title"><small>WELCOME TO</small><strong>DASH NETWORK</strong><span>One network. Three ways to play.</span><button onClick={toggleCollapsed}>MINIMIZE</button></div>{products.map((product)=><Link aria-current={current===product.key?'page':undefined} href={product.href} key={product.key} onClick={(event)=>switchProduct(event,product.key)} style={{'--product':product.color}}><i>{product.name.slice(0,1)}</i><span><b>{product.name}</b><small>{product.meta}</small></span>{current===product.key?<em>YOU ARE HERE</em>:<em>OPEN →</em>}</Link>)}</div>}
    <button aria-expanded={open} aria-label={open?'Close DASH Network product navigation':'Open DASH Network product navigation'} title="Drag to move · tap to open" onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setOpen((value)=>!value)}}} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={()=>{dragRef.current=null}}><img src="/icon-192.png" alt="" width="34" height="34"/><div><small>DASH</small><b>NETWORK</b></div><i>{open?'×':'⌃'}</i></button>
    <style jsx global>{`.dash-network-switcher{position:fixed;z-index:120;left:14px;bottom:max(14px,env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif;touch-action:none;user-select:none}.dash-network-switcher>button{display:flex;align-items:center;gap:8px;height:48px;padding:6px 11px 6px 7px;border:1px solid #383431;border-radius:14px;background:rgba(15,15,15,.94);color:#f4f1eb;box-shadow:0 14px 40px rgba(0,0,0,.48);backdrop-filter:blur(18px);cursor:grab}.dash-network-switcher>button:active{cursor:grabbing}.dash-network-switcher>button>img{width:34px;height:34px;border-radius:10px;object-fit:cover;pointer-events:none}.dash-network-switcher>button div{text-align:left;pointer-events:none}.dash-network-switcher>button small,.dash-network-switcher>button b{display:block}.dash-network-switcher>button small{color:#777;font:800 7px/1 monospace;letter-spacing:.14em}.dash-network-switcher>button b{margin-top:3px;font:900 10px/1 monospace;letter-spacing:.06em}.dash-network-switcher>button>i{margin-left:4px;color:#f97316;font-style:normal;pointer-events:none}.dash-network-collapsed>button{width:48px;padding:6px}.dash-network-collapsed>button div,.dash-network-collapsed>button>i{display:none}.dash-network-menu{position:absolute;left:0;bottom:58px;width:min(330px,calc(100vw - 28px));overflow:hidden;border:1px solid #383431;border-radius:16px;background:rgba(14,14,14,.98);box-shadow:0 24px 70px rgba(0,0,0,.65);backdrop-filter:blur(22px)}.dash-network-title{position:relative;padding:17px;border-bottom:1px solid #292725;background:radial-gradient(circle at 90% 0,rgba(249,115,22,.13),transparent 50%)}.dash-network-title>button{position:absolute;right:12px;top:12px;padding:5px 7px;border:1px solid #383431;border-radius:7px;background:#171717;color:#999;font:800 7px/1 monospace;letter-spacing:.08em;cursor:pointer}.dash-network-title small,.dash-network-title strong,.dash-network-title span{display:block}.dash-network-title small{color:#f97316;font:900 7px/1 monospace;letter-spacing:.15em}.dash-network-title strong{margin-top:6px;font-size:18px}.dash-network-title span{margin-top:5px;color:#777;font-size:10px}.dash-network-menu>a{display:grid;grid-template-columns:37px 1fr auto;align-items:center;gap:10px;min-height:57px;padding:8px 12px;border-bottom:1px solid #252321;color:#ddd;text-decoration:none}.dash-network-menu>a:last-child{border:0}.dash-network-menu>a:hover,.dash-network-menu>a[aria-current=page]{background:color-mix(in srgb,var(--product) 9%,transparent)}.dash-network-menu>a>i{display:grid;place-items:center;width:34px;height:34px;border:1px solid color-mix(in srgb,var(--product) 46%,#333);border-radius:10px;background:color-mix(in srgb,var(--product) 13%,#111);color:var(--product);font:900 11px/1 monospace}.dash-network-menu>a span b,.dash-network-menu>a span small{display:block}.dash-network-menu>a span b{font-size:11px}.dash-network-menu>a span small{margin-top:4px;color:#777;font:800 7px/1 monospace}.dash-network-menu>a em{color:var(--product);font:900 7px/1 monospace;font-style:normal}.dash-network-fantasy{bottom:calc(82px + env(safe-area-inset-bottom))}@media(min-width:761px){.dash-network-fantasy{bottom:14px}}`}</style>
  </div>
}
