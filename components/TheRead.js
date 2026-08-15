'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { quoteFor, fmtOdds, impliedPct } from '../lib/odds'
import { nameOf, teamOf, oppOf, clean, n, playerId } from '../lib/player'
import { isoAdjustedHr, isoMultiplier } from '../lib/scoring_additions'
import { whyPick, standingPhrase, convictionOf } from '../lib/whyPick'
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
//
// ── 2026-08-15 — RHYTHM ──────────────────────────────────────────────────────
//
// Donovan: the Bot page "can be boring", and — mid-sentence — that pairing it
// with odds is not the answer ("idk maybe not tho that doesnt seem like it
// flows"). He was right on both counts. The problem was never data density;
// it was that the page had one tempo. Four calls, four identical paragraph
// skeletons, four equal weights, and above them a row of four TILES, which is
// the one style he has now ruled against four separate times.
//
// Three changes, all structural:
//
//   1. THE TILE ROW IS A SENTENCE. Games, designated picks, the friendliest
//      air and the widest ISO disagreement were four boxes; they are now the
//      opening line, and Section 1's old paragraph folded into it rather than
//      saying the same two facts twice.
//   2. ONE CALL LEADS. The four were rendered at identical weight, so nothing
//      led and the eye had nowhere to land. The lead is now chosen by
//      CONVICTION — how far clear of its own category's field it sits, in
//      that category's own standard deviations (convictionOf). Comparing an
//      hr_score to a hit_score would be meaningless; comparing "how far clear
//      of his own field" is the same question asked four times, so the
//      answers rank. The other three follow in a tighter form.
//   3. EVERY CALL SAYS WHAT IS CARRYING IT. lib/whyPick.js measures each
//      pick's drivers against tonight's own slate and names the strongest —
//      and the weakest. The HR call is broken down with the bot's own
//      hr_shape_components; the other three with their own market's inputs,
//      per the coherence rule.

const num = (v, d = null) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const first = (...xs) => xs.map((x) => clean(x, '')).find(Boolean) || ''
const roleOf = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
// A player can now carry more than one role (2026-08-12: TOP allowed to also
// hold HR, joined "TOP/HR") — use this where matching a SPECIFIC category
// matters, so a double-up still counts for its non-primary role too.
const hasRole = (p, role) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).includes(role)
const ord = (i) => (i % 10 === 1 && i % 100 !== 11 ? 'st' : i % 10 === 2 && i % 100 !== 12 ? 'nd' : i % 10 === 3 && i % 100 !== 13 ? 'rd' : 'th')

// The bot's three simple_reasons often say the same thing twice — reason 1
// "Reached 439 feet recently" and reason 2 "Recent distance ceiling is
// already near home run range (439 ft)" are one fact wearing two sentences.
// Printing all three at length made the lead call read like a list. A later
// reason is dropped when every number it carries has already been said.
function dedupeReasons(list) {
  const kept = []
  const said = new Set()
  for (const raw of list) {
    const r = String(raw || '').trim()
    if (!r || kept.includes(r)) continue
    const nums = r.match(/\d+(?:\.\d+)?/g) || []
    if (nums.length && nums.every((x) => said.has(x))) continue
    nums.forEach((x) => said.add(x))
    kept.push(r)
  }
  return kept
}

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

