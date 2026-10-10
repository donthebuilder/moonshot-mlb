import json,glob,collections,os
import pandas as pd
D=os.path.dirname(os.path.abspath(__file__))+'/graded'
rows=[]
for f in sorted(glob.glob(D+'/graded_results_2026-*.json')):
    day=f[-15:-5]
    d=json.load(open(f))
    if isinstance(d,list): lst=d; sch='list'
    elif 'results' in d: lst=d['results']; sch='results'
    elif 'graded_picks' in d: lst=d['graded_picks']; sch='gp'
    else: continue
    for r in lst:
        if not isinstance(r,dict): continue
        r=dict(r); r['_day']=day; r['_sch']=sch; r['_fs']=bool(r.get('feature_snapshot')); r['_lr']=bool(r.get('locked_run_id'))
        r.pop('feature_snapshot',None)
        rows.append(r)
df=pd.DataFrame(rows)
