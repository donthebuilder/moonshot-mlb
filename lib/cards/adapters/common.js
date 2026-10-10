// SHARED BY THE THREE SPORT ADAPTERS (server only). Pictures, number words and the bio words; no sport is named here except as a key
// in the logo table (the same choices lib/cards/kit.js LOGO_OF makes: MLB's marks sit on a light plate).
import { mlbTeamLogo } from '../../mlbTeams'
import { nflTeamLogo } from '../../nfl/nflAssets'
import { nhlLogo } from '../../nhl/teams'
import { inline } from '../cardKit'
import { num } from '../model'

export { num }
const LOGO_OF = {
  mlb: { url: (t) => mlbTeamLogo(t, 320), plate: true },
  nfl: { url: (t) => nflTeamLogo(t, 160, true), plate: false },
  nhl: { url: (t) => nhlLogo(t, true), plate: false },
}
/** The club logo as a data URI ('' when it cannot be fetched) and whether it needs a light plate. */
export const logoFor = async (sport, team) => ({ src: await inline(LOGO_OF[sport]?.url(team)), plate: Boolean(LOGO_OF[sport]?.plate) })

export const f0 = (v) => (num(v) == null ? '—' : Math.round(num(v)).toLocaleString('en-US'))
export const signed = (v) => (num(v) == null ? '—' : v > 0 ? `+${v}` : String(v))
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const bornWord = (iso, city) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}${city ? ` · ${city}` : ''}` : null }
export const feet = (inches) => (num(inches) ? `${Math.floor(inches / 12)}'${inches % 12}"` : null)
