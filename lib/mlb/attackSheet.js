// MOONSHOT'S ATTACK SHEET (2026-10-20, Donovan: "how to attack for all sports"; TUDDY's lib/nfl/attackSheet.js is the
// model). How tonight's starter pitches, one trait a row, each answered by the hitter in the OTHER lineup who beats it and
// the number that says so. Every number is read off the slate rows: a hitter's pitcher_* fields describe the starter he
// faces. Rank is among tonight's starters (1 = the most of it); under 8 starters on the slate there is no rank and no
// standout colour, the number alone.
//
// Traits:   homers      pitcher_hr9                       -> the lineup's best season ISO
//           his weak    pitcher_hr9_vs_lhb / _rhb         -> the best ISO vs his hand among bats on that side (switch counts)
//           side
//           fly balls   pitcher_fb_rate                   -> the most fly balls over the last 20 PA (a ground-ball arm: hard contact)
//           mistakes    pitcher_meatball_pct              -> the hardest contact over the last 20 PA
//           his pitch   pitcher_pitch_usage (top pitch)   -> the best pitch_mix_score (his read of this arsenal)
import { PITCH_NAMES } from '../livePitches'

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const pct = (v) => `${Math.round(100 * v)}%`
const iso = (v) => v.toFixed(3).replace(/^0/, '')
const MIN_STARTERS = 8

/** One value per starter on the slate: pitcher name -> value of `key`. */
function starters(all, key) {
  const out = new Map()
  for (const p of all || []) {
    const name = p?.pitcher_name
    const v = num(p?.[key])
    if (name && fin(v) && !out.has(name)) out.set(name, v)
  }
  return out
}
function rankOf(all, key, v) {
  const m = starters(all, key)
  if (m.size < MIN_STARTERS || !fin(v)) return { rank: null, of: m.size }
  return { rank: 1 + [...m.values()].filter((x) => x > v).length, of: m.size }
}
const tierOf = (rank, of) => (rank == null ? 1 : rank <= Math.ceil(of / 3) ? 0 : rank > of - Math.ceil(of / 3) ? 2 : 1)

const best = (rows, key, filter = () => true) => rows
  .map((p) => ({ p, v: num(p?.[key]) })).filter((x) => fin(x.v) && filter(x.p)).sort((a, b) => b.v - a.v)[0] || null

/** rows: this game's slate rows; all: the whole slate (for ranks). off = the batting club. Rows most extreme first. */
export function mlbAttackRows(rows, all, off) {
  const bats = (rows || []).filter((p) => p?.team === off)
  if (!bats.length) return []
  const src = (k) => { for (const p of bats) { const v = p?.[k]; if (v !== null && v !== undefined && v !== '') return v } return null }
  const pool = all?.length ? all : rows
  const out = []
  const add = (k, words, val, key, v, who, why) => {
    if (!who || !why) return
    const { rank, of } = key ? rankOf(pool, key, v) : { rank: null, of: 0 }
    const tier = typeof words === 'string' ? 1 : tierOf(rank, of)
    // no rank (a thin slate): the trait's plain name (words[3]), never a comparison nothing was compared against
    out.push({ k, word: typeof words === 'string' ? words : rank == null ? words[3] : words[tier], val, rank, of, tier, player: who, name: who.name, why })
  }

  const hr9 = num(src('pitcher_hr9'))
  const isoBest = best(bats, 'season_iso')
  if (fin(hr9) && isoBest) add('hr', ['GIVES UP HOMERS', 'SOME HOMERS', 'KEEPS IT IN THE PARK', 'HOMERS ALLOWED'], `${hr9.toFixed(2)} HR/9`, 'pitcher_hr9', hr9, isoBest.p, `${iso(isoBest.v)} ISO this season`)

  const throws = String(src('pitcher_throws') || '').toUpperCase()
  const vl = num(src('pitcher_hr9_vs_lhb')), vr = num(src('pitcher_hr9_vs_rhb'))
  if (fin(vl) && fin(vr) && (throws === 'L' || throws === 'R')) {
    const side = vl >= vr ? 'L' : 'R'
    const key = side === 'L' ? 'pitcher_hr9_vs_lhb' : 'pitcher_hr9_vs_rhb'
    const b = best(bats, `iso_vs_${throws.toLowerCase()}hp`, (p) => [side, 'S', 'B'].includes(String(p?.bats || '').toUpperCase()))
    if (b) add('side', side === 'L' ? ['HOMERS TO LEFTIES', 'WEAKER VS LEFTIES', 'WEAKER VS LEFTIES', 'WEAKER VS LEFTIES'] : ['HOMERS TO RIGHTIES', 'WEAKER VS RIGHTIES', 'WEAKER VS RIGHTIES', 'WEAKER VS RIGHTIES'],
      `${(side === 'L' ? vl : vr).toFixed(2)} HR/9 vs ${side}`, key, side === 'L' ? vl : vr, b.p, `${iso(b.v)} ISO vs ${throws}HP`)
  }

  const fb = num(src('pitcher_fb_rate'))
  if (fin(fb)) {
    const { rank, of } = rankOf(pool, 'pitcher_fb_rate', fb)
    if (tierOf(rank, of) === 2) {
      const h = best(bats, 'l20pa_hard_hit_rate')
      if (h) add('fly', ['FLY-BALL ARM', 'SOME FLY BALLS', 'GROUND-BALL ARM', 'FLY BALLS ALLOWED'], `${pct(fb)} fly balls`, 'pitcher_fb_rate', fb, h.p, `hit it hard: ${pct(h.v)} hard-hit, last 20 PA`)
    } else {
      const f = best(bats, 'l20pa_fb_rate')
      if (f) add('fly', ['FLY-BALL ARM', 'SOME FLY BALLS', 'GROUND-BALL ARM', 'FLY BALLS ALLOWED'], `${pct(fb)} fly balls`, 'pitcher_fb_rate', fb, f.p, `lifts it: ${pct(f.v)} fly balls, last 20 PA`)
    }
  }

  const mb = num(src('pitcher_meatball_pct'))
  const hh = best(bats, 'l20pa_hard_hit_rate')
  if (fin(mb) && hh) add('mistake', ['MEATBALLS', 'SOME MISTAKES', 'FEW MISTAKES', 'MISTAKE PITCHES'], `${pct(mb)} meatballs`, 'pitcher_meatball_pct', mb, hh.p, `${pct(hh.v)} hard-hit, last 20 PA`)

  const usage = src('pitcher_pitch_usage')
  const top = usage && typeof usage === 'object' ? Object.entries(usage).filter(([, u]) => fin(Number(u))).sort((a, b) => b[1] - a[1])[0] : null
  const mix = best(bats, 'pitch_mix_score')
  if (top && mix) add('pitch', `${String(PITCH_NAMES[top[0]] || top[0]).toUpperCase()} FIRST`, `${Math.round(top[1])}% of his pitches`, null, null, mix.p, `mix score ${Math.round(mix.v)} vs his pitches`)

  const pull = (r) => (r.rank == null ? -1 : Math.abs(r.rank - (r.of + 1) / 2) / r.of)
  return out.sort((a, b) => pull(b) - pull(a))
}
