// GITHUB RUNS THAT GITHUB DROPS (2026-09-27). Server only.
//
// Measured 09-25: GitHub started 11 of today.yml's 24 scheduled runs, 7 of
// results.yml's ~64 and 5 of dash-endpoints.yml's ~84 -- runs take ~2 min and
// nothing queues, GitHub simply doesn't start them. Grading froze, and NFL
// Sunday is a chain of single runs (main build, inactives, live waves, final
// grade) with no retry.
//
// So Vercel's cron (reliable, already every minute for the push tick) backs
// the bot's own schedule up: every 10 minutes it looks at each watched
// workflow's cron lines -- read from the workflow file itself on GitHub, so
// there is no second copy of the schedule to drift -- and for every slot that
// came due 10-25 minutes ago with NO run of that workflow created since the
// slot, it starts one (workflow_dispatch). The 10-minute grace lets GitHub's
// own late start land first; the check means a slot is never started twice
// by us. If both do land, the workflow's own concurrency group queues the
// second -- the same as two scheduled runs.
//
// Needs GITHUB_DISPATCH_TOKEN: a fine-grained token on the bot repo only,
// Actions read + write. Without it, nothing happens (reason: no-token).
const REPO = 'donthebuilder/MLB-HR-DASHBOARD-STREAMLIT'
const API = 'https://api.github.com'
export const WATCHED = ['results.yml', 'today.yml', 'nfl.yml']
const GRACE_MIN = 10
const LOOKBACK_MIN = 25

// A few runs change behaviour on WHICH cron started them
// (github.event.schedule); a dispatched run says the same thing with an input.
const INPUTS_FOR = {
  'nfl.yml': { '3 13 * * 2': { report: 'true' } },                       // nfl.yml's own `github.event.schedule` test
  'today.yml': { '5 7 * * *': { tomorrow: 'true' }, '5 9 * * *': { tomorrow: 'true' } },   // Tomorrow folded into Today (bot 2026-09-27)
}
// Every dispatched run stands in for a dropped SCHEDULED slot, so it says so:
// the bot's offseason guard lets hand-started runs through but not these.
const ALWAYS = { scheduled: 'true' }
// An input is sent only if the workflow file declares it -- GitHub refuses a
// dispatch carrying an undeclared input (422), and this reads the file anyway.
const declared = (yml, name) => new RegExp(`\\n\\s+${name}:\\s*\\n\\s+description:`).test(yml)

/** The quoted strings on `- cron:` lines of a workflow file. Pure. */
export function cronLines(yaml) {
  const out = []
  for (const m of String(yaml || '').matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)) out.push(m[1].trim())
  return out
}

function fieldMatches(field, value, lo, hi) {
  return field.split(',').some((part) => {
    const [range, stepS] = part.split('/')
    const step = stepS ? Number(stepS) : 1
    let a = lo; let b = hi
    if (range !== '*') {
      const [x, y] = range.split('-').map(Number)
      a = x; b = y ?? (stepS ? hi : x)
    }
    return value >= a && value <= b && (value - a) % step === 0
  })
}

/** Does a 5-field cron (UTC) fire at this minute? Pure; no names, no L/W/#. */
export function cronFires(expr, d) {
  const f = expr.split(/\s+/)
  if (f.length !== 5) return false
  const [mi, h, dom, mo, dow] = f
  return fieldMatches(mi, d.getUTCMinutes(), 0, 59) && fieldMatches(h, d.getUTCHours(), 0, 23)
    && fieldMatches(dom, d.getUTCDate(), 1, 31) && fieldMatches(mo, d.getUTCMonth() + 1, 1, 12)
    // Sunday is 0 or 7 in cron.
    && (fieldMatches(dow, d.getUTCDay(), 0, 7) || (d.getUTCDay() === 0 && fieldMatches(dow, 7, 0, 7)))
}

/** Slots (minute Dates) of `exprs` in (now - LOOKBACK, now - GRACE]. Pure. */
export function dueSlots(exprs, now) {
  const out = []
  const end = Math.floor(now / 60e3) * 60e3 - GRACE_MIN * 60e3
  for (let t = end - (LOOKBACK_MIN - GRACE_MIN - 1) * 60e3; t <= end; t += 60e3) {
    const d = new Date(t)
    for (const e of exprs) if (cronFires(e, d)) out.push({ cron: e, at: d })
  }
  return out
}

const gh = (path, token, init = {}) => fetch(`${API}${path}`, {
  ...init,
  headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) },
  cache: 'no-store',
})

export async function dispatchDropped({ dry = false, now = Date.now() } = {}) {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) return { reason: 'no-token', started: [] }
  const out = { started: [], covered: [], errors: [] }
  for (const wf of WATCHED) {
    try {
      const yml = await fetch(`https://raw.githubusercontent.com/${REPO}/main/.github/workflows/${wf}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.text() : ''))
      const slots = dueSlots(cronLines(yml), now)
      if (!slots.length) continue
      // Oldest due slot first; one run covers every slot since it.
      const slot = slots.sort((a, b) => a.at - b.at)[0]
      const since = new Date(slot.at.getTime() - 60e3).toISOString()
      const runs = await gh(`/repos/${REPO}/actions/workflows/${wf}/runs?per_page=1&created=%3E%3D${encodeURIComponent(since)}`, token).then((r) => r.json())
      if (Number(runs?.total_count) > 0) { out.covered.push({ wf, slot: slot.at.toISOString(), cron: slot.cron }); continue }
      if (dry) { out.started.push({ wf, slot: slot.at.toISOString(), cron: slot.cron, dry: true }); continue }
      const wanted = { ...ALWAYS, ...Object.assign({}, ...slots.map((s) => INPUTS_FOR[wf]?.[s.cron] || {})) }
      const inputs = Object.fromEntries(Object.entries(wanted).filter(([k]) => declared(yml, k)))
      const res = await gh(`/repos/${REPO}/actions/workflows/${wf}/dispatches`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', ...(Object.keys(inputs).length ? { inputs } : {}) }),
      })
      if (res.status === 204) out.started.push({ wf, slot: slot.at.toISOString(), cron: slot.cron })
      else out.errors.push({ wf, status: res.status })
    } catch (e) {
      out.errors.push({ wf, error: e?.message })
    }
  }
  return out
}
