'use client'
import Tap from '../Tap'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { useState } from 'react'
import { usePickLight } from '../../lib/pickLight'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'

// 🔮 THE ALIGNMENTS VIEW, EVERY SPORT (2026-09-29, numerology parity).
// MOONSHOT's components/Alignments.js, lifted out so TUDDY and LAMP render
// their numerology through the SAME sections instead of a 336-line copy and
// a one-table page: tonight's number (numbers pick the set, the bot's score
// ranks it, median test printed), yesterday / today / tomorrow (only where a
// sport keeps that archive), the watchlist cross-check, the nine clubs with
// their arithmetic share, full braids, name families, and MOONSHOT's builder
// hand-off (only where there is a builder). Every word MOONSHOT prints is a
// default below, so MOONSHOT renders exactly as before.
//
// The data comes in built: model (lib/numerology/align.js alignModel), tonight
// (alignedWithBy), the sport's AXIS_META and scoreOf. Nothing is fetched here.

// ONE NIGHT'S HOMER HITTERS AND THEIR NUMBERS (2026-10-04): lib/numerology/actualNight's
// shape. Each number reduced to its root; lit in the root's colour where it meets the
// day's number. Three hitters, then 'show more'. A name opens his card (p=, on or off
// the slate).
function NightBox({ title, night, empty, C, NUM_FONT }) {
  const { shown, open, restN, toggle } = usePreview(night?.hitters || [], 3)
  const dr = night?.dateRoot
  return (
    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{title}</div>
      {!night ? <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>…</div>
        : !night.hitters.length ? <div style={{ fontSize: 12, color: C.text3, marginTop: 2, lineHeight: 1.5 }}>{empty}</div>
          : (<>
            <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, marginTop: 2 }}>
              {night.date} reduces to <b style={{ color: ROOT_COLORS[dr], fontFamily: NUM_FONT }}>{dr}</b>:{' '}
              <b>{night.matched}</b> of {night.hitters.length} homer hitter{night.hitters.length === 1 ? '' : 's'} carr{night.matched === 1 ? 'ies' : 'y'} it
              {night.homers > night.hitters.length ? ` (${night.homers} homers)` : ''}.
            </div>
            {shown.map((h) => (
              <div key={h.player_id} style={{ marginTop: 6, minWidth: 0 }}>
                <a href={`#sport=mlb&p=${h.player_id}`} style={{ color: C.text, fontWeight: 800, fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
                  {h.name}{h.team ? <span style={{ color: C.text3, fontWeight: 600, marginLeft: 5, fontFamily: NUM_FONT, fontSize: 11 }}>{h.team}</span> : null}{h.hr > 1 ? <span style={{ color: C.orange, marginLeft: 5, fontFamily: NUM_FONT, fontSize: 11 }}>×{h.hr}</span> : null}
                </a>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {h.axes.length ? h.axes.map((x) => (
                    <span key={x.k} title={x.match ? `meets ${night.date}'s ${dr}` : undefined} style={{
                      fontFamily: NUM_FONT, fontSize: 11, padding: '2px 6px', borderRadius: 6,
                      border: `1px solid ${x.match ? ROOT_COLORS[x.root] : C.border}`, color: x.match ? C.text : C.text2,
                      background: x.match ? `${ROOT_COLORS[x.root]}22` : 'transparent', fontWeight: x.match ? 800 : 600,
                    }}>{x.label} → {x.root}</span>
                  )) : <span style={{ fontSize: 11, color: C.text3 }}>no numbers on file</span>}
                </div>
              </div>
            ))}
            <ShowMoreButton open={open} restN={restN} toggle={toggle} itemWord="hitters" />
          </>)}
    </div>
  )
}

export const ROOT_COLORS = ['', '#f97316', '#f59e0b', '#22d3ee', '#4ade80', '#a78bfa', '#f87171', '#60a5fa', '#FCD34D', '#c084fc']

