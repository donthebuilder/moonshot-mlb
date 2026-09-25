'use client'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampGame } from '../../../lib/nhl/useLamp'
import { nhlLogo } from '../../../lib/nhl/teams'
import { strengthTag } from '../ScoreTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, LampDot, fmtDay, fmtPuckDrop, zoneAbbrev } from '../ui'

// 🏒 GAME — one game, top to bottom: the header (score, period, clock),
// the linescore and shots by period, every goal with its assists and
// strength, every penalty, the team comparison, the three stars, and this
// season's series. Every value is a field: gamecenter/{id}/landing for the
// header, goals, penalties and stars; gamecenter/{id}/right-rail for the
// linescore, shots by period, team stats and season series (see
// lib/nhl/reduce.js reduceGameDetail, which names each one).
//
// NOT HERE YET, on purpose: goaltending lines and the skater box (that is
// gamecenter/{id}/boxscore — batch 2, with the goalie pages that give those
// numbers a home), a shot map (play-by-play has the coordinates; it comes
// with the ice-map component, not before). Nothing here is a placeholder.
export default function Game({ id, onBack }) {
  const { data: g, error, loading } = useLampGame(id)
  if (!/^\d{10}$/.test(String(id || ''))) {
    return <EmptyState title="NO GAME PICKED" note="Open a game from Scores or the Schedule."><BackBtn onBack={onBack} /></EmptyState>
  }
  if (loading && !g) return <Loading what="the game" />
  if (!g) {
    // A 400/404 from the route is an answer, not a delay: there is no such game.
    const notAGame = error?.status === 400 || error?.status === 404
    return (
      <EmptyState title={notAGame ? 'NO SUCH GAME' : 'LIVE DATA DELAYED'} note={notAGame ? 'That is not a game id the league knows. Open one from Scores or the Schedule.' : 'We’re waiting on the league’s game feed.'} tone={notAGame ? C.text3 : C.amber}>
        <BackBtn onBack={onBack} />
      </EmptyState>
    )
  }

  const live = g.state === 'live'; const done = g.state === 'final'; const scored = live || done
  const status = g.statusLine || `${fmtDay(g.date)} · ${fmtPuckDrop(g.startUtc)} ${zoneAbbrev()}`
  const lead = (side) => scored && g[side].score != null && g[side].score > g[side === 'away' ? 'home' : 'away'].score
  const ts = g.teamStats || {}
  const stat = (k) => ts[k] || { away: null, home: null }
  const pct = (v) => (v == null || v === '' ? '—' : `${Math.round(Number(v) * 100)}%`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackBtn onBack={onBack} />
      <DelayedBanner error={error} what="the league’s game feed" />

      {/* ── header ── */}
      <header style={{ borderBottom: `1px solid ${C.border2}`, paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ color: C.ice, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em' }}>LAMP · GAME</span>
          <GameTypeChip label={g.gameTypeLabel} />
          <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{g.seasonLabel} · {fmtDay(g.date)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
          <Side team={g.away} lead={lead('away')} align="left" />
          <div style={{ textAlign: 'center', minWidth: 96 }}>
            <div style={{ font: `900 34px/1 ${NUM_FONT}`, color: C.text, letterSpacing: '-.02em' }}>
              {scored ? <><span style={{ color: lead('away') ? C.text : C.text2 }}>{g.away.score ?? '–'}</span><span style={{ color: C.text3, margin: '0 8px', fontWeight: 400 }}>–</span><span style={{ color: lead('home') ? C.text : C.text2 }}>{g.home.score ?? '–'}</span></> : <span style={{ color: C.text3, fontSize: 18 }}>@</span>}
            </div>
            <div style={{ marginTop: 6, color: live ? C.lamp : done ? C.text2 : C.text3, font: `900 10px/1.3 ${NUM_FONT}`, letterSpacing: '.06em' }}>
              {live && <LampDot />}{status}
            </div>
            {scored && g.away.sog != null && <div style={{ marginTop: 4, color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>SOG {g.away.sog}–{g.home.sog ?? '–'}</div>}
          </div>
          <Side team={g.home} lead={lead('home')} align="right" />
        </div>
        <div style={{ marginTop: 8, color: C.text3, fontSize: 11 }}>{g.venue}{g.venueLocation ? `, ${g.venueLocation}` : ''}{g.neutralSite ? ' · neutral site' : ''}</div>
      </header>

      {/* ── by period ── */}
      {(g.linescore?.length || g.shotsByPeriod?.length) ? (
        <section aria-label="By period">
          <Kicker>BY PERIOD</Kicker>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr style={thr}><th style={th}></th>{(g.linescore.length ? g.linescore : g.shotsByPeriod).map((p) => <th key={p.label} style={{ ...th, textAlign: 'center' }}>{p.label}</th>)}<th style={{ ...th, textAlign: 'center' }}>T</th></tr></thead>
              <tbody>
                {['away', 'home'].map((side) => (
                  <tr key={side} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}><b style={{ fontFamily: NUM_FONT, fontSize: 11 }}>{g[side].abbrev}</b> <span style={{ color: C.text3, fontSize: 10 }}>goals</span></td>
                    {g.linescore.map((p) => <td key={p.label} style={{ ...td, textAlign: 'center', fontFamily: NUM_FONT, fontWeight: 800 }}>{p[side] ?? '—'}</td>)}
                    <td style={{ ...td, textAlign: 'center', fontFamily: NUM_FONT, fontWeight: 900, color: C.text }}>{g.linescoreTotals?.[side] ?? g[side].score ?? '—'}</td>
                  </tr>
                ))}
                {g.shotsByPeriod?.length ? ['away', 'home'].map((side) => (
                  <tr key={`s-${side}`} style={{ borderTop: `1px solid ${C.border}`, color: C.text3 }}>
                    <td style={td}><b style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text2 }}>{g[side].abbrev}</b> <span style={{ fontSize: 10 }}>shots</span></td>
                    {g.shotsByPeriod.map((p) => <td key={p.label} style={{ ...td, textAlign: 'center', fontFamily: NUM_FONT }}>{p[side] ?? '—'}</td>)}
                    <td style={{ ...td, textAlign: 'center', fontFamily: NUM_FONT, fontWeight: 800, color: C.text2 }}>{g[side].sog ?? '—'}</td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── goals ── */}
      <section aria-label="Goals">
        <Kicker tone={C.lamp}>GOALS · {g.goals.length}</Kicker>
        {g.goals.length === 0
          ? <EmptyState title={scored ? 'NO GOALS YET' : 'PUCK NOT DROPPED'} note={scored ? 'Nobody has lit the lamp.' : `Puck drop ${fmtPuckDrop(g.startUtc)} ${zoneAbbrev()}.`} />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tbl}>
                <thead><tr style={thr}><th style={th}>PER</th><th style={th}>TIME</th><th style={th}>TEAM</th><th style={th} title="Strength">STR</th><th style={th}>SCORER</th><th className="sm-hide" style={th}>ASSISTS</th><th className="sm-hide" style={th}>SHOT</th><th style={{ ...th, textAlign: 'right' }}>SCORE</th></tr></thead>
                <tbody>
                  {g.goals.map((x, i) => (
                    <tr key={`${x.period}-${x.time}-${x.scorer.id ?? i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...td, fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{x.periodLabel}</td>
                      <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 10.5 }}>{x.time}</td>
                      <td style={{ ...td, fontFamily: NUM_FONT, fontWeight: 900, fontSize: 11 }}>{x.team}</td>
                      <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, color: x.strength === 'pp' ? C.teal : x.strength === 'sh' ? C.amber : C.text3 }}>{strengthTag(x)}</td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          {x.scorer.headshot && <img src={x.scorer.headshot} alt="" width={22} height={22} loading="lazy" style={{ width: 22, height: 22, borderRadius: '50%', background: C.bg3, objectFit: 'cover' }} />}
                          <span style={{ color: C.text, fontWeight: 700 }}>{x.scorer.first ? `${x.scorer.first} ${x.scorer.last}` : x.scorer.name}</span>
                          {x.scorer.goalsToDate != null && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>({x.scorer.goalsToDate})</span>}
                        </span>
                      </td>
                      <td className="sm-hide" style={{ ...td, color: C.text2, fontSize: 11 }}>{x.assists.length ? x.assists.map((a) => `${a.name}${a.assistsToDate != null ? ` (${a.assistsToDate})` : ''}`).join(', ') : <span style={{ color: C.text3 }}>unassisted</span>}</td>
                      <td className="sm-hide" style={{ ...td, color: C.text3, fontSize: 10.5 }}>{x.shotType || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 800, color: C.text2, whiteSpace: 'nowrap' }}>{x.awayScore != null ? `${x.awayScore}–${x.homeScore}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {/* ── team comparison ── */}
      {Object.keys(ts).length > 0 && (
        <section aria-label="Team comparison">
          <Kicker>TEAM COMPARISON</Kicker>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr style={thr}><th style={{ ...th, textAlign: 'right' }}>{g.away.abbrev}</th><th style={{ ...th, textAlign: 'center' }}></th><th style={th}>{g.home.abbrev}</th></tr></thead>
              <tbody>
                {[
                  ['Shots on goal', stat('sog').away, stat('sog').home],
                  ['Power play', stat('powerPlay').away, stat('powerPlay').home],
                  ['Power play %', pct(stat('powerPlayPctg').away), pct(stat('powerPlayPctg').home)],
                  ['Faceoffs won', pct(stat('faceoffWinningPctg').away), pct(stat('faceoffWinningPctg').home)],
                  ['Penalty minutes', stat('pim').away, stat('pim').home],
                  ['Hits', stat('hits').away, stat('hits').home],
                  ['Blocked shots', stat('blockedShots').away, stat('blockedShots').home],
                  ['Giveaways', stat('giveaways').away, stat('giveaways').home],
                  ['Takeaways', stat('takeaways').away, stat('takeaways').home],
                ].map(([label, a, h]) => (
                  <tr key={label} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 800 }}>{a ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'center', color: C.text3, fontSize: 10.5, whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={{ ...td, fontFamily: NUM_FONT, fontWeight: 800 }}>{h ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── penalties ── */}
      {g.penalties.length > 0 && (
        <section aria-label="Penalties">
          <Kicker>PENALTIES · {g.penalties.length}</Kicker>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr style={thr}><th style={th}>PER</th><th style={th}>TIME</th><th style={th}>TEAM</th><th style={th}>PLAYER</th><th style={th}>CALL</th><th className="sm-hide" style={th}>MIN</th><th className="sm-hide" style={th}>DRAWN BY</th></tr></thead>
              <tbody>
                {g.penalties.map((p, i) => (
                  <tr key={`${p.period}-${p.time}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...td, fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{p.periodLabel}</td>
                    <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 10.5 }}>{p.time}</td>
                    <td style={{ ...td, fontFamily: NUM_FONT, fontWeight: 900, fontSize: 11 }}>{p.team}</td>
                    <td style={td}>{p.by || <span style={{ color: C.text3 }}>bench</span>}{p.byNumber != null && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}> #{p.byNumber}</span>}</td>
                    <td style={{ ...td, color: C.text2 }}>{p.desc}{p.type && p.type !== 'MIN' ? <span style={{ color: C.amber, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 6 }}>{p.type}</span> : null}</td>
                    <td className="sm-hide" style={{ ...td, fontFamily: NUM_FONT, color: C.text3 }}>{p.minutes ?? '—'}</td>
                    <td className="sm-hide" style={{ ...td, color: C.text3, fontSize: 11 }}>{p.drawnBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── three stars ── */}
      {g.threeStars.length > 0 && (
        <section aria-label="Three stars">
          <Kicker tone={C.cream}>THREE STARS</Kicker>
          <table style={tbl}>
            <tbody>
              {g.threeStars.map((s) => (
                <tr key={s.star} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, width: 28, fontFamily: NUM_FONT, fontWeight: 900, color: C.cream }}>{'★'.repeat(Math.max(1, 4 - (s.star || 3)))}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      {s.headshot && <img src={s.headshot} alt="" width={22} height={22} loading="lazy" style={{ width: 22, height: 22, borderRadius: '50%', background: C.bg3, objectFit: 'cover' }} />}
                      <b>{s.name}</b><span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{s.team} · {s.pos}{s.number != null ? ` #${s.number}` : ''}</span>
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2, fontSize: 11 }}>
                    {s.pos === 'G' ? (s.savePctg != null ? `${s.savePctg.toFixed(3).replace(/^0/, '')} SV%` : '') : `${s.goals ?? 0} G · ${s.assists ?? 0} A`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── season series ── */}
      {g.seasonSeries?.length > 1 && (
        <section aria-label="Season series">
          <Kicker>SEASON SERIES</Kicker>
          <table style={tbl}>
            <tbody>
              {g.seasonSeries.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${C.border}`, opacity: m.id === g.id ? 1 : .8 }}>
                  <td style={{ ...td, fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{fmtDay(m.date)}</td>
                  <td style={{ ...td, fontFamily: NUM_FONT, fontWeight: 800 }}>{m.away.abbrev} {m.state === 'pre' ? '@' : (m.away.score ?? '–')} {m.state === 'pre' ? '' : '–'} {m.state === 'pre' ? '' : (m.home.score ?? '–')} {m.home.abbrev}</td>
                  <td style={{ ...td, textAlign: 'right', color: m.state === 'live' ? C.lamp : C.text3, font: `800 9px/1 ${NUM_FONT}` }}>{m.id === g.id ? 'THIS GAME' : m.state.toUpperCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <SourceLine>
        Source: NHL (api-web.nhle.com) gamecenter/{'{id}'}/landing and /right-rail, read server-side by /api/lamp/game, refreshed every 30 s while the game is live. Game id {g.id}.
        {g.railMissing ? ' The right-rail feed did not answer; by-period and team-comparison sections are missing until it does.' : ''}
      </SourceLine>
    </div>
  )
}

function Side({ team, lead, align }) {
  return (
    <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, minWidth: 0, justifyContent: 'flex-start' }}>
      <img src={team.logo || nhlLogo(team.abbrev)} alt="" width={44} height={44} style={{ width: 44, height: 44, flex: 'none', objectFit: 'contain' }} />
      <div style={{ textAlign: align, minWidth: 0 }}>
        <div style={{ font: `900 15px/1 ${NUM_FONT}`, color: lead ? C.text : C.text2, letterSpacing: '.04em' }}>{team.abbrev}</div>
        <div style={{ marginTop: 4, color: C.text3, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.place ? `${team.place} ${team.name}` : team.name}</div>
        {team.record && <div style={{ marginTop: 3, color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>{team.record}</div>}
      </div>
    </div>
  )
}

function BackBtn({ onBack }) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ Scores</button>
    </div>
  )
}

const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const thr = { color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '8px 8px', verticalAlign: 'middle' }
