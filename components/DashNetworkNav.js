'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { setSport, useSport } from '../lib/sport'

const products=[
  {key:'mlb',name:'MOONSHOT',meta:'MLB',href:'/#sport=mlb&tab=home',color:'#f97316'},
  {key:'nfl',name:'TUDDY',meta:'NFL',href:'/#sport=nfl&tab=picks',color:'#22c55e'},
  {key:'fantasy',name:'FRANCHISE',meta:'FANTASY',href:'/fantasy',color:'#ff633e'},
]

export default function DashNetworkNav() {
  const pathname=usePathname()
  const sport=useSport()
  const [open,setOpen]=useState(false)
  const current=pathname.startsWith('/fantasy')?'fantasy':sport
  const switchProduct=(event,key)=>{if(pathname==='/'&&key!=='fantasy'){event.preventDefault();setSport(key)}setOpen(false)}
  return <div className={`dash-network-switcher ${pathname.startsWith('/fantasy')?'dash-network-fantasy':''}`}>
    {open&&<div className="dash-network-menu"><div className="dash-network-title"><small>WELCOME TO</small><strong>DASH NETWORK</strong><span>One network. Three ways to play.</span></div>{products.map((product)=><Link aria-current={current===product.key?'page':undefined} href={product.href} key={product.key} onClick={(event)=>switchProduct(event,product.key)} style={{'--product':product.color}}><i>{product.name.slice(0,1)}</i><span><b>{product.name}</b><small>{product.meta}</small></span>{current===product.key?<em>YOU ARE HERE</em>:<em>OPEN →</em>}</Link>)}</div>}
    <button aria-expanded={open} aria-label="Open DASH Network product navigation" onClick={()=>setOpen((value)=>!value)}><span>DN</span><div><small>DASH</small><b>NETWORK</b></div><i>{open?'×':'⌃'}</i></button>
    <style jsx global>{`.dash-network-switcher{position:fixed;z-index:120;left:14px;bottom:max(14px,env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif}.dash-network-switcher>button{display:flex;align-items:center;gap:8px;height:48px;padding:6px 11px 6px 7px;border:1px solid #383431;border-radius:14px;background:rgba(15,15,15,.94);color:#f4f1eb;box-shadow:0 14px 40px rgba(0,0,0,.48);backdrop-filter:blur(18px);cursor:pointer}.dash-network-switcher>button>span{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(145deg,#ff8c35,#ef4444);color:#fff;font:900 10px/1 monospace}.dash-network-switcher>button div{text-align:left}.dash-network-switcher>button small,.dash-network-switcher>button b{display:block}.dash-network-switcher>button small{color:#777;font:800 7px/1 monospace;letter-spacing:.14em}.dash-network-switcher>button b{margin-top:3px;font:900 10px/1 monospace;letter-spacing:.06em}.dash-network-switcher>button>i{margin-left:4px;color:#f97316;font-style:normal}.dash-network-menu{position:absolute;left:0;bottom:58px;width:min(330px,calc(100vw - 28px));overflow:hidden;border:1px solid #383431;border-radius:16px;background:rgba(14,14,14,.98);box-shadow:0 24px 70px rgba(0,0,0,.65);backdrop-filter:blur(22px)}.dash-network-title{padding:17px;border-bottom:1px solid #292725;background:radial-gradient(circle at 90% 0,rgba(249,115,22,.13),transparent 50%)}.dash-network-title small,.dash-network-title strong,.dash-network-title span{display:block}.dash-network-title small{color:#f97316;font:900 7px/1 monospace;letter-spacing:.15em}.dash-network-title strong{margin-top:6px;font-size:18px}.dash-network-title span{margin-top:5px;color:#777;font-size:10px}.dash-network-menu>a{display:grid;grid-template-columns:37px 1fr auto;align-items:center;gap:10px;min-height:57px;padding:8px 12px;border-bottom:1px solid #252321;color:#ddd;text-decoration:none}.dash-network-menu>a:last-child{border:0}.dash-network-menu>a:hover,.dash-network-menu>a[aria-current=page]{background:color-mix(in srgb,var(--product) 9%,transparent)}.dash-network-menu>a>i{display:grid;place-items:center;width:34px;height:34px;border:1px solid color-mix(in srgb,var(--product) 46%,#333);border-radius:10px;background:color-mix(in srgb,var(--product) 13%,#111);color:var(--product);font:900 11px/1 monospace}.dash-network-menu>a span b,.dash-network-menu>a span small{display:block}.dash-network-menu>a span b{font-size:11px}.dash-network-menu>a span small{margin-top:4px;color:#777;font:800 7px/1 monospace}.dash-network-menu>a em{color:var(--product);font:900 7px/1 monospace;font-style:normal}.dash-network-fantasy{bottom:calc(82px + env(safe-area-inset-bottom))}@media(min-width:761px){.dash-network-fantasy{bottom:14px}}`}</style>
  </div>
}
