'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, nameOf, teamOf, oppOf, txt } from '../../lib/player'
import { alpha, verdictInk, verdictWash } from '../../lib/scales'
import { FilterPill } from '../Filters'
import { fmtOdds, impliedPct, normName } from '../../lib/odds'

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

const SORTS = [
  // Risk leads, because it is the only column that answers "is tonight a good
  // night to run" rather than "who runs a lot". Blanks sort last on their own
  // (the ?? -1), same rule every other column here follows.
  ['risk', 'Steal spot', (p) => riskOf(p) ?? -1],
  ['sb', 'Steals', (p) => sbOf(p)],
  ['rate', 'Attempt rate', (p) => attRate(p) ?? -1],
  ['succ', 'Success %', (p) => succOf(p) ?? -1],
  ['obp', 'On base', (p) => n(p?.season_obp, 0)],
  // A weak-throwing catcher is the reason to run tonight, so ascending: the
  // softest arm behind the plate first.
  ['catcher', 'Weakest catcher', (p) => { const c = catcherOf(p); return c == null ? -1 : 1 - c }],
  // Longest price first; a runner the book does not list sorts last.
  ['price', 'Longest price', (p) => { const q = p.__sb; return q && q.matches ? (q.over > 0 ? q.over : -1e6 - q.over) : -1e7 }],
]

function Cell({ children, w, mono = true, color, title, right }) {
  return (
    <span title={title} style={{
      width: w, flexShrink: 0, minWidth: 0, textAlign: right ? 'right' : 'left',
      fontFamily: mono ? NUM_FONT : undefined, fontSize: 11, color: color || C.text2,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      cursor: title ? 'inherit' : 'inherit',
    }}>{children}</span>
  )
}

