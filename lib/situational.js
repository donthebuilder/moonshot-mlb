// Situational splits, pulled live from the MLB StatsAPI (statsapi.mlb.com).
//
// This is the first data source on the site that isn't the bot's data branch.
// It's justified because the API is public, CORS-open (verified — the site can
// call it straight from the browser), and it carries splits the bot doesn't
// publish. Everything here was checked against a live 2026 response
// (Zack Wheeler, sitCodes h/a) before this file was written; the sitCodes
// below are from /api/v1/situationCodes, fetched and verified 2026-08-04.
//
// WHAT'S PULLED AND WHY — the shortlist that survived the archive audit
// thinking, not the whole menu:
//
//   PITCHER (2 calls, on demand per modal):
//     h, a           home/away HR9 — park-entangled arms have real 0.5+ gaps
//     pi000, pi760   first 75 pitches vs 76+ — the fatigue/TTO proxy; there is
//                    no direct times-through-order sitCode, pitch-count
//                    buckets are the API's version of it
//     dr4, dr5       4 days vs 5+ days rest
//
//   BATTER (1 call, on demand per modal):
//     h, a           home/away — ISO context for park-dependent bats
//     risp           runners in scoring position — grades the HRR/CONTACT job
//     ac, 2s         ahead in count / two strikes — where HRs live vs where
//                    Ks live; feeds the K-risk read with hitter-specific data
//
// ON-DEMAND ONLY. These fetch when a modal opens, one player at a time, and
// cache for the session. No slate-wide sweep: 268 hitters × splits on load
// would hammer a public API for numbers nobody's looking at.
//
// NOT VALIDATED AGAINST THE ARCHIVE — none of these appear in graded files,
// so unlike ISO (measured, 8.2%→22.2%) these are shown as context, not folded
// into any score. The bot-side plan for making them scoreable is in
// BOT-DATA-REQUESTS.md. If a split shows, it's real API data; if the API has
// no sample (e.g. a rookie with no away PA), the row is omitted rather than
// zero-filled.

const API = 'https://statsapi.mlb.com/api/v1'
const cache = new Map()

const f = (v) => {
  const x = parseFloat(v)
  return Number.isFinite(x) ? x : null
}

async function fetchSplits(pid, group, sitCodes, season) {
  const key = `${pid}:${group}:${sitCodes}`
  if (cache.has(key)) return cache.get(key)
  const url = `${API}/people/${pid}/stats?stats=statSplits&group=${group}&season=${season}&sitCodes=${sitCodes}`
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const out = {}
      const splits = j?.stats?.[0]?.splits || []
      splits.forEach((s) => {
        if (s?.split?.code && s?.stat) out[s.split.code] = s.stat
      })
      return out
    })
    .catch(() => ({}))
  cache.set(key, p)
  return p
}

const season = () => {
  const d = new Date()
  // January–February belong to last season's data.
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear()
}

// ── pitcher ──────────────────────────────────────────────────────────────────
// Returns rows ready to render: [{label, a, b, aLabel, bLabel, worse}], where
// `worse` marks which side the damage is on so the UI can tint it.
export async function pitcherSituational(pid) {
  if (!pid) return []
  const [ha, fatigue, rest] = await Promise.all([
    fetchSplits(pid, 'pitching', 'h,a', season()),
    fetchSplits(pid, 'pitching', 'pi000,pi760', season()),
    fetchSplits(pid, 'pitching', 'dr4,dr5', season()),
  ])
  const rows = []
  const hr9 = (s) => f(s?.homeRunsPer9)
  const slgA = (s) => f(s?.slg)

  if (ha.h && ha.a && hr9(ha.h) != null && hr9(ha.a) != null) {
    rows.push({
      key: 'ha', label: 'HR/9 home vs away',
      a: hr9(ha.h), b: hr9(ha.a), aLabel: 'home', bLabel: 'away',
      note: `SLG against ${ha.h.slg} / ${ha.a.slg}`,
      worse: hr9(ha.h) > hr9(ha.a) ? 'a' : 'b',
    })
  }
  if (fatigue.pi000 && fatigue.pi760 && slgA(fatigue.pi000) != null && slgA(fatigue.pi760) != null) {
    rows.push({
      key: 'fatigue', label: 'SLG against, pitches 1–75 vs 76+',
      a: slgA(fatigue.pi000), b: slgA(fatigue.pi760), aLabel: '≤75', bLabel: '76+',
      dp: 3,
      note: `HR/9 ${f(fatigue.pi000?.homeRunsPer9) ?? '—'} → ${f(fatigue.pi760?.homeRunsPer9) ?? '—'} · the closest thing the API has to times-through-order`,
      worse: slgA(fatigue.pi760) > slgA(fatigue.pi000) ? 'b' : 'a',
    })
  }
  if (rest.dr4 && rest.dr5 && f(rest.dr4?.era) != null && f(rest.dr5?.era) != null) {
    rows.push({
      key: 'rest', label: 'ERA on 4 days rest vs 5+',
      a: f(rest.dr4.era), b: f(rest.dr5.era), aLabel: '4d', bLabel: '5d+',
      worse: f(rest.dr4.era) > f(rest.dr5.era) ? 'a' : 'b',
    })
  }
  const gbfb = [s.vgb, s.vfb]
  if (gbfb[0] && gbfb[1] && f(gbfb[0]?.slg) != null && f(gbfb[1]?.slg) != null) {
    rows.push({
      key: 'gbfb', label: 'SLG vs ground-ball vs fly-ball pitchers',
      a: f(gbfb[0].slg), b: f(gbfb[1].slg), aLabel: 'GB arms', bLabel: 'FB arms', dp: 3,
      note: 'Tonight’s starter has a batted-ball identity — this is how he handles each kind',
      good: f(gbfb[1].slg) >= f(gbfb[0].slg) ? 'b' : 'a',
    })
  }
  return rows
}

