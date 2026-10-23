// WHAT THE RATES COUNT, IN WORDS (2026-10-17). One place for the sentence that says how many games a LAMP rate
// is over, so copy tells the truth for the model a date was locked under (lib/nhl/versions.js):
//   v3 and before  his last 82 NHL games (this season first, last season for the rest)
//   v4 (2026-10-18 on)  this season only
// `date` is the game's own day (YYYY-MM-DD); none given = today's Eastern day, i.e. the board being looked at now.
import { isV4, V4_FROM, V5_FROM } from './versions'
const todayEt = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) } catch { return '' } }
export const poolsThisSeasonOnly = (date) => isV4(date || todayEt())
/** "over his last 82 games" | "over his games this season" */
export const poolOver = (date) => (poolsThisSeasonOnly(date) ? 'over his games this season' : 'over his last 82 games')
/** "over his last 82 NHL games" | "over his NHL games this season" */
export const poolOverNhl = (date) => (poolsThisSeasonOnly(date) ? 'over his NHL games this season' : 'over his last 82 NHL games')
/** The GP column's explanation. */
export const gpUsedWords = (date) => (poolsThisSeasonOnly(date) ? 'Games counted for his rates: this season only.' : 'Games pooled for his rates (this season, plus last season weighted down early on).')
/** The Guide paragraph's clause, naming both rules and the day the change started. */
export const poolGuideWords = `each over his games this season (from ${V4_FROM} on; nights before that counted his last 82 NHL games, this season first and last season for the rest). A skater with 3 to 9 games is pulled toward his position's average; under 3 games is not scored. From ${V5_FROM} on, a skater the injury report lists out or on injured reserve is not scored either`
