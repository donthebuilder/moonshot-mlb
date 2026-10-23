// The review page of scripts/check-discord-posts.mjs --html: every rendered post, grouped by the channel it reaches, drawn the way
// Discord draws it (plain text or a card with a coloured edge). One self-contained file, phone first, no external anything.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// Discord's own markdown, the little the posts use: **bold**, links
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')
const hex = (n) => (Number.isFinite(n) ? `#${n.toString(16).padStart(6, '0')}` : 'var(--edge)')

const ROOM = {
  DISCORD_MEMBERS_WEBHOOK: ['#members', 'paying members'],
  DISCORD_MLB_WEBHOOKS: ['#moonshot', 'MLB, free'],
  DISCORD_NFL_WEBHOOKS: ['#tuddy', 'NFL, free'],
  DISCORD_NHL_WEBHOOKS: ['#lamp', 'NHL, free'],
  DISCORD_NBA_WEBHOOKS: ['#buckets', 'NBA, free'],
  DISCORD_OVERVIEW_WEBHOOK: ['#dash-network', 'the whole network'],
  DISCORD_RECEIPTS_WEBHOOK: ['#called-it', 'receipts'],
  DISCORD_HOMER_WEBHOOK: ['old feed', 'the other server'],
  nowhere: ['Reaches no channel', 'built, but no webhook is set for it'],
  held: ['Not delivered', 'cut or folded on purpose: the row is recorded, nothing is sent'],
}
const ORDER = ['DISCORD_MEMBERS_WEBHOOK', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NFL_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'DISCORD_NBA_WEBHOOKS', 'DISCORD_OVERVIEW_WEBHOOK', 'DISCORD_RECEIPTS_WEBHOOK', 'DISCORD_HOMER_WEBHOOK', 'nowhere', 'held']

function post(o) {
  const p = o.payload || {}
  const embeds = (p.embeds || []).map((e) => `<div class="embed" style="border-left-color:${hex(e.color)}">
    ${e.title ? `<div class="et">${e.url ? `<a href="${esc(e.url)}">${esc(e.title)}</a>` : esc(e.title)}</div>` : ''}
    ${e.description ? `<div class="ed">${md(e.description)}</div>` : ''}
    ${(e.fields || []).map((f) => `<div class="ef"><div class="efn">${md(f.name)}</div><div class="efv">${md(f.value)}</div></div>`).join('')}
    ${e.image?.url ? '<div class="img">picture</div>' : ''}
    ${e.footer?.text ? `<div class="foot">${esc(e.footer.text)}</div>` : ''}
  </div>`).join('')
  const flags = [...(o.errors || []).map((e) => `<span class="bad">${esc(e)}</span>`), ...(o.warns || []).map((w) => `<span class="warn">${esc(w)}</span>`)].join('')
  return `<article class="msg${o.errors?.length ? ' isbad' : ''}">
    <header><b>${esc(o.kind)}</b><span>${esc(o.day || '')}${o.label ? ` · ${esc(o.label)}` : ''} · ${o.words || 0} words</span></header>
    ${p.content ? `<div class="content">${md(p.content)}</div>` : ''}${embeds}
    ${flags ? `<div class="flags">${flags}</div>` : ''}
  </article>`
}

export function reviewPage(out, { days = [], wired = [] } = {}) {
  const groups = Object.fromEntries(ORDER.map((k) => [k, []]))
  for (const o of out) {
    if (!o.payload) continue
    const where = o.cut ? ['held'] : o.channels?.length ? o.channels : ['nowhere']
    for (const w of where) (groups[w] ||= []).push(o)
  }
  const bad = out.filter((o) => o.errors?.length).length
  const sections = ORDER.filter((k) => groups[k]?.length).map((k) => `<section><h2>${esc(ROOM[k]?.[0] || k)} <small>${esc(ROOM[k]?.[1] || '')} · ${groups[k].length}</small></h2>${groups[k].map(post).join('')}</section>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Discord Posts Review</title>
<style>
:root{--bg:#f4f4f6;--card:#fff;--ink:#1d1f24;--mute:#5c6070;--edge:#c9ccd4;--bad:#b3261e;--warn:#8a5a00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1e1f22;--card:#2b2d31;--ink:#e6e7ea;--mute:#a4a8b3;--edge:#4e5058;--bad:#ff8a80;--warn:#f0b35a}}
:root[data-theme="dark"]{--bg:#1e1f22;--card:#2b2d31;--ink:#e6e7ea;--mute:#a4a8b3;--edge:#4e5058;--bad:#ff8a80;--warn:#f0b35a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:680px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0}p.sum{color:var(--mute);margin:0 0 16px}
h2{font-size:16px;margin:24px 0 8px}h2 small{color:var(--mute);font-weight:400}
.msg{background:var(--card);border-radius:8px;padding:12px;margin:0 0 10px;overflow-wrap:anywhere}.msg.isbad{outline:2px solid var(--bad)}
.msg header{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;margin-bottom:6px;font-size:13px}.msg header span{color:var(--mute)}
.embed{border-left:4px solid var(--edge);padding:6px 10px;margin-top:6px}.et{font-weight:700}.ed{margin-top:4px}.ef{margin-top:6px}.efn{font-weight:700;font-size:14px}
.foot{color:var(--mute);font-size:12px;margin-top:6px}.img{margin-top:6px;border:1px dashed var(--edge);border-radius:6px;padding:14px;text-align:center;color:var(--mute);font-size:12px}
a{color:inherit}.flags{margin-top:8px;display:flex;flex-direction:column;gap:2px;font-size:13px}.bad{color:var(--bad)}.warn{color:var(--warn)}
</style></head><body><main>
<h1>Discord posts, rendered from real data</h1>
<p class="sum">${out.length} posts · ${esc(days.at(-1) || '')} to ${esc(days[0] || '')} · ${bad} broken · channels wired now: ${esc(wired.map((k) => ROOM[k]?.[0] || k).join(', '))}. Nothing here was sent.</p>
${sections}
</main></body></html>`
}
