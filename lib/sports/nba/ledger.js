'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../../components/PageHeader'
import CallStatusBadge from '../../../components/CallStatusBadge'
import { STATUS_WORD } from '../../callStatus'
import { C, NUM_FONT } from '../../nba/theme'
import { NBA_MARKETS } from '../../nba/legs'
import { useBucketsLedger, useBucketsBoard, useBucketsDefense, useBucketsNumerology } from '../../nba/useBuckets'
import { fromNba } from '../../numerology/adapters'
import { ord } from '../../../components/ledger/LedgerBlocks'
import { matchLanes } from '../../numerology/lanes'
import NamePatterns from '../../../components/NamePatterns'
import NbaTonight from '../../../components/tonight/NbaTonight'
import BucketsTable from '../../../components/buckets/BucketsTable'
import { LedgerHead, RoundLine, WatchStrip, AlignBox, ScorerChips, LookOutBox, NextUpBox, SpotBars } from '../../../components/ledger/LedgerBlocks'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, DayPager, RimDot, fmtDay } from '../../../components/buckets/ui'

// 🧾 THE LEDGER -- LAMP's nightly Ledger, basketball's: every player who
// cleared a market's bar that night, live while the games are on, each with
// the status his row LOCKED with before tip (CallStatusBadge, lib/callStatus
// words). A game that never locked carries no tag -- it is said, not guessed.
// THE LEDGER BLOCKS (2026-10-03): under the table, the same frame LAMP, TUDDY
// and MOONSHOT draw their night in (components/ledger/LedgerBlocks.js): the
// calls that cleared out of the calls written (one per team in each locked
// game), and who cleared as chips with his club's logo.
// PARITY (2026-10-05): + the look-out's defences (/api/buckets/defense: what each
// club playing that night allows of the market's stat, ESPN byteam), name echoes
// over who cleared, the calls still to come (PTS board CALLED rows whose game
// isn't final and who haven't cleared), and who cleared by position (the ESPN
// box's own position, G / F / C); and who cleared on a numerology lane that matched the date
// (/api/buckets/numerology: ESPN roster jersey + birth date); round numbers (a clearer whose
// season points crossed a multiple of 500, from his game log) and who needs what (the night's
// untipped board players one PTS-bar night from the next 500, on the league's season totals).
const MK = ['pts', 'reb', 'ast', '3pm', 'pra']
const ORDER = { called: 0, board: 1, off: 2 }
// the defence stat each market's look-out reads (PRA: points allowed, its biggest part)
const DEF_KEY = { pts: 'oppPts', reb: 'oppReb', ast: 'oppAst', '3pm': 'oppTpm', pra: 'oppPts' }
const DEF_WORD = { oppPts: 'points', oppReb: 'rebounds', oppAst: 'assists', oppTpm: 'threes' }
// ESPN writes G / F / C, sometimes PG / SF / G-F: the first listed, to its family
const posFamily = (p) => { const s = String(p || '').toUpperCase().split(/[-/ ]/)[0]; return /G$/.test(s) ? 'G' : /F$/.test(s) ? 'F' : s === 'C' ? 'C' : null }
const POS = [['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centres']]

