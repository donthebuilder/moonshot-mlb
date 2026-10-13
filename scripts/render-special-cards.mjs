// SPECIAL CARD PREVIEWS: one PNG per moment (lib/cards/moments.js) from a REAL recent event (read-only), else a TEST fixture that prints
// TEST DATA on its face, plus a contact sheet. Nothing is written to the database; nothing is posted.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-special-cards.mjs <outDir> [--env <file>] [--test-only] [--days 14]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const out = args.find((a) => !a.startsWith('--') && a !== flag('--env') && a !== flag('--days'))
if (!out) { console.error('usage: render-special-cards.mjs <outDir> [--env <file>] [--test-only] [--days N]'); process.exit(2) }
mkdirSync(out, { recursive: true })

// the database key lives in an env file and is read into process.env here, never printed
const envFile = flag('--env') || '.env.local'
if (!args.includes('--test-only') && existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
const { MOMENT_KEYS, MOMENTS, tierRank } = await import('../lib/cards/moments.js')
const { buildSpecialModel, modelFromRow, candidates } = await import('../lib/cards/specialData.js')
const { renderSpecial } = await import('../lib/cards/specialCard.js')
const F = await import('../lib/cards/specialFixtures.js')
const { adminClient } = await import('../lib/supabase/admin.js')

const db = args.includes('--test-only') ? null : adminClient({ anon: true })
const days = Number(flag('--days')) || 14
const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10)

const TEST_OF = {
  nhl_goal: F.TEST_GOAL, nhl_hat_trick: F.TEST_HAT, nhl_three_points: F.TEST_POINTS, nhl_season_goal_milestone: F.TEST_MILESTONE,
  mlb_multi_hr: F.TEST_MULTI_HR, nfl_multi_td: F.TEST_MULTI_TD, nfl_100_yards: F.TEST_100, long_shot_cashed: F.TEST_LONG_SHOT,
}
const made = []
const save = async (name, model) => {
  const png = await renderSpecial(model)
  writeFileSync(`${out}/${name}.png`, png)
  made.push({ name, file: `${out}/${name}.png`, moment: model.moment.key, tier: model.moment.tier, holo: model.moment.holo, shimmer: model.moment.shimmer, real: !model.test })
  console.log(`${name}.png  ${png.length} bytes  ${model.moment.tier}${model.moment.holo ? ' HOLO' : model.moment.shimmer ? ' SHIMMER' : ''}  ${model.test ? 'TEST' : 'REAL'}`)
}
const testModel = (key, row, o = {}) => buildSpecialModel(key, row, { test: true, ident: {}, ...o })

for (const key of MOMENT_KEYS) {
  let real = null
  if (db) {
    try {
      const c = await candidates(key, db, { since })
      // the rarest real event first, then one the source labelled CALLED (the label is the source's, never forced), then the newest
      const rank = (x) => tierRank(MOMENTS[key].tierOf(x.row)) * 10 + (MOMENTS[key].statusOf(x.row) === 'called' ? 1 : 0)
      const pick = [...c].sort((a, b) => rank(b) - rank(a))[0]
      console.log(`${key}: ${c.length} real events since ${since}${pick ? `, using ${pick.id}` : ''}`)
      if (pick) real = await modelFromRow(key, pick.row)
    } catch (e) { console.error(`${key}: read failed (${e?.message || e})`) }
  }
  if (real) await save(key, real)
  else await save(`${key}-TEST`, testModel(key, TEST_OF[key]))
}
// TEST variants that show the rest of the look (always labelled TEST)
await save('nhl_goal-nocall-longname-TEST', testModel('nhl_goal', F.TEST_GOAL_NOCALL))
await save('nhl_goal-overtime-TEST', testModel('nhl_goal', F.TEST_GOAL_OT))
await save('nhl_goal-holo-forced-TEST', testModel('nhl_goal', F.TEST_GOAL, { holo: true }))
await save('nhl_three_points-TEST', testModel('nhl_three_points', F.TEST_POINTS))
await save('mlb_multi_hr-two-nocall-TEST', testModel('mlb_multi_hr', F.TEST_MULTI_HR_2))
await save('nfl_100_yards-legend-TEST', testModel('nfl_100_yards', F.TEST_200))
await save('nhl_hat_trick-legend-TEST', testModel('nhl_hat_trick', { ...F.TEST_HAT, goals: [...F.TEST_HAT.goals, { ...F.TEST_HAT.goals[2], goal_n: 4, time_in_period: '19:59' }] }))

// the contact sheet: every image at 270 wide, 4 across
try {
  const sharp = (await import('sharp')).default
  const W = 270, H = 338, cols = 4, rows = Math.ceil(made.length / cols)
  const tiles = await Promise.all(made.map(async (m, i) => ({ input: await sharp(m.file).resize(W, H).png().toBuffer(), left: (i % cols) * (W + 12) + 12, top: Math.floor(i / cols) * (H + 12) + 12 })))
  await sharp({ create: { width: cols * (W + 12) + 12, height: rows * (H + 12) + 12, channels: 4, background: { r: 12, g: 11, b: 10, alpha: 1 } } }).composite(tiles).png().toFile(`${out}/contact-sheet.png`)
  console.log('contact-sheet.png')
} catch (e) { console.error(`no contact sheet (${e?.message || e})`) }
writeFileSync(`${out}/manifest.json`, JSON.stringify(made.map(({ name, moment, tier, holo, shimmer, real }) => ({ name, moment, tier, holo, real })), null, 2))
