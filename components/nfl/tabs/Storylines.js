'use client'
// 📰 STORYLINES (2026-09-12, updated same day; reformatted + expanded
// 2026-09-16, round 6) — Phase 3, four angles now, in MOONSHOT's own compact
// row format.
//
// Donovan sent a screenshot of MOONSHOT's Storylines fold and said this tab
// was "built kinda wrong or formatted not like the mlb." Traced both before
// touching anything (claude/tuddy-storylines-and-markets-audit-2026-09-16.md):
// the honest gap was two things, not one --
//   FORMAT: MOONSHOT is a dense list of one-sentence rows (icon, bold name,
//     bold orange numbers inline, no separate stat block). This tab was a
//     feed of big cards with a headline plus a 3-4 tile stat rail underneath.
//     Rebuilt below as rows -- the numbers that used to sit in a rail are now
//     folded into the sentence or a hover tooltip, same as MOONSHOT does it.
//   CONTENT: MOONSHOT ships nine categories, this tab shipped two. Most of
//     the other seven need data this repo does not have -- see the audit doc
//     for the category-by-category trace. Two were honestly buildable with
//     what already exists and are added here: Birthdays (`birth_date` is
//     already on every player object -- Numerology.js already reads it) and
//     Rivalry Nights (this week's schedule, checked against a curated list --
//     see lib/nfl/storylines.js). Revenge games, BvP-style duels and
//     giveaways stay out, same as before -- no data source exists for any of
//     them, and this page has never guessed to fill a slot.
//
// Milestone (streak) and Model narrative are unchanged in substance -- same
// lib/nfl/storylines.js functions, same underlying facts -- only the row they
// render into has changed.
//
// Model narrative — a call the model actually saw but filed under the wrong
// market (see claude/moonshot-the-missing-philosophy.md) — turned out to
// need NO new bot work. nfl_results.py already publishes `lines`: every
// eligible market outcome for every player who recorded a line that week,
// not just the five rungs on the card (see that file's own module
// docstring: "every player who recorded a line... it is not worth being
// clever about"). resultsArchive.js's useResultsArchive() already fetches
// and caches that whole payload for the season-to-date record — `lines`,
// `bars` and `names` were just sitting there unused. This reads them.
//
// Game narrative (injury-driven role changes) is the one angle still not
// live. Real ESPN injury data exists on the site today (lib/nfl/injury.js)
// but a boolean Questionable/Out tag is not the same thing as knowing a
// teammate's absence changes THIS player's role enough to matter — that
// needs snap-share/target-share modeling this repo doesn't have. Guessing at
// that connection without it would be exactly the kind of fabricated
// causality this page has avoided from the start. See the note at the
// bottom, which still says so in plain words.
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { streakMarkets } from '../../../lib/nfl/streaks'
import { useResultsArchive } from '../../../lib/nfl/resultsArchive'
import PageHeader from '../../PageHeader'
import {
  VERB, NOUN, fmtBar, ordinal, weekLabel,
  milestoneStreaks, modelNarrativeStories, rivalryNights, birthdays,
} from '../../../lib/nfl/storylines'

// One row shape for all four categories -- icon, a sentence (bold name, bold
// orange numbers), optional click-through. Matches components/Storylines.js's
// own Row: a clickable div at 11.5px, no card, no rail.
function Row({ icon, onClick, title, children }) {
  const interactive = Boolean(onClick)
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={`sl-row${interactive ? ' tap' : ''}`}
    >
      <span className="sl-row-icon">{icon}</span>
      <span className="sl-row-text">{children}</span>
    </Tag>
  )
}
const Num = ({ children }) => <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{children}</b>
const Name = ({ children }) => <b style={{ color: C.text }}>{children}</b>

