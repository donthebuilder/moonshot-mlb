// THE CALIBRATION READER, FOR ANY SPORT (2026-10-10). Server only. Was inline in app/api/calibration/route.js;
// /called now leads with "calls landed of calls made" from the same body, so the route and the page call
// ONE function and share one cache entry (30 min, keyed sport + ET day): the page cannot print a number the
// API does not.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../supabase/admin'
import { readCalibration } from './readMlbCalibration'
import { readNhlCalibration, readNbaCalibration, readNflCalibration } from './readSportCalibration'

export const READ = {
  mlb: (day) => readCalibration(day),
  nhl: () => readNhlCalibration(adminClient({ anon: true })),
  nfl: () => readNflCalibration(),
  nba: () => readNbaCalibration(adminClient({ anon: true })),
}

export const readCalibrationAny = (sport, day) => unstable_cache(() => READ[sport](day), ['calibration-v1', sport, day], { revalidate: 1800 })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? READ[sport](day) : Promise.reject(e)))