export const MLB_WORDS = {
  person: 'hitter', persons: 'hitters', night: 'tonight', NIGHT: 'TONIGHT', unit: 'night',
  axesWord: 'seven', slate: <>tonight&apos;s slate</>, onSlate: 'on the slate', empty: 'No slate loaded yet.',
  scoreName: <>bot&apos;s HR score</>, scoreShort: 'HR score',
  scoreRecord: <>the only
              figure here with sixty graded nights behind it</>,
  carrying: <>Carrying tonight&apos;s number, best bats first</>,
  watchLegend: null,
  braidNote: <>Two or more of a man&apos;s OWN axes on one root — jersey, birthday, next homer, spot, position braided
            together. The rarest read here, and still arithmetic: click for every strand.</>,
  namesNote: <>Shared surnames (2+) and first names (3+ — pairs of a common first name are arithmetic, not a pattern).
            The ledger&apos;s echo panel grades these against the night once homers land; this is the pregame roster of them.</>,
}

export default function AlignmentsView({
  model, tonight, todayKey, todayRoot, AXIS_META, scoreOf = () => null,
  head = null, days = null, watchedRows = [], hasWatch = false,
  words = MLB_WORDS, builder = false, chipLimit = 24, compact = false, onBuildAround, onName, children = null,
  theme = MLB_C, numFont = MLB_NUM, accent = null, sport = 'mlb',
}) {
  const C = theme
  const NUM_FONT = numFont
  accent = accent || C.orange
  const W = { ...MLB_WORDS, ...words }
  const { rows, clubs, totalMemberships, braids, names } = model
  // THE PICKED SET IS SITE-WIDE (2026-09-30, Donovan: "click and highlight
  // players and then click thru and see they are highlighted -- that
  // component needs to be everywhere"). lib/pickLight.js: a tapped name stays
  // lit on every page of this product, not only in these clubs; MOONSHOT's
  // builder hand-off still reads the same set.
  const light = usePickLight(sport)
  const picked = { has: (pid) => light.has(String(pid)) }
  const [openRoot, setOpenRoot] = useState(null)
  const { yesterdayArchive, todayArchive, tomorrowKey, tomorrowRoot } = days || {}
  // MOONSHOT collects names for its builder; the other sports open the card.
  // MOONSHOT's chip size on every product (2026-09-30, "plus the text size
  // too" -> MLB's). The old override ended in `font: 'inherit'`, which lands
  // AFTER fontSize in the style object and reset TUDDY/LAMP chips to the
  // page's bigger text; only the tap-floor reset stays.
  const CHIP = builder ? {} : { minHeight: 0 }
  const clickWord = (pid, lower) => builder
    ? `${lower ? 'click' : 'Click'} to ${picked.has(pid) ? 'remove from' : 'add to'} your build list`
    : `${lower ? 'tap' : 'Tap'} to ${picked.has(pid) ? 'stop highlighting him' : 'highlight him on every page'}`
  const toggle = (pid) => {
    const a = rows.find((r) => r.pid === pid)
    light.toggle(String(pid), a?.name || '')
  }
  const pickedRows = rows.filter((a) => picked.has(a.pid))

  // Concentration against the arithmetic share: each root's expected share of
  // memberships is ~1/9. Quoted as ×, with the count and denominator.
  const ranked = [...clubs].sort((a, b) => b.count - a.count)
  const expected = totalMemberships / 9

  if (!rows.length) return <div style={{ fontSize: 11.5, color: C.text3 }}>{W.empty}</div>

  return (
    <div>
      {head}

      {/* ── TONIGHT'S NUMBER (2026-08-31) ─────────────────────────────────
          Donovan: "you mus give us preditcution using the numeroly
          reductions as well like the 1 can be differcn combos of season hr
          nummbers i like that it highlight the specific number like 10 but
          numberolgy speaking its a 1 or like 19th thats a 1."

          Two things in that, and both are here. The season-HR count is a new
          axis (lib/alignments.js) — it used to reduce only his NEXT homer,
          which is a different number and usually a different root, so a man on
          18 carried a 9 and was chasing a 1 and no club could see both. And
          every chip prints the RAW number beside the root, because 10 and 19
          reaching the same 1 IS the thing being looked at; a screen showing
          only the 1 has thrown away the half he wanted to see.

          The expected count sits in the same sentence as the actual one, on
          purpose. Seven axes over ~250 hitters is ~1,500 numbers across nine
          roots, so dozens of men carry two on the same root every single
          night — that is what division does, not a finding. This panel says
          who is aligned with tonight's number. It does not say who is going to
          homer, and nothing here feeds any score. */}
      {tonight && tonight.total > 0 && (
        <div style={{
          border: `1px solid ${ROOT_COLORS[todayRoot]}55`, borderRadius: 11,
          background: `${ROOT_COLORS[todayRoot]}0d`, padding: '9px 12px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: ROOT_COLORS[todayRoot] }}>
              🔮 {W.NIGHT}&apos;S NUMBER IS {todayRoot}
            </span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              {todayKey} reduces to {todayRoot} · {tonight.twoPlus} {tonight.twoPlus === 1 ? W.person : W.persons} carry
              it on two or more of their own numbers
            </span>
          </div>
          {compact ? (
            // One line on a phone (2026-09-29): the counts that matter, the
            // full reading one tap away. MOONSHOT never passes compact.
            <details style={{ margin: '4px 0 7px' }}>
              <summary style={{ fontSize: 9.5, color: C.text3, cursor: 'pointer', minHeight: 0, display: 'list-item' }}>
                ~{Math.round(tonight.expectedTwoPlus)} expected by chance
                {W.scoreName && tonight.medianScoreAligned != null && tonight.medianScoreSlate != null
                  ? ` · median score ${tonight.medianScoreAligned.toFixed(1)} aligned vs ${tonight.medianScoreSlate.toFixed(1)} all` : ''}
              </summary>
              <div style={{ marginTop: 5 }}>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, margin: '4px 0 7px' }}>
            Expect about <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{Math.round(tonight.expectedTwoPlus)}</b>{' '}
            of those by arithmetic alone on a slate this size, so{' '}
            {tonight.twoPlus > tonight.expectedTwoPlus * 1.25
              ? <>{W.night} is running <b style={{ color: ROOT_COLORS[todayRoot] }}>above</b> its share</>
              : tonight.twoPlus < tonight.expectedTwoPlus * 0.8
                ? <>{W.night} is running <b style={{ color: C.text2 }}>below</b> its share</>
                : <>{W.night} is <b style={{ color: C.text2 }}>about normal</b></>}
            {' '}— which is the honest read on nearly every night. Raw number → root on every chip.
          </div>
          {/* ── NUMBERS FIRST, THEN THE BOT (2026-08-31) ───────────────────
              Donovan: "those predctions are base on the numbers first then how
              they socred on the bot to help with predicting."

              That is the only defensible ordering and it is worth saying out
              loud on the page. The reduction is arithmetic — it SELECTS a set
              and claims nothing about whether the men in it can hit. The bot's
              HR score is the part of this site with sixty graded nights behind
              it. So the numbers narrow and the thing with a record ranks what
              is left; neither is asked to do the other's job.

              Which makes the median comparison below mandatory rather than
              decorative: if the reduction were quietly picking better bats,
              the aligned median would sit above the slate's. Printing it is
              running the test on his own idea with his own data, every night,
              in public. */}
          {W.scoreName && tonight.medianScoreAligned != null && tonight.medianScoreSlate != null && (
            <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 7 }}>
              The numbers pick the set; the <b style={{ color: C.text2 }}>{W.scoreName}</b> — {W.scoreRecord} — ranks what is in it. Median score among
              the aligned is{' '}
              <b style={{ fontFamily: NUM_FONT, color: C.text2 }}>{tonight.medianScoreAligned.toFixed(1)}</b>{' '}
              against the whole slate&apos;s{' '}
              <b style={{ fontFamily: NUM_FONT, color: C.text2 }}>{tonight.medianScoreSlate.toFixed(1)}</b>
              {Math.abs(tonight.medianScoreAligned - tonight.medianScoreSlate) < 2
                ? <> — the same board, in other words, which is what you should expect and what it almost always says.</>
                : tonight.medianScoreAligned > tonight.medianScoreSlate
                  ? <> — {W.night} the aligned set happens to be the stronger half. One {W.unit} is not a finding.</>
                  : <> — {W.night} the aligned set is the weaker half. One {W.unit} is not a finding either way.</>}
            </div>
          )}
              </div>
            </details>
          ) : (<>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, margin: '4px 0 7px' }}>
            Expect about <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{Math.round(tonight.expectedTwoPlus)}</b>{' '}
            of those by arithmetic alone on a slate this size, so{' '}
            {tonight.twoPlus > tonight.expectedTwoPlus * 1.25
              ? <>{W.night} is running <b style={{ color: ROOT_COLORS[todayRoot] }}>above</b> its share</>
              : tonight.twoPlus < tonight.expectedTwoPlus * 0.8
                ? <>{W.night} is running <b style={{ color: C.text2 }}>below</b> its share</>
                : <>{W.night} is <b style={{ color: C.text2 }}>about normal</b></>}
            {' '}— which is the honest read on nearly every night. Raw number → root on every chip.
          </div>
          {/* ── NUMBERS FIRST, THEN THE BOT (2026-08-31) ───────────────────
              Donovan: "those predctions are base on the numbers first then how
              they socred on the bot to help with predicting."

              That is the only defensible ordering and it is worth saying out
              loud on the page. The reduction is arithmetic — it SELECTS a set
              and claims nothing about whether the men in it can hit. The bot's
              HR score is the part of this site with sixty graded nights behind
              it. So the numbers narrow and the thing with a record ranks what
              is left; neither is asked to do the other's job.

              Which makes the median comparison below mandatory rather than
              decorative: if the reduction were quietly picking better bats,
              the aligned median would sit above the slate's. Printing it is
              running the test on his own idea with his own data, every night,
              in public. */}
          {W.scoreName && tonight.medianScoreAligned != null && tonight.medianScoreSlate != null && (
            <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 7 }}>
              The numbers pick the set; the <b style={{ color: C.text2 }}>{W.scoreName}</b> — {W.scoreRecord} — ranks what is in it. Median score among
              the aligned is{' '}
              <b style={{ fontFamily: NUM_FONT, color: C.text2 }}>{tonight.medianScoreAligned.toFixed(1)}</b>{' '}
              against the whole slate&apos;s{' '}
              <b style={{ fontFamily: NUM_FONT, color: C.text2 }}>{tonight.medianScoreSlate.toFixed(1)}</b>
              {Math.abs(tonight.medianScoreAligned - tonight.medianScoreSlate) < 2
                ? <> — the same board, in other words, which is what you should expect and what it almost always says.</>
                : tonight.medianScoreAligned > tonight.medianScoreSlate
                  ? <> — {W.night} the aligned set happens to be the stronger half. One {W.unit} is not a finding.</>
                  : <> — {W.night} the aligned set is the weaker half. One {W.unit} is not a finding either way.</>}
            </div>
          )}
          </>)}
          <div style={{ fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800, marginBottom: 4 }}>
            {W.carrying}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(tonight.byBotScore || []).slice(0, chipLimit).map(({ a, keys, strength }) => (
              <button key={a.pid} onClick={() => toggle(a.pid)}
                title={`${keys.map((k) => AXIS_META[k].why(a)).join(' · ')} — all reducing to ${todayRoot}.${Number.isFinite(scoreOf(a)) && W.scoreShort ? ` Bot ${W.scoreShort} ${scoreOf(a).toFixed(0)}.` : ''} ${clickWord(a.pid)}.`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, ...CHIP,
                  border: `1px solid ${picked.has(a.pid) ? C.orange : `${ROOT_COLORS[todayRoot]}55`}`,
                  background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                }}>
                {a.name}
                {/* The bot's score, on the chip rather than buried in a
                    tooltip — it is what the list is ORDERED by, and a list
                    whose ordering is invisible reads as arbitrary. */}
                {W.scoreShort && Number.isFinite(scoreOf(a)) && <span style={{ color: accent, fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900 }}
                  title={`The bot's 0-100 ${W.scoreShort}. This list is sorted by it.`}>
                  {' '}{scoreOf(a).toFixed(0)}
                </span>}
                <span style={{ color: ROOT_COLORS[todayRoot], fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900 }}>
                  {' '}{strength}×
                </span>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>
                  {' '}{keys.map((k) => {
                    const raw = AXIS_META[k].raw ? AXIS_META[k].raw(a) : null
                    return raw ? `${AXIS_META[k].label} ${raw}→${todayRoot}` : `${AXIS_META[k].label}→${todayRoot}`
                  }).join(' · ')}
                </span>
              </button>
            ))}
            {tonight.twoPlus > chipLimit && (
              <span style={{ fontSize: 9.5, color: C.text3 }}>+{tonight.twoPlus - chipLimit} more</span>
            )}
          </div>
        </div>
      )}

      {/* ── THE DAYS — yesterday's actual root, today's so far, tomorrow's
          date (2026-08-18). Everything above this is the PREGAME slate,
          projecting who might align before a single ball has flown. This is
          the only place on the page looking at what actually happened —
          yesterday and tonight-so-far: every homer hitter with his own numbers,
          lit where they meet that day's number (/api/numerology/night, from the
          homers themselves since 2026-10-04 -- it used to be one browser's copy). */}
      {days && (
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2,
        padding: '9px 13px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: C.text2, marginBottom: 6 }}>
          📅 Yesterday · Today · Tomorrow
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <NightBox title="Yesterday, actually" night={yesterdayArchive} empty="No homers on file for yesterday." C={C} NUM_FONT={NUM_FONT} />
          <NightBox title="Tonight, so far" night={todayArchive} empty="Nothing's landed yet tonight -- the first homer fills this in." C={C} NUM_FONT={NUM_FONT} />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Tomorrow&apos;s date</div>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 2 }}>
              {tomorrowKey} reduces to root <b style={{ color: ROOT_COLORS[tomorrowRoot], fontFamily: NUM_FONT, fontSize: 13 }}>{tomorrowRoot}</b>.
              A hitter&apos;s jersey, birthday and life path don&apos;t change day to day, so anyone whose own
              numbers land on {tomorrowRoot} is worth a glance once tomorrow&apos;s slate loads — see your
              watchlist below.
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── YOUR WATCHLIST, CROSS-CHECKED (2026-08-18) ─────────────────────
          Donovan: "it also helps to see if the players on watch list are
          aligned or aligning number for today yesterday and the next day."
          Only renders with a watchlist AND at least one of those names on
          tonight's slate — an empty watchlist has nothing to cross-check. */}
      {hasWatch && (
        <div style={{
          border: `1px solid ${watchedRows.some((w) => w.any) ? C.orange + '77' : C.border}`,
          background: watchedRows.some((w) => w.any) ? 'rgba(249,115,22,.06)' : C.bg2,
          borderRadius: 10, padding: '9px 13px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.text2, marginBottom: 4 }}>
            ⭐ Your watchlist, aligning
          </div>
          {watchedRows.length === 0 ? (
            <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
              None of your starred {W.persons} are on {W.slate}.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, marginBottom: 6 }}>
                {W.watchLegend || <>Checked against his own jersey / birthday / life-path roots — <b style={{ color: C.orange }}>Y</b> = matches
                yesterday&apos;s leading root, <b style={{ color: C.orange }}>T</b> = today&apos;s so far, <b style={{ color: C.orange }}>+1</b> = tomorrow&apos;s date.</>}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {watchedRows.map(({ a, hitsYesterday, hitsToday, hitsTomorrow, any }) => (
                  <button key={a.pid} onClick={() => toggle(a.pid)}
                    title={clickWord(a.pid, true)}
                    style={{
                      padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, ...CHIP,
                      border: `1px solid ${picked.has(a.pid) ? C.orange : any ? C.orange + '55' : C.border}`,
                      background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                    }}>
                    {a.name}
                    {hitsYesterday && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5 }}>Y</span>}
                    {hitsToday && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>T</span>}
                    {hitsTomorrow && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>+1</span>}
                    {!any && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5 }}>·</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── THE CLUBS — nine roots, concentration stated ─────────────────── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {ranked.map((c) => {
          const x = expected > 0 ? c.count / expected : 0
          const on = openRoot === c.root
          return (
            <button key={c.root} onClick={() => setOpenRoot(on ? null : c.root)} style={{
              padding: '5px 12px', borderRadius: 9, cursor: 'pointer',
              border: `1px solid ${on ? ROOT_COLORS[c.root] : C.border}`,
              background: on ? `${ROOT_COLORS[c.root]}18` : C.bg2,
              color: C.text2, fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800,
            }}
              title={`Root ${c.root}: ${c.count} memberships across all ${W.axesWord} axes, against ~${Math.round(expected)} expected by arithmetic. ${x >= 1.25 ? `Running above its share ${W.night}.` : x <= 0.8 ? 'Running below its share.' : 'About its arithmetic share.'}`}>
              <span style={{ color: ROOT_COLORS[c.root], fontSize: 13 }}>{c.root}</span>
              {' '}{c.count}
              <span style={{ color: x >= 1.25 ? ROOT_COLORS[c.root] : C.text3, fontSize: 9 }}> {x.toFixed(2)}×</span>
            </button>
          )
        })}
      </div>
      {openRoot && (() => {
        const c = clubs.find((k) => k.root === openRoot)
        const members = [...c.members].sort((a, b) => (b.axisKeys.length - a.axisKeys.length) || ((scoreOf(b.a) || 0) - (scoreOf(a.a) || 0)))
        return (
          <div style={{ border: `1px solid ${ROOT_COLORS[openRoot]}44`, background: `${ROOT_COLORS[openRoot]}0a`, borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: ROOT_COLORS[openRoot], marginBottom: 5 }}>
              THE {openRoot} CLUB · {members.length} {W.persons}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {members.slice(0, 40).map(({ a, axisKeys }) => (
                <button key={a.pid} onClick={() => toggle(a.pid)}
                  title={`${axisKeys.map((k) => AXIS_META[k].why(a)).join(' · ')}${W.scoreShort && Number.isFinite(scoreOf(a)) ? ` · bot ${W.scoreShort} ${scoreOf(a).toFixed(0)}` : ''} · ${clickWord(a.pid, true)}`}
                  style={{
                    padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, ...CHIP,
                    border: `1px solid ${picked.has(a.pid) ? C.orange : C.border}`,
                    background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                  }}>
                  {a.name}
                  {/* Raw number → root, not just the axis name. "season HR
                      19→1" is the read; "season HR" alone is a label. */}
                  <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>
                    {' '}{axisKeys.map((k) => {
                      const raw = AXIS_META[k].raw ? AXIS_META[k].raw(a) : null
                      return raw ? `${AXIS_META[k].label} ${raw}→${openRoot}` : AXIS_META[k].label
                    }).join(' · ')}
                  </span>
                </button>
              ))}
              {members.length > 40 && <span style={{ fontSize: 9.5, color: C.text3 }}>+{members.length - 40} more</span>}
            </div>
          </div>
        )
      })()}

      {/* ── FULL BRAIDS — his own numbers agree with each other ──────────── */}
      {braids.length > 0 && (
        <div style={{ border: `1px solid rgba(192,132,252,.3)`, background: 'rgba(192,132,252,.06)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#c084fc', marginBottom: 2 }}>
            🧬 FULL BRAIDS · {braids.length} {W.persons} whose own numbers agree
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            {W.braidNote}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {braids.slice(0, 24).map(({ a, root, keys, strength }) => (
              <button key={a.pid} onClick={() => toggle(a.pid)}
                title={`Root ${root}: ${keys.map((k) => AXIS_META[k].why(a)).join(' · ')}${W.scoreShort && Number.isFinite(scoreOf(a)) ? ` · ${W.scoreShort} ${scoreOf(a).toFixed(0)}` : ''} · ${clickWord(a.pid, true)}`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, ...CHIP,
                  border: `1px solid ${picked.has(a.pid) ? C.orange : strength >= 3 ? '#c084fc' : C.border}`,
                  background: picked.has(a.pid) ? 'rgba(249,115,22,.14)' : 'transparent', color: C.text2,
                }}>
                {a.name}
                <span style={{ color: ROOT_COLORS[root], fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900 }}> {root}</span>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>×{strength}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── NAME CONNECTIONS ─────────────────────────────────────────────── */}
      {names.length > 0 && (
        <div style={{ border: `1px solid rgba(34,211,238,.28)`, background: 'rgba(34,211,238,.05)', borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.cyan, marginBottom: 2 }}>
            🔤 NAME CONNECTIONS · {names.length} families {W.onSlate}
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginBottom: 6 }}>
            {W.namesNote}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {names.slice(0, 8).map((f) => (
              <div key={`${f.kind}-${f.key}`} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6 }}>
                <b style={{ color: C.cyan, fontFamily: NUM_FONT }}>{f.key.toUpperCase()}</b>
                <span style={{ color: C.text3 }}> ({f.kind === 'first' ? 'first name' : 'surname'}, {f.list.length}) — </span>
                {f.list.map((a, i) => (
                  <span key={a.pid}>
                    {i > 0 && ' · '}
                    <span onClick={() => toggle(a.pid)}
                      style={{ cursor: 'pointer', fontWeight: 700, color: picked.has(a.pid) ? C.orange : C.text }}
                      title={clickWord(a.pid, true)}>
                      {a.name}
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {builder && (<>
      {/* ── HAND-OFF TO THE BUILDER ──────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        border: `1px solid ${pickedRows.length ? C.orange : C.border}`, borderRadius: 10,
        background: C.bg2, padding: '7px 11px',
      }}>
        <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: pickedRows.length ? C.orange : C.text3, fontWeight: 800 }}>
          {pickedRows.length ? `${pickedRows.length} PICKED` : 'CLICK NAMES TO COLLECT THEM'}
        </span>
        {/* a picked name opens his file (0g A6: onName was accepted and never called) */}
        {pickedRows.map((a) => (
          <span key={a.pid} style={{ fontSize: 10, color: C.text2 }}>{onName ? <Tap onClick={() => onName(a)}>{a.name}</Tap> : a.name}</span>
        ))}
        <button
          disabled={!pickedRows.length}
          onClick={() => onBuildAround?.(pickedRows.map((a) => a.p))}
          style={{
            marginLeft: 'auto', padding: '5px 13px', borderRadius: 999,
            cursor: pickedRows.length ? 'pointer' : 'default', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${pickedRows.length ? C.orange : C.border}`,
            background: pickedRows.length ? 'rgba(249,115,22,.14)' : 'transparent',
            color: pickedRows.length ? C.orange : C.text3,
          }}>
          🧱 Build a ticket around {pickedRows.length ? `these ${pickedRows.length}` : 'them'} →
        </button>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.55 }}>
        The alignment is why you noticed him; the ticket is still built by the group engine under its normal
        measured rules. The two claims never mix — a braid is watched, a ticket is graded.
      </div>
      </>)}
      {children}
    </div>
  )
}
