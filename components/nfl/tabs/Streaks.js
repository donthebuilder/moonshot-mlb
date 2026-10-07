'use client'
// 🔥 STREAKS — the NFL sibling of MOONSHOT's Runs page. See lib/nfl/streaks.js
// for what a streak is. The page: pick a market, pick your own line (chips
// around the bot's bar), and every slate player with a log ranks by
// consecutive games on the same side of that number. Hot at the top, or flip
// to Coldest for the fade board.
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, gradeFor } from '../../../lib/nfl/theme'
import { streakMarkets, streakBoard, barChoices, seriesFor } from '../../../lib/nfl/streaks'
import PageHeader from '../../PageHeader'
import { FilterPill } from '../../Filters'
import NflExplain from '../NflExplain'
import { RunLeaderCard, RunBoardRow, runChip, RunHistogram } from '../../runs/RunParts'
import { SportTheme } from '../../SportTheme'
import { readRun } from '../../../lib/runs'
import { useIsPhone } from '../../MobileFold'

const REASON_WORD = { rising: 'usage rising', bot: 'bot likes him' }
const REASON_TITLE = (r) => `Below the volume floor (${r.usage.recent.toFixed(1)} a game over his last 8, floor ${r.usage.floor}) but on the board because: ${r.reasons.map((x) => REASON_WORD[x]).join(', ')}.`
const LABEL = { TD: 'Anytime TD', REC_YDS: 'Receiving yards', REC: 'Receptions', RUSH_YDS: 'Rushing yards', RUSH_ATT: 'Carries', PASS_YDS: 'Passing yards', KICK_PTS: 'Kicking points' }

// MOONSHOT'S RUN PIECES (2026-09-29, queue batch 11). The list below was its
// own .ts-* grid with a private sparkline; it is MOONSHOT's Runs card and row
// now (components/runs/RunParts.js), fed by the same readRun() arithmetic --
// the NFL log is laid out in MOONSHOT's run columns so hot/cold, his own best
// and L5-L30 are computed by one function for both sports.
//
// Phone budget: two featured cards on a phone (six on desktop, MOONSHOT's
// number) and a twelve-row preview of the board, so the page is no taller
// than the list it replaced.
const PREVIEW = 12

// One NFL log series -> readRun()'s rows (newest first): [date, opp, _, v].
// Home/away comes from the log's per-game `h` (bots/nfl/nfl_gamelog.py, since
// 2026-10-06): the strip says "vs" / "@" for a game that carries it. A neutral
// site, or a log published before that change, has none -- home: null there,
// so the strip says neither (readRun alone would turn "unknown" into "away").
function runOf(series, bar) {
  const latest = series.length ? series[series.length - 1].s : null
  const rows = [...series].reverse().map((g) => [
    `${g.s !== latest ? `'${String(g.s).slice(2)} ` : ''}W${g.w}`, g.opp, null, g.v,
  ])
  const r = readRun(rows, 3, bar)
  if (!r) return null
  // strip is oldest -> newest, the same order as `series`
  const aligned = r.strip.length === series.length
  return { ...r, strip: r.strip.map((x, i) => ({ ...x, home: aligned && series[i].h != null ? series[i].h === 1 : null })) }
}

