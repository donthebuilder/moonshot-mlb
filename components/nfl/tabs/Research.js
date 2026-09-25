'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import NflTable from '../NflTable'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import PageHeader from '../../PageHeader'
import { oppShort } from '../../../lib/nfl/oppLabel'
import { FilterBar, FilterPill, FilterSearch, FilterSelect } from '../../Filters'

// Research — every number the bot has, in one sortable table.
//
// This is the tab that's useful even when the model is wrong, which in August
// is most of the time. The boards give you an opinion; this gives you the
// evidence and lets you disagree with it. It's also the honest home for the
// NGS layer: separation, YAC-over-expected and RYOE were all tested in the
// models and all but one made them WORSE, so they don't drive a score — but
// they're real measurements and they belong in front of you.
//
// Runs on the shared DenseTable, so every improvement to the MLB table (the
// multi-sort stack, the per-column ⓘ, the heat ramps) lands here for free.

const POS_GROUPS = [
  ['ALL', null],
  ['RB', ['RB']],
  ['WR', ['WR']],
  ['TE', ['TE']],
  ['QB', ['QB']],
  ['K', ['K']],
]

// Columns where a LOW number is the good one.
const INVERT = new Set([])

export default function Research({ data, onPlayerClick }) {
  const watchlist = useNflWatchlist(data)
  const [pos, setPos] = useState('ALL')
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')
  // The same ONLY toggle Boards and Touchdowns carry (2026-09-18).
  const [onlyWatched, setOnlyWatched] = useState(false)

  const specs = data?.research_columns || []

  const teams = useMemo(
    () => [...new Set((data?.players || []).map((p) => p.team).filter(Boolean))].sort(),
    [data],
  )

  // THE TD BOARD RANK (2026-09-25). Donovan: "no dedicated place to look at
  // the boards at every single one in order" -- for both sports. This is
  // TUDDY's: every scored player, #1 to #N on the Anytime TD board, over the
  // WHOLE pool before any filter, so a filtered view shows true positions
  // and never renumbers. Ties break on player_id so the order is stable.
  const tdRankOf = useMemo(() => {
    const m = new Map()
    ;(data?.players || [])
      .filter((p) => Number.isFinite(Number(p?.scores?.TD)))
      .sort((a, b) => (Number(b.scores.TD) - Number(a.scores.TD)) || String(a.player_id).localeCompare(String(b.player_id)))
      .forEach((p, i) => { if (!m.has(p.player_id)) m.set(p.player_id, i + 1) })
    return m
  }, [data])

  const rows = useMemo(() => {
    const want = POS_GROUPS.find(([k]) => k === pos)?.[1]
    const needle = q.trim().toLowerCase()
    return (data?.players || [])
      .filter((p) => !want || want.includes(p.position))
      .filter((p) => !team || p.team === team)
      .filter((p) => !needle || `${p.name} ${p.team} ${p.opp}`.toLowerCase().includes(needle))
      .filter((p) => !onlyWatched || watchlist.isPinned(p.player_id))
      .map((p) => {
        const sc = p.scores || {}
        const td = p.components?.TD || {}
        const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
        return {
          ...p.stats,
          _p: p,
          _raw: p,
          rank: tdRankOf.get(p.player_id) ?? null,
          name: p.name,
          pos: p.position,
          team: p.team,
          opp: oppShort(p),
          // ── the model's own numbers: every market score, then the six TD
          //    components (0-100 within-slate percentiles), then the flags ──
          TDSC: num(sc.TD),
          RECYDSC: num(sc.REC_YDS), RECSC: num(sc.REC), RUYDSC: num(sc.RUSH_YDS),
          RUATSC: num(sc.RUSH_ATT), PAYDSC: num(sc.PASS_YDS), KICKSC: num(sc.KICK_PTS),
          cRz: num(td.f_rz_opp), cTot: num(td.implied_total), cTouch: num(td.f_touches),
          cXtd: num(td.f_xtd), cGl: num(td.f_gl_opp), cSnap: num(td.f_snap_pct),
          seasonTd: num(p.season_td), sinceTd: num(p.games_since_last_td),
          hiConf: p.high_confidence_td_flag ? 1 : 0,
          quest: p.questionable ? 1 : 0,
          lowS: p.low_sample ? 1 : 0,
          carry: p.carryover ? 1 : 0,
          matchup: p.coverage_mismatch_tag || '',
          watched: watchlist.isPinned(p.player_id) ? 1 : 0,
        }
      })
  }, [data, pos, team, q, onlyWatched, watchlist, tdRankOf])

  // Counts on the controls, the way Boards and Touchdowns carry them -- a
  // filter that says how many it will leave is worth more than one that
  // doesn't.
  const posOptions = useMemo(() => {
    const pool = data?.players || []
    return POS_GROUPS.map(([k, want]) => ({
      key: k,
      count: want ? pool.filter((p) => want.includes(p.position)).length : pool.length,
    }))
  }, [data])

  const teamOptions = useMemo(() => {
    const pool = data?.players || []
    const counts = {}
    for (const p of pool) if (p.team) counts[p.team] = (counts[p.team] || 0) + 1
    return [
      { key: '', label: 'All teams', count: pool.length },
      ...teams.map((t) => ({ key: t, label: t, count: counts[t] || 0 })),
    ]
  }, [data, teams])

  const columns = useMemo(() => {
    const base = [
      { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
        titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
        onAction: (row) => watchlist.toggle(row) },
      { key: 'rank', label: '#', w: 40, heat: false, mono: true, bold: true,
        fmt: (v) => (v == null ? '—' : `#${v}`),
        title: 'His position on this week\u2019s Anytime TD board, #1 first, over every scored player. Filtering hides rows; it never renumbers them. Blank means the TD market does not score his position.' },
      { key: 'name', label: 'Player', w: 150, heat: false, sticky: true },
      { key: 'pos', label: 'POS', w: 42, heat: false },
      { key: 'team', label: 'TM', w: 42, heat: false },
      { key: 'opp', label: 'OPP', w: 46, heat: false },
      // ── THE FULL COLUMN SET (2026-09-25). Donovan: every column, on every
      //    table, both sports. The model's numbers first -- the seven market
      //    scores, the six TD components, the flags -- then every published
      //    stat below. Same shape as MOONSHOT's lib/boardColumns.js. ──
      { key: 'TDSC', label: 'Anytime TD', w: 62, dp: 0, primary: true },
      { key: 'RECYDSC', label: 'Receiving yards', w: 62, dp: 0 },
      { key: 'RECSC', label: 'Receptions', w: 62, dp: 0 },
      { key: 'RUYDSC', label: 'Rushing yards', w: 62, dp: 0 },
      { key: 'RUATSC', label: 'Rushing attempts', w: 62, dp: 0 },
      { key: 'PAYDSC', label: 'Passing yards', w: 62, dp: 0 },
      { key: 'KICKSC', label: 'Kicking points', w: 62, dp: 0 },
      { key: 'cRz', label: 'RZ opp', w: 52, dp: 0 },
      { key: 'cGl', label: 'GL opp', w: 52, dp: 0 },
      { key: 'cTouch', label: 'Touches', w: 54, dp: 0 },
      { key: 'cXtd', label: 'xTD opp', w: 54, dp: 0 },
      { key: 'cSnap', label: 'Snap share', w: 58, dp: 0 },
      { key: 'cTot', label: 'Implied team total', w: 60, dp: 0 },
      { key: 'seasonTd', label: 'Season TD', w: 54, dp: 0 },
      { key: 'sinceTd', label: 'Since last TD', w: 58, dp: 0, invert: true },
      { key: 'hiConf', label: 'A+', flag: true, mark: '\u2605', w: 30, title: 'High-confidence TD flag: a TD score of 78 or better, the A+ band.' },
      { key: 'quest', label: 'Q', flag: true, mark: 'Q', w: 28, title: 'Listed as questionable on the injury report.' },
      { key: 'lowS', label: 'Thin', flag: true, mark: '\u25CB', w: 34, title: 'Low sample: the model scored him off too few games. Dimmed rows are these.' },
      { key: 'carry', label: 'Carryover', flag: true, mark: '\u21A9', w: 44 },
      { key: 'matchup', label: 'Matchup', heat: false, w: 64, dim: true, title: 'The coverage read: TARGET when the defense he faces leaks to his role, AVOID when it does not.' },
    ]
    // Only render a stat column if at least one row actually has it — an all-
    // dash column is noise, and with seven positions sharing one table most
    // columns are empty for most of them.
    const present = specs.filter((s) => rows.some((r) => Number.isFinite(r[s.key])))
    return [...base, ...present.map((s) => ({
      key: s.key,
      label: s.label,
      w: 58,
      invert: INVERT.has(s.key),
      // PRECISION COMES FROM THE PAYLOAD. DenseTable defaults to toFixed(0),
      // which is right for a homer count and catastrophic for a rate: target
      // share 0.198, xTD 0.63 and TDoE -0.01 every one rendered as "0" or
      // "1", so the whole table read as random noise. The bot declares `dp`
      // and `pct` alongside each stat because precision is a property of the
      // measurement, not of the table drawing it.
      dp: s.dp ?? 2,
      fmt: (v) => {
        const n = Number(v)
        if (!Number.isFinite(n)) return '—'
        return s.pct ? `${(n * 100).toFixed(s.dp ?? 1)}%` : n.toFixed(s.dp ?? 2)
      },
    }))]
  }, [specs, rows, watchlist])

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · THE BOARD"
        title="Every player, #1 to the bottom, every number"
        note="The whole board in order — every scored player ranked on the Anytime TD board, with every market score, the six numbers behind the TD score, and every stat the bot publishes. Sort any column; the # column brings back the board's own order. Tap a name to open his card."
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
      />
      {/* THE HOUSE RESEARCH BAR (2026-09-18). This page used to open with five
          plain buttons, a bare <input> and a bare <select> -- its own third
          idiom, against Boards' and Touchdowns' shared one. Same grammar as
          those two now: pills, then the filter bar, then the ONLY row. */}
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 2 }}>
        {posOptions.map((o) => (
          <FilterPill key={o.key} active={pos === o.key} onClick={() => setPos(o.key)} count={o.count}>
            {o.key === 'ALL' ? 'Everyone' : o.key}
          </FilterPill>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <FilterBar>
          <FilterSearch value={q} onChange={setQ} placeholder="Search player…" width={165} />
          <FilterSelect label="Team" value={team} options={teamOptions} onChange={setTeam} />
        </FilterBar>
      </div>

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Only</span>
        <FilterPill active={onlyWatched} onClick={() => setOnlyWatched(!onlyWatched)} title="Only names on your watchlist.">
          ★ Watchlist
        </FilterPill>
      </div>

      <div style={{ fontSize: 12, color: C.text3, margin: '8px 0 6px', lineHeight: 1.55 }}>
        {rows.length} player{rows.length === 1 ? '' : 's'} — in board order, every published number, sorted by whichever column you tap.
      </div>

      <NflTable
        rows={rows}
        columns={columns}
        initialSort={{ key: 'rank', dir: 'asc' }}
        maxHeight={620}
        // Every single one, in order (2026-09-25): no cap on this table.
        maxRows={Math.max(rows.length, 1)}
        onRowClick={(r) => onPlayerClick?.(r._p)}
        dimRow={(r) => r._p?.low_sample}
        caption={
          'Per-game trailing averages. In preseason these are last season\'s ' +
          'baselines — dimmed rows are low-sample and should be read as such. ' +
          'SEP, YACOE and RYOE come from Next Gen Stats; they are shown because ' +
          'they are real, not because the models lean on them — every one was ' +
          'tested and only RYOE (rush attempts) earned a weight.'
        }
      />
    </div>
  )
}
