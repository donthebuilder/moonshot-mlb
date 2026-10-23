#!/usr/bin/env node
// THE DISCORD MAP: where every post goes, in plain words, built from the one table (lib/dash/routing.js). Nothing is sent or read.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/build-routing-preview.mjs [--out <file>]
// Default out: .claude-notes/routing-table.html. Grouped by channel; posts that share one rule share one row (the product chips say which).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { ROUTES, PREFIX_ROUTES } = await import('../lib/dash/routing.js')
const args = process.argv.slice(2)
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const CHANNELS = [
  ['members', '#members', 'Paying members. Today\'s picks, more picks, wins, the morning grade, the roundups.'],
  ['sport', 'The product channels', '#moonshot-mlb · #tuddy-nfl · #lamp-nhl · #buckets. Free. The lead pick, the live CALLED moments, the results.'],
  ['network', '#dash-network', 'Free. Every product in one place: the slate before the games, the receipts after, the weekly shows. (#called-it merged in here.)'],
  ['partner', 'Partner servers', 'Other Discords you are in. Tonight\'s picks (straights + parlay), the top 5 per product, the receipt. Each links to the site.'],
  ['x', 'X only', 'Never on Discord, by design.'],
  ['off', 'Not sent', 'Cut or phone-only. The record is still kept.'],
  ['chosen', 'Admin', 'Only when you press a button on /admin/discord.'],
]
const PRODUCT = { mlb: 'MOONSHOT', nfl: 'TUDDY', nhl: 'LAMP', nba: 'BUCKETS' }
const OWN = { td: 'nfl', sunday_sheet: 'nfl', alert_nflboardred: 'nfl', nhlgoal: 'nhl', nhlhardest: 'nhl', nba30: 'nba', homer: 'mlb', multi_club: 'mlb' }
const productOf = (k) => OWN[k] || (/(^|_)nfl(_|$)/.test(k) ? 'nfl' : /(^|_)nhl(_|$)/.test(k) ? 'nhl' : /(^|_)nba(_|$)/.test(k) ? 'nba' : 'mlb')
// the time of night a post belongs to, read from its own words
const PHASE = (when) => {
  if (/^Live/.test(when)) return 'During the games'
  if (/^(Folded|Stored|Cut|Retired|Phone|A reply|LONGSHOT|Paused)/.test(when)) return 'Not sent right now'
  if (/2\+ Club|weekday post|stat post|long shots by price|^Sunday: the network|^Friday|^Wednesday|^Monday morning|^The 1st|poll question|^Sunday morning/.test(when)) return 'Through the week'
  if (/graded|result|answer|^After|morning after|^Next morning|^As picks grade/.test(when)) return 'After the games'
  return 'Before the games'
}

// group rows by their rule object (posts that share one rule share one row)
const rows = new Map()
const add = (name, r) => { const key = r; if (!rows.has(key)) rows.set(key, { r, kinds: [] }); rows.get(key).kinds.push(name) }
for (const [k, r] of Object.entries(ROUTES)) add(k, r)
for (const [p, r] of PREFIX_ROUTES) if (!rows.has(r)) add(`${p}…`, r)

const sectionOf = ([room, title, sub]) => {
  const mine = [...rows.values()].filter(({ r }) => (room === 'members' ? r.rooms.includes('members') && !r.rooms.includes('sport') : room === 'sport' ? r.rooms.includes('sport') : room === 'partner' ? r.rooms.includes('partner') : r.rooms[0] === room))
  if (!mine.length) return ''
  const byPhase = {}
  for (const m of mine) (byPhase[room === 'sport' || room === 'members' || room === 'network' ? PHASE(m.r.when) : ''] ||= []).push(m)
  const order = ['Before the games', 'During the games', 'After the games', 'Through the week', 'Not sent right now', '']
  const body = order.filter((p) => byPhase[p]).map((p) => `${p ? `<h3>${esc(p)}</h3>` : ''}<ul>${byPhase[p].map(({ r, kinds }) => {
    const prods = room === 'sport' ? [...new Set(kinds.map(productOf))] : []
    const also = r.rooms.length > 1 ? r.rooms.filter((x) => x !== room && !(room === 'sport' && x === 'members')).map((x) => ({ network: '#dash-network', receipts: '#called-it', members: '#members' }[x])).filter(Boolean) : []
    const members = room === 'sport' && r.rooms.includes('members')
    return `<li><div class="w">${esc(r.when)}</div><div class="m">${prods.map((p) => `<span class="chip ${p}">${PRODUCT[p]}</span>`).join('')}${members ? '<span class="chip">+ #members</span>' : ''}${also.map((a) => `<span class="chip">+ ${esc(a)}</span>`).join('')}<code>${esc(kinds.slice(0, 4).join(' · '))}${kinds.length > 4 ? ` +${kinds.length - 4}` : ''}</code></div></li>`
  }).join('')}</ul>`).join('')
  return `<section class="${room}"><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p>${body}</section>`
}

const total = Object.keys(ROUTES).length + PREFIX_ROUTES.length
const html = `<title>Discord Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* one column; a section per channel; inside it the posts by phase of the night */
:root{--bg:#f4f5f8;--card:#fff;--ink:#1c1e24;--mute:#5b6070;--line:#dcdfe6;--accent:#5865f2;--mlb:#c2410c;--nfl:#15803d;--nhl:#1d4ed8;--nba:#b45309}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1e1f22;--card:#2b2d31;--ink:#e7e8ec;--mute:#a7abb6;--line:#41444c;--accent:#8c96ff;--mlb:#fb923c;--nfl:#4ade80;--nhl:#93c5fd;--nba:#fbbf24;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1e1f22;--card:#2b2d31;--ink:#e7e8ec;--mute:#a7abb6;--line:#41444c;--accent:#8c96ff;--mlb:#fb923c;--nfl:#4ade80;--nhl:#93c5fd;--nba:#fbbf24;color-scheme:dark}
*{box-sizing:border-box}body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:24px;margin:0 0 6px;text-wrap:balance}.lead{color:var(--mute);margin:0 0 16px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:0 0 14px}
section.x,section.off{opacity:.8}h2{font-size:17px;margin:0 0 2px}h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin:14px 0 6px}
.sub{color:var(--mute);margin:0 0 4px;font-size:14px}ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
li{border-top:1px solid var(--line);padding-top:8px}.w{font-weight:600}.m{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;margin-top:3px;min-width:0}
.chip{font:600 11px/1 system-ui;padding:4px 8px;border-radius:999px;border:1px solid var(--line);color:var(--mute)}
.chip.mlb{color:var(--mlb);border-color:var(--mlb)}.chip.nfl{color:var(--nfl);border-color:var(--nfl)}.chip.nhl{color:var(--nhl);border-color:var(--nhl)}.chip.nba{color:var(--nba);border-color:var(--nba)}
code{font:12px ui-monospace,Menlo,monospace;color:var(--mute);overflow-wrap:anywhere}
</style>
<main>
<h1>Where every Discord post goes</h1>
<p class="lead">One table in the code (lib/dash/routing.js) decides every channel. This page is built from it. ${total} post types, every one listed. Gray names are the code's names.</p>
${CHANNELS.map(sectionOf).join('\n')}
</main>
`
const out = outArg || join(root, '.claude-notes', 'routing-table.html')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`wrote ${out} (${html.length} bytes, ${total} post types)`)
