// THE SEASON STAMP (2026-10-10): which season a shot panel is drawn from, on every panel. Pure, browser-safe.
// This season is the default from its first game; under the small-sample line it says "THIS SEASON: n GAMES"
// and the real numbers stand alone. Last season shows only as a labelled fallback (no shots yet this season)
// or by choice (the switch).

/** @param data /api/lamp/shots answer  @param m the window's summary (games) */
export function stampLine(data, m) {
  const n = m?.games ?? data?.sample?.games ?? 0
  if (data?.fallback) return `NO SHOTS YET IN ${data.currentLabel} · SHOWING LAST SEASON (${data.seasonLabel}) · ${n} GAMES`
  const base = `${data.seasonLabel} REGULAR SEASON · ${n} GAMES`
  if (data?.stale) return `${base} · LAST SEASON`
  if (data?.sample?.thin && data.sample.current) return `THIS SEASON: ${n} ${n === 1 ? 'GAME' : 'GAMES'} · SMALL SAMPLE, READ LIGHTLY`
  return base
}

/** The league column's label: its own season, and plainly last season's when the league is still early. */
export const leagueStamp = (league, data) => (league
  ? `league's ${league.seasonLabel || data?.seasonLabel || ''}${league.fallback ? ' (last season: the league is early this year)' : ''}`.trim()
  : '')