export default function TheRead({ players = [], onPlayerClick, odds = null }) {
  const read = useMemo(() => {
    const rows = (players || []).filter(Boolean)
    if (!rows.length) return null

    const calls = CATS.map((c) => {
      const pool = rows.filter((p) => hasRole(p, c.role))
      if (!pool.length) return null
      const score = (p) => num(p?.[`${c.role.toLowerCase()}_score`], num(p?.hr_score, 0)) || 0
      const lead = [...pool].sort((a, b) => score(b) - score(a))[0]
      return {
        ...c,
        p: lead,
        depth: pool.length,
        score: score(lead),
        // Conviction is measured against the category's DESIGNATED pool, not
        // the whole slate: the question is how far clear of the other names
        // the bot tagged for this market he is, which is what makes the four
        // numbers comparable.
        conv: convictionOf(lead, pool, score),
        why: whyPick(lead, rows, c.role),
      }
    }).filter(Boolean)

    // The lead is the clearest of its own field. Ties and single-name pools
    // (z = 0, no field to be clear of) fall back to source order, which is
    // the categories' own order — HR first.
    const ordered = [...calls].sort((a, b) => (b.conv?.z ?? -99) - (a.conv?.z ?? -99))
    const hero = ordered[0] || null
    const rest = calls.filter((c) => c !== hero)

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
      calls, hero, rest, under, over, lens, maxMove, traps,
      games: byGame.size, picks: rows.filter((p) => roleOf(p)).length, helping, hurting,
    }
  }, [players])

  if (!read) return <Empty>No slate loaded, so there is nothing to read yet.</Empty>

  // The book's number for this exact call, or nothing. Nothing is the normal
  // state: no key configured, no board published, or the book is on a
  // different line than the bar — and a page that speaks in sentences should
  // stay quiet rather than emit a sentence about an absence.
  const PriceClause = ({ p, cat, odds }) => {
    const q = quoteFor(odds, p, cat.role)
    if (!q || q.matches === false || q.over == null) return null
    const need = q.implied ?? impliedPct(q.over)
    return (
      <Para dim>
        <span style={{ color: C.text3 }}>The price:</span>{' '}
        <b style={{ color: C.text2 }}>{fmtOdds(q.over)}</b> to clear it
        {need != null && <> — which needs it to happen <b style={{ color: C.text2 }}>{Math.round(need)}%</b> of the time to be worth taking</>}
        {q.best_over != null && q.best_over !== q.over && <>; best on the board is <b style={{ color: C.text2 }}>{fmtOdds(q.best_over)}</b>{q.best_book ? ` at ${q.best_book}` : ''}</>}.
      </Para>
    )
  }

  const Name = ({ p }) => (
    <b onClick={() => onPlayerClick?.(p)} style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{nameOf(p)}</b>
  )

  // WHAT IS CARRYING IT — the measured driver, said in one line. Prints
  // nothing rather than a hedge when no driver clears the bar; a call whose
  // every input is middling has no story and should not be given one.
  const WhyLine = ({ why, color }) => {
    if (!why || (!why.top.length && !why.against)) return null
    return (
      <Para>
        {why.top.length > 0 && (
          <>
            <span style={{ color: color || C.orange }}>Carrying it:</span>{' '}
            {why.top[0].text}
            {why.top[0].pct != null && <> — <b style={{ color: C.text2 }}>{standingPhrase(why.top[0].pct)}</b></>}
            {why.top[1] && <>, and {why.top[1].text}</>}.
          </>
        )}
        {why.against && (
          <>
            {why.top.length > 0 ? ' ' : ''}
            <span style={{ color: C.text3 }}>Against it:</span> {why.against.text}
            {why.against.pct != null && <> — <b style={{ color: C.text3 }}>{standingPhrase(why.against.pct)}</b></>}.
          </>
        )}
      </Para>
    )
  }

  // How clear of its own field this call sits, in plain words. The gap is in
  // the category's own points and the sd is that category's own spread, so
  // "2.1 standard deviations clear" is a like-for-like across the four.
  const clearanceClause = (c) => {
    if (!c?.conv || c.conv.depth < 3 || c.conv.gap == null) return null
    if (c.conv.z < 0.8) return null
    return (
      <>
        {' '}He is <b style={{ color: C.text2 }}>{c.conv.gap.toFixed(1)} points</b> clear of the next
        {' '}{c.role} name of {c.conv.depth} tagged — {c.conv.z.toFixed(1)} standard deviations above that field.
      </>
    )
  }

  const top = read.under[0]
  const hero = read.hero

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginBottom: 12, maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>What this is:</b> tonight read back to you in sentences instead of
        ranked in a table, plus the one measurement the site deliberately does not rank on. Every clause
        is assembled from the bot&apos;s own published fields, so anything here traces to a column.
      </div>

      {/* THE SHAPE OF TONIGHT — was four tiles above a paragraph that said
          two of the same four facts again. One sentence, every fact kept. */}
      <Para>
        <b style={{ color: C.text2 }}>{read.games}</b> game{read.games === 1 ? '' : 's'} on the board
        {' '}and <b style={{ color: C.text2 }}>{read.picks}</b> designated pick{read.picks === 1 ? '' : 's'} across the four categories.
        {read.helping && <> The friendliest air is <b style={{ color: C.text2 }}>{read.helping.teams}</b> at <b style={{ color: read.helping.eff > 0 ? C.green : C.text3 }}>{read.helping.eff > 0 ? '+' : ''}{read.helping.eff}%</b> — {read.helping.label.toLowerCase()}.</>}
        {read.hurting && read.hurting.teams !== read.helping?.teams && <> The one working against the hitters is <b style={{ color: C.text2 }}>{read.hurting.teams}</b> — {read.hurting.label.toLowerCase()}.</>}
        {top && <> And the ISO archive disagrees with the bot hardest about <Name p={top.p} />, whom it marks <b style={{ color: C.orange }}>{top.delta > 0 ? '+' : ''}{top.delta.toFixed(0)}</b> from his published score.</>}
      </Para>

      {/* ── THE CALL OF THE NIGHT ────────────────────────────────────────────
          One pick leads, chosen by conviction rather than by category order.
          Everything the compact form below carries, it carries too — plus the
          clearance clause and the bot's own stated reasons at full length. */}
      {hero && (() => {
        const p = hero.p
        const r1 = first(p?.simple_reason_1)
        const r2 = first(p?.simple_reason_2)
        const r3 = first(p?.simple_reason_3)
        const weak = first(p?.weak_spot_reason)
        const risk = first(p?.risk_reason, p?.trap_reason)
        const hr9 = num(p?.pitcher_hr9)
        const spot = num(p?.lineup_spot)
        return (
          <section style={{
            marginBottom: 26, marginTop: 20, maxWidth: 760,
            borderLeft: `3px solid ${hero.color}`, paddingLeft: 14,
          }}>
            <div style={{ fontSize: 9, fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', color: hero.color, marginBottom: 5 }}>
              The call of the night · {hero.label} · {hero.bar}
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 27, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              <span onClick={() => onPlayerClick?.(p)} style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}>{nameOf(p)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(p)} vs {oppOf(p)}</span>
            </h2>
            <Para>
              He draws {clean(p?.pitcher_name, 'a TBD arm')}
              {hr9 != null && hr9 > 0 && <>, who is giving up <b style={{ color: hr9 >= 1.4 ? '#f87171' : C.text2 }}>{hr9.toFixed(2)} home runs per nine</b></>}
              {spot != null && spot > 0 && <>, and he hits {spot}{ord(spot)}</>}.
              {clearanceClause(hero)}
            </Para>
            <WhyLine why={hero.why} color={hero.color} />
            <Para>{formClause(p)}</Para>
            {dedupeReasons([r1, r2, r3]).length > 0 && (
              <Para>{dedupeReasons([r1, r2, r3]).map((r) => r.replace(/\.$/, '')).join('. ')}.</Para>
            )}
            <PriceClause p={p} cat={hero} odds={odds} />
            {weak && <Para><span style={{ color: C.orange }}>The hole:</span> {weak}</Para>}
            {risk && <Para dim><span style={{ color: C.text3 }}>The bot&apos;s own caveat:</span> {risk}.</Para>}
          </section>
        )
      })()}

      <Section n="1" title="The other three" note="one lead pick per remaining category">
        {read.rest.map((c) => {
          const p = c.p
          const why = first(p?.simple_reason_1)
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
              </Para>
              <WhyLine why={c.why} color={c.color} />
              <Para>{formClause(p)}</Para>
              {/* 💰 THE PRICE, said in sentences because that is what this page
                  does. Donovan, 2026-08-15: "just odd on the picks to see what
                  price they are at." Only when the book is asking for the same
                  thing the pick's bar asks for — an HR call beside a 1.5 HR
                  line would be quoting a multi-homer bet. */}
              <PriceClause p={p} cat={c} odds={odds} />
              {weak && <Para><span style={{ color: C.orange }}>The hole:</span> {weak}</Para>}
              {risk && <Para dim><span style={{ color: C.text3 }}>Against it:</span> {risk}.</Para>}
            </div>
          )
        })}
      </Section>

      <Section n="2" title="The ISO lens" note="the measurement the site does not rank on">
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
        <Section n="3" title="What it is steering clear of" note="scored well, flagged anyway">
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
