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
// WHAT IT DELIBERATELY DOES NOT DO:
//   · No SB score. The bot has no stolen-base model, and inventing a blend
//     here — "0.6 × rate + 0.4 × OBP" — would be a number with the authority
//     of the HR score and none of its 28 graded nights behind it. Counts and
//     rates only, each labelled with what it is.
//   · No prices. Whether the book even lists a stolen-base prop is unknown
//     until a real fetch lands after the cap-deadlock fix (see the odds probe
//     note). The matcher is armed; when SB props appear they arrive on their
//     own and this board gets a price column then, not before.
//   · No catcher data. Who is behind the plate is the other half of a steal
//     and the slate does not carry it. Stating that is more useful than
//     quietly ranking without it.

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

const SORTS = [
  ['sb', 'Steals', (p) => sbOf(p)],
  ['rate', 'Attempt rate', (p) => attRate(p) ?? -1],
  ['succ', 'Success %', (p) => succOf(p) ?? -1],
  ['obp', 'On base', (p) => n(p?.season_obp, 0)],
]

function Cell({ children, w, mono = true, color, title, right }) {
  return (
    <span title={title} style={{
      width: w, flexShrink: 0, minWidth: 0, textAlign: right ? 'right' : 'left',
      fontFamily: mono ? NUM_FONT : undefined, fontSize: 11, color: color || C.text2,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      cursor: title ? 'help' : 'inherit',
    }}>{children}</span>
  )
}

export default function StealBoard({ players = [], onPlayerClick }) {
  const [sort, setSort] = useState('sb')
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
        Every runner on tonight&apos;s slate, by the counts the bot publishes — no
        model, no score, no blend. A steal needs a man who runs <b style={{ color: C.text2 }}>and</b> a
        man who reaches, so on-base sits next to the volume: the biggest total on
        the board is not the night&apos;s steal if he is not getting on. Success rate
        is coloured against the <b style={{ color: C.text2 }}>{BREAK_EVEN}%</b> break-even — under it,
        the attempt costs more than it wins. No prices yet: whether the book even
        lists a stolen-base prop is unknown until a real odds fetch lands.
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
        <div style={{ minWidth: 560 }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px',
            borderBottom: `1px solid ${C.border2}`,
            fontSize: 8.5, fontWeight: 800, letterSpacing: '.09em',
            color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT,
          }}>
            <Cell w={20} right>#</Cell>
            <Cell w={148} mono={false}>Runner</Cell>
            <Cell w={86}>Matchup</Cell>
            <Cell w={40} right title="Stolen bases this season">SB</Cell>
            <Cell w={40} right title="Caught stealing this season">CS</Cell>
            <Cell w={56} right title="Stolen bases divided by attempts. Blank under five attempts — a 2-for-2 is not a rate.">Succ</Cell>
            <Cell w={56} right title="The bot's season attempt rate — how often he goes, not how often he makes it">Att</Cell>
            <Cell w={52} right title="Season on-base percentage. The other half of a steal: he has to reach first.">OBP</Cell>
          </div>

          {rows.map((p, i) => {
            const succ = succOf(p)
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
        better. <b style={{ color: C.text2 }}>Who is catching is not on this board</b> — the slate
        does not carry the opposing catcher, and that is the other half of a
        steal; saying so is more useful than ranking as though it were counted.
        Tap a row for his full card.
      </div>
    </div>
  )
}