export default function Streaks({ data, logs, onPlayerClick }) {
  const markets = useMemo(() => streakMarkets(logs), [logs])
  const [mk, setMk] = useState(markets[0]?.key || 'REC_YDS')
  const market = markets.find((m) => m.key === mk) || markets[0]
  const [bar, setBar] = useState(null)
  const [side, setSide] = useState('over')
  const [pos, setPos] = useState('ALL')
  const [openRow, setOpenRow] = useState(null)
  const [all, setAll] = useState(false)
  const phone = useIsPhone()
  const line = bar ?? market?.bar ?? 0
  const chips = useMemo(() => (market ? barChoices(market.key, market.bar) : []), [market])

  const rows = useMemo(() => {
    if (!market) return []
    // Only positions the bot scores in this market. Without this the cold
    // board was every quarterback at "30 straight under 40 receiving yards",
    // which is true and worthless.
    const eligible = new Set((data?.markets || []).find((m) => m.key === market.key)?.positions || [])
    // A man on a bye is carried in the payload for the catalog's sake, but
    // "who is hot right now" is a question about people who are playing.
    const players = (data?.players || []).filter((p) => !p.on_bye && (!eligible.size || eligible.has(p.position)) && (pos === 'ALL' || p.position === pos))
    return streakBoard(logs, players, market.field, line, side, 30, market.key).filter((r) => r.streak > 0).slice(0, 60)
      .map((r) => ({ ...r, run: runOf(seriesFor(logs, r.player.player_id, market.field, 30), line) }))
      .filter((r) => r.run)
  }, [logs, data, market, line, side, pos])

  // MOONSHOT's "every active run on the board" (components/runs/RunParts.js
  // RunHistogram): every eligible player's active run at this line, both
  // directions -- the board below lists one side; the chart counts the field.
  const allRuns = useMemo(() => {
    if (!market) return []
    const eligible = new Set((data?.markets || []).find((m) => m.key === market.key)?.positions || [])
    return (data?.players || [])
      .filter((p) => !p.on_bye && (!eligible.size || eligible.has(p.position)) && (pos === 'ALL' || p.position === pos))
      .map((p) => runOf(seriesFor(logs, p.player_id, market.field, 30), line)?.run)
      .filter((v) => Number.isFinite(v) && v !== 0)
  }, [logs, data, market, line, pos])

  if (!markets.length) return <div className="ts-empty">No game logs published yet — the bot ships nfl_logs.json on its first run of the season.</div>

  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
    <div className="ts">
      <PageHeader
        eyebrow="TUDDY · STREAKS"
        title={side === 'over' ? 'Who is hot' : 'Who is cold'}
        note={<>Consecutive games on the same side of a number <b>you</b> pick, last 30 games, no model in the way. Hot is the play; cold is the fade — or the bounce, if you believe in those. Low-volume names only make the board with a reason printed next to them: usage rising, or the bot rating him this week.</>}
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
        right={(
          <div style={{ display: 'flex', gap: 7 }}>
            <FilterPill active={side === 'over'} onClick={() => setSide('over')}>🔥 Hottest</FilterPill>
            <FilterPill active={side === 'under'} onClick={() => setSide('under')}>🧊 Coldest</FilterPill>
          </div>
        )}
      />

      {/* THE HOUSE CONTROLS (2026-09-18). These three rows used to be a private
          .ts-row button system with its own hardcoded hex, a fourth control
          vocabulary on TUDDY. Same FilterPill every other board uses now; the
          list below keeps its own .ts-* styling, which is this page's real
          visual work. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {markets.map((m) => (
            <FilterPill key={m.key} active={m.key === market.key}
              onClick={() => { setMk(m.key); setBar(null); setPos('ALL'); setAll(false) }}>
              {LABEL[m.key] || m.key}
            </FilterPill>
          ))}
        </div>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}><NflExplain label="Line" /></span>
          {chips.map((c) => (
            <FilterPill key={c} active={c === line} onClick={() => setBar(c)}
              title={c === market.bar ? "The bot's own bar for this market." : `Your own line: ${c}.`}>
              {c}{c === market.bar ? ' · bot' : ''}
            </FilterPill>
          ))}
        </div>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Pos</span>
          {['ALL', ...((data?.markets || []).find((m) => m.key === market.key)?.positions || ['QB', 'RB', 'WR', 'TE', 'K'])].map((k) => (
            <FilterPill key={k} active={k === pos} onClick={() => setPos(k)}>
              {k === 'ALL' ? 'Everyone' : k}
            </FilterPill>
          ))}
        </div>
      </div>

      {!rows.length && <div className="ts-empty">Nobody on this slate is on a run at {line} {LABEL[market.key]?.toLowerCase()}.</div>}
      {rows.length > 0 && (() => {
        const label = `${line}+ ${(LABEL[market.key] || market.key).toLowerCase()}`
        const why = (r) => (r.usage && !r.usage.volume ? r.reasons.map((x) => REASON_WORD[x]).join(' · ') : '')
        const featured = rows.slice(0, phone ? 2 : 6)
        const board = rows.slice(featured.length)
        const shown = all ? board : board.slice(0, PREVIEW)
        return (
          <>
            {allRuns.length > 0 && <RunHistogram runs={allRuns} label={label} noun="players" nounOne="player" />}
            <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))' }}>
              {featured.map((x) => {
                const score = x.player.scores?.[market.key]
                const g = gradeFor(score)
                return (
                  <RunLeaderCard key={x.player.player_id} r={x.run} name={x.player.name} label={label}
                    kicker={<>{x.player.team}{x.player.opp ? ` vs ${x.player.opp}` : ''} · {x.player.position} · {label}</>}
                    onClick={() => onPlayerClick?.(x.player, market.key)}>
                    <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3, marginTop: 3 }}>
                      {Number.isFinite(score) ? <>bot <b style={{ color: g.color }}>{Math.round(score)}</b> this week</> : 'not scored this week'}
                      {x.questionable && <b title="Listed questionable on the slate" style={{ color: C.yellow, marginLeft: 6 }}>Q</b>}
                      {why(x) && <span title={REASON_TITLE(x)} style={{ color: C.green, marginLeft: 6 }}>{why(x)}</span>}
                    </div>
                  </RunLeaderCard>
                )
              })}
            </div>
            {board.length > 0 && (
              <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
                {shown.map((x) => (
                  <RunBoardRow key={x.player.player_id} r={x.run} name={x.player.name} label={label}
                    team={<>{x.player.team} · {x.player.position}{x.questionable ? ' · Q' : ''}{why(x) ? <span title={REASON_TITLE(x)} style={{ color: C.green }}> · {why(x)}</span> : null}</>}
                    open={openRow === x.player.player_id}
                    onToggle={() => setOpenRow(openRow === x.player.player_id ? null : x.player.player_id)}
                    onOpenCard={() => onPlayerClick?.(x.player, market.key)} />
                ))}
              </div>
            )}
            {board.length > PREVIEW && (
              <button type="button" onClick={() => setAll(!all)} style={{ ...runChip(false), alignSelf: 'flex-start', padding: '8px 14px' }}>
                {all ? 'Show less' : `Show all ${board.length}`}
              </button>
            )}
          </>
        )
      })()}

      <style>{`
      .ts{display:flex;flex-direction:column;gap:12px}
      .ts-empty{padding:26px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      `}</style>
    </div>
    </SportTheme>
  )
}
