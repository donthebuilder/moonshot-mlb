'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, clean, n, playerId } from '../lib/player'
import { isoAdjustedHr, isoMultiplier } from '../lib/scoring_additions'
import { Empty } from './ui'

// 📝 THE READ — tonight in sentences, and the one number the site stopped using.
//
// 2026-08-11, Donovan: "the raw board is trash, maybe just remove both and
// build a useful page ... something that is not on the site yet while still
// giving a different angle" — then, seeing the disagreement block: "this is
// what I want a page based around this."
//
// HIS INSTINCT WAS RIGHT AND THE CAPTION THAT GAVE IT TO HIM WAS STALE.
//
// The Boards tab still says "Ranked by the site, not the bot — Adj = the bot's
// raw hr_score × the measured HR rate of the hitter's ISO band ... the gap
// between the two boards IS the adjustment." That adjustment was REMOVED on
// 2026-08-09 (see the long note in lib/scoring.js): hr_score already carries
// ISO through season_power at 0.12, so multiplying an ISO band rate onto it
// double-counted, and it corrupted ProjectedOutput's CALIB bands, which were
// measured against the raw score. scoreFor(p,'hr') has returned the bot's raw
// number ever since, and isoAdjustedHr has sat imported-but-never-called.
//
// So there was no gap to see, and the page that promised one couldn't show it.
//
// WHAT SECTION 3 DOES INSTEAD. It applies the real isoAdjustedHr — finally
// wiring up research that has been dead in the tree — and presents it as what
// it honestly is: a SECOND OPINION, not the site's ranking. That is precisely
// what lib/scoring.js said it wanted when it pulled the adjustment out ("the
// ISO story is told where it belongs ... so a reader can see it rather than
// have it silently folded in"). The multipliers are measured ratios from
// 3,973 graded slots (ISO <.13 homered 8.2%, ≥.23 homered 22.2%), not tuned
// constants.
//
// EVERY OTHER SENTENCE IS ASSEMBLED FROM PUBLISHED FIELDS — simple_reason_*,
// risk_reason, weak_spot_reason, weather_label — with numbers off the same
// row. Nothing here is generated prose about baseball. A missing field drops
// its clause rather than being guessed at.

const num = (v, d = null) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const first = (...xs) => xs.map((x) => clean(x, '')).find(Boolean) || ''
const roleOf = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
const ord = (i) => (i % 10 === 1 && i % 100 !== 11 ? 'st' : i % 10 === 2 && i % 100 !== 12 ? 'nd' : i % 10 === 3 && i % 100 !== 13 ? 'rd' : 'th')

const CATS = [
  { role: 'HR', label: 'the home run call', bar: 'needs to go deep', color: C.orange },
  { role: 'HIT', label: 'the base-hit call', bar: 'needs one hit', color: C.purple },
  { role: 'HRR', label: 'the runs call', bar: 'needs two of hits / runs / RBI', color: C.cyan },
  { role: 'CONTACT', label: 'the total-bases call', bar: 'needs two total bases', color: '#4ade80' },
]

const L5 = (p) => ({
  h: Math.max(0, n(p?.last5_hits, 0)), r: Math.max(0, n(p?.last5_runs, 0)),
  rbi: Math.max(0, n(p?.last5_rbi, 0)), xbh: Math.max(0, n(p?.last5_xbh, 0)),
  hr: Math.max(0, n(p?.last5_hr, 0)),
})

// His last five as a clause, not a stat block. "Quiet" is said out loud because
// an empty line is information, and "0H 0R" reads as missing data rather than
// as a cold hitter.
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
  return <p style={{ margin: '0 0 7px', fontSize: 12.5, lineHeight: 1.72, color: dim ? C.text3 : C.text2, maxWidth: 720 }}>{children}</p>
}

