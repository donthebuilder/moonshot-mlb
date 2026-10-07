'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, nameOf, teamOf, oppOf, txt } from '../../lib/player'
import { FilterPill } from '../Filters'
import { fmtOdds, impliedPct, normName } from '../../lib/odds'
import DenseTable from '../DenseTable'
import { boardRow, boardRowContext, withBoardColumns, placeAfter } from '../../lib/boardColumns'
import { useGameNav } from '../../lib/teamNav'

// ══ THE STEAL BOARD ═════════════════════════════════════════════════════════
//
// Donovan, 2026-08-22: "some also requested stolen base metrics and data and
// information odds all that to track and find stolen base looks" → "i think
// stolen bases for postseason will be big" → deadline "now". Then 2026-08-23,
// after SB v1 landed on the bot: "then do the stolen base thing its simple."
//
// It is simple, and it is simple because the bot did the hard part first. SB v1
// put season_sb, season_cs and season_sb_attempt_rate on every slate row and
// graded actual_sb from the box score. Tonight 216 of 267 hitters carry a steal.
// This board is the read on top of that, and NOTHING here is modelled: every
// number is a count or a rate the bot published.
//
// WHAT THE BOARD IS FOR, stated so it cannot drift: a stolen base needs a
// runner who runs, and a runner who GETS ON. A 42-steal man batting .190 who
// reaches twice a week is not tonight's steal — his rate is real and his
// opportunity is not. So the board ranks on volume but always prints on-base
// beside it, and says so in words.
//
// ── TWO OF THE THREE REFUSALS CAME OFF (2026-08-23) ─────────────────────────
//
// This board shipped with three written refusals. Two of them are now answered
// and the third still stands, which is exactly how a refusal is supposed to
// end: somebody goes and gets the data rather than the caveat becoming
// furniture.
//
//   ANSWERED — "No catcher data. Who is behind the plate is the other half of
//   a steal and the slate does not carry it."
//     It was on the boxscore the whole time. The bot walks the posted batting
//     order for "C" (find_catcher), joins him to Baseball Savant's
//     catcher-throwing leaderboard, and publishes his caught-stealing rate,
//     pop time and arm strength on every row. `opp_catcher_source` says
//     whether the lineup was posted or the catcher was inferred, and this
//     board shows the difference rather than flattening it.
//
//   ANSWERED — "No SB score. The bot has no stolen-base model."
//     It has one now: steal_risk_score, built on the runner's own history, the
//     arm's willingness to be run on (attempts against, pickoff rate, wild
//     pitches) and the catcher's arm, with reaching base as a multiplier
//     because you cannot steal first. It is worth ZERO points in any other
//     model and it is archived unscored, so in a few weeks "do high-risk spots
//     actually produce steals" is answerable against actual_sb rather than
//     asserted. If the answer is no, it goes.
//
//   ANSWERED TOO (2026-09-01) — prices. The odds probe of 2026-08-29 and
//     tonight's odds_latest.json both carry batter_stolen_bases (76 of 219
//     hitters priced, Fanatics). sbPriceFor() below reads it; the Price
//     column and the "Longest price" sort exist because of it.
//
// A row whose score reads "—" is a row the bot refused to score, and the sort
// puts those at the bottom rather than at zero.

// "Sandy León" in 112px next to a percentage is an ellipsis. First initial and
// surname is the same man and fits, and the full name is in the title.
const shortCatcher = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length < 2) return parts[0] || ''
  return `${parts[0][0]}. ${parts[parts.length - 1]}`
}

const sbOf = (p) => n(p?.season_sb, 0)
const csOf = (p) => n(p?.season_cs, 0)
const attRate = (p) => {
  const r = n(p?.season_sb_attempt_rate, null)
  return r == null || r === 0 ? null : r
}
// Success rate off the two counts the bot publishes. The break-even for a
// stolen base is about 75% — under it the attempt costs more than it wins —
// so that is the line the colour reads against, not an arbitrary "good".
const succOf = (p) => {
  const sb = sbOf(p), cs = csOf(p)
  const att = sb + cs
  return att >= 5 ? (100 * sb) / att : null
}
const BREAK_EVEN = 75

// The model, and the two halves of the matchup it is built from.
const riskOf = (p) => {
  const v = n(p?.steal_risk_score, 0)
  return v > 0 && String(p?.steal_risk_status || '') !== 'no_runner' ? v : null
}
const catcherOf = (p) => {
  const r = p?.opp_catcher_cs_rate
  return r == null || r === '' ? null : Number(r)
}

// ── THE PRICE, NOW THAT THERE IS ONE (2026-09-01) ────────────────────────────
// This board shipped with "no prices — whether the book even lists a
// stolen-base prop is unknown until a real fetch lands." The fetch landed: the
// odds probe of 2026-08-29 and tonight's odds_latest.json both carry
// batter_stolen_bases, priced on 76 of 219 hitters via Fanatics. So the
// column exists now. It is the over on 0.5 — "1+ steal tonight" — and only
// that line; a book sitting on 1.5 is a different bet and prints as such.
export function sbPriceFor(odds, p) {
  if (!odds || !p) return null
  const byId = odds.by_player_id?.[String(p.player_id ?? p.id)]
  const byName = odds.by_name?.[normName(p.name || p.player_name)]
  const q = (byId || byName)?.batter_stolen_bases
  if (!q || q.over == null) return null
  const line = Number(q.line)
  return { over: q.over, implied: q.implied ?? impliedPct(q.over), line, matches: Math.abs(line - 0.5) < 1e-9, book: q.best_book || null, books: q.books || null }
}

