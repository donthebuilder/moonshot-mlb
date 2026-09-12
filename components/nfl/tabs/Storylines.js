'use client'
// 📰 STORYLINES (2026-09-12, updated same day) — Phase 3, two angles shipped
// for real now. Milestone (incentive/streak content, the NFL sibling of
// MLB's automated Birthday Watch / Back-to-Back Watch) reads nfl_logs.json,
// live, in the browser — same as Streaks.js.
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
// Both angles' actual math now live in lib/nfl/storylines.js, shared with
// the inline "why this matters" blurb on Games cards (Phase 3's original
// second surface, shipped same day) — one source of truth for "is this
// worth a sentence," not two copies that can quietly disagree.
//
// Game narrative (revenge games, injury-driven role changes) is the one
// angle still not live. Real ESPN injury data exists on the site today
// (lib/nfl/injury.js) but a boolean Questionable/Out tag is not the same
// thing as knowing a teammate's absence changes THIS player's role enough
// to matter — that needs snap-share/target-share modeling this repo
// doesn't have. Guessing at that connection without it would be exactly
// the kind of fabricated causality this page has avoided from the start.
// See the note at the bottom, which still says so in plain words.
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { streakMarkets } from '../../../lib/nfl/streaks'
import { useResultsArchive } from '../../../lib/nfl/resultsArchive'
import { VERB, NOUN, fmtBar, ordinal, weekLabel, milestoneStreaks, modelNarrativeStories } from '../../../lib/nfl/storylines'

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

  if (!markets.length && !modelCards.length) {
    return <div className="sl-empty">No game logs published yet — the bot ships nfl_logs.json on its first run of the season, and storylines read the same file Streaks does.</div>
  }

  return (
    <div className="sl">
      <section className="sl-hero">
        <span className="sl-dot" aria-hidden="true" />
        <small>TUDDY · STORYLINES</small>
        <h1>What the numbers are already saying</h1>
        <p>Not a leaderboard — a sentence. Every card below is a real, live fact off this week's logs and grading — read as a story instead of a row in a table.</p>
      </section>

      {!cards.length && !modelCards.length && <div className="sl-empty">Nobody on this slate is three-plus games deep on either side of a number right now — check back once more logs are in.</div>}

      {!!modelCards.length && (
        <div className="sl-feed">
          {modelCards.map((c) => (
            <button
              type="button"
              key={`model-${c.pid}-${c.weekKey}`}
              className="sl-card model"
              onClick={() => onPlayerClick?.(c.player, c.hitMarket)}
            >
              <div className="sl-top">
                <span className="sl-kicker model">Model narrative</span>
                <span className="sl-src">GRADED · {weekLabel(c.week).toUpperCase()}</span>
              </div>
              <div className="sl-headline">
                {c.player.name} was priced for {NOUN[c.missMarket] || c.missMarket} this week and missed — he delivered anyway, just {VERB[c.hitMarket] ? VERB[c.hitMarket](fmtBar(c.hitBar)) : `over ${fmtBar(c.hitBar)} ${NOUN[c.hitMarket] || c.hitMarket}`} in a market the card never opened for him.
              </div>
              <div className="sl-sub">{c.player.team} · {c.player.position} — priced {fmtBar(c.missBar)} {NOUN[c.missMarket] || c.missMarket}, went {fmtBar(c.missActual)}.</div>
              <div className="sl-rail">
                <div className="sl-stat"><div className="v" style={{ color: C.red }}>{fmtBar(c.missActual)}<span style={{ fontSize: 11 }}>/{fmtBar(c.missBar)}</span></div><div className="k">missed<br />{NOUN[c.missMarket] || c.missMarket}</div></div>
                <div className="sl-stat"><div className="v" style={{ color: C.orange }}>{fmtBar(c.hitVal)}<span style={{ fontSize: 11 }}>/{fmtBar(c.hitBar)}</span></div><div className="k">cleared<br />{NOUN[c.hitMarket] || c.hitMarket}</div></div>
                <div className="sl-stat"><div className="v">+{fmtBar(c.hitVal - c.hitBar)}</div><div className="k">past the<br />unset bar</div></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!!cards.length && (
        <div className="sl-feed">
          {cards.map((r, idx) => {
            const label = NOUN[r.marketKey]?.replace(/^a /, '') || r.marketKey
            const rankPhrase = r.rank === 1
              ? `the longest active streak on the board, in ${label}`
              : `the ${ordinal(r.rank)} longest active streak on the board, in ${label}`
            return (
              <button
                type="button"
                key={`${r.player.player_id}-${r.marketKey}`}
                className={`sl-card${idx === 0 && !modelCards.length ? ' hot' : ''}`}
                onClick={() => onPlayerClick?.(r.player, r.marketKey)}
              >
                <div className="sl-top">
                  <span className="sl-kicker">{idx === 0 && !modelCards.length ? '\u{1F525} ' : ''}Milestone</span>
                  <span className="sl-src">LIVE · FROM THIS WEEK'S LOGS</span>
                </div>
                <div className="sl-headline">
                  {r.player.name} has {VERB[r.marketKey] ? VERB[r.marketKey](fmtBar(r.marketBar)) : `cleared ${fmtBar(r.marketBar)} ${label}`} in <b>{r.streak}</b> straight games.
                </div>
                <div className="sl-sub">{r.player.team} · {r.player.position} · vs {r.player.opp || '—'} — {rankPhrase}.</div>
                <div className="sl-rail">
                  <div className="sl-stat"><div className="v">{r.streak}</div><div className="k">straight<br />games</div></div>
                  <div className="sl-stat"><div className="v">{r.hits}/{r.games}</div><div className="k">hit rate<br />last {r.games}</div></div>
                  <div className="sl-stat"><div className="v">{Math.round(r.rate * 100)}<span style={{ fontSize: 11 }}>%</span></div><div className="k">clip at<br />this mark</div></div>
                  <div className="sl-stat"><div className="v">{r.lastV}</div><div className="k">last<br />game</div></div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {setTab && (
        <button type="button" className="sl-more" onClick={() => setTab('streaks')}>See every streak on the board, any line you pick →</button>
      )}

      <div className="sl-note">
        <b>One more angle, not live yet.</b> Game narrative (revenge games, injury-driven role
        changes, schedule swings) needs more than the Questionable/Out tag the site already shows —
        it needs snap- or target-share modeling to actually connect one player's absence to
        another's role, and that doesn't exist here yet. Rather than guess at that connection, this
        page leaves it out.
      </div>

      <style>{`
      .sl{display:flex;flex-direction:column;gap:14px}
      .sl-hero{position:relative;padding:22px 24px;border:1px solid rgba(0,224,164,.28);border-radius:16px;background:radial-gradient(circle at 88% 8%,rgba(0,224,164,.14),transparent 36%),radial-gradient(circle at 6% 100%,rgba(45,200,255,.1),transparent 40%),${C.bg2}}
      .sl-dot{position:absolute;top:24px;left:24px;width:6px;height:6px;border-radius:50%;background:${C.green};animation:slPulse 1.8s ease-in-out infinite}
      .sl-hero small{display:block;margin-left:16px;color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}
      .sl-hero h1{margin:7px 0 5px;font-size:clamp(24px,4.2vw,40px);letter-spacing:-.03em}
      .sl-hero p{max-width:600px;margin:0;color:${C.text3};font-size:11px;line-height:1.55}
      @keyframes slPulse{0%,100%{opacity:1}50%{opacity:.35}}
      @media(prefers-reduced-motion:reduce){.sl-dot{animation:none}}

      .sl-feed{display:flex;flex-direction:column;gap:10px}
      .sl-card{display:block;width:100%;text-align:left;padding:16px 18px 17px;border:1px solid ${C.border};border-left:3px solid ${C.green};border-radius:12px;background:${C.bg2};color:inherit;cursor:pointer}
      .sl-card:hover{border-color:${C.border2};border-left-color:${C.green}}
      .sl-card.hot{box-shadow:0 0 0 1px ${C.border},0 0 22px -6px rgba(0,224,164,.4)}
      .sl-card.model{border-left-color:${C.orange}}
      .sl-card.model:hover{border-left-color:${C.orange}}
      .sl-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
      .sl-kicker{font:900 9.5px/1 ${NUM_FONT};letter-spacing:.08em;text-transform:uppercase;color:${C.green};background:rgba(0,224,164,.12);border:1px solid rgba(0,224,164,.3);border-radius:5px;padding:4px 8px}
      .sl-kicker.model{color:${C.orange};background:rgba(251,146,60,.12);border-color:rgba(251,146,60,.32)}
      .sl-src{font:700 8px/1 ${NUM_FONT};letter-spacing:.06em;color:${C.text3};text-transform:uppercase}
      .sl-headline{font-size:16.5px;line-height:1.4;font-weight:600;margin-bottom:5px}
      .sl-headline b{font-family:${NUM_FONT};color:${C.green};font-weight:800}
      .sl-sub{font-size:11.5px;color:${C.text3};margin-bottom:13px}
      .sl-rail{display:flex;gap:20px;padding-top:12px;border-top:1px solid ${C.border};flex-wrap:wrap}
      .sl-stat .v{font:800 17px/1 ${NUM_FONT};color:${C.text}}
      .sl-stat .k{margin-top:3px;font:700 7.5px/1.3 ${NUM_FONT};letter-spacing:.05em;color:${C.text3};text-transform:uppercase}

      .sl-more{align-self:flex-start;padding:9px 14px;border:1px solid ${C.border};border-radius:9px;background:${C.bg};color:${C.cyan};font:800 10px/1 ${NUM_FONT};cursor:pointer}
      .sl-more:hover{border-color:${C.cyan}}

      .sl-note{padding:14px 16px;border:1px dashed ${C.border2};border-radius:12px;color:${C.text3};font-size:10.5px;line-height:1.6}
      .sl-note b{color:${C.text2}}
      .sl-empty{padding:26px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      @media(max-width:640px){.sl-rail{gap:14px}.sl-headline{font-size:15px}}
      `}</style>
    </div>
  )
}
