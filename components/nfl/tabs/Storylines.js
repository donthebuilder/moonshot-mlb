'use client'
// 📰 STORYLINES (2026-09-12) — Phase 3, one angle shipped for real before the
// other two. The confirmed scope is three angles: game narrative, model
// narrative, and this one — incentive/milestone content, the NFL sibling of
// MLB's automated Birthday Watch / Back-to-Back Watch. This is the only one
// of the three buildable with data the site actually has today: it reads
// the same nfl_logs.json Streaks.js already reads, live, in the browser.
//
// Game narrative (revenge games, injury-driven role changes) needs a
// transaction/injury-history feed this repo doesn't carry yet. Model
// narrative (a call the model actually saw but filed under the wrong
// market — see claude/moonshot-the-missing-philosophy.md) needs a new
// grading-mismatch pass over the bot's own results, not built yet either.
// Both are next — see the note at the bottom of this page, which says so
// in plain words rather than shipping two empty placeholder cards.
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { streakMarkets, streakBoard } from '../../../lib/nfl/streaks'

// Plain-English verb per market, bar folded in at render time. Anytime TD is
// the one binary market (bar is always 0.5) — every other market gets a
// real threshold in the sentence, because "over 0.5" reads like a bug.
const VERB = {
  TD: () => 'scored a touchdown',
  REC_YDS: (bar) => `gone for ${bar}+ receiving yards`,
  REC: (bar) => `caught ${bar}+ passes`,
  RUSH_YDS: (bar) => `gone for ${bar}+ rushing yards`,
  RUSH_ATT: (bar) => `carried it ${bar}+ times`,
  PASS_YDS: (bar) => `thrown for ${bar}+ yards`,
  KICK_PTS: (bar) => `scored ${bar}+ kicking points`,
}
const NOUN = { TD: 'touchdown', REC_YDS: 'receiving yards', REC: 'receptions', RUSH_YDS: 'rushing yards', RUSH_ATT: 'carries', PASS_YDS: 'passing yards', KICK_PTS: 'kicking points' }
const fmtBar = (b) => (Number(b) % 1 ? Number(b).toFixed(1) : Math.round(Number(b)))
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

export default function Storylines({ data, logs, onPlayerClick, setTab }) {
  const markets = useMemo(() => streakMarkets(logs), [logs])

  const cards = useMemo(() => {
    if (!markets.length) return []
    const all = []
    for (const m of markets) {
      const eligible = new Set((data?.markets || []).find((x) => x.key === m.key)?.positions || [])
      const players = (data?.players || []).filter((p) => !p.on_bye && (!eligible.size || eligible.has(p.position)))
      const board = streakBoard(logs, players, m.field, m.bar, 'over', 30, m.key).filter((r) => r.streak > 0)
      board.forEach((r, i) => {
        if (r.streak >= 3) all.push({ ...r, marketKey: m.key, marketBar: m.bar, rank: i + 1, boardSize: board.length })
      })
    }
    all.sort((a, b) => b.streak - a.streak)
    return all.slice(0, 6)
  }, [markets, data, logs])

  if (!markets.length) {
    return <div className="sl-empty">No game logs published yet — the bot ships nfl_logs.json on its first run of the season, and storylines read the same file Streaks does.</div>
  }

  return (
    <div className="sl">
      <section className="sl-hero">
        <span className="sl-dot" aria-hidden="true" />
        <small>TUDDY · STORYLINES</small>
        <h1>What the numbers are already saying</h1>
        <p>Not a leaderboard — a sentence. Every card below is a real, live streak off this week's game logs, read as a story instead of a row in a table.</p>
      </section>

      {!cards.length && <div className="sl-empty">Nobody on this slate is three-plus games deep on either side of a number right now — check back once more logs are in.</div>}

      <div className="sl-feed">
        {cards.map((r, idx) => {
          const label = NOUN[r.marketKey] || r.marketKey
          const rankPhrase = r.rank === 1
            ? `the longest active streak on the board, in ${label}`
            : `the ${ordinal(r.rank)} longest active streak on the board, in ${label}`
          return (
            <button
              type="button"
              key={`${r.player.player_id}-${r.marketKey}`}
              className={`sl-card${idx === 0 ? ' hot' : ''}`}
              onClick={() => onPlayerClick?.(r.player, r.marketKey)}
            >
              <div className="sl-top">
                <span className="sl-kicker">{idx === 0 ? '\u{1F525} ' : ''}Milestone</span>
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

      {setTab && (
        <button type="button" className="sl-more" onClick={() => setTab('streaks')}>See every streak on the board, any line you pick →</button>
      )}

      <div className="sl-note">
        <b>Two more angles, not live yet.</b> Game narrative (revenge games, injury-driven role
        changes, schedule swings) needs a transaction/injury-history feed this site doesn't have
        wired up. Model narrative — a call the model actually saw coming but filed under the wrong
        market, graded a miss it never made — needs a new pass over the bot's own grading data
        that hasn't been built for football yet. Both are next.
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
      .sl-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
      .sl-kicker{font:900 9.5px/1 ${NUM_FONT};letter-spacing:.08em;text-transform:uppercase;color:${C.green};background:rgba(0,224,164,.12);border:1px solid rgba(0,224,164,.3);border-radius:5px;padding:4px 8px}
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
