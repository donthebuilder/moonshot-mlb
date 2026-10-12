// THE GAME-SECTION REGISTRY CHECK (2026-10-12). lib/game/sections.js lists, per sport, the sections a game shows, in order.
// This holds the list to the components that walk it:
//   - every sport has an entry, and both surfaces (slate, page) are a list or say why not
//   - ids are unique on a surface; roles come from the shared vocabulary; every pill has its words
//   - each id has a renderer in the component (or, for MOONSHOT's pill-names-only adoption, an anchor), and the component
//     really asks the registry for its list
//   - every section with an `empty` state: its words are in the component
//   - every shared role is carried or has a stated reason in `lacks` (and a role listed in `lacks` is not carried)
//   - no sport ternary in the registry
// Run: node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-game-sections.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(path.join(root, f), 'utf8')
const R = await import('../lib/game/sections.js')
const { GAME_SECTIONS, ROLES, gameSections, panelPairs, panelSubs, rolesCarried, whyNoSurface } = R

let bad = 0
const fail = (m) => { console.log(`FAIL ${m}`); bad += 1 }

// where each (sport, surface) is drawn, and how: 'walk' = the component maps the list to its own renderers; 'names' = the
// component takes the pill names/words only (MOONSHOT: the 1,977-line page keeps its JSX order; proven by screenshot).
const WHERE = {
  'mlb/slate': { file: 'components/tabs/Games.js', mode: 'names' },
  'nfl/slate': { file: 'components/nfl/NflSlate.js', mode: 'walk' },
  'nhl/slate': { file: 'components/lamp/LampSlate.js', mode: 'walk' },
  'nhl/page': { file: 'components/lamp/tabs/Game.js', mode: 'walk' },
  'nba/page': { file: 'components/buckets/tabs/Game.js', mode: 'walk' },
}

for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
  const e = GAME_SECTIONS[sport]
  if (!e) { fail(`${sport}: no entry in GAME_SECTIONS`); continue }
  for (const which of ['slate', 'page']) {
    const s = e[which]
    if (!s) { fail(`${sport}/${which}: surface missing (a list, or { list: [], why })`); continue }
    if (!s.list.length) { if (!s.why) fail(`${sport}/${which}: empty and no reason`); if (WHERE[`${sport}/${which}`]) fail(`${sport}/${which}: listed in the check as drawn but the registry list is empty`); continue }
    const where = WHERE[`${sport}/${which}`]
    if (!where) { fail(`${sport}/${which}: has sections but this check does not know which component draws them (add it to WHERE)`); continue }
    const src = read(where.file)
    const ids = s.list.map((x) => x.id)
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i)
    if (dup.length) fail(`${sport}/${which}: duplicate ids ${dup.join(', ')}`)
    for (const x of s.list) {
      if (!x.label) fail(`${sport}/${which}/${x.id}: no label`)
      if (x.role && !ROLES.includes(x.role)) fail(`${sport}/${which}/${x.id}: role '${x.role}' is not in ROLES`)
      if (x.only && !['pre', 'started'].includes(x.only)) fail(`${sport}/${which}/${x.id}: only '${x.only}'`)
      if (which === 'slate' && x.pill !== false && !x.sub) fail(`${sport}/${which}/${x.id}: a pill with no words`)
      if (x.empty && !src.includes(x.empty)) fail(`${sport}/${which}/${x.id}: its empty state '${x.empty}' is not in ${where.file}`)
    }
    if (where.mode === 'walk') {
      if (!src.includes(`gameSections('${sport}', '${which}'`)) fail(`${sport}/${which}: ${where.file} does not walk gameSections('${sport}', '${which}')`)
      // a renderer is a key of the component's SECTIONS map: `id:` or `'id':`
      for (const id of ids) if (!new RegExp(`^\\s+(?:'${id}'|${id}): \\(\\) =>`, 'm').test(src)) fail(`${sport}/${which}/${id}: no renderer in ${where.file} (SECTIONS.${id})`)
      // and the reverse: a renderer the registry does not list would never draw
      const at = src.indexOf('const SECTIONS = {')
      const indent = src.slice(src.lastIndexOf('\n', at) + 1, at)
      const block = src.slice(at, src.indexOf(`\n${indent}}\n`, at))
      const keys = [...block.matchAll(new RegExp(`^${indent}  (?:'([\\w-]+)'|(\\w+)): \\(\\) =>`, 'gm'))].map((m) => m[1] || m[2])
      for (const k of keys) if (!ids.includes(k)) fail(`${sport}/${which}: renderer '${k}' in ${where.file} is not in the registry, so it never draws`)
    } else {
      if (!src.includes(`panelPairs('${sport}')`) || !src.includes(`panelSubs('${sport}')`)) fail(`${sport}/${which}: ${where.file} does not take its pills from panelPairs/panelSubs`)
      for (const id of ids) if (!src.includes(`gp-${id}-`)) fail(`${sport}/${which}/${id}: no anchor gp-${id}- in ${where.file}`)
    }
  }
  // every shared role carried, or its absence says why
  const have = rolesCarried(sport)
  for (const role of ROLES) {
    if (!have.has(role) && !e.lacks?.[role]) fail(`${sport}: no '${role}' section and no reason in lacks`)
    if (have.has(role) && e.lacks?.[role]) fail(`${sport}: lacks says no '${role}' but the registry has one`)
  }
}
for (const k of Object.keys(WHERE)) {
  const [sport, which] = k.split('/')
  if (whyNoSurface(sport, which)) fail(`${k} is drawn per the check but the registry has no list`)
}