// ── A DENSE TABLE, NOT A LIST OF FLEX ROWS (2026-10-07, Donovan: "steal boards: not dense, redo as a dense table") ──
// The same runners, the same numbers, the same prices -- drawn as the site's one table (DenseTable skin v2):
// the sort is the header's (the old Sort chips are gone), the best fifth of every column glows, the worst
// fifth recedes, and every other column the Rankings board carries rides along under the steal columns
// (lib/boardColumns.js). A header with a ⓘ says what the column is; a phone folds the Call columns
// under the name.
const STEAL_GROUP = { key: 'steal', label: 'The steal', order: 1 }
const MARKET_GROUP = { key: 'stealprice', label: 'The price', order: 1.4 }
const fmtAvg3 = (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, ''))

export default function StealBoard({ players = [], odds = null, onPlayerClick }) {
  const [runnersOnly, setRunnersOnly] = useState(true)
  const openGame = useGameNav()

  const ctx = useMemo(() => boardRowContext(players || []), [players])

  const rows = useMemo(() => {
    const out = (players || []).filter((p) => p && p.player_id && sbOf(p) > 0)
    // A runner is a hitter with a real attempt history -- five or more tries.
    // Under that a 2-for-2 reads as 100% and tops the board on noise.
    const kept = runnersOnly ? out.filter((p) => sbOf(p) + csOf(p) >= 5) : out
    return kept.map((p, i) => {
      const q = sbPriceFor(odds, p)
      const cName = txt(p?.opp_catcher_name)
      const cRate = catcherOf(p)
      return {
        ...boardRow(p, i, ctx),
        _key: `${p.player_id}-${p.game_pk}`,
        _raw: p,
        risk: riskOf(p),
        thin: String(p?.steal_risk_status) === 'thin' ? 1 : 0,
        riskNote: txt(p?.steal_risk_note) || 'not scored',
        catcher: cName || '',
        cSrc: String(p?.opp_catcher_source || ''),
        cRate: cRate == null ? null : 100 * cRate,
        cAtt: n(p?.opp_catcher_sb_attempts, 0),
        sb: sbOf(p),
        cs: csOf(p),
        succ: succOf(p),
        att: (() => { const a = attRate(p); return a == null ? null : (a > 1 ? a : a * 100) })(),
        price: q && q.matches ? q.over : null,
        priceQ: q,
      }
    })
  }, [players, odds, runnersOnly, ctx])

  const total = (players || []).filter((p) => sbOf(p) > 0).length
  const priced = rows.filter((r) => r.priceQ?.matches).length

  // ── SAY IT WHEN THE ARM DATA DIDN'T ARRIVE (2026-08-31) ─────────────────
  //
  // This board's own header records that "no catcher data" was a written
  // refusal until 2026-08-23, when the bot went and got it. On the 2026-08-30
  // slate it is silently gone again: pop time, arm strength and
  // caught-stealing rate are null on all 251 rows, opp_catcher_sb_attempts is
  // 0 on all 251, and every one of the 28 catchers carries status
  // "unqualified". Those men are not unqualified. Nobody is. The board was the
  // last line of defence and it never read the status at all.
  //
  // The rule this board already lives by, applied one level up: a reader who
  // cannot tell a hard matchup from an unmeasured one cannot use either.
  const feed = useMemo(() => {
    const rowsWithCatcher = (players || []).filter((p) => txt(p?.opp_catcher_name))
    if (!rowsWithCatcher.length) return null
    const withArm = rowsWithCatcher.filter((p) => catcherOf(p) != null
      || p?.opp_catcher_pop_time != null || p?.opp_catcher_arm_strength != null)
    if (withArm.length) return null
    const names = new Set(rowsWithCatcher.map((p) => txt(p.opp_catcher_name)))
    const st = txt(rowsWithCatcher[0]?.opp_catcher_status)
    return { catchers: names.size, status: st }
  }, [players])

  const columns = useMemo(() => placeAfter(withBoardColumns([
    // the Vs cell opens the game, as the old Matchup cell did
    { key: 'opp', label: 'Vs', heat: false, w: 40, mono: true, dim: true, link: (p) => (openGame && p?.game_pk ? () => openGame(p.game_pk) : null) },
    { key: 'risk', group: STEAL_GROUP, label: 'Spot', w: 56, dp: 0, domain: [0, 100], bar: 'primary', primary: true,
      fmt: (v, r) => (v == null ? '—' : <>{Number(v).toFixed(0)}{r.thin ? <span style={{ opacity: 0.55 }}>*</span> : null}</>),
      title: 'MOONSHOT’s steal-spot score for THIS runner against THIS arm and THIS catcher tonight. Zero points in any other model; archived unscored so it earns its way in or gets deleted. A * means half the matchup is unmeasured. A dash is a refusal, not a zero.' },
    { key: 'sb', group: STEAL_GROUP, label: 'SB', w: 42, dp: 0, title: 'Stolen bases this season' },
    { key: 'cs', group: STEAL_GROUP, label: 'CS', w: 42, dp: 0, invert: true, title: 'Caught stealing this season' },
    { key: 'succ', group: STEAL_GROUP, label: 'Succ%', w: 56, dp: 0, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`),
      title: `Stolen bases divided by attempts. Blank under five attempts — a 2-for-2 is not a rate. Break-even for a steal is about ${BREAK_EVEN}%.` },
    { key: 'att', group: STEAL_GROUP, label: 'Att%', w: 52, dp: 0, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`),
      title: 'MOONSHOT’s season attempt rate — how often he goes, not how often he makes it' },
    { key: 'catcher', group: STEAL_GROUP, label: 'Catcher', heat: false, w: 104,
      fmt: (v, r) => (v ? <span title={`${v}${r.cSrc === 'roster' ? ' (lineup not posted — likeliest catcher)' : ''}`}>{r.cSrc === 'roster' ? <span style={{ color: C.text3 }}>{'˜'}</span> : null}{shortCatcher(v)}</span> : '—'),
      title: 'Who is catching tonight. A ˜ before the name means the lineup was not posted and he is the likeliest man back there.' },
    { key: 'cRate', group: STEAL_GROUP, label: 'C CS%', w: 56, dp: 0, invert: true, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`),
      title: 'Share of steal attempts the catcher throws out. Blank under 10 attempts — a backup at 1-of-2 is not a 50% thrower. Lower is softer for a runner.' },
    { key: 'price', group: MARKET_GROUP, label: '1+ SB', w: 78, standout: false,
      fmt: (v, r) => {
        const q = r.priceQ
        if (!q) return '—'
        if (!q.matches) return <span style={{ fontSize: 9 }} title={`book is at ${q.line}, not 0.5 — a different bet`}>@{q.line}</span>
        return <span title={`${fmtOdds(q.over)} on 1+ SB${q.book ? ` · ${q.book}` : ''} · needs ${q.implied}% to break even`}><b>{fmtOdds(q.over)}</b>{q.implied != null ? <span style={{ fontSize: 9, color: C.text3, marginLeft: 4 }}>{Math.round(q.implied)}%</span> : null}</span>
      },
      title: 'The book’s price on 1+ stolen base tonight (the over on 0.5), and the break-even rate it implies. Blank when he isn’t listed.' },
  ], {}), 'opp', 'team'), [openGame])

  if (!total) {
    return (
      <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.6 }}>
        No stolen-base numbers for tonight yet. There is nothing here to rank until they arrive.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginBottom: 8, maxWidth: 760 }}>
        Every runner on tonight&apos;s slate. <b style={{ color: C.text2 }}>Spot</b> is MOONSHOT&apos;s
        steal-spot score for this man against tonight&apos;s arm and catcher, scaled by how often he
        reaches base. Everything else is a raw count or a published rate, unmodelled.{' '}
        <b style={{ color: C.text2 }}>1+ SB</b> is the book&apos;s number
        {priced ? <> — <b style={{ color: C.text2 }}>{priced}</b> of these runners are priced tonight</> : ' — none priced yet tonight'}.
      </div>

      {feed && (
        <div style={{ borderLeft: `3px solid ${C.orange}`, padding: '2px 0 2px 10px', marginBottom: 10, maxWidth: 760 }}>
          <b style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 10 }}>⚠ NO ARM DATA TONIGHT</b>
          <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 4 }}>
            Not one of the <b style={{ color: C.text2 }}>{feed.catchers}</b> catchers on this slate has a
            published caught-stealing rate, pop time or arm strength
            {feed.status ? <> — every row reads <code style={{ fontFamily: NUM_FONT }}>{feed.status}</code></> : null}.
            That is the whole league at once, so read it as the feed not landing rather than as a slate
            full of unmeasured backups. <b style={{ color: C.text2 }}>Half of the Spot score is missing</b>{' '}
            on every row below.
          </div>
        </div>
      )}

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <FilterPill active={runnersOnly} count={rows.length}
          title="Five or more attempts this season. Under that a 2-for-2 reads as 100% and tops the board on noise."
          onClick={() => setRunnersOnly((v) => !v)}>Real runners only</FilterPill>
        <span style={{ fontSize: 9.5, color: C.text3 }}>{total} hitters with a steal tonight</span>
      </div>

      <DenseTable
        rows={rows}
        columns={columns}
        onRowClick={onPlayerClick}
        initialSort="risk"
        maxHeight={560}
        maxRows={Math.max(rows.length, 1)}
        caption="Ranked by MOONSHOT's steal-spot score. Success is read against the 75% break-even — under it the attempt costs more than it wins. A blank Spot is a refusal, not a zero. Counts are MOONSHOT's published season fields, graded nightly against the box score. Tap a row for his full card."
      />
    </div>
  )
}