export function useNbaLedger({ date, setDate, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useBucketsLedger(date)
  // the PTS board Home reads (same URL; polls only while a game is live) for the TONIGHT strip
  const ptsBoard = useBucketsBoard(date, 'pts')
  const [m, setM] = useState('pts')
  const rows = useMemo(() => (data?.rows || []).filter((r) => r.market === m)
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || b.value - a.value)
    .map((r) => ({ ...r, _id: `${r.gameId}-${r.playerId}-${r.market}` })), [data, m])
  const cap = data?.capture?.[m]
  const unit = NBA_MARKETS[m].label.split(' ')[0]
  const locked = (data?.lockedGames || []).length
  const calledIn = rows.filter((r) => r.status === 'called')
  const live = (data?.games || []).some((g) => g.state === 'live')
  // 👀 THE LOOK-OUT: that night's defences that allow the most of this market's stat
  const def = useBucketsDefense(date)
  const dk = DEF_KEY[m]
  const soft = useMemo(() => {
    const d = def.data
    if (!d?.teams?.length) return []
    const opp = new Map()
    for (const g of d.games || []) { if (g.home?.abbrev && g.away?.abbrev) { opp.set(g.home.abbrev, g.away.abbrev); opp.set(g.away.abbrev, g.home.abbrev) } }
    return d.teams.filter((t) => opp.has(t.abbrev) && t[dk] != null).sort((a, b) => (a.ranks?.[dk] ?? 99) - (b.ranks?.[dk] ?? 99)).slice(0, 5)
      .map((t) => ({ ...t, vs: opp.get(t.abbrev), rank: t.ranks?.[dk] ?? null }))
  }, [def.data, dk])
  // 🔮 STILL TO COME: the PTS board's CALLED players whose game isn't final and who haven't cleared PTS
  const ptsCleared = useMemo(() => new Set((data?.rows || []).filter((r) => r.market === 'pts').map((r) => `${r.gameId}|${r.playerId}`)), [data])
  const pending = useMemo(() => {
    const b = ptsBoard.data
    const gs = new Map((b?.games || []).map((g) => [String(g.id), g]))
    return (b?.rows || []).filter((r) => r.status === 'called' && gs.get(String(r.gameId))?.state !== 'final' && !ptsCleared.has(`${r.gameId}|${r.playerId}`))
      .map((r) => ({ ...r, g: gs.get(String(r.gameId)) || null }))
  }, [ptsBoard.data, ptsCleared])
  // 🧲 LINING UP: each clearer's jersey / birthday / name lanes against the night's date
  // (Fibonacci lanes aren't about the day -- TUDDY's 09-28 rule)
  const num = useBucketsNumerology(date)
  const lines = useMemo(() => {
    const by = new Map((num.data?.all || []).map((r) => [String(r.id), r]))
    const day = num.data?.date || data?.date
    const seen = new Set()
    return rows.filter((r) => { const k = String(r.playerId); if (seen.has(k)) return false; seen.add(k); return true }).map((r) => {
      const a = fromNba(by.get(String(r.playerId)))
      const m = a && day ? matchLanes(a, { date: day }) : []
      const lanes = [...new Set(m.map((x) => x.label))].filter((l) => !/fibonacci/i.test(l))
      return lanes.length ? { ...r, chips: lanes } : null
    }).filter(Boolean)
  }, [num.data, rows, data])
  // 🎯 ROUND NUMBER + WHO NEEDS WHAT (/api/buckets/ledger round / nearMark)
  const rounds = data?.round || []
  const mark = data?.mark || 500
  const needs = useMemo(() => {
    const near = data?.nearMark
    const b = ptsBoard.data
    if (!near || !b) return []
    const gs = new Map((b.games || []).map((g) => [String(g.id), g]))
    const seen = new Set()
    return (b.rows || []).filter((r) => { const k = String(r.playerId); if (seen.has(k) || near[k] == null || gs.get(String(r.gameId))?.state !== 'pre') return false; seen.add(k); return true })
      .map((r) => { const now = near[String(r.playerId)]; return { ...r, now, next: (Math.floor(now / mark) + 1) * mark } })
      .sort((a, b2) => (a.next - a.now) - (b2.next - b2.now) || b2.now - a.now)
  }, [data, ptsBoard.data, mark])
  const needsWhy = !data ? null : data.nearWhy === 'stale' ? 'The regular season has no points on file yet -- last season\'s totals don\'t carry over.'
    : data.nearWhy === 'past' ? 'Who needs what is a before-tip read: it shows on the current night only.'
      : data.nearWhy === 'failed' ? 'Season point totals didn\'t load.' : null
  const byPos = POS.map(([k]) => rows.filter((r) => posFamily(r.pos) === k).length)
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'opp', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'value', label: NBA_MARKETS[m].label.split(' ')[0], group: 'The night', w: 54, mono: true, primary: true, heat: false, fmt: (v) => <b style={{ color: C.rim }}>{v}</b> },
    { key: 'status', label: 'Locked as', group: 'The night', w: 150, heat: false, statusCol: true, fmt: (v, r) => (v ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CallStatusBadge status={v} accent={C.purple} />{r.role ? <b style={{ fontSize: 10, color: C.purple }}>{r.role}</b> : null}</span> : <span style={{ fontSize: 11, color: C.text3 }}>game not locked</span>) },
    { key: 'state', label: 'Game', group: 'The night', w: 90, heat: false, mono: true, dim: true, link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null), fmt: (v, r) => (v === 'live' ? <span style={{ color: C.rim }}><RimDot size={6} />{r.detail}</span> : 'FINAL') },
  ]
  // THE PAGE, AS DATA (BATCH-ONE-SITE step 1): BUCKETS' pieces in the shared page's slots --
  // the day pager + market pills (picker), the banners / table (lead), the frame only once
  // somebody cleared the bar, the source line (footer).
  return {
    headNode: (
      <PageHeader eyebrow={`BUCKETS · THE LEDGER · ${NBA_MARKETS[m].label}`} title={data?.date ? fmtDay(data.date) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every player who cleared the bar that night, live while the games are on, with the status his row locked with before tip."
        stats={cap ? [{ value: rows.length, label: 'CLEARED', tone: C.text2 },   // every row that cleared; cap.total counts locked games only (said 0 on an unlocked night)
 { value: cap.called, label: STATUS_WORD.called, tone: C.purple }, { value: cap.board, label: 'ON BOARD', tone: C.text2 }] : null} />
    ),
    tonight: <NbaTonight board={ptsBoard.data} date={date} onOpenPlayer={onOpenPlayer} />,
    picker: (<>
      <DayPager shown={data?.date || date} date={date} setDate={setDate} disabled={loading} />
      <Pills ariaLabel="Market" value={m} onChange={setM} options={MK.map((k) => ({ key: k, text: NBA_MARKETS[k].label }))} />
    </>),
    lead: (<>
        <DelayedBanner error={error} what="the box scores" />
        {loading && !data ? <Loading what="the night’s box scores" /> : null}
        {data && !data.games.length && <EmptyState title="NO GAMES THAT DAY" note="Page a day." />}
        {data && data.games.length > 0 && !data.games.some((g) => g.state !== 'pre') && <EmptyState title="NOTHING TIPPED YET" note="The ledger fills as the games are played -- live, then final." />}
        {data && data.games.some((g) => g.state !== 'pre') && !rows.length && <EmptyState title={`NOBODY AT ${NBA_MARKETS[m].label} YET`} note="Check another market, or come back as the games go." />}
        {cap?.total > 0 && <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>Of {cap.total} who cleared it in locked games: <b style={{ color: C.purple }}>{cap.called} {STATUS_WORD.called}</b> · {cap.board} on the board · {cap.off} not on the board.</p>}
        {rows.length > 0 && <BucketsTable rows={rows} columns={columns} statusOf={(r) => r.status} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
        heatMode="none" maxHeight={620} maxRows={rows.length} caption="Who cleared the bar, called first. Each row opens that player; the game column opens the game." />}
    </>),
    // the frame once somebody cleared -- or, before then, when the look-out or the calls still to come have something
    frame: rows.length > 0 || soft.length > 0 || pending.length > 0 ? { accent: C.purple, header: <LedgerHead title="🧾 Bucket ledger" count={rows.length} countWord={`cleared ${NBA_MARKETS[m].label}`} note={live ? 'builds as the games play' : (data?.games || []).some((g) => g.state !== 'pre') ? 'the finals' : 'before tip'} accent={C.purple} /> } : null,
    sections: {
      round: (<RoundLine label="Round number tonight:" accent={C.purple}
          items={rounds.map((r) => ({ key: `${r.gameId}|${r.playerId}`, name: r.name, num: `${r.mark.toLocaleString()} points (${r.before.toLocaleString()} → ${(r.before + r.tonight).toLocaleString()})`, onClick: () => onOpenPlayer?.(r.playerId) }))} />),
      watch: (<WatchStrip color={C.purple} label="The calls:" hits={calledIn.length} watched={data?.callsMade?.[m] ?? 0}
            sentence={`cleared ${NBA_MARKETS[m].label} -- ${data?.callsMade?.[m] ?? 0} call${(data?.callsMade?.[m] ?? 0) === 1 ? '' : 's'} written before tip across the ${locked} locked game${locked === 1 ? '' : 's'}.`}>
            {calledIn.map((r) => <span key={r._id}>{' · '}<b onClick={() => onOpenPlayer?.(r.playerId)} style={{ color: C.text, cursor: 'pointer' }}>{r.name}</b><span style={{ color: C.text3, fontFamily: NUM_FONT }}> {r.value} {unit}</span></span>)}
          </WatchStrip>),
      align: (<AlignBox accent={C.purple} preview={8} title="🧲 Lining up with the date" sub={`${lines.length} of tonight's ${NBA_MARKETS[m].label} clearers on a numerology lane that matched the date`}
          chips={lines.map((l) => ({ key: l._id, name: l.name, tags: l.chips.map((c) => ({ k: c, label: c })), onClick: () => onOpenPlayer?.(l.playerId) }))}
          foot="Overlap, not evidence. A night of big lines spread over jersey numbers, birthdays and name numbers will line up with the date by arithmetic alone -- the trend made visible, never a reason to chase one." />),
      lookout: (<>
        <LookOutBox accent={C.purple} title="👀 The look-out — before it happens" tag="lookups, not predictions"
          rows={[{ key: 'def', label: 'Defences to watch', hint: `most ${DEF_WORD[dk]} allowed`,
            hintTitle: `That night's defences that allow the most ${DEF_WORD[dk]} a game (ESPN, ${def.data?.seasonLabel || 'this season'}${def.data?.stale ? ' -- last season, until this one has games' : ''}). Rank 1 of 30 = allows the most. A lookup, not a prediction.`,
            chips: soft.map((t) => ({ key: t.abbrev, name: t.abbrev, small: `vs ${t.vs}`, em: `#${t.rank}`, hot: t.rank != null && t.rank <= 3, title: `${t.name}: ${Number(t[dk]).toFixed(1)} ${DEF_WORD[dk]} allowed a game, #${t.rank} of 30${def.data?.stale ? ` (${def.data.seasonLabel})` : ''}`, onClick: onOpenTeam ? () => onOpenTeam(t.abbrev) : null })) },
            { key: 'needs', label: 'Who needs what', hint: `one ${NBA_MARKETS.pts.label} night from the next ${mark}`,
              hintTitle: `A player whose game hasn't tipped, within ${NBA_MARKETS.pts.bar} points of the next multiple of ${mark} season points (ESPN's season totals). A counting fact, not a reason to expect a big night.`,
              chips: needs.slice(0, 12).map((r) => ({ key: `n${r.playerId}`, name: r.name, small: r.team, smallTeam: r.team, em: `${r.now.toLocaleString()}→${r.next.toLocaleString()}`, onClick: () => onOpenPlayer?.(r.playerId) })) }]} />
        {!needs.length && needsWhy && (data?.games || []).length > 0 && <div style={{ fontSize: 11, color: C.text3, margin: '-4px 0 9px' }}>{needsWhy}</div>}
      </>),
      names: (<NamePatterns homers={rows.map((r) => ({ name: r.name }))} population={(ptsBoard.data?.rows || []).map((r) => ({ name: r.name }))} sport="nba" />),
      nextUp: (<NextUpBox title="🔮 Called, still to come" color={C.purple}
          rows={pending.map((r) => ({ key: `${r.gameId}|${r.playerId}`, when: r.g?.state === 'live' ? 'now' : 'later', name: r.name,
            chips: [r.g ? { label: `${r.g.away?.abbrev}@${r.g.home?.abbrev}`, onClick: onOpenGame ? () => onOpenGame(r.gameId) : null } : r.team, `BUCKETS ${Math.round(r.score ?? 0)}`], title: `Called for ${NBA_MARKETS.pts.label}${r.role ? ` (${r.role})` : ''}`, onClick: () => onOpenPlayer?.(r.playerId) }))}
          about={`The players the PTS board called, whose game isn't final and who haven't reached ${NBA_MARKETS.pts.bar} yet. ⚡ live, ⏳ still to come. The call was locked before tip.`} />),
      spots: (<SpotBars accent={C.purple} title={`Cleared ${NBA_MARKETS[m].label}, by position`} bars={POS.map(([k, w], i) => ({ key: k, label: k, value: byPos[i], title: `${byPos[i]} ${w.toLowerCase()} cleared ${NBA_MARKETS[m].label}` }))}
          foot={rows.length ? <>{rows.length} cleared. One night is a picture, not a finding.</> : null} />),
      scorers: (<ScorerChips sport="nba" accent={C.purple} preview={12} cards={rows.map((r) => ({
            key: r._id, icon: '🏀', team: r.team, name: r.name, milestone: r.status === 'called', numHot: r.status === 'called',
            num: `${r.value} ${unit}`, spot: r.status === 'called' || r.status === 'board' ? STATUS_WORD[r.status] : null, onClick: () => onOpenPlayer?.(r.playerId),
            title: `${r.name} (${r.team}) -- ${r.value} ${unit} vs ${r.opp}${r.status ? ` · locked ${STATUS_WORD[r.status] || STATUS_WORD.off}` : ' · game not locked'}`,
          }))} />),
    },
    first: { C, numFont: NUM_FONT, accent: C.purple, sport: 'nba', day: data?.date || date, onOpenGame: onOpenGame && ((id) => onOpenGame(id)),
      emptyWhy: 'No regular-season first basket on file in the last few days.', onOpenPlayer: (id) => onOpenPlayer?.(id) },
    footer: (<SourceLine>Box scores: ESPN game summaries. Tags: buckets_log rows as locked before tip (/api/buckets/ledger).</SourceLine>),
  }
}