// the registry is data: no sport ternary
const reg = read('lib/game/sections.js')
if (/sport\s*===|===\s*'(?:mlb|nfl|nhl|nba)'|\?\s*'(?:mlb|nfl|nhl|nba)'/.test(reg.replace(/^\s*\/\/.*$/gm, ''))) fail('lib/game/sections.js has a sport ternary')

// the state-bound entries: the NHL rink leads before the puck drops, follows the goals after
const order = (state) => gameSections('nhl', 'page', state).map((x) => x.id)
const pre = order('pre'); const fin = order('final'); const live = order('live')
if (!(pre.includes('stage-pre') && !pre.includes('stage') && pre.indexOf('stage-pre') < pre.indexOf('period'))) fail(`nhl page, pre: the rink must lead the tables (${pre.join(' > ')})`)
if (!(fin.includes('stage') && !fin.includes('stage-pre') && fin.indexOf('stage') > fin.indexOf('goals'))) fail(`nhl page, final: the rink must follow the goals (${fin.join(' > ')})`)
if (live.join() !== fin.join()) fail('nhl page: live and final must draw the same sections')

// MOONSHOT: its pills are the words it always had (the list moved out of components/tabs/Games.js byte for byte)
const OLD_MLB = [['read', 'The read'], ['lineups', 'Lineups'], ['h2h', 'Head-to-head'], ['out', 'Out'], ['picks', 'Picks']]
if (JSON.stringify(panelPairs('mlb')) !== JSON.stringify(OLD_MLB)) fail(`mlb pills changed: ${JSON.stringify(panelPairs('mlb'))}`)
if (Object.keys(panelSubs('mlb')).join() !== 'read,lineups,h2h,out,picks') fail('mlb pill words changed')
// NFL / NHL slates: the pills as they were
if (JSON.stringify(panelPairs('nfl')) !== JSON.stringify([['calls', 'Our calls'], ['field', 'The field'], ['players', 'Players'], ['matchup', 'Matchup'], ['out', 'Out']])) fail('nfl pills changed')
if (JSON.stringify(panelPairs('nhl')) !== JSON.stringify([['read', 'The read'], ['board', 'Every player'], ['calls', 'The calls'], ['out', 'Out']])) fail('nhl pills changed')

if (bad) { console.log(`\n${bad} failure(s)`); process.exit(1) }
const n = Object.values(WHERE).length
console.log(`ok: ${n} surfaces drawn from the registry (${Object.keys(WHERE).join(', ')}); every shared role carried or explained`)
