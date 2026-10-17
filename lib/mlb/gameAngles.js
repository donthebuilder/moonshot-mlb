// BEST ANGLES FOR ONE MLB GAME (the shared game card, components/slate/SlateCard.js; the picker is lib/slate/angles.js).
// PURE. Every number is a published slate field, read through the helpers the site already has:
//   THE WEAK SPOT   the leakier of the game's two starters when he is in the top third of tonight's arms (lib/armLeak.js rankArms: HR/9, barrels,
//                   hard hit, fly balls, park ... ranked against tonight's other starters), said with his two heaviest terms. A starter whose
//                   contact sample is thin (< 60 batted balls) is not named. With no leaky arm, the AIR when it is carrying the ball
//                   (lib/conditions.js airVerdict: temp, wind, park). Neither: no line.
//   MATCHUP row     the hitter who faces that arm with the best published matchup power (matchup_power_score), said with his ISO against that hand.
//   FORM row        the hottest bat of the game: home runs in his last 10, then his last-10 xwOBA (a .350+ xwOBA alone is a row; less is no edge).
// Nothing here reads a call role. The caller's `hiddenOf` (the member gate) is applied in lib/slate/angles.js.
import { airVerdict, airGlance } from '../conditions'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const dot = (v) => v.toFixed(3).replace(/^0/, '')
export const XWOBA_EDGE = 0.35

/** The edge arms of a slate: rankArms() output cut to the top third of tonight's starters, thin samples out. */
export function edgeArms(arms) {
  const list = Array.isArray(arms) ? arms : []
  const cut = Math.ceil(list.length / 3)
  return list.slice(0, cut).filter((a) => !a.thin)
}

/** { weak, matchup: [candidate], form: [candidate] } for one game. `rows` = the game's hitters (RAW slate rows); `arms` = rankArms(whole slate). */
export function mlbGameAngles({ rows = [], arms = [], hrefOf = () => undefined }) {
  const names = new Set(rows.map((p) => String(p.pitcher_name || '').trim()).filter(Boolean))
  const arm = edgeArms(arms).find((a) => names.has(a.name)) || null   // rankArms is leakiest first: the first one in this game is its leakiest
  const mk = (p, why, extra) => ({ key: String(p.player_id), pid: p.player_id, name: p.name, team: p.team, why, href: hrefOf(p.player_id), row: p, ...extra })

  let weak = null
  if (arm) {
    const bits = arm.drivers.map((d) => `${d.label} ${d.text}`).join(', ')
    weak = `Weak spot: ${arm.name} (${arm.team}) is among the leakiest arms tonight: ${bits}`
  } else if (rows[0] && airVerdict(rows[0]) === 'carrying') {
    const g = airGlance(rows[0])
    if (g) weak = `Weak spot: the air is carrying the ball here (${g.text})`
  }

  const matchupC = []
  if (arm) {
    const last = arm.name.split(/\s+/).slice(-1)[0]
    for (const p of rows) {
      if (String(p.pitcher_name || '').trim() !== arm.name) continue
      const fit = num(p.matchup_power_score)
      if (fit == null) continue
      const iso = num(String(p.pitcher_throws).toUpperCase() === 'L' ? p.iso_vs_lhp : p.iso_vs_rhp)
      const hand = String(p.pitcher_throws).toUpperCase() === 'L' ? 'lefties' : 'righties'
      matchupC.push(mk(p, `${iso != null ? `${dot(iso)} ISO vs ${hand} · ` : ''}faces ${last}, ${num(arm.hr9) != null ? `${arm.hr9.toFixed(2)} HR/9` : 'a leaky arm'}`, { fit }))
    }
  }

  const formC = []
  for (const p of rows) {
    const hr = num(p.last10_hr) ?? 0
    const x = num(p.l10_xwoba)
    if (hr >= 1) formC.push(mk(p, `${hr} HR in last 10${x != null ? ` · ${dot(x)} xwOBA` : ''}`, { form: hr + (x ?? 0) }))
    else if (x != null && x >= XWOBA_EDGE) formC.push(mk(p, `${dot(x)} xwOBA over his last 10`, { form: x }))
  }
  return { weak, matchup: matchupC, form: formC }
}
