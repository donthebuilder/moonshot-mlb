// TOP THREE CARD CHECK (the picture of the night's digest, lib/cards/topThreeCard.js). TEST data only (lib/cards/topThreeFixtures.js: every name says "Test").
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-top-three-card.mjs [--png <dir>]
// Renders 1, 2 and 3 tiles in every tier plus a STRESS set (a 45-character hyphenated name, a 7-point line, a long club, a single-letter name, a 4-digit price,
// no opponent) and asserts:
//   1. the PNG is the 1080 x 1350 design size and renders for every count;
//   2. no text node is under the 22px floor (cardKit lintType, read from LINT);
//   3. every tile's text was MEASURED with the real font files and fits its box: the name (slant reserved) and the moment line at a size >= 32, the matchup line;
//      a name is cut with an ellipsis only when it is 30+ characters long;
//   4. tiles never overlap and the three tiles + header + footer fit the frame (the geometry sums, not just the picture);
//   6. the digest's words and order (lib/cards/digestRank.js): one name = TOP PERFORMER, NFL = TODAY, ties go to the main count over yards, the MLB postseason digest
//      replaces the regular one.
//   5. the tier is drawn as rarity only: LEGEND / ELITE holo, STAR shimmer, and no word on the card is a result word (no CALLED / lock / due / percent).
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const pngDir = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png') + 1] : null
if (pngDir) mkdirSync(pngDir, { recursive: true })
let fails = 0
const bad = (m) => { fails += 1; console.log(`  ERROR ${m}`) }
const ok = (c, m) => { if (!c) bad(m); return c }

const { renderTopThree, tileLayout, topThreeDesign, tileHeight } = await import('../lib/cards/topThreeCard.js')
const { LINT, assets } = await import('../lib/cards/cardKit.js')
const { initMetrics, textWidth, metricsReady } = await import('../lib/cards/fit.js')
const F = await import('../lib/cards/topThreeFixtures.js')
const { fonts } = await assets()
initMetrics(fonts)
ok(metricsReady(), 'font metrics did not load')

const SETS = {
  'three-nhl': F.TEST_MODEL('nhl'),
  'three-nfl': F.TEST_MODEL('nfl', [F.TEST_LEGEND, { ...F.TEST_STAR, line: '151 RUSH YDS' }, { ...F.TEST_STAR_2, line: '3 TOUCHDOWNS' }]),
  'three-mlb': F.TEST_MODEL('mlb', [{ ...F.TEST_ELITE, line: '3 HOME RUNS' }, { ...F.TEST_STAR, line: '2 HOME RUNS' }, { ...F.TEST_STAR_2, line: '2 HOME RUNS' }]),
  'two': F.TEST_MODEL('nhl', [F.TEST_ELITE, F.TEST_STAR]),
  'one': F.TEST_MODEL('nhl', [F.TEST_STAR]),
  'stress': F.TEST_MODEL('nhl', F.TEST_STRESS),
}
console.log('render')
for (const [name, model] of Object.entries(SETS)) {
  LINT.length = 0
  const png = Buffer.from(await renderTopThree(model, { width: 1080 }))
  const meta = await sharp(png).metadata()
  ok(meta.width === 1080 && meta.height === 1350, `${name}: ${meta.width}x${meta.height}, not 1080x1350`)
  ok(LINT.filter((x) => x.card === 'topthree').length === 0, `${name}: text under the 22px floor: ${JSON.stringify(LINT.filter((x) => x.card === 'topthree').slice(0, 3))}`)
  const small = await sharp(Buffer.from(await renderTopThree(model, { width: 540 }))).metadata()
  ok(small.width === 540 && small.height === 675, `${name}: the 540 scale is ${small.width}x${small.height}`)
  if (pngDir) writeFileSync(`${pngDir}/${name}.png`, png)
  console.log(`  ${name}: ${model.tiles.length} tile(s), ${png.length} bytes, type floor ok`)
}

