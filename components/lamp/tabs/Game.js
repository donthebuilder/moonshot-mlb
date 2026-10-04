'use client'
import { useTeamNav } from '../../../lib/teamNav'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampGame } from '../../../lib/nhl/useLamp'
import { nhlLogo, nhlTeam } from '../../../lib/nhl/teams'
import { strengthTag } from '../ScoreTable'
import LampTable from '../LampTable'
import Tap from '../../Tap'
import SiteTeamMark from '../../TeamMark'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, LampDot, GoalLabel, fmtDay, fmtPuckDrop, zoneAbbrev } from '../ui'

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
export default function Game({ id, onBack, onOpenPlayer = null, onOpenTeam = null, onOpenGame = null, backLabel = 'Scores' }) {
  const { data: g, error, loading } = useLampGame(id)
  if (!/^\d{10}$/.test(String(id || ''))) {
    return <EmptyState title="NO GAME PICKED" note="Open a game from Scores or the Schedule."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  }
  if (loading && !g) return <Loading what="the game" />
  if (!g) {
    // A 400/404 from the route is an answer, not a delay: there is no such game.
    const notAGame = error?.status === 400 || error?.status === 404
    return (
      <EmptyState title={notAGame ? 'NO SUCH GAME' : 'LIVE DATA DELAYED'} note={notAGame ? 'That is not a game id the league knows. Open one from Scores or the Schedule.' : 'We’re waiting on the league’s game feed.'} tone={notAGame ? C.text3 : C.amber}>
        <BackBtn onBack={onBack} label={backLabel} />
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
      <BackBtn onBack={onBack} label={backLabel} />
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
          {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b; Donovan:
              "convert them all to the new sortable sheet") -- every table on
              this page. Each opens in the game's own order. */}
          {(() => {
            const per = g.linescore.length ? g.linescore : g.shotsByPeriod
            const rows = [
              ...['away', 'home'].map((side) => ({ _key: `g-${side}`, who: g[side].abbrev, what: 'goals', ...Object.fromEntries(g.linescore.map((p) => [`p_${p.label}`, p[side]])), total: g.linescoreTotals?.[side] ?? g[side].score })),
              ...(g.shotsByPeriod?.length ? ['away', 'home'].map((side) => ({ _key: `s-${side}`, who: g[side].abbrev, what: 'shots', dim: true, ...Object.fromEntries(g.shotsByPeriod.map((p) => [`p_${p.label}`, p[side]])), total: g[side].sog })) : []),
            ]
            return (
              <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption="Goals and shots by period"
                rows={rows} columns={[
                  { key: 'who', label: 'Club', heat: false, sticky: true, w: 96, link: (r) => (onOpenTeam ? () => onOpenTeam(r.who) : null), fmt: (v, r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><SiteTeamMark sport="nhl" abbr={v} variant="logo" px={16} /><b style={{ fontFamily: NUM_FONT, fontSize: 11, color: r.dim ? C.text2 : C.text }}>{v}</b><span style={{ color: C.text3, fontSize: 10 }}>{r.what}</span></span> },
                  ...per.map((p) => ({ key: `p_${p.label}`, label: p.label, w: 34, fmt: (v) => v ?? '—', tone: (_, r) => ({ color: r.dim ? C.text3 : C.text, weight: r.dim ? 500 : 800 }) })),
                  { key: 'total', label: 'T', w: 36, fmt: (v) => v ?? '—', tone: (_, r) => ({ color: r.dim ? C.text2 : C.text, weight: 900 }) },
                ]} />
            )
          })()}
        </section>
      ) : null}

      {/* ── goals ── */}
      <section aria-label="Goals">
        <Kicker tone={C.lamp}>GOALS · {g.goals.length}</Kicker>
        {g.goals.length === 0
          ? <EmptyState title={scored ? 'NO GOALS YET' : 'PUCK NOT DROPPED'} note={scored ? 'Nobody has lit the lamp.' : `Puck drop ${fmtPuckDrop(g.startUtc)} ${zoneAbbrev()}.`} />
          : (
            <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption="Every goal, in order"
              rows={g.goals.map((x, i) => ({ ...x, _key: `${x.period}-${x.time}-${x.scorer.id ?? i}`, seq: i, name: x.scorer.first ? `${x.scorer.first} ${x.scorer.last}` : x.scorer.name, assistTxt: x.assists.length ? x.assists.map((a) => `${a.name}${a.assistsToDate != null ? ` (${a.assistsToDate})` : ''}`).join(', ') : '' }))}
              columns={[
                { key: 'seq', label: 'Per', w: 40, fmt: (_, x) => x.periodLabel, tone: () => ({ color: C.text3 }) },
                { key: 'time', label: 'Time', heat: false, mono: true, w: 48 },
                { key: 'team', label: 'Team', heat: false, w: 54, link: (x) => (onOpenTeam && x.team ? () => onOpenTeam(x.team) : null) },
                { key: 'strength', label: 'Str', heat: false, w: 40, title: 'Strength', fmt: (_, x) => <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, color: x.strength === 'pp' ? C.teal : x.strength === 'sh' ? C.amber : C.text3 }}>{strengthTag(x)}</span> },
                { key: 'name', label: 'Scorer', heat: false, sticky: true, w: 190, link: (x) => (x.scorer.id && onOpenPlayer ? () => onOpenPlayer(x.scorer.id) : null),
                  fmt: (v, x) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 7, rowGap: 3 }}>
                      {x.scorer.headshot && <img src={x.scorer.headshot} alt="" width={20} height={20} loading="lazy" style={{ width: 20, height: 20, borderRadius: '50%', background: C.bg3, objectFit: 'cover' }} />}
                      <span style={{ color: C.text, fontWeight: 700 }}>{v}</span>
                      {x.scorer.goalsToDate != null && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>({x.scorer.goalsToDate})</span>}
                      <GoalLabel label={x.label} />
                    </span>) },
                { key: 'assistTxt', label: 'Assists', heat: false, w: 200, fmt: (v, x) => (x.assists.length
                  ? <span>{x.assists.map((a, k) => <span key={a.id ?? k}>{k ? ', ' : ''}{a.id && onOpenPlayer ? <Tap onClick={() => onOpenPlayer(a.id)}>{a.name}</Tap> : a.name}{a.assistsToDate != null ? ` (${a.assistsToDate})` : ''}</span>)}</span>
                  : <span style={{ color: C.text3 }}>unassisted</span>) },
                { key: 'shotType', label: 'Shot', heat: false, w: 64, fmt: (v) => v || '—' },
                { key: 'awayScore', label: 'Score', heat: false, numeric: false, w: 52, fmt: (_, x) => (x.awayScore != null ? `${x.awayScore}–${x.homeScore}` : '') },
              ]} />
          )}
      </section>

      {/* ── team comparison ── */}
      {Object.keys(ts).length > 0 && (
        <section aria-label="Team comparison">
          <Kicker>TEAM COMPARISON</Kicker>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption={`${g.away.abbrev} and ${g.home.abbrev}, side by side`}
            rows={[
              ['Shots on goal', stat('sog').away, stat('sog').home],
              ['Power play', stat('powerPlay').away, stat('powerPlay').home],
              ['Power play %', pct(stat('powerPlayPctg').away), pct(stat('powerPlayPctg').home)],
              ['Faceoffs won', pct(stat('faceoffWinningPctg').away), pct(stat('faceoffWinningPctg').home)],
              ['Penalty minutes', stat('pim').away, stat('pim').home],
              ['Hits', stat('hits').away, stat('hits').home],
              ['Blocked shots', stat('blockedShots').away, stat('blockedShots').home],
              ['Giveaways', stat('giveaways').away, stat('giveaways').home],
              ['Takeaways', stat('takeaways').away, stat('takeaways').home],
            ].map(([label, a, h]) => ({ _key: label, label, a: a ?? '—', h: h ?? '—' }))}
            columns={[
              { key: 'label', label: 'Stat', heat: false, sticky: true, w: 130 },
              { key: 'a', label: g.away.abbrev, heat: false, numeric: false, mono: true, w: 70, fmt: (v) => <b>{v}</b> },
              { key: 'h', label: g.home.abbrev, heat: false, numeric: false, mono: true, w: 70, fmt: (v) => <b>{v}</b> },
            ]} />
        </section>
      )}

      {/* ── the box (2026-10-04, audit 05 #10: goalie lines and the skater box
          were missing, though the route already read the boxscore) ── */}
      {g.box && (g.box.away.goalies.length + g.box.home.goalies.length) > 0 && (
        <section aria-label="Goalies">
          <Kicker>GOALIES</Kicker>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption="Each goalie who played"
            rows={[...g.box.away.goalies, ...g.box.home.goalies].map((x) => ({ ...x, _key: `g-${x.id}`, svWord: x.sa != null ? `${x.saves ?? '—'}/${x.sa}` : '—' }))}
            columns={[
              { key: 'name', label: 'Goalie', heat: false, sticky: true, w: 150, link: (x) => (x.id && onOpenPlayer ? () => onOpenPlayer(x.id) : null) },
              { key: 'team', label: 'Team', heat: false, w: 44, teamMark: 'nhl' },
              { key: 'svWord', label: 'Saves', heat: false, numeric: false, mono: true, w: 64 },
              { key: 'svPct', label: 'SV%', w: 56, fmt: (v) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '—') },
              { key: 'ga', label: 'GA', w: 40, dp: 0 },
              { key: 'toi', label: 'TOI', heat: false, numeric: false, mono: true, w: 56 },
              { key: 'decision', label: 'Dec', heat: false, numeric: false, w: 44, fmt: (v) => v || '—' },
            ]} />
        </section>
      )}
      {g.box && ['away', 'home'].map((sd) => g.box[sd].skaters.length > 0 && (
        <section key={sd} aria-label={`${g.box[sd].abbrev} skaters`}>
          <Kicker>{g.box[sd].abbrev} SKATERS</Kicker>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={8} caption={`${g.box[sd].abbrev}'s skaters in this game`}
            rows={[...g.box[sd].skaters].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0) || (b.sog ?? 0) - (a.sog ?? 0)).map((x) => ({ ...x, _key: `s-${x.id}` }))}
            columns={[
              { key: 'name', label: 'Skater', heat: false, sticky: true, w: 140, link: (x) => (x.id && onOpenPlayer ? () => onOpenPlayer(x.id) : null) },
              { key: 'pos', label: 'Pos', heat: false, w: 36 },
              { key: 'g', label: 'G', w: 34, dp: 0 },
              { key: 'a', label: 'A', w: 34, dp: 0 },
              { key: 'pts', label: 'PTS', w: 40, dp: 0 },
              { key: 'sog', label: 'SOG', w: 40, dp: 0 },
              { key: 'plusMinus', label: '+/-', w: 40, dp: 0 },
              { key: 'toi', label: 'TOI', heat: false, numeric: false, mono: true, w: 56 },
              { key: 'hits', label: 'HIT', w: 38, dp: 0 },
              { key: 'blk', label: 'BLK', w: 38, dp: 0 },
            ]} />
        </section>
      ))}

      {/* ── penalties ── */}
      {g.penalties.length > 0 && (
        <section aria-label="Penalties">
          <Kicker>PENALTIES · {g.penalties.length}</Kicker>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption="Every penalty, in order"
            rows={g.penalties.map((x, i) => ({ ...x, _key: `${x.period}-${x.time}-${i}`, seq: i, who: x.by || 'bench' }))}
            columns={[
              { key: 'seq', label: 'Per', w: 40, fmt: (_, x) => x.periodLabel, tone: () => ({ color: C.text3 }) },
              { key: 'time', label: 'Time', heat: false, mono: true, w: 48 },
              { key: 'team', label: 'Team', heat: false, w: 54, link: (x) => (onOpenTeam && x.team ? () => onOpenTeam(x.team) : null) },
              { key: 'who', label: 'Player', heat: false, sticky: true, w: 150, link: (x) => (x.byId && onOpenPlayer ? () => onOpenPlayer(x.byId) : null),
                fmt: (v, x) => <span>{x.by ? v : <span style={{ color: C.text3 }}>bench{x.servedBy ? ` (served by ${x.servedBy})` : ''}</span>}{x.byNumber != null && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}> #{x.byNumber}</span>}</span> },
              { key: 'desc', label: 'Call', heat: false, w: 170, fmt: (v, x) => <span style={{ color: C.text2 }}>{v}{x.type && x.type !== 'MIN' ? <span style={{ color: C.amber, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 6 }}>{x.type}</span> : null}</span> },
              { key: 'minutes', label: 'Min', w: 40, fmt: (v) => v ?? '—', tone: () => ({ color: C.text3 }) },
              { key: 'drawnBy', label: 'Drawn by', heat: false, w: 130, link: (x) => (x.drawnById && onOpenPlayer ? () => onOpenPlayer(x.drawnById) : null), fmt: (v) => v || '—' },
            ]} />
        </section>
      )}

      {/* ── three stars ── */}
      {g.threeStars.length > 0 && (
        <section aria-label="Three stars">
          <Kicker tone={C.cream}>THREE STARS</Kicker>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption="The three stars"
            rows={g.threeStars.map((x) => ({ ...x, _key: x.star }))}
            columns={[
              { key: 'star', label: '★', w: 40, fmt: (v) => '★'.repeat(Math.max(1, 4 - (v || 3))), tone: () => ({ color: C.cream, weight: 900 }) },
              { key: 'name', label: 'Player', heat: false, sticky: true, w: 210, link: (x) => (x.id && onOpenPlayer ? () => onOpenPlayer(x.id) : null),
                fmt: (v, x) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {x.headshot && <img src={x.headshot} alt="" width={20} height={20} loading="lazy" style={{ width: 20, height: 20, borderRadius: '50%', background: C.bg3, objectFit: 'cover' }} />}
                    <b>{v}</b><span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{x.team} · {x.pos}{x.number != null ? ` #${x.number}` : ''}</span>
                  </span>) },
              { key: 'line', label: 'Line', heat: false, numeric: false, w: 110,
                fmt: (_, x) => (x.pos === 'G' ? (x.savePctg != null ? `${x.savePctg.toFixed(3).replace(/^0/, '')} SV%` : '') : `${x.goals ?? 0} G · ${x.assists ?? 0} A`) },
            ]} />
        </section>
      )}

      {/* ── season series ── */}
      {g.seasonSeries?.length > 1 && (
        <section aria-label="Season series">
          <Kicker>SEASON SERIES</Kicker>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption="The season series"
            rows={g.seasonSeries.map((m) => ({ ...m, _key: m.id }))}
            rowEdge={(m) => (m.id === g.id ? C.ice : null)}
            columns={[
              { key: 'date', label: 'Date', heat: false, sticky: true, w: 90, fmt: (v) => fmtDay(v) },
              { key: 'game', label: 'Game', heat: false, numeric: false, w: 140, link: (m) => (onOpenGame && m.id !== g.id ? () => onOpenGame(m.id) : null), fmt: (_, m) => <b style={{ fontFamily: NUM_FONT }}>{m.away.abbrev} {m.state === 'pre' ? '@' : (m.away.score ?? '–')} {m.state === 'pre' ? '' : '–'} {m.state === 'pre' ? '' : (m.home.score ?? '–')} {m.home.abbrev}</b> },
              { key: 'state', label: 'State', heat: false, w: 80, fmt: (v, m) => <span style={{ color: m.state === 'live' ? C.lamp : C.text3, font: `800 9px/1 ${NUM_FONT}` }}>{m.id === g.id ? 'THIS GAME' : String(v).toUpperCase()}</span> },
            ]} />
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
  // the club opens its page (0g A5)
  const teamNav = useTeamNav()
  return (
    <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, minWidth: 0, justifyContent: 'flex-start' }}>
      <img src={team.logo || nhlLogo(team.abbrev)} alt="" width={44} height={44} style={{ width: 44, height: 44, flex: 'none', objectFit: 'contain' }} />
      <div style={{ textAlign: align, minWidth: 0 }}>
        <div style={{ font: `900 15px/1 ${NUM_FONT}`, color: lead ? C.text : C.text2, letterSpacing: '.04em' }}>{teamNav ? <Tap onClick={() => teamNav(team.abbrev)}>{team.abbrev}</Tap> : team.abbrev}</div>
        <div style={{ marginTop: 4, color: C.text3, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{/* the league's placeName for the NY clubs is 'NY Islanders' -> 'NY Islanders Islanders' (audit 05 #15) */}{nhlTeam(team.abbrev)?.name || (team.place && !String(team.place).endsWith(team.name) ? `${team.place} ${team.name}` : team.place || team.name)}</div>
        {team.record && <div style={{ marginTop: 3, color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>{team.record}</div>}
      </div>
    </div>
  )
}

// Labelled with where it goes (the trail in LampDashboard), never a bare
// "Back" that lands somewhere else.
function BackBtn({ onBack, label }) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ {label}</button>
    </div>
  )
}

