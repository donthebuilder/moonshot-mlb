'use client'

function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function fitText(ctx,text,maxWidth,start=54,min=28){let size=start;while(size>min){ctx.font=`900 ${size}px Arial`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size}

export default function CoachShareCard({ team, league, score, grade, headline, detail, className }) {
  const download = () => {
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675
    const ctx=canvas.getContext('2d');if(!ctx)return
    const bg=ctx.createLinearGradient(0,0,1200,675);bg.addColorStop(0,'#071015');bg.addColorStop(.52,'#111214');bg.addColorStop(1,'#17100d');ctx.fillStyle=bg;ctx.fillRect(0,0,1200,675)
    const glow=ctx.createRadialGradient(980,95,0,980,95,430);glow.addColorStop(0,'rgba(40,185,231,.24)');glow.addColorStop(1,'rgba(40,185,231,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,1200,675)
    ctx.fillStyle='#ff633e';ctx.fillRect(0,0,1200,9)
    ctx.fillStyle='#ff633e';ctx.font='900 24px Arial';ctx.fillText('DASH NETWORK',62,72)
    ctx.fillStyle='#747b82';ctx.font='900 15px monospace';ctx.fillText('FRANCHISE · DASH INTELLIGENCE',62,102)
    ctx.fillStyle='#f4f1eb';ctx.font=`900 ${fitText(ctx,team||league||'MY TEAM',650)}px Arial`;ctx.fillText(team||league||'MY TEAM',62,184)
    ctx.fillStyle='#777f85';ctx.font='700 18px monospace';ctx.fillText(String(league||'').toUpperCase(),64,217)
    ctx.fillStyle='rgba(8,12,15,.82)';rounded(ctx,62,266,260,250,26)
    ctx.strokeStyle='rgba(40,185,231,.42)';ctx.lineWidth=2;ctx.strokeRect(63,267,258,248)
    ctx.fillStyle='#75818a';ctx.font='900 16px monospace';ctx.fillText('DASH SCORE',92,311)
    ctx.fillStyle='#28b9e7';ctx.font='900 126px monospace';ctx.fillText(String(score),82,438)
    ctx.fillStyle='#18c878';ctx.font='900 33px monospace';ctx.fillText(String(grade),237,438)
    ctx.fillStyle='#18c878';ctx.fillRect(92,471,Math.max(8,Math.min(200,Number(score)*2)),7)
    ctx.fillStyle='#7b858b';ctx.fillRect(92+Math.max(8,Math.min(200,Number(score)*2)),471,200-Math.max(8,Math.min(200,Number(score)*2)),7)
    ctx.fillStyle='#18c878';ctx.font='900 15px monospace';ctx.fillText('DASH COACH SAYS',375,304)
    ctx.fillStyle='#f4f1eb';ctx.font=`900 ${fitText(ctx,headline||'Your next move starts here.',710,48,27)}px Arial`
    const words=String(headline||'Your next move starts here.').split(' ');let line='';let y=362
    for(const word of words){const test=`${line}${word} `;if(ctx.measureText(test).width>740&&line){ctx.fillText(line.trim(),375,y);line=`${word} `;y+=58}else line=test}ctx.fillText(line.trim(),375,y)
    ctx.fillStyle='#9b9690';ctx.font='600 20px Arial';const detailWords=String(detail||'').split(' ');line='';y+=52
    for(const word of detailWords){const test=`${line}${word} `;if(ctx.measureText(test).width>730&&line){ctx.fillText(line.trim(),375,y);line=`${word} `;y+=30;if(y>522)break}else line=test}if(y<=522)ctx.fillText(line.trim(),375,y)
    ctx.fillStyle='#5f676c';ctx.font='800 14px monospace';ctx.fillText('TUDDY PROJECTIONS · LEAGUE-SPECIFIC SCORING · PUBLICLY EXPLAINED',62,620)
    ctx.fillStyle='#ff9d42';ctx.textAlign='right';ctx.fillText('DASH IS THE NETWORK. FRANCHISE IS THE ROOM.',1138,620)
    const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`dash-franchise-${String(team||'team').toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`;a.click()
  }
  return <button type="button" className={className} onClick={download}>Download score card ↗</button>
}