console.log('measure: every tile\'s text fits its box')
for (const [name, model] of Object.entries(SETS)) {
  const n = model.tiles.length
  const h = tileHeight(n)
  ok(h === (n === 3 ? 360 : 400), `${name}: tile height ${h} is not the plan (3 tiles 360, fewer 400)`)
  // 4. geometry: header + tiles + gaps + footer inside the frame
  const used = 118 + 2 + 12 + n * h + (n - 1) * 12 + 56
  ok(used <= 1298 - 6, `${name}: header + ${n} tiles + footer = ${used}px, over the frame's ${1298 - 6}`)
  model.tiles.forEach((t, i) => {
    const L = tileLayout(t, h)
    const nameW = textWidth(L.name.text, { size: L.name.size, family: 'Shoulders', weight: 900, upper: true })
    ok(nameW + Math.round(L.name.size * 0.17) <= L.nameBox + 1, `${name} tile ${i + 1}: the name "${L.name.text}" is ${nameW}px at ${L.name.size}px in a ${L.nameBox}px box`)
    ok(L.name.size >= 40 || nameW <= L.nameBox, `${name} tile ${i + 1}: the name is under 40px`)
    if (L.name.text !== t.name) ok(String(t.name).length >= 30, `${name} tile ${i + 1}: a short name "${t.name}" was cut`)
    const lineW = textWidth(t.line, { size: L.line.size, family: 'Shoulders', weight: 900, upper: true })
    ok(L.line.fits && L.line.size >= 32 && lineW <= L.lineBox, `${name} tile ${i + 1}: the line "${t.line}" is ${lineW}px at ${L.line.size}px in a ${L.lineBox}px box`)
    const mW = textWidth(L.matchup.text, { size: 34, family: 'Inter', weight: 800 })
    ok(mW <= L.mBox, `${name} tile ${i + 1}: the matchup "${L.matchup.text}" is ${mW}px in a ${L.mBox}px box`)
    ok(L.face >= 200 && L.rightW >= 480, `${name} tile ${i + 1}: face ${L.face}px / text column ${L.rightW}px too small`)
    console.log(`  ${name} #${i + 1}: name ${L.name.size}px (${nameW}/${L.nameBox}), line ${L.line.size}px (${lineW}/${L.lineBox}), face ${L.face}px`)
  })
}

