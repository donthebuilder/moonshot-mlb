// WHAT EACH MOONSHOT PICK WAS PICKED TO DO (moved out of components/
// PickScorecard.js 2026-10-02 so the record page and the scorecard read one
// rule; the colours stay in the component). A pick did its job when it
// cleared its own lane's bar -- a HIT pick is judged on a hit, not a homer.
import { clean } from './player'

const i = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export const PICK_JOBS = {
  HR:      { label: 'HR',      job: '1+ HR',          test: (r) => r.gotHr },
  TOP:     { label: 'Top',     job: '1+ HR',          test: (r) => r.gotHr },
  HIT:     { label: 'Hit',     job: '1+ hit',         test: (r) => r.hits > 0 },
  HRR:     { label: 'HRR',     job: '2+ H+R+RBI',     test: (r) => r.hits + r.runs + r.rbi >= 2 },
  CONTACT: { label: 'Contact', job: '2+ total bases', test: (r) => r.tb >= 2 },
  ATS:     { label: 'ATS',     job: 'beat spread',    test: (r) => r.atsHit },
}
export const PICK_JOB_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT', 'ATS']

/** { role, label, job, did } for a graded slot, or null when its lane has no job. */
export function pickJobOf(s) {
  if (!s) return null
  const role = clean(s.game_pick_role || s.pick_type, '').split('/')[0].trim().toUpperCase()
  const j = PICK_JOBS[role]
  if (!j) return null
  const r = {
    gotHr: s.got_hr === 1 || i(s.actual_hr) > 0,
    hits: i(s.actual_hits), runs: i(s.actual_runs),
    rbi: i(s.actual_rbi), tb: i(s.actual_tb),
  }
  return { role, label: j.label, job: j.job, did: j.test(r) }
}
