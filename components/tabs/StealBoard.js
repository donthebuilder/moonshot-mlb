'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, nameOf, teamOf, oppOf, txt } from '../../lib/player'
import { alpha, verdictInk, verdictWash } from '../../lib/scales'
import { FilterPill } from '../Filters'

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
//   STILL STANDS — no prices. Whether the book even lists a stolen-base prop
//     is unknown until a real fetch lands. The matcher is armed; when SB props
//     appear they arrive on their own and this board gets a price column then,
//     not before.
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

export default function StealBoard({ players = [], onPlayerClick }) {
  const [sort, setSort] = useState('risk')
  const [runnersOnly, setRunnersOnly] = useState(true)

  const rows = useMemo(() => {
    const out = (players || []).filter((p) => p && p.player_id && sbOf(p) > 0)
    const f = (SORTS.find(([k]) => k === sort) || SORTS[0])[2]
    // A runner is a hitter with a real attempt history — five or more tries.
    // Under that a 2-for-2 reads as 100% and tops the board on noise.
    const kept = runnersOnly ? out.filter((p) => sbOf(p) + csOf(p) >= 5) : out
    return [...kept].sort((a, b) => f(b) - f(a) || String(nameOf(a)).localeCompare(String(nameOf(b))))
  }, [players, sort, runnersOnly])

  const total = (players || []).filter((p) => sbOf(p) > 0).length

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
        belongs to somebody else. No prices yet — whether the book even lists a stolen-base prop
        is unknown until a real odds fetch lands.
      </div>

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
        a confirmed one. Still no prices — whether the book lists a stolen-base prop at all is
        unknown until a real fetch lands. Tap a row for his full card.
      </div>
    </div>
  )
}