function Section({ n: idx, title, note, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 900, color: C.orange }}>{idx}</span>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900, letterSpacing: '-.01em' }}>{title}</h3>
        {note && <span style={{ fontSize: 10, color: C.text3 }}>{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Tile({ k, v, sub, color }) {
  return (
    <div style={{
      flex: '1 1 108px', minWidth: 0, borderRadius: 10, padding: '7px 10px',
      border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)',
    }}>
      <div style={{ fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.text3, fontFamily: NUM_FONT }}>{k}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 19, fontWeight: 900, color: color || C.text, lineHeight: 1.15 }}>{v}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

// The move, drawn. A number that says "+29.1" is a fact; a bar that leans
// right is a glance, and this page is meant to be read at a glance.
function MoveBar({ delta, max }) {
  const pct = Math.min(1, Math.abs(delta) / (max || 1))
  const up = delta > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 5, width: '100%', maxWidth: 220, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: '50%', display: 'flex', justifyContent: 'flex-end' }}>
        {!up && <div style={{ width: `${pct * 100}%`, height: 5, background: '#f87171' }} />}
      </div>
      <div style={{ width: '50%' }}>
        {up && <div style={{ width: `${pct * 100}%`, height: 5, background: C.orange }} />}
      </div>
    </div>
  )
}

