import pandas as pd, numpy as np, math
from scipy import stats
d=pd.read_pickle('d.pkl'); d=d[d.played].copy()
def wilson(k,n,z=1.96):
    p=k/n; dd=1+z*z/n; c=p+z*z/(2*n); a=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n)); return ((c-a)/dd,(c+a)/dd)
def fmt(k,n):
    lo,hi=wilson(k,n); return f"{k}/{n} {100*k/n:.1f}% [{100*lo:.1f},{100*hi:.1f}]"
def auc(y,s):
    m=~(pd.isna(s)|pd.isna(y)); y=np.array(y[m]);s=np.array(s[m],float)
    if y.sum()==0 or y.sum()==len(y): return float('nan'),0
    r=stats.rankdata(s); n1=y.sum(); n0=len(y)-n1
    return (r[y==1].sum()-n1*(n1+1)/2)/(n1*n0), len(y)
def auc_ci(y,s,B=300,seed=1):
    rng=np.random.default_rng(seed); m=~(pd.isna(s)|pd.isna(y)); y=np.array(y[m]);s=np.array(s[m],float); out=[]
    for _ in range(B):
        i=rng.integers(0,len(y),len(y)); a,_=auc(pd.Series(y[i]),pd.Series(s[i])); out.append(a)
    return np.nanpercentile(out,[2.5,97.5])
d['hrpa']=pd.to_numeric(d.season_hr,errors='coerce')/pd.to_numeric(d.season_pa,errors='coerce')
d['iso']=pd.to_numeric(d.season_iso,errors='coerce')
for c in ['hr_score','hit_score','hrr_score','contact_score','top_board_score_v2','season_hr_game_probability','board_rank','rank']:
    d[c]=pd.to_numeric(d.get(c),errors='coerce')
print('== AUC for HR (played rows) ==')
for lk,name in [(False,'UNLOCKED (Apr16-Aug21)'),(True,'LOCKED (Aug22-Oct8)')]:
    g=d[d.locked==lk]
    print(name,'n',len(g),'base',f"{100*g.hr.mean():.1f}%")
    for c in ['hr_score','hrpa','iso','season_hr_game_probability']:
        a,n=auc(g.hr,g[c]); lo,hi=auc_ci(g.hr,g[c]) if n>0 else (0,0)
        print(f"   {c:28s} AUC {a:.3f} [{lo:.3f},{hi:.3f}] n={n}")
# deciles locked
g=d[d.locked&d.hr_score.notna()].copy()
g['dec']=pd.qcut(g.hr_score,10,labels=False,duplicates='drop')
print('LOCKED hr_score deciles:')
for k,gg in g.groupby('dec'): print('  d%d score %.1f-%.1f  %s'%(k,gg.hr_score.min(),gg.hr_score.max(),fmt(int(gg.hr.sum()),len(gg))))
# top-N per night
for lk in [False,True]:
    gg=d[(d.locked==lk)&d.hr_score.notna()]
    for N in (5,10,20):
        top=gg.sort_values(['_day','hr_score'],ascending=[True,False]).groupby('_day').head(N)
        # baseline: same N picked by hrpa
        top2=gg[gg.hrpa.notna()].sort_values(['_day','hrpa'],ascending=[True,False]).groupby('_day').head(N)
        print(f"locked={lk!s:5} top{N}/night: model {fmt(int(top.hr.sum()),len(top))} | season HR/PA rule {fmt(int(top2.hr.sum()),len(top2))} | all {100*gg.hr.mean():.1f}%")
# chronological halves for locked
L=d[d.locked].sort_values('_day'); days=sorted(L._day.unique()); mid=days[len(days)//2]
for nm,gg in [('first half to '+mid,L[L._day<mid]),('second half',L[L._day>=mid])]:
    a,n=auc(gg.hr,gg.hr_score); b,_=auc(gg.hr,gg.hrpa); print(nm,'n',n,f"AUC hr_score {a:.3f} vs hrpa {b:.3f} base {100*gg.hr.mean():.1f}%")
# postseason split in locked: days >= 2026-09-29
for nm,gg in [('regular(<=09-28)',L[L._day<='2026-09-28']),('postseason(>=09-29)',L[L._day>='2026-09-29'])]:
    a,n=auc(gg.hr,gg.hr_score); b,_=auc(gg.hr,gg.hrpa); print(nm,'n',n,f"AUC hr_score {a:.3f} hrpa {b:.3f} base {100*gg.hr.mean():.1f}%")
