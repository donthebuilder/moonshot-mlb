// BEST ANGLES FOR ONE NFL GAME (the shared game card, components/slate/SlateCard.js; the picker is lib/slate/angles.js).
// PURE. Every number is a field the site already computes:
//   THE WEAK SPOT   the softest starter role either defense gives up (lib/nfl/dvpSignal.js weakSpotRoles: z >= 1 against the league's own
//                   average for that role, starters' touchdown and red-zone cells; the Weak spots card's and the Matchups page's measure), said with
//                   softLine's own words. A defense with no standout soft role has none: no line.
//   MATCHUP row     the man who holds that role on the offense it faces (the bot's depth chart, matchup.roles) and fits the leak (fitsSoft); the
//                   softest role first, his TD score only breaks a tie between two men in the same role.
//   FORM row        the best last three games in the logs (nfl_logs.json): touchdowns, then touches a game.
// Nothing here reads a call status. The caller's `hiddenOf` (the member gate) is applied in lib/slate/angles.js.
import { weakSpotRoles, softLine, multipleWords, fitsSoft, plainRole } from './dvpSignal'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const roleOf = (matchup, id) => { const r = matchup?.roles?.[id]; return typeof r === 'string' ? r : r && typeof r === 'object' ? r.role || null : null }
const cap = (t) => `${t[0].toUpperCase()}${t.slice(1)}`
const LAST = 3
const MIN_TOUCHES = 8   // touches a game over the last three, below which "balling out" is not a claim worth a row

function softCells(matchup, game) {
  const out = []
  for (const [def, off] of [[game?.home, game?.away], [game?.away, game?.home]]) {
    if (!def || !off) continue
    for (const d of weakSpotRoles(matchup, def)) out.push({ def, off, d })
  }
  return out.sort((a, b) => b.d.z - a.d.z)
}

/** { weak, matchup: [candidate], form: [candidate] } for one game. `players` = the week's rows; `logs` = nfl_logs.json. */
export function nflGameAngles({ matchup, game, players = [], logs = null, hrefOf = () => undefined }) {
  const inGame = players.filter((p) => (p.team === game?.away || p.team === game?.home) && p.position !== 'DEF' && !p.on_bye)
  const mk = (p, why, extra) => ({ key: String(p.player_id), pid: p.player_id, name: p.name, team: p.team, why, href: hrefOf(p.player_id), ...extra })

  const cells = softCells(matchup, game)
  const matchupC = []
  cells.forEach(({ def, off, d }, ci) => {
    for (const p of inGame) {
      if (p.team !== off || roleOf(matchup, p.player_id) !== d.role || !fitsSoft(p, d)) continue
      const m = multipleWords(d, { short: true })
      matchupC.push(mk(p, `${cap(plainRole(d.role))} vs ${def}: ${m ? `${m} on ${d.label}` : `${d.label} allowed`}`, { fit: d.z * 1000 + (num(p.scores?.TD) ?? 0), cell: ci }))
    }
  })
  // THE LINE says the soft spot the first matchup row attacks (the softest role that has a man who fits it); with nobody fitting, the softest spot there is
  const lead = matchupC.length ? cells[matchupC.reduce((a, c) => (c.fit > a.fit ? c : a)).cell] : cells[0]
  // softLine's own sentence (the Matchups page's), tightened for a card: no sample tail, "the opposing" and "average" dropped
  const weak = lead ? `Weak spot: ${lead.def} ${softLine(lead.d).split(' · ')[0].replace(' to the opposing ', ' to the ').replace(' — ', ', ').replace('the league average', 'the league')}` : null

  const formC = []
  for (const p of inGame) {
    const log = logs?.logs?.[String(p.player_id)]?.log
    if (!Array.isArray(log) || log.length < 2) continue
    const last = [...log].sort((a, b) => (a.s - b.s) || (a.w - b.w)).slice(-LAST)
    const tds = last.reduce((t, r) => t + (num(r.g_td) ?? 0), 0)
    const touches = last.reduce((t, r) => t + (num(r.g_rec) ?? 0) + (num(r.g_car) ?? 0), 0) / last.length
    if (tds >= 1) formC.push(mk(p, `${tds} TD in last ${last.length}${touches >= MIN_TOUCHES ? ` · ${touches.toFixed(1)} touches a game` : ''}`, { form: tds * 100 + touches }))
    else if (touches >= MIN_TOUCHES) formC.push(mk(p, `${touches.toFixed(1)} touches a game, last ${last.length}`, { form: touches }))
  }
  return { weak, matchup: matchupC, form: formC }
}

