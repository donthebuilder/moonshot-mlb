exec(open('load.py').read().replace("os.path.dirname(os.path.abspath(__file__))","'/private/tmp/claude-501/-Volumes-DONX-USERS-Kingdondondon-Desktop-moonshot-push/15979ad8-547a-4566-8eb5-38c0310baa0f/scratchpad/inv'"))
import numpy as np, math
from scipy import stats
def wilson(k,n,z=1.96):
    if n==0: return (float('nan'),)*2
    p=k/n; d=1+z*z/n; c=p+z*z/(2*n); a=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))
    return ((c-a)/d,(c+a)/d)
def fmt(k,n):
    lo,hi=wilson(k,n); return f"{k}/{n} {100*k/n:.1f}% [{100*lo:.1f},{100*hi:.1f}]" if n else "0/0"
for c in ['actual_hr','actual_ab','plate_appearances','hr_score','season_hr','season_pa','last5_hr','last10_hr']:
    df[c]=pd.to_numeric(df[c],errors='coerce')
print('rows',len(df),'with actual_ab notnull',df.actual_ab.notna().sum(),'ab>0',(df.actual_ab>0).sum(), 'actual_hr notnull', df.actual_hr.notna().sum())
# dedupe per (day, player_id, game_pk): keep last
d=df.sort_values('_day').drop_duplicates(['_day','player_id','game_pk'],keep='last')
print('dedup',len(d), 'dups removed', len(df)-len(d))
d=d[d.actual_hr.notna()]
d['hr']=(d.actual_hr>0).astype(int)
d['played']=(d.actual_ab.fillna(0)>0)|(d.plate_appearances.fillna(0)>0)
print('played share',d.played.mean(), 'rate among all', d.hr.mean(), 'among played', d[d.played].hr.mean())
d['locked']=d._fs
print(d.groupby('locked').apply(lambda g: pd.Series({'n':len(g),'played':g.played.sum(),'hr_rate_played':g[g.played].hr.mean(),'first':g._day.min(),'last':g._day.max(),'nights':g._day.nunique()})))
d.to_pickle('d.pkl')
# LEAK replication
for col in ['last5_hr','last10_hr','l20pa_hr','season_hr']:
    for lk in [False,True]:
        g=d[(d.locked==lk)&d.played&d[col].notna()] if col in d else None
        if g is None or len(g)==0: continue
        z=g[pd.to_numeric(g[col],errors='coerce')==0]; nz=g[pd.to_numeric(g[col],errors='coerce')>0]
        print(f"{col:10s} locked={lk!s:5s} zero: {fmt(int(z.hr.sum()),len(z))}   >0: {fmt(int(nz.hr.sum()),len(nz))}   base {100*g.hr.mean():.1f}%")
