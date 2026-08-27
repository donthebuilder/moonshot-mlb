import Link from 'next/link'

export default function FranchisePortalLink() {
  return <Link aria-label="Open Franchise fantasy football" href="/fantasy" style={{
    position:'fixed',zIndex:90,right:14,bottom:'max(14px,env(safe-area-inset-bottom))',
    display:'flex',alignItems:'center',gap:9,padding:'11px 14px',border:'1px solid rgba(249,115,22,.5)',
    borderRadius:999,background:'linear-gradient(135deg,rgba(38,22,14,.96),rgba(18,18,18,.96))',
    boxShadow:'0 12px 36px rgba(0,0,0,.45),0 0 24px rgba(249,115,22,.12)',backdropFilter:'blur(14px)',
    color:'#f97316',textDecoration:'none',font:'900 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace',letterSpacing:'.08em',
  }}><span style={{display:'grid',placeItems:'center',width:22,height:22,borderRadius:7,background:'linear-gradient(135deg,#f97316,#ef4444)',color:'#fff',fontSize:11}}>F</span><span><small style={{display:'block',marginBottom:3,color:'#777',fontSize:7,letterSpacing:'.12em'}}>FANTASY FOOTBALL</small>FRANCHISE →</span></Link>
}
