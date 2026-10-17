#!/usr/bin/env node
// Writes .claude-notes/routing-table.html: one self-contained phone-friendly page showing where every kind of post goes.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/build-routing-preview.mjs
// Reads lib/dash/routing.js + lib/dash/routingUnrouted.js + xSchedule KIND_TAGS. No send counts (not known here), no external libs. Nothing is sent.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { ROUTES, PREFIX_ROUTES } = await import('../lib/dash/routing.js')
const { UNROUTED } = await import('../lib/dash/routingUnrouted.js')
const { KIND_TAGS } = await import('../lib/dash/xSchedule.js')

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const WHO = { everyone: 'everyone', members: 'members only', me: 'Donovan only' }
const ROOM_TITLE = {
  feed: ['The public feed', 'DISCORD_HOMER_WEBHOOK, the other server'],
  sport: ['Sport channels', '#moonshot-mlb, #tuddy-nfl, #lamp-nhl, BUCKETS its own'],
  receipts: ['#called-it', 'DISCORD_RECEIPTS_WEBHOOK'],
  members: ['#members', 'DISCORD_MEMBERS_WEBHOOK, private'],
  donovan: ["Donovan's server", 'DISCORD_DONOVAN_WEBHOOK, nothing is sent when unset'],
  off: ['CUT', 'no Discord delivery; the row is still recorded so grading and receipts keep working'],
  old: ['Old rule (kept on purpose)', "the poster's own room rule, unchanged; each has a reason"],
}
const groups = { feed: [], sport: [], receipts: [], members: [], donovan: [], off: [], old: [] }
const sportOf = (k) => KIND_TAGS[k]?.sport && KIND_TAGS[k].sport !== 'all' ? KIND_TAGS[k].sport.toUpperCase() : ''
const place = (kind, r, family = false) => {
  const row = { kind: family ? `${kind}*` : kind, who: WHO[r.who] || r.who, how: r.how || '', sport: sportOf(kind) }
  for (const room of r.rooms) groups[room]?.push(row)
}
for (const [k, r] of Object.entries(ROUTES)) place(k, r)
for (const [p, r] of PREFIX_ROUTES) place(p, r, true)
for (const [k, v] of Object.entries(UNROUTED)) groups.old.push({ kind: k, who: WHO[v.who] || v.who, how: v.why, sport: sportOf(k) })

const sections = Object.keys(groups).map((room) => {
  const rows = groups[room].sort((a, b) => a.kind.localeCompare(b.kind))
  const [title, sub] = ROOM_TITLE[room]
  const body = rows.map((r) => `<tr><td class="k">${esc(r.kind)}${r.sport ? ` <span class="sp">${esc(r.sport)}</span>` : ''}</td><td class="w">${esc(r.who)}</td><td class="h">${esc(r.how)}</td></tr>`).join('')
  return `<section class="${room === 'off' ? 'cut' : ''}"><h2>${esc(title)} <span class="n">${rows.length}</span></h2><p class="sub">${esc(sub)}</p>${rows.length ? `<div class="scroll"><table><thead><tr><th>Kind</th><th>Who sees it</th><th>How</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="none">Nothing routed here yet.</p>'}</section>`
}).join('\n')

const SWITCHES = [
  ['RECAP_POSTS_ON', 'Off by default. On: one night-recap post per sport per night in #called-it (who was called and cleared, misses listed). Discord only, never X.'],
  ['MEMBERS_FOLDS_ON', 'Off by default. On: #members gets one daily briefing plus one write-up roundup per sport and night instead of a post per game; the per-game rows are still written.'],
  ['SPORT_PLANS_ON', "Off by default. On: each sport room gets one 'Tonight's plays' post a day (the free lead pick plus a site link); card, list, slate and board posts are still recorded but not delivered to Discord. X is untouched."],
  ['PUSH_FOLDS_ON', 'Off by default. On: phone pushes are folded (for example a scratch push goes only for a CALLED pick). Off: pushes are exactly as before.'],
  ['PEN_DOOR_FOLD_ON', "Named in the brief but not found in this branch's code, so it does nothing here yet."],
  ['DISCORD_EVENTS', "Unset means 'called': live goal/touchdown/homer events post only for called picks. Set to 'all' to bring back the every-event feed."],
  ['DISCORD_DONOVAN_WEBHOOK', "The 'donovan' room: Donovan's own server. Unset means nothing is sent there."],
  ['DISCORD_OPS_WEBHOOK', "Donovan's ops channel: gets one plain message when X starts refusing posts (credits, key or limit). Unset means log only."],
]
const sw = SWITCHES.map(([n, d]) => `<tr><td class="k">${esc(n)}</td><td class="h">${esc(d)}</td></tr>`).join('')

const total = Object.values(groups).reduce((a, g) => a + g.length, 0)
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Routing table</title>
<style>
:root{--bg:#0b0d12;--panel:#12151c;--line:#232834;--text:#e8eaf0;--mute:#9aa3b5;--accent:#7cc4ff;--cut:#ff9a8a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0}.n{color:var(--mute);font-weight:400;font-size:13px}
.lead,.sub{color:var(--mute);margin:2px 0 8px}section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;margin:12px 0}
section.cut h2{color:var(--cut)}.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;min-width:520px}th{font-size:12px;text-align:left;color:var(--mute);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}td.k{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--accent);white-space:nowrap}
td.w{white-space:nowrap}td.h{color:var(--mute)}.sp{font-size:11px;color:var(--mute);font-family:system-ui}.none{color:var(--mute)}
</style></head><body>
<h1>Routing table</h1>
<p class="lead">Where each kind of post goes. ${total} entries, built from lib/dash/routing.js, lib/dash/routingUnrouted.js and xSchedule KIND_TAGS. A name ending in * stands for a family (name plus an id). Send counts are not shown.</p>
${sections}
<section><h2>Switches <span class="n">${SWITCHES.length}</span></h2><p class="sub">Environment settings that change what is delivered.</p><div class="scroll"><table><thead><tr><th>Setting</th><th>What it does</th></tr></thead><tbody>${sw}</tbody></table></div></section>
</body></html>
`
const out = join(root, '.claude-notes', 'routing-table.html')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`wrote ${out} (${html.length} bytes, ${total} entries)`)