// Per-lineup-slot damage: what the arm allows to each batting-order slot,
// season-long, via sitCodes b1..b9. Returns [{slot, ops, hr, ab}] or [].
export async function pitcherSlotDamage(pid) {
  if (!pid) return []
  const s = await fetchSplits(pid, 'pitching', 'b1,b2,b3,b4,b5,b6,b7,b8,b9', season())
  const out = []
  for (let k = 1; k <= 9; k++) {
    const st = s['b' + k]
    if (st && f(st.ops) != null) out.push({ slot: k, ops: f(st.ops), hr: Number(st.homeRuns) || 0, ab: Number(st.atBats) || 0 })
  }
  return out
}

// ── batter ───────────────────────────────────────────────────────────────────
export async function batterSituational(pid) {
  if (!pid) return []
  const s = await fetchSplits(pid, 'hitting', 'h,a,risp,ac,2s,d7,d30,vgb,vfb', season())
  const rows = []
  const iso = (x) => {
    const slg = f(x?.slg), avg = f(x?.avg)
    return slg != null && avg != null ? slg - avg : null
  }

  if (s.h && s.a && iso(s.h) != null && iso(s.a) != null) {
    rows.push({
      key: 'ha', label: 'ISO home vs away',
      a: iso(s.h), b: iso(s.a), aLabel: 'home', bLabel: 'away', dp: 3,
      note: `OPS ${s.h.ops} / ${s.a.ops}`,
      good: iso(s.h) >= iso(s.a) ? 'a' : 'b',
    })
  }
  if (s.risp && f(s.risp?.ops) != null) {
    rows.push({
      key: 'risp', label: 'With runners in scoring position',
      single: `${s.risp.avg} AVG · ${s.risp.ops} OPS · ${s.risp.rbi ?? 0} RBI in ${s.risp.atBats ?? 0} AB`,
      note: 'This is the HRR/CONTACT job — cashing traffic, not clearing fences',
    })
  }
  if (s.ac && f(s.ac?.slg) != null) {
    rows.push({
      key: 'ac', label: 'Ahead in the count',
      single: `${s.ac.slg} SLG · ${s.ac.homeRuns ?? 0} of his HR`,
      note: 'Where home runs live — a big gap here means he needs the count to do damage',
    })
  }
  if (s.d7 && f(s.d7?.ops) != null) {
    rows.push({
      key: 'd7', label: 'Last 7 days',
      single: `${s.d7.avg} AVG · ${s.d7.ops} OPS · ${s.d7.homeRuns ?? 0} HR in ${s.d7.atBats ?? 0} AB`,
      note: 'Calendar week, not games — the rawest read on right now',
    })
  }
  if (s.d30 && f(s.d30?.ops) != null) {
    rows.push({
      key: 'd30', label: 'Last 30 days',
      single: `${s.d30.avg} AVG · ${s.d30.ops} OPS · ${s.d30.homeRuns ?? 0} HR in ${s.d30.atBats ?? 0} AB`,
      note: 'The month view — big enough to mean something, fresh enough to matter',
    })
  }
  if (s['2s'] && f(s['2s']?.ops) != null) {
    rows.push({
      key: '2s', label: 'With two strikes',
      single: `${s['2s'].avg} AVG · ${s['2s'].ops} OPS`,
      note: 'The K-risk read, from his own at-bats rather than a blended rate',
    })
  }
  return rows
}