console.log('rarity only')
{
  const strip = (el, out = []) => { if (el == null || typeof el === 'boolean') return out; if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out } if (Array.isArray(el)) { el.forEach((c) => strip(c, out)); return out } if (typeof el.type === 'function') return strip(el.type(el.props), out); strip(el.props?.children, out); return out }
  const words = strip(topThreeDesign(SETS['three-nhl'], '')).join(' | ')
  ok(/ELITE · HOLO/.test(words) && /STAR · SHIMMER/.test(words) && !/CALLED|ON THE BOARD|\block\b|\bdue\b|guarantee|%/i.test(words), `the card words: ${words.slice(0, 200)}`)
  const lw = strip(topThreeDesign(F.TEST_MODEL('nfl', [F.TEST_LEGEND]), '')).join(' | ')
  ok(/LEGEND · HOLO/.test(lw), 'a LEGEND tile says LEGEND · HOLO')
}
console.log('digest words and order')
{
  const DR = await import('../lib/cards/digestRank.js')
  const T = DR.digestTitle
  ok(T(1) === 'TOP PERFORMER TONIGHT' && T(1, { sport: 'mlb' }) === 'TOP PERFORMER TONIGHT' && T(1, { sport: 'nhl' }) === 'TOP PERFORMER TONIGHT', 'a night with ONE qualifying player is TOP PERFORMER TONIGHT, not a top three')
  ok(T(2) === 'TOP 2 TONIGHT' && T(3) === 'TOP 3 TONIGHT' && T(3, { sport: 'mlb' }) === 'TOP 3 TONIGHT' && T(0) === null, 'two and three names, none = no title')
  ok(T(3, { sport: 'nfl' }) === 'TOP 3 TODAY' && T(2, { sport: 'nfl' }) === 'TOP 2 TODAY' && T(1, { sport: 'nfl' }) === 'TOP PERFORMER TODAY', 'the NFL digest is TOP 3 TODAY (a game day)')
  ok(T(3, { sport: 'mlb', postseason: true }) === 'TOP 3 POSTSEASON PERFORMANCES', 'the MLB postseason digest keeps its own title')
  ok(SETS['three-nfl'].title === 'TOP 3 TODAY' && SETS['three-nhl'].title === 'TOP 3 TONIGHT' && SETS['one'].title === 'TOP PERFORMER TONIGHT', `the card model titles: ${SETS['three-nfl'].title} / ${SETS['three-nhl'].title} / ${SETS['one'].title}`)
  // ties: at the same tier the main count (TDs / goals / HRs) outranks yards, whatever the yardage
  const pick = (moment, row, who, tier = 'elite') => DR.pickOf({ moment, tier, row, day: '2026-10-12', who: { playerId: who, name: `Test ${who}`, team: 'TST' } })
  const yards = (y, who) => pick('nfl_100_yards', { rush_yds: y, rec_yds: 0 }, who)
  const tds = (n, who) => pick('nfl_multi_td', { tds: Array.from({ length: n }, (_, i) => ({ i })) }, who)
  const hrs = (n, who) => pick('mlb_multi_hr', { hrs: Array.from({ length: n }, (_, i) => ({ i })) }, who)
  const goals = (n, who) => pick('nhl_hat_trick', { goals: Array.from({ length: n }, (_, i) => ({ i })) }, who)
  const order = (list) => DR.rankPicks(list, { max: 9 }).map((p) => p.playerId).join(',')
  ok(order([yards(212, 'y'), tds(2, 't')]) === 't,y', 'NFL: 2 TDs outrank 212 yards at the same tier')
  ok(order([yards(400, 'y'), tds(2, 't')]) === 't,y', 'NFL: 2 TDs outrank even 400 yards')
  ok(order([yards(151, 'a'), yards(212, 'b'), yards(100, 'c')]) === 'b,a,c', 'among yardage games more yards still ranks first')
  ok(order([tds(2, 'a'), tds(3, 'b')]) === 'b,a' && order([hrs(2, 'a'), hrs(3, 'b')]) === 'b,a' && order([goals(3, 'a'), goals(4, 'b')]) === 'b,a', 'among count games the bigger count ranks first (TDs, HRs, goals)')
  ok(DR.magnitudeOf({ moment: 'nfl_100_yards', row: { rush_yds: 100 } }) === 1 && DR.magnitudeOf({ moment: 'nfl_100_yards', row: { rush_yds: 9999 } }) < 2, 'yardage starts at 1.0 (its entry level) and stays under the smallest count (2)')
  const lg = pick('nfl_100_yards', { rush_yds: 212, rec_yds: 0 }, 'l', 'legend')
  ok(order([tds(3, 't'), lg]) === 'l,t', 'tier still comes before the count: a LEGEND yardage game outranks an ELITE touchdown game')
  // the MLB postseason digest replaces the regular top three: one digest kind per MLB postseason date
  const { digestKindOf } = await import('../lib/cards/momentPosting.js')
  const reg = digestKindOf({ sport: 'mlb', night: '2026-10-12' }), ps = digestKindOf({ sport: 'mlb', night: '2026-10-12', postseason: true })
  ok(reg === 'moment_mlb_top3_20261012' && ps === 'postseason_mlb_top3_20261012', `the two MLB digest kinds are distinct (${reg} / ${ps}); digestPass posts only the postseason one on a postseason date (check-moment-posts L)`)
}
console.log(fails ? `\n${fails} ERROR(S)` : '\nall top-three card checks passed')
process.exit(fails ? 1 : 0)
