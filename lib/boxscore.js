'use client'

// 📋 THE BOX — the whole game, both sides, the way a box score has looked for
// a hundred and fifty years.
//
// 2026-08-15, Donovan: "there needs to be a place we can see last nights box
// score and the games going on either live or after they are finished and also
// the box score on the at the plate is hard to read."
//
// WHY THIS IS A SEPARATE FETCH FROM lib/liveSlate.js. That file pulls one
// boxscore per STARTED game every refresh and hands back only what a live pick
// board needs — AB, H, HR, TB, R, RBI for the hitters it cares about. Its
// field mask is deliberately tiny because it runs on a timer across sixteen
// games at once. A real box score needs walks, strikeouts, left-on-base,
// positions, season averages, and the whole pitching line for both staffs, and
// it needs them for EVERY player in the game rather than the ones on tonight's
// slate. Widening that mask would have made the sitewide 30-second poll several
// times heavier to serve a page nobody has open most of the time.
//
// So: this is fetched ONE GAME AT A TIME, when you open that game, and cached.
//
// AND IT ASKS FOR NO FIELD MASK. Every other call in this project enumerates
// `fields=` to keep payloads small. A box score is the one place where that
// trade goes the wrong way: the mask has to name every nested key, a missing
// one shows up as a silently absent column rather than an error, and the
// columns here are the entire point of the page. ~180 KB for a game you
// explicitly asked to see is a fair price for a box that can't quietly lose
// its walk column.

const gameCache = new Map()     // pk -> { at, promise }
const schedCache = new Map()    // date -> { at, promise }

const LIVE_TTL = 25_000
const FINAL_TTL = 10 * 60_000
const SCHED_TTL = 30_000

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** "2026-08-15" for a Date, in US Eastern — the day a baseball slate belongs to. */
export function slateDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/**
 * Every game on one date, with score and state.
 *
 * hydrate=linescore so a live game can say which inning it's in without a
 * second call, and decisions so a final game can name the winning pitcher.
 */
