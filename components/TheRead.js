'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, clean, n, playerId, hrScore } from '../lib/player'
import { Empty } from './ui'

// 📝 THE READ — tonight's slate, in sentences.
//
// 2026-08-11, Donovan: "the page seems blank and unuseful, it's essentially
// just a bare four ... the raw board is trash, maybe just remove both and
// build a useful page to go along with the today's and tomorrow sheets.
// Something that is not on the site yet while still giving a different angle
// to the information and stats given" — and, about the pick write-ups,
// "I do like the write ups, maybe this can be a page with written things."
//
// WHAT MAKES THIS A DIFFERENT ANGLE, rather than a fifteenth table.
//
// Every other tab hands you numbers and asks you to do the reading. Boards
// rank, Games groups, Pairs combines, Results grades. Not one of them tells
// you what tonight LOOKS like, and that is the thing you actually want before
// you have decided anything. So this page reads the slate back to you.
//
// EVERY SENTENCE IS ASSEMBLED FROM PUBLISHED FIELDS. Nothing here is
// generated prose about baseball; the clauses are the bot's own strings
// (simple_reason_*, risk_reason, weak_spot_reason, weather_label,
// matchup_reason) with numbers off the same row. If a field is missing the
// clause is dropped rather than guessed at, which is why several of these
// read shorter on some nights than others. A sentence you cannot trace back
// to a column is worse than no sentence.
//
// THE DISAGREEMENT SECTION IS WHY THE RAW BOARD CAN GO. Its one real value
// was the caption — "where the two boards disagree, the gap IS the site's
// adjustment, visible" — which it stated and then never actually showed you,
// since it only ever rendered one of the two rankings. Section 3 shows the
// gap itself, both directions, which is the thing that caption promised.

const num = (v, d = null) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const first = (...xs) => xs.map((x) => clean(x, '')).find(Boolean) || ''
const roleOf = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

const CATS = [
  { role: 'HR', label: 'the home run call', bar: 'needs to go deep' },
  { role: 'HIT', label: 'the base-hit call', bar: 'needs one hit' },
  { role: 'HRR', label: 'the runs call', bar: 'needs two of hits / runs / RBI' },
  { role: 'CONTACT', label: 'the total-bases call', bar: 'needs two total bases' },
]

const L5 = (p) => ({
  h: Math.max(0, n(p?.last5_hits, 0)), r: Math.max(0, n(p?.last5_runs, 0)),
  rbi: Math.max(0, n(p?.last5_rbi, 0)), xbh: Math.max(0, n(p?.last5_xbh, 0)),
  hr: Math.max(0, n(p?.last5_hr, 0)),
})

// His last five as a clause, not a stat block. "quiet" is said out loud
// because an empty line is information and rendering it as "0H 0R" reads as
// missing data rather than as a cold hitter.
function formClause(p) {
  const l = L5(p)
  const cold = num(p?.games_since_last_hr)
  if (!(l.h || l.r || l.rbi || l.xbh || l.hr)) {
    return cold != null && cold > 0
      ? `He has been quiet — nothing in his last five, and ${cold} games since his last homer.`
      : 'He has been quiet — nothing across his last five.'
  }
  const bits = []
  if (l.h) bits.push(`${l.h} hit${l.h === 1 ? '' : 's'}`)
  if (l.xbh) bits.push(`${l.xbh} for extra bases`)
  if (l.hr) bits.push(`${l.hr} over the fence`)
  if (l.rbi) bits.push(`${l.rbi} driven in`)
  const tail = cold != null && cold > 0 && !l.hr ? ` He has gone ${cold} games without a homer.` : ''
  return `Last five: ${bits.join(', ')}.${tail}`
}

function Para({ children, dim }) {
  return (
    <p style={{
      margin: '0 0 7px', fontSize: 12.5, lineHeight: 1.72,
      color: dim ? C.text3 : C.text2, maxWidth: 720,
    }}>{children}</p>
  )
}