export default function TheRead({ players = [], onPlayerClick }) {
  const read = useMemo(() => {
    const rows = (players || []).filter(Boolean)
    if (!rows.length) return null

    const calls = CATS.map((c) => {
      const pool = rows.filter((p) => roleOf(p) === c.role)
      if (!pool.length) return null
      const score = (p) => num(p?.[`${c.role.toLowerCase()}_score`], num(p?.hr_score, 0)) || 0
      return { ...c, p: [...pool].sort((a, b) => score(b) - score(a))[0], depth: pool.length }
    }).filter(Boolean)

    // ── THE ISO LENS ────────────────────────────────────────────────────
    // raw = what the site actually ranks on. lens = the benched adjustment.
    const lens = rows.map((p) => {
      const raw = num(p?.hr_score)
      const iso = num(p?.season_iso)
      if (raw == null || iso == null || iso <= 0) return null
      const adj = num(isoAdjustedHr(p, raw))
      if (adj == null) return null
      return { p, raw, iso, mult: isoMultiplier(p), adj, delta: adj - raw }
    }).filter(Boolean).sort((a, b) => b.delta - a.delta)
    const maxMove = lens.length ? Math.max(...lens.map((x) => Math.abs(x.delta))) : 1
    const under = lens.slice(0, 4)
    const over = lens.slice(-4).reverse()

    const traps = rows
      .filter((p) => p?.trap_flag && clean(p?.trap_reason, '') && !roleOf(p))
      .sort((a, b) => num(b?.hr_score, 0) - num(a?.hr_score, 0)).slice(0, 4)

    const byGame = new Map()
    rows.forEach((p) => {
      const k = clean(p?.game_pk, '')
      if (!k) return
      if (!byGame.has(k)) byGame.set(k, [])
      byGame.get(k).push(p)
    })
    const weathers = [...byGame.values()].map((g) => ({
      label: clean(g[0]?.weather_label, ''), eff: num(g[0]?.weather_hr_effect_pct, 0),
      teams: `${teamOf(g[0]) || '?'} vs ${oppOf(g[0]) || '?'}`,
    })).filter((w) => w.label)
    const helping = [...weathers].sort((a, b) => b.eff - a.eff)[0]
    const hurting = [...weathers].sort((a, b) => a.eff - b.eff)[0]

    return {
      calls, under, over, lens, maxMove, traps,
      games: byGame.size, picks: rows.filter((p) => roleOf(p)).length, helping, hurting,
    }
  }, [players])

  if (!read) return <Empty>No slate loaded, so there is nothing to read yet.</Empty>

  const Name = ({ p }) => (
    <b onClick={() => onPlayerClick?.(p)} style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{nameOf(p)}</b>
  )

  const top = read.under[0]

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginBottom: 12, maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>What this is:</b> tonight read back to you in sentences instead of
        ranked in a table, plus the one measurement the site deliberately does not rank on. Every clause
        is assembled from the bot&apos;s own published fields, so anything here traces to a column.
      </div>

      <div className="chip-row" style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
        <Tile k="games" v={read.games} />
        <Tile k="designated" v={read.picks} sub="across four categories" />
        <Tile k="ISO disagrees most" v={top ? `+${top.delta.toFixed(0)}` : '—'} sub={top ? nameOf(top.p) : ''} color={C.orange} />
        <Tile k="friendliest air" v={read.helping ? `${read.helping.eff > 0 ? '+' : ''}${read.helping.eff}%` : '—'} sub={read.helping?.teams} color={read.helping?.eff > 0 ? '#4ade80' : C.text3} />
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
          const spot = num(p?.lineup_spot)
          return (
            <div key={c.role} style={{ marginBottom: 14, paddingLeft: 10, borderLeft: `2px solid ${c.color}55` }}>
              <div style={{ fontSize: 9, fontFamily: NUM_FONT, color: c.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>
                {c.label} · {c.bar} · {c.depth} tagged
              </div>
              <Para>
                <Name p={p} /> ({teamOf(p)}) draws {clean(p?.pitcher_name, 'a TBD arm')}
                {hr9 != null && hr9 > 0 && <>, who is giving up <b style={{ color: hr9 >= 1.4 ? '#f87171' : C.text2 }}>{hr9.toFixed(2)} HR per nine</b></>}
                {spot != null && spot > 0 && <>, and he hits {spot}{ord(spot)}</>}.
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

      <Section n="3" title="The ISO lens" note="the measurement the site does not rank on">
        <Para dim>
          Across 3,973 graded picks, hitters under a .130 ISO homered <b style={{ color: C.text2 }}>8.2%</b> of
          the time and hitters at .230 or better homered <b style={{ color: C.orange }}>22.2%</b> — and that
          held <i>inside every hr_score quartile</i>, so a bottom-quartile high-ISO bat out-homered a
          top-quartile low-ISO one. Those ratios are what the multipliers below are; nothing is tuned.
        </Para>
        <Para dim>
          The site does <b style={{ color: C.text2 }}>not</b> rank on this, on purpose: hr_score already
          carries ISO through season_power, so applying the band on top double-counts it, and it
          corrupted the projection bands, which were measured against the raw score. So this is a second
          opinion shown next to the first, rather than a correction folded in silently. Where the two
          disagree hardest is where the bot and the archive genuinely see a different hitter.
        </Para>

        {[['The ISO band says the score is too LOW', read.under, C.orange],
          ['The ISO band says the score is too HIGH', read.over, '#f87171']].map(([t, list, col]) => (
          <div key={t} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: col, marginBottom: 4, letterSpacing: '.04em' }}>{t}</div>
            {list.map((g) => (
              <div key={playerId(g.p)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0', borderTop: `1px solid ${C.border}` }}>
                <div style={{ flex: '1 1 190px', minWidth: 0, fontSize: 12 }}>
                  <Name p={g.p} />
                  <span style={{ color: C.text3, fontSize: 10, fontFamily: NUM_FONT }}> {teamOf(g.p)}</span>
                </div>
                <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3, flexShrink: 0 }}>
                  ISO <b style={{ color: C.text2 }}>{g.iso.toFixed(3)}</b>
                  <span style={{ color: col, marginLeft: 5 }}>×{g.mult.toFixed(2)}</span>
                </span>
                <span style={{ fontFamily: NUM_FONT, fontSize: 11.5, flexShrink: 0 }}>
                  <span style={{ color: C.text3 }}>{g.raw.toFixed(1)}</span>
                  <span style={{ color: C.text3 }}> → </span>
                  <b style={{ color: col }}>{g.adj.toFixed(1)}</b>
                </span>
                <MoveBar delta={g.delta} max={read.maxMove} />
              </div>
            ))}
          </div>
        ))}
      </Section>

      {read.traps.length > 0 && (
        <Section n="4" title="What it is steering clear of" note="scored well, flagged anyway">
          <Para dim>
            Hitters who scored high enough to be in the conversation and were not designated, with the
            bot&apos;s own stated reason. A picks page that never shows its rejections is telling you half
            of what it did.
          </Para>
          {read.traps.map((p) => (
            <Para key={playerId(p)}><Name p={p} /> ({teamOf(p)} vs {oppOf(p)}) — {first(p?.trap_reason)}.</Para>
          ))}
        </Section>
      )}
    </div>
  )
}