export async function scheduleFor(date) {
  const key = String(date)
  const hit = schedCache.get(key)
  if (hit && Date.now() - hit.at < SCHED_TTL) return hit.promise
  const p = fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${key}&endDate=${key}`
    + '&hydrate=linescore,decisions,probablePitcher',
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const out = []
      ;(j?.dates || []).forEach((d) => (d.games || []).forEach((g) => {
        const ls = g?.linescore || {}
        // postponed and suspended games report abstractGameState 'Final'.
        // liveSlate.js has the long note; the rule is the same here, and a
        // box score that says FINAL over a rained-out 5th is the exact kind
        // of confident wrongness this project keeps finding.
        const detail = String(g?.status?.detailedState || '')
        const postponed = /postponed|cancel/i.test(detail)
        const suspended = /suspend/i.test(detail)
        const abstract = String(g?.status?.abstractGameState || '')
        out.push({
          pk: g?.gamePk,
          date: d.date,
          state: abstract,
          detail,
          postponed,
          suspended,
          final: abstract === 'Final' && !postponed && !suspended,
          live: abstract === 'Live' && !postponed && !suspended,
          inning: num(ls?.currentInning, 0) || null,
          inningState: ls?.inningState || '',
          outs: num(ls?.outs, 0),
          away: {
            id: g?.teams?.away?.team?.id,
            name: g?.teams?.away?.team?.name || '',
            abbr: g?.teams?.away?.team?.abbreviation || '',
            score: g?.teams?.away?.score ?? null,
            record: g?.teams?.away?.leagueRecord || null,
            probable: g?.teams?.away?.probablePitcher?.fullName || '',
          },
          home: {
            id: g?.teams?.home?.team?.id,
            name: g?.teams?.home?.team?.name || '',
            abbr: g?.teams?.home?.team?.abbreviation || '',
            score: g?.teams?.home?.score ?? null,
            record: g?.teams?.home?.leagueRecord || null,
            probable: g?.teams?.home?.probablePitcher?.fullName || '',
          },
          startTime: g?.gameDate || '',
          venue: g?.venue?.name || '',
          // Line score by inning, when the league has it. A box score without
          // the innings across the top is half a box score.
          innings: (ls?.innings || []).map((i) => ({
            n: num(i?.num),
            away: i?.away?.runs ?? null,
            home: i?.home?.runs ?? null,
          })),
          totals: {
            away: { r: ls?.teams?.away?.runs ?? null, h: ls?.teams?.away?.hits ?? null, e: ls?.teams?.away?.errors ?? null },
            home: { r: ls?.teams?.home?.runs ?? null, h: ls?.teams?.home?.hits ?? null, e: ls?.teams?.home?.errors ?? null },
          },
          decisions: {
            win: g?.decisions?.winner?.fullName || '',
            loss: g?.decisions?.loser?.fullName || '',
            save: g?.decisions?.save?.fullName || '',
          },
        })
      }))
      // Time order, so the card reads like an evening rather than an id dump.
      out.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
      return out
    })
    .catch(() => null)
  schedCache.set(key, { at: Date.now(), promise: p })
  return p
}

// battingOrder is "100".."900" for the nine starters and "101"/"102" for the
// men who replaced them in that slot. The leading digit is the lineup spot;
// the suffix is how deep into the substitutions he is.
const spotOf = (bo) => {
  const n = num(String(bo || '').slice(0, 1), 0)
  return n || null
}
const subDepth = (bo) => num(String(bo || '').slice(1), 0)

function battingRows(side) {
  const players = side?.players || {}
  // `batters` is the league's own ordered list of everyone who took an at-bat,
  // in the order they appeared. Fall back to battingOrder, then to whoever has
  // a batting line at all, so a spring or suspended game still renders.
  const ids = (side?.batters?.length ? side.batters
    : side?.battingOrder?.length ? side.battingOrder
      : Object.values(players).filter((p) => p?.stats?.batting && Object.keys(p.stats.batting).length)
        .map((p) => p?.person?.id)).filter(Boolean)

  const rows = ids.map((id) => {
    const p = players[`ID${id}`] || players[id] || {}
    const b = p?.stats?.batting || {}
    const s = p?.seasonStats?.batting || {}
    return {
      id: num(p?.person?.id) || num(id),
      name: p?.person?.fullName || '',
      pos: p?.position?.abbreviation || '',
      spot: spotOf(p?.battingOrder),
      depth: subDepth(p?.battingOrder),
      ab: num(b.atBats), r: num(b.runs), h: num(b.hits), rbi: num(b.rbi),
      bb: num(b.baseOnBalls), k: num(b.strikeOuts), lob: num(b.leftOnBase),
      hr: num(b.homeRuns), d2: num(b.doubles), d3: num(b.triples),
      tb: num(b.totalBases), sb: num(b.stolenBases),
      avg: s.avg ?? null, ops: s.ops ?? null,
      // A pinch hitter or defensive sub is indented under the man he replaced,
      // exactly as a newspaper box does it.
      sub: subDepth(p?.battingOrder) > 0,
    }
  })
  // Order: lineup spot, then substitution depth inside it. Anyone with no
  // batting order (a pitcher who never hit) sorts to the bottom.
  rows.sort((a, b) => (a.spot ?? 99) - (b.spot ?? 99) || a.depth - b.depth)
  return rows
}

function pitchingRows(side) {
  const players = side?.players || {}
  const ids = (side?.pitchers?.length ? side.pitchers
    : Object.values(players).filter((p) => p?.stats?.pitching && Object.keys(p.stats.pitching).length)
      .map((p) => p?.person?.id)).filter(Boolean)
  return ids.map((id) => {
    const p = players[`ID${id}`] || players[id] || {}
    const t = p?.stats?.pitching || {}
    const s = p?.seasonStats?.pitching || {}
    return {
      id: num(p?.person?.id) || num(id),
      name: p?.person?.fullName || '',
      // inningsPitched is a STRING like "5.2" meaning five and two thirds —
      // not 5.2 innings. Never do arithmetic on it; it is display only.
      ip: t.inningsPitched ?? '0.0',
      h: num(t.hits), r: num(t.runs), er: num(t.earnedRuns),
      bb: num(t.baseOnBalls), k: num(t.strikeOuts), hr: num(t.homeRuns),
      pitches: num(t.numberOfPitches), strikes: num(t.strikes),
      era: s.era ?? null,
      started: num(t.gamesStarted) > 0,
      note: t.note || '',      // (W, 9-4) / (S, 22) — the league's own tag
    }
  })
}

function teamTotals(side) {
  const b = side?.teamStats?.batting || {}
  const p = side?.teamStats?.pitching || {}
  return {
    batting: {
      ab: num(b.atBats), r: num(b.runs), h: num(b.hits), rbi: num(b.rbi),
      bb: num(b.baseOnBalls), k: num(b.strikeOuts), lob: num(b.leftOnBase),
      hr: num(b.homeRuns), avg: b.avg ?? null,
    },
    pitching: {
      ip: p.inningsPitched ?? '0.0', h: num(p.hits), r: num(p.runs),
      er: num(p.earnedRuns), bb: num(p.baseOnBalls), k: num(p.strikeOuts),
    },
  }
}

/** The full box for one game, normalised. Cached; live games expire fast. */
export async function fullBox(pk, { live = false } = {}) {
  const key = String(pk)
  const ttl = live ? LIVE_TTL : FINAL_TTL
  const hit = gameCache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.promise
  const p = fetch(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const t = j?.teams
      if (!t?.home && !t?.away) return null
      const side = (s) => ({
        team: {
          id: s?.team?.id,
          name: s?.team?.name || '',
          abbr: s?.team?.abbreviation || '',
        },
        batting: battingRows(s),
        pitching: pitchingRows(s),
        totals: teamTotals(s),
        notes: (s?.note || []).map((n2) => n2?.label ? `${n2.label} ${n2.value || ''}` : '').filter(Boolean),
      })
      return { pk: num(pk), away: side(t.away), home: side(t.home) }
    })
    .catch(() => null)
  gameCache.set(key, { at: Date.now(), promise: p })
  return p
}

/** Drop the cache for one game — used by the manual refresh button. */
export function forget(pk) {
  gameCache.delete(String(pk))
}