function Section({ n: idx, title, note, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 900, color: C.orange }}>{idx}</span>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900, letterSpacing: '-.01em' }}>{title}</h3>
        {note && <span style={{ fontSize: 10, color: C.text3 }}>{note}</span>}
      </div>
      {children}
    </section>
  )
}

export default function TheRead({ players = [], onPlayerClick }) {
  const read = useMemo(() => {
    const rows = (players || []).filter(Boolean)
    if (!rows.length) return null

    // ── the four calls ──────────────────────────────────────────────────
    const calls = CATS.map((c) => {
      const pool = rows.filter((p) => roleOf(p) === c.role)
      if (!pool.length) return null
      const score = (p) => num(p?.[`${c.role.toLowerCase()}_score`], num(p?.hr_score, 0)) || 0
      const lead = [...pool].sort((a, b) => score(b) - score(a))[0]
      return { ...c, p: lead, depth: pool.length }
    }).filter(Boolean)

    // ── where the two rankings disagree ─────────────────────────────────
    // top_board_score_v2 is the bot's own unadjusted ranking; hrScore() is
    // what the site ranks on after the ISO adjustment. Both are 0-100, so the
    // difference is directly readable as "how much the site moved him".
    const gaps = rows.map((p) => {
      const raw = num(p?.top_board_score_v2)
      const adj = num(hrScore(p))
      if (raw == null || adj == null) return null
      return { p, raw, adj, gap: adj - raw }
    }).filter(Boolean).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    const up = gaps.filter((g) => g.gap > 0).slice(0, 3)
    const down = gaps.filter((g) => g.gap < 0).slice(0, 3)

    // ── what it is steering clear of ────────────────────────────────────
    const traps = rows
      .filter((p) => p?.trap_flag && clean(p?.trap_reason, '') && !roleOf(p))
      .sort((a, b) => num(b?.hr_score, 0) - num(a?.hr_score, 0))
      .slice(0, 4)

    // ── the slate itself ────────────────────────────────────────────────
    const byGame = new Map()
    rows.forEach((p) => {
      const k = clean(p?.game_pk, '')
      if (!k) return
      if (!byGame.has(k)) byGame.set(k, [])
      byGame.get(k).push(p)
    })
    const weathers = [...byGame.values()].map((g) => ({
      label: clean(g[0]?.weather_label, ''),
      eff: num(g[0]?.weather_hr_effect_pct, 0),
      park: num(g[0]?.park_hr_factor, 1),
      teams: `${teamOf(g[0]) || '?'} vs ${oppOf(g[0]) || '?'}`,
    })).filter((w) => w.label)
    const helping = [...weathers].sort((a, b) => b.eff * b.park - a.eff * a.park)[0]
    const hurting = [...weathers].sort((a, b) => a.eff * a.park - b.eff * b.park)[0]

    return { calls, up, down, traps, games: byGame.size, picks: rows.filter((p) => roleOf(p)).length, helping, hurting }
  }, [players])

  if (!read) return <Empty>No slate loaded, so there is nothing to read yet.</Empty>

  const Name = ({ p }) => (
    <b onClick={() => onPlayerClick?.(p)} style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{nameOf(p)}</b>
  )

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginBottom: 16, maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>What this is:</b> tonight read back to you in sentences instead of
        ranked in a table. Every clause below is assembled from the bot&apos;s own published fields — its
        stated case, its stated risk, the measured lineup-spot holes, the weather string — so anything
        here can be traced to a column on the slate. Where a field is missing the sentence is shorter
        rather than invented.
      </div>

      <Section n="1" title="The shape of tonight" note="before any names">
        <Para>
          {read.games} game{read.games === 1 ? '' : 's'} on the board and {read.picks} designated
          {' '}pick{read.picks === 1 ? '' : 's'} across the four categories.
          {read.helping && <> The friendliest environment is <b style={{ color: C.text2 }}>{read.helping.teams}</b> — {read.helping.label.toLowerCase()}.</>}
          {read.hurting && read.hurting.teams !== read.helping?.teams && <> The one working against the hitters is <b style={{ color: C.text2 }}>{read.hurting.teams}</b> — {read.hurting.label.toLowerCase()}.</>}
        </Para>
      </Section>

      <Section n="2" title="The four calls" note="one lead pick per category, and what the bot says about it">
        {read.calls.map((c) => {
          const p = c.p
          const why = first(p?.simple_reason_1)
          const why2 = first(p?.simple_reason_2)
          const weak = first(p?.weak_spot_reason)
          const risk = first(p?.risk_reason, p?.trap_reason)
          const hr9 = num(p?.pitcher_hr9)
          return (
            <div key={c.role} style={{ marginBottom: 14, paddingLeft: 10, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>
                {c.label} · {c.bar} · {c.depth} tagged
              </div>
              <Para>
                <Name p={p} /> ({teamOf(p)}) draws {clean(p?.pitcher_name, 'a TBD arm')}
                {hr9 != null && hr9 > 0 && <>, who is giving up <b style={{ color: hr9 >= 1.4 ? '#f87171' : C.text2 }}>{hr9.toFixed(2)} HR per nine</b></>}
                {clean(p?.lineup_spot, '') && <>, and he hits {clean(p?.lineup_spot, '')}{['', 'st', 'nd', 'rd'][num(p?.lineup_spot, 0)] || 'th'}</>}.
                {why && <> {why}.</>}
                {why2 && why2 !== why && <> {why2}.</>}
              </Para>
              <Para>{formClause(p)}</Para>
              {weak && <Para><span style={{ color: C.orange }}>The hole:</span> {weak}</Para>}
              {risk && <Para dim><span style={{ color: C.text3 }}>Against it:</span> {risk}.</Para>}
            </div>
          )
        })}
      </Section>

      <Section n="3" title="Where the two boards disagree" note="the site's adjustment, made visible">
        <Para dim>
          The bot ranks on its own unadjusted score. This site re-ranks it through the measured HR rate
          of each hitter&apos;s ISO band, because across the graded archive ISO bands separated homers far
          better than raw-score quartiles did. The gap between the two IS that adjustment — so these are
          the hitters the site most disagrees with the bot about, which is a question no other tab
          answers.
        </Para>
        {[['Moved UP by the site', read.up, C.orange], ['Moved DOWN by the site', read.down, C.text3]].map(([t, list, col]) => (
          <div key={t} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: col, marginBottom: 2 }}>{t}</div>
            {(list || []).length === 0 ? <Para dim>Nothing meaningful in this direction tonight.</Para> : (list || []).map((g) => (
              <Para key={playerId(g.p)}>
                <Name p={g.p} /> — the bot has him at {g.raw.toFixed(1)}, the site at {g.adj.toFixed(1)}
                {' '}(<b style={{ color: col }}>{g.gap > 0 ? '+' : ''}{g.gap.toFixed(1)}</b>).
                {num(g.p?.season_iso) != null && <> His ISO is {num(g.p.season_iso).toFixed(3)}, which is the band doing the moving.</>}
              </Para>
            ))}
          </div>
        ))}
      </Section>

      {read.traps.length > 0 && (
        <Section n="4" title="What it is steering clear of" note="scored well, flagged anyway">
          <Para dim>
            These are hitters who scored high enough to be in the conversation and were not designated,
            with the bot&apos;s own stated reason. A picks page that never shows its rejections is only
            telling you half of what it did.
          </Para>
          {read.traps.map((p) => (
            <Para key={playerId(p)}>
              <Name p={p} /> ({teamOf(p)} vs {oppOf(p)}) — {first(p?.trap_reason)}.
            </Para>
          ))}
        </Section>
      )}
    </div>
  )
}
