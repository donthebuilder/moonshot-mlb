'use client'
import { useMounted, localTime, localDayTime } from '../lib/localTime'

// A SERVER-RENDERED PAGE'S CLOCK TIME, IN THE VIEWER'S ZONE (2026-10-07, audit X11).
// The front door and /start render on the server, where there is no viewer zone. The server
// (and the client's first paint, so they agree: no hydration warning) writes `fallback` --
// the time in ET, labelled -- and once mounted the same instant is redrawn in the viewer's
// zone, labelled once ("5:15 PM MST"). `day` adds the weekday.
export default function LocalAt({ iso, fallback = '', day = false, zone = true }) {
  const mounted = useMounted()
  const text = mounted ? (day ? localDayTime(iso, { zone }) : localTime(iso, { zone })) : ''
  return <span>{text || fallback}</span>
}
