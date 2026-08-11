// Palette guard. Run alongside check-undefined and the bundle.
//
// The ramps were rewritten six times in one day and every rewrite risked two
// silent failures: a stop landing in the 0.170-0.189 dead zone where neither
// ink is readable, and a comment drifting away from the hexes it describes.
// Both are invisible until someone squints at a board at midnight.
import fs from 'node:fs'
const src = fs.readFileSync('lib/palette.js', 'utf8')
const blk = src.slice(src.indexOf('export const RAMPS = {'),
  src.indexOf('\n}\n', src.indexOf('export const RAMPS = {')) + 2)
const ids = [...blk.matchAll(/^  ([a-z]+): \{/gm)].map((m) => m[1])
const sect = (id) => { const a = blk.indexOf(`  ${id}: {`); return blk.slice(a, blk.indexOf('\n  },', a)) }
const arr = (id) => sect(id).match(/stops:\s*\[([^\]]*)\]/)[1].match(/#[0-9a-f]{6}/g)
// A ramp may ship its OWN inks — a lit number on a deep tinted cell, which is
// how Signal reproduces the props sheet. When it does, the dead-zone and
// single-neutral-ink checks below do not apply (both are facts about white and
// near-black) and are REPLACED by a stricter one: every fill measured against
// its own ink.
const inks = (id) => { const m = sect(id).match(/inks:\s*\[([^\]]*)\]/); return m ? m[1].match(/#[0-9a-f]{6}/g) : null }
const spec = (id, tag) => {
  const m = sect(id).match(new RegExp(`@${tag}\\s+([\\d. ]+?)\\s{2,}`))
  return m ? m[1].trim().split(/\s+/).map(Number) : null
}
const hexA = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (h) => { const p = hexA(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] }
const sat = (x) => { const [r, g, b] = hexA(x).map((v) => v / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; return d ? (l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)) : 0 }
const hue = (x) => { const [r, g, b] = hexA(x).map((v) => v / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; if (!d) return 0; let t; if (mx === r) t = ((g - b) / d) % 6; else if (mx === g) t = (b - r) / d + 2; else t = (r - g) / d + 4; return ((t * 60) % 360 + 360) % 360 }
const ratio = (a, b) => { const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]; return (hi + 0.05) / (lo + 0.05) }
const dist = (a, b) => { const [r1, g1, b1] = hexA(a); const [r2, g2, b2] = hexA(b); const rm = (r1 + r2) / 2; return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2) }
const D = '#0a0a0b'; const L = '#f4f4f5'
let bad = 0
const chk = (n, ok) => { if (!ok) { console.log('MISS ' + n); bad++ } }
for (const id of ids) {
  const st = arr(id)
  const own = inks(id)
  const ink = own || st.map((c) => (ratio(c, D) > ratio(c, L) ? D : L))
  chk(`${id}: every cell readable`, Math.min(...st.map((c, i) => ratio(c, ink[i]))) >= 4.5)
  chk(`${id}: luminance rises the whole way`, st.every((c, i) => i === 0 || lum(c) > lum(st[i - 1])))
  if (own) {
    chk(`${id}: an ink for every stop`, own.length === st.length)
    // The ink is what the eye actually reads on this construction, so it gets
    // the same two guarantees the fills get: ordered in greyscale, and no two
    // neighbours collapsing into one shade.
    chk(`${id}: ink luminance rises too`, own.every((c, i) => i === 0 || lum(c) > lum(own[i - 1])))
    let isep = 999; for (let i = 1; i < own.length; i++) isep = Math.min(isep, dist(own[i], own[i - 1]))
    chk(`${id}: inks don't plateau (closest Δ${isep.toFixed(0)})`, isep >= 22)
    // And the number has to be findable against the PAGE, not just its cell —
    // a dark ink on a dark fill can clear 4.5:1 between them and still vanish.
    chk(`${id}: every ink readable on the page`, Math.min(...own.map((c) => ratio(c, '#111113'))) >= 4.5)
  } else {
    chk(`${id}: no stop in the 0.170-0.189 dead zone`, !st.some((c) => lum(c) > 0.170 && lum(c) < 0.189))
    chk(`${id}: ink switches exactly once`, ink.filter((v, i) => i > 0 && v !== ink[i - 1]).length === 1)
  }
  let sep = 999; for (let i = 1; i < st.length; i++) sep = Math.min(sep, dist(st[i], st[i - 1]))
  chk(`${id}: no plateau (closest Δ${sep.toFixed(0)})`, sep >= 22)
  const tags = [['lum', lum, 0.006, st], ['sat', sat, 0.02, st], ['hue', hue, 2, st]]
  if (own) tags.push(['ilum', lum, 0.006, own], ['isat', sat, 0.02, own], ['ihue', hue, 2, own])
  for (const [tag, fn, tol, target] of tags) {
    const d = spec(id, tag)
    chk(`${id}: @${tag} spec matches its stops`, d && d.length === target.length
      && d.every((v, i) => { let x = Math.abs(v - fn(target[i])); if (tag === 'hue' && x > 180) x = 360 - x; return x <= tol }))
  }
}
// The toggle has to mean something: three different saturation SHAPES.
const [em, sg, vd] = ['ember', 'traffic', 'verdict'].map(arr)
const mid = (s) => sat(s[Math.floor(s.length / 2)])
const ends = (s) => (sat(s[0]) + sat(s[s.length - 1])) / 2
chk('signal arches in saturation', mid(sg) > ends(sg))
chk('verdict collapses in saturation', mid(vd) < ends(vd) * 0.4)
chk('ember rises in saturation', sat(em[em.length - 1]) > sat(em[0]) * 3)
console.log(bad ? `\n${bad} palette problem(s)` : `\nok   palette: ${ids.length} ramps, contrast + dead zone + spec drift all clean`)
process.exit(bad ? 1 : 0)