export default function Storylines({ data, logs, results, onPlayerClick, setTab }) {
  const markets = useMemo(() => streakMarkets(logs), [logs])
  const { archive, keys } = useResultsArchive(results, data?.season)

  const playersById = useMemo(
    () => Object.fromEntries((data?.players || []).map((p) => [String(p.player_id), p])),
    [data],
  )

  const cards = useMemo(() => milestoneStreaks(logs, data).slice(0, 6), [logs, data])

  const modelCards = useMemo(
    () => modelNarrativeStories(archive, keys, playersById).slice(0, 4),
    [archive, keys, playersById],
  )

  // Neither of these needs `logs` -- schedule and birth_date are both
  // published in nfl_week.json before any log or grade exists, so they must
  // not be gated behind the same "no logs yet" empty state as the other two.
  const rivalries = useMemo(() => rivalryNights(data), [data])
  const bdays = useMemo(() => birthdays(data), [data])

  const nothingAtAll = !markets.length && !modelCards.length && !rivalries.length && !bdays.length
  if (nothingAtAll) {
    return <div className="sl-empty">No game logs published yet — the bot ships nfl_logs.json on its first run of the season, and storylines read the same file Streaks does.</div>
  }

  const counts = [
    cards.length && `\u{1F525} ${cards.length} milestone streak${cards.length > 1 ? 's' : ''}`,
    modelCards.length && `\u{1F3AF} ${modelCards.length} model call${modelCards.length > 1 ? 's' : ''}`,
    bdays.length && `\u{1F382} ${bdays.length} birthday${bdays.length > 1 ? 's' : ''}`,
    rivalries.length && `⚡ ${rivalries.length} rivalry game${rivalries.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="sl">
      <PageHeader
        eyebrow="TUDDY · STORYLINES"
        title="What the numbers are already saying"
        note={<>Not a leaderboard — a sentence. Every line below is a real, live fact off this week&apos;s logs and grading — read as a story instead of a row in a table.{counts && <div className="sl-counts">{counts}</div>}</>}
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
      />

      {!!modelCards.length && (
        <div className="sl-feed">
          <div className="sl-section-head">MODEL NARRATIVE</div>
          {modelCards.map((c) => (
            <Row
              key={`model-${c.pid}-${c.weekKey}`}
              icon="\u{1F3AF}"
              onClick={() => onPlayerClick?.(c.player, c.hitMarket)}
              title={`Priced ${fmtBar(c.missBar)} ${NOUN[c.missMarket] || c.missMarket}, went ${fmtBar(c.missActual)} — GRADED, ${weekLabel(c.week).toUpperCase()}.`}
            >
              <Name>{c.player.name}</Name> was priced for {NOUN[c.missMarket] || c.missMarket} this week and missed
              (<Num>{fmtBar(c.missActual)}</Num> of <Num>{fmtBar(c.missBar)}</Num>) — he delivered anyway, just{' '}
              {VERB[c.hitMarket] ? VERB[c.hitMarket](fmtBar(c.hitBar)) : `over ${fmtBar(c.hitBar)} ${NOUN[c.hitMarket] || c.hitMarket}`}
              {' '}(<Num>{fmtBar(c.hitVal)}</Num>), a market the card never opened for him.
              <span className="sl-row-meta"> · {c.player.team} {c.player.position}</span>
            </Row>
          ))}
        </div>
      )}

      {!!cards.length && (
        <div className="sl-feed">
          <div className="sl-section-head">MILESTONE WATCH</div>
          {cards.map((r, idx) => {
            const label = NOUN[r.marketKey]?.replace(/^a /, '') || r.marketKey
            const rankPhrase = r.rank === 1
              ? 'the longest active streak on the board'
              : `the ${ordinal(r.rank)} longest active streak on the board`
            return (
              <Row
                key={`${r.player.player_id}-${r.marketKey}`}
                icon={idx === 0 && !modelCards.length ? '\u{1F525}' : '\u{1F501}'}
                onClick={() => onPlayerClick?.(r.player, r.marketKey)}
                title={`${r.hits}/${r.games} at this mark (${Math.round(r.rate * 100)}%), last game ${r.lastV} — ${rankPhrase}, in ${label}. LIVE, from this week's logs.`}
              >
                <Name>{r.player.name}</Name> has {VERB[r.marketKey] ? VERB[r.marketKey](fmtBar(r.marketBar)) : `cleared ${fmtBar(r.marketBar)} ${label}`} in <Num>{r.streak}</Num> straight games
                <span className="sl-row-meta"> · {r.player.team} {r.player.position} vs {r.player.opp || '—'}</span>
              </Row>
            )
          })}
        </div>
      )}

      {!!bdays.length && (
        <div className="sl-feed">
          <div className="sl-section-head">BIRTHDAYS</div>
          {bdays.map(({ player, age }) => (
            <Row key={`bd-${player.player_id}`} icon="\u{1F382}" onClick={() => onPlayerClick?.(player)}>
              <Name>{player.name}</Name> turns <Num>{age}</Num> today
              <span className="sl-row-meta"> · {player.team} {player.position}</span>
            </Row>
          ))}
        </div>
      )}

      {!!rivalries.length && (
        <div className="sl-feed">
          <div className="sl-section-head">RIVALRY NIGHT</div>
          {rivalries.map((g) => (
            <Row key={`rv-${g.gameId || `${g.away}@${g.home}`}`} icon="⚡">
              Rivalry night: <Name>{g.away} at {g.home}</Name> — the games that never need a storyline get one anyway
            </Row>
          ))}
        </div>
      )}

      {setTab && (
        <button type="button" className="sl-more" onClick={() => setTab('streaks')}>See every streak on the board, any line you pick →</button>
      )}

      <div className="sl-note">
        <b>One more angle, not live yet.</b> Game narrative (injury-driven role
        changes, schedule swings) needs more than the Questionable/Out tag the site already
        shows — connecting one player's absence to another's role takes snap- or target-share
        modeling that doesn't exist here yet, so rather than guess, this page leaves it out.
        Revenge games and player-vs-defense duels are out for the same reason — no prior-team
        or matchup-history data exists in this pipeline yet.
      </div>

      <style>{`
      .sl{display:flex;flex-direction:column;gap:14px}
            .sl-counts{margin-top:8px;font:700 9.5px/1.6 ${NUM_FONT};letter-spacing:.02em;color:${C.text2}}

      .sl-feed{display:flex;flex-direction:column;gap:0;border:1px solid ${C.border};border-radius:12px;background:${C.bg2};padding:6px 14px;overflow:hidden}
      .sl-section-head{padding:8px 0 4px;font:900 8.5px/1 ${NUM_FONT};letter-spacing:.12em;text-transform:uppercase;color:${C.text3}}
      .sl-row{display:flex;gap:8px;align-items:baseline;width:100%;font:inherit;font-size:11.5px;line-height:1.6;text-align:left;padding:5px 0;border:none;border-top:1px solid ${C.border};background:transparent;color:${C.text2}}
      .sl-row:first-of-type{border-top:none}
      .sl-row.tap{cursor:pointer}
      .sl-row.tap:hover{color:${C.text}}
      .sl-row-icon{flex-shrink:0}
      .sl-row-text{min-width:0}
      .sl-row-meta{color:${C.text3};font-family:${NUM_FONT};font-size:9.5px}

      .sl-more{align-self:flex-start;padding:9px 14px;border:1px solid ${C.border};border-radius:9px;background:${C.bg};color:${C.cyan};font:800 10px/1 ${NUM_FONT};cursor:pointer}
      .sl-more:hover{border-color:${C.cyan}}

      .sl-note{padding:14px 16px;border:1px dashed ${C.border2};border-radius:12px;color:${C.text3};font-size:10.5px;line-height:1.6}
      .sl-note b{color:${C.text2}}
      .sl-empty{padding:26px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      `}</style>
    </div>
  )
}
