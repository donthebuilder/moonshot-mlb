import pandas as pd, numpy as np, math
exec(open('a2.py').read().split("d['hrpa']")[0].split("d=pd.read_pickle")[0])
d=pd.read_pickle('d.pkl'); d=d[d.played].copy()
exec("def wilson(k,n,z=1.96):\n    p=k/n; dd=1+z*z/n; c=p+z*z/(2*n); a=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n)); return ((c-a)/dd,(c+a)/dd)")
def fmt(k,n):
    lo,hi=wilson(k,n); return f"{k}/{n} {100*k/n:.1f}% [{100*lo:.1f},{100*hi:.1f}]"
from scipy import stats
def auc(y,s):
    m=~(pd.isna(s)|pd.isna(y)); y=np.array(y[m]).astype(int);s=np.array(s[m],float)
    if y.sum()==0 or y.sum()==len(y): return float('nan'),0
    r=stats.rankdata(s); n1=y.sum(); n0=len(y)-n1
    return (r[y==1].sum()-n1*(n1+1)/2)/(n1*n0), len(y)
num=lambda c: pd.to_numeric(d.get(c),errors='coerce')
d['hit1']=(num('actual_hits')>=1).astype(float); d['hrr2']=(num('actual_hits')+num('actual_runs')+num('actual_rbi')>=2).astype(float); d['tb2']=(num('actual_tb')>=2).astype(float)
for c in ['hit_score','hrr_score','contact_score','tb_score','hr_score','season_avg','season_slg']: d[c]=num(c)
print('role value counts (locked):'); print(d[d.locked].game_pick_role.fillna('').value_counts().head(12))
print('BASE RATES played rows: hit>=1 %.3f  hrr>=2 %.3f  tb>=2 %.3f hr %.3f'%(d.hit1.mean(),d.hrr2.mean(),d.tb2.mean(),d.hr.mean()))
tg={'HR':('hr','hr_score'),'TOP':('hr','hr_score'),'HIT':('hit1','hit_score'),'HRR':('hrr2','hrr_score'),'CONTACT':('tb2','contact_score')}
for lk in (False,True):
    g=d[d.locked==lk]; print('--- locked',lk,'n',len(g))
    for role,(tgt,sc) in tg.items():
        has=g[g.game_pick_role.fillna('').str.upper().str.split('/').apply(lambda L: role in [x.strip() for x in L])]
        if len(has)==0: print(role,'n=0'); continue
        base=g[tgt].mean()
        a,n=auc(g[tgt],g[sc])
        print(f"{role:8s} called n={len(has):4d} target-rate {fmt(int(has[tgt].sum()),len(has))} | all-played base {100*base:.1f}% | score AUC (all rows) {a:.3f} n={n}")
# simple baselines for HIT: season_avg ; for TB2: season_slg
g=d[d.locked]
print('HIT: hit_score AUC %.3f vs season_avg AUC %.3f'%(auc(g.hit1,g.hit_score)[0], auc(g.hit1,pd.to_numeric(g.season_avg,errors='coerce'))[0]))
print('TB2: contact_score AUC %.3f vs season_slg AUC %.3f'%(auc(g.tb2,g.contact_score)[0], auc(g.tb2,pd.to_numeric(g.season_slg,errors='coerce'))[0]))
print('HRR2: hrr_score AUC %.3f vs season_slg %.3f'%(auc(g.hrr2,g.hrr_score)[0], auc(g.hrr2,pd.to_numeric(g.season_slg,errors='coerce'))[0]))
g=d[~d.locked]
print('UNLOCKED HIT: %.3f vs avg %.3f ; TB2 %.3f vs slg %.3f ; HRR2 %.3f'%(auc(g.hit1,g.hit_score)[0],auc(g.hit1,pd.to_numeric(g.season_avg,errors='coerce'))[0],auc(g.tb2,g.contact_score)[0],auc(g.tb2,pd.to_numeric(g.season_slg,errors='coerce'))[0],auc(g.hrr2,g.hrr_score)[0]))