export default function StealBoard({ players = [], odds = null, onPlayerClick }) {
  const [sort, setSort] = useState('risk')
  const [runnersOnly, setRunnersOnly] = useState(true)

  const rows = useMemo(() => {
    const out = (players || []).filter((p) => p && p.player_id && sbOf(p) > 0)
      .map((p) => ({ ...p, __sb: sbPriceFor(odds, p) }))
    const f = (SORTS.find(([k]) => k === sort) || SORTS[0])[2]
    // A runner is a hitter with a real attempt history — five or more tries.
    // Under that a 2-for-2 reads as 100% and tops the board on noise.
    const kept = runnersOnly ? out.filter((p) => sbOf(p) + csOf(p) >= 5) : out
    return [...kept].sort((a, b) => f(b) - f(a) || String(nameOf(a)).localeCompare(String(nameOf(b))))
  }, [players, sort, runnersOnly, odds])

  const total = (players || []).filter((p) => sbOf(p) > 0).length
  const priced = rows.filter((p) => p.__sb?.matches).length

  // ── SAY IT WHEN THE ARM DATA DIDN'T ARRIVE (2026-08-31) ─────────────────
  //
  // This board's own header records that "no catcher data" was a written
  // refusal until 2026-08-23, when the bot went and got it. On the 2026-08-30
  // slate it is silently gone again: pop time, arm strength and
  // caught-stealing rate are null on all 251 rows, opp_catcher_sb_attempts is
  // 0 on all 251, and every one of the 28 catchers — Rutschman, Raleigh, Kirk,
  // Murphy, Hedges — carries status "unqualified".
  //
  // Those men are not unqualified. Nobody is. The Savant map came back empty
  // wearing an "ok", and mlb_dashboard's status ladder then blames the catcher
  // (fixed on the bot side; see savant_feeds.py). But the board was the last
  // line of defence and it never read the status at all — it printed "no
  // caught-stealing rate published" per row, which reads as a fact about THAT
  // CATCHER and is how a league-wide outage passed for a quiet night for
  // weeks.
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

  if (!total) {
    return (
      <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.6 }}>
        No stolen-base fields on tonight&apos;s slate yet. They arrive with the bot&apos;s
        SB v1 fields (season_sb, season_cs, season_sb_attempt_rate); until a slate
        publishes them there is nothing here to rank.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginBottom: 10, maxWidth: 760 }}>
        Every runner on tonight&apos;s slate. <b style={{ color: C.text2 }}>Spot</b> is the bot&apos;s
        steal-spot score for this man against tonight&apos;s arm and tonight&apos;s catcher — how
        often he runs, how often he makes it, how easily that arm gets run on, and whether the
        catcher can throw, all scaled by how often he reaches base, because you cannot steal
        first. Everything to the right of it is a raw count or a published rate, unmodelled.
        Success rate is coloured against the <b style={{ color: C.text2 }}>{BREAK_EVEN}%</b>{' '}
        break-even — under it, the attempt costs more than it wins. A blank Spot is a refusal
        rather than a zero: no stolen-base attempt on his record this season, so the matchup
        belongs to somebody else. <b style={{ color: C.text2 }}>Price</b> is the book&apos;s
        number on 1+ steal tonight, with the break-even rate it implies under it
        {priced ? <> — <b style={{ color: C.text2 }}>{priced}</b> of these runners are priced tonight</> : ' — none priced yet tonight'}.
      </div>

      {feed && (
        <div style={{
          border: `1px solid ${C.orange}59`, borderRadius: 10, padding: '8px 11px',
          background: alpha(C.orange, 0.07), marginBottom: 10, maxWidth: 760,
        }}>
          <b style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 10 }}>⚠ NO ARM DATA TONIGHT</b>
          <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 4 }}>
            Not one of the <b style={{ color: C.text2 }}>{feed.catchers}</b> catchers on this slate has a
            published caught-stealing rate, pop time or arm strength
            {feed.status ? <> — every row reads <code style={{ fontFamily: NUM_FONT }}>{feed.status}</code></> : null}.
            That is the whole league at once, so read it as the feed not landing rather than as a slate
            full of unmeasured backups. <b style={{ color: C.text2 }}>Half of the Spot score is missing</b>{' '}
            on every row below: what is left is the runner&apos;s own history and how easily the arm gets
            run on, with nothing about who is behind the plate.
          </div>
        </div>
      )}

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase' }}>Sort</span>
        {SORTS.map(([k, label]) => (
          <FilterPill key={k} active={sort === k} onClick={() => setSort(k)}>{label}</FilterPill>
        ))}
      </div>
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <FilterPill active={runnersOnly} count={rows.length}
          title="Five or more attempts this season. Under that a 2-for-2 reads as 100% and tops the board on noise."
          onClick={() => setRunnersOnly((v) => !v)}>Real runners only</FilterPill>
        <span style={{ fontSize: 9.5, color: C.text3 }}>{total} hitters with a steal tonight</span>
      </div>

      <div className="dense-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 724 }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px',
            borderBottom: `1px solid ${C.border2}`,
            fontSize: 8.5, fontWeight: 800, letterSpacing: '.09em',
            color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT,
          }}>
            <Cell w={20} right>#</Cell>
            <Cell w={148} mono={false}>Runner</Cell>
            <Cell w={86}>Matchup</Cell>
            <Cell w={52} right title="The bot's steal-spot score for THIS runner against THIS arm and THIS catcher tonight. Zero points in any other model; archived unscored so it earns its way in or gets deleted. Blank means the bot refused to score him — no attempt on his record this season, so the matchup is somebody else's.">Spot</Cell>
            <Cell w={112} mono={false} title="Who is catching, and his caught-stealing rate. Blank under 10 attempts — a backup at 1-of-2 is not a 50% thrower. A ˜ before the name means the lineup was not posted and this is the likeliest catcher rather than a confirmed one.">Catcher</Cell>
            <Cell w={40} right title="Stolen bases this season">SB</Cell>
            <Cell w={40} right title="Caught stealing this season">CS</Cell>
            <Cell w={56} right title="Stolen bases divided by attempts. Blank under five attempts — a 2-for-2 is not a rate.">Succ</Cell>
            <Cell w={56} right title="The bot's season attempt rate — how often he goes, not how often he makes it">Att</Cell>
            <Cell w={52} right title="Season on-base percentage. The other half of a steal: he has to reach first.">OBP</Cell>
            <Cell w={64} right title="The book's price on 1+ stolen base tonight (the over on 0.5), and the break-even rate it implies. Blank when he isn't listed; a note when the book is at a different number.">Price</Cell>
          </div>

          {rows.map((p, i) => {
            const succ = succOf(p)
            const risk = riskOf(p)
            const cName = txt(p?.opp_catcher_name)
            const cSrc = String(p?.opp_catcher_source || '')
            const cRate = catcherOf(p)
            const ink = succ == null ? C.text3 : verdictInk(succ >= BREAK_EVEN).color
            const obp = n(p?.season_obp, 0)
            const att = attRate(p)
            return (
              <div
                key={`${p.player_id}-${p.game_pk}`}
                onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
                className="dense-click"
                style={{
                  display: 'flex', gap: 8, alignItems: 'center', padding: '7px 8px',
                  borderBottom: `1px solid ${C.border}`, minWidth: 0,
                  cursor: onPlayerClick ? 'pointer' : 'default',
                  background: succ != null && succ >= BREAK_EVEN && sbOf(p) >= 15
                    ? verdictWash(true, 0.06) : 'transparent',
                }}
              >
                <Cell w={20} right color={C.text3}>{i + 1}</Cell>
                <Cell w={148} mono={false} color={C.text}>
                  <b style={{ fontWeight: 800 }}>{nameOf(p)}</b>
                </Cell>
                <Cell w={86} color={C.text3}>{teamOf(p)} vs {oppOf(p)}</Cell>
                {/* THE SPOT — the model, and it says when it declined. A row
                    the bot refused to score prints an em-dash and the tooltip
                    gives the reason; it never prints 0.0, which would rank a
                    refusal beside a genuinely terrible matchup. */}
                <Cell w={52} right
                  color={risk == null ? C.text3
                    : risk >= 60 ? verdictInk(true).color
                    : risk >= 40 ? C.text : C.text3}
                  title={txt(p?.steal_risk_note) || 'not scored'}>
                  {risk == null ? '—' : risk.toFixed(0)}
                  {risk != null && String(p?.steal_risk_status) === 'thin'
                    ? <span style={{ opacity: 0.55 }}>*</span> : null}
                </Cell>
                {/* THE OTHER HALF OF THE STEAL. ˜ marks a catcher inferred
                    from the roster rather than read off a posted lineup —
                    the same fact, one confidence lower, and flattening the
                    two would be the quiet kind of lie. */}
                <Cell w={112} mono={false} color={C.text2}
                  title={cName
                    ? `${cName}${cSrc === 'roster' ? ' (lineup not posted — likeliest catcher)' : ''}`
                      + (cRate == null
                        ? ` · no caught-stealing rate published${n(p?.opp_catcher_sb_attempts, 0) ? ` (${n(p.opp_catcher_sb_attempts, 0)} attempts, under the 10 needed)` : ''}`
                        : ` · throws out ${(100 * cRate).toFixed(0)}% on ${n(p?.opp_catcher_sb_attempts, 0)} attempts`)
                    : 'the catcher for this game is not published yet'}>
                  {cName ? (
                    <>
                      {cSrc === 'roster' && <span style={{ color: C.text3 }}>˜</span>}
                      {shortCatcher(cName)}
                      {cRate != null && (
                        <b style={{
                          marginLeft: 5, fontFamily: NUM_FONT,
                          color: cRate <= 0.16 ? verdictInk(true).color
                            : cRate >= 0.28 ? verdictInk(false).color : C.text3,
                        }}>{(100 * cRate).toFixed(0)}%</b>
                      )}
                    </>
                  ) : '—'}
                </Cell>
                <Cell w={40} right color={C.text}>{sbOf(p)}</Cell>
                <Cell w={40} right color={C.text3}>{csOf(p)}</Cell>
                <Cell w={56} right color={ink}
                  title={succ == null ? 'under five attempts — no rate' : `${sbOf(p)} of ${sbOf(p) + csOf(p)} · break-even is ${BREAK_EVEN}%`}>
                  {succ == null ? '—' : `${succ.toFixed(0)}%`}
                </Cell>
                <Cell w={56} right color={C.text2}>
                  {att == null ? '—' : att > 1 ? att.toFixed(1) : `${(att * 100).toFixed(0)}%`}
                </Cell>
                <Cell w={52} right color={obp >= 0.34 ? verdictInk(true).color : C.text2}>
                  {obp ? obp.toFixed(3).replace(/^0/, '') : '—'}
                </Cell>
                <Cell w={64} right color={p.__sb?.matches ? C.text : C.text3}
                  title={!p.__sb ? 'not priced tonight'
                    : !p.__sb.matches ? `book is at ${p.__sb.line}, not 0.5 — a different bet`
                    : `${fmtOdds(p.__sb.over)} on 1+ SB${p.__sb.book ? ` · ${p.__sb.book}` : ''} · needs ${p.__sb.implied}% to break even`}>
                  {!p.__sb ? '—' : !p.__sb.matches ? <span style={{ fontSize: 9 }}>@{p.__sb.line}</span> : (
                    <>
                      <b style={{ fontWeight: 900 }}>{fmtOdds(p.__sb.over)}</b>
                      <span style={{ fontSize: 8.5, color: C.text3, marginLeft: 4 }}>{p.__sb.implied != null ? `${Math.round(p.__sb.implied)}%` : ''}</span>
                    </>
                  )}
                </Cell>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.65, marginTop: 9, maxWidth: 760 }}>
        Counts are the bot&apos;s published season fields, graded nightly against the
        box score (<span style={{ fontFamily: NUM_FONT }}>actual_sb</span>). Warm on-base is .340 or
        better. <b style={{ color: C.text2 }}>Spot</b> is the bot&apos;s steal-spot score for this
        runner against tonight&apos;s arm and tonight&apos;s catcher — it is worth zero points in
        every other model on this site, and it is archived unscored so that in a few weeks
        &ldquo;do high spots actually produce steals&rdquo; is answerable against
        <span style={{ fontFamily: NUM_FONT }}> actual_sb</span> instead of asserted. A{' '}
        <b style={{ color: C.text2 }}>*</b> means half the matchup is unmeasured (usually the
        catcher) and the score is built on what landed. A blank Spot is a refusal, not a zero:
        no stolen-base attempt on his record this season, so the arm and the catcher are
        somebody else&apos;s matchup. <b style={{ color: C.text2 }}>˜</b> before a catcher&apos;s
        name means the lineup was not posted and he is the likeliest man back there rather than
        a confirmed one. Prices are the book&apos;s own on 1+ steal tonight, read straight off
        the odds snapshot; the percentage under one is the rate that price needs. Tap a row for his
        full card.
      </div>
    </div>
  )
}
