'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampPlayers } from '../../../lib/nhl/useLamp'
import LampTable from '../LampTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills } from '../ui'

// 🏒 PLAYERS / GOALIES — the directory. Every player on every current roster
// (roster/{team}/current × 32, one route), a name box, a position filter,
// a table. Tap a row for the file. `goaliesOnly` is the GOALIES tab: the
// same directory opened on G, because a goalie's page is a different page
// (spec §10) but the way you find him is not.
//
// Long list, so it previews (site-wide rule): 25 rows until you type or
// open the rest.
const POS = [['all', 'ALL'], ['F', 'FORWARDS'], ['D', 'DEFENCE'], ['G', 'GOALIES']]
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Players({ goaliesOnly = false, onOpenPlayer, onOpenTeam }) {
  const [q, setQ] = useState('')
  const [pos, setPos] = useState(goaliesOnly ? 'G' : 'all')
  const { data, error, loading } = useLampPlayers()
  const all = data?.players || []
  const rows = useMemo(() => {
    const needle = norm(q.trim())
    return all.filter((p) => {
      if (pos === 'G' && p.pos !== 'G') return false
      if (pos === 'D' && p.pos !== 'D') return false
      if (pos === 'F' && !['C', 'L', 'R'].includes(p.pos)) return false
      if (needle && !norm(p.name).includes(needle) && !norm(p.team).includes(needle)) return false
      return true
    })
  }, [all, q, pos])
  const title = goaliesOnly ? 'Every goalie' : 'Every player'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow={`LAMP · ${goaliesOnly ? 'GOALIES' : 'PLAYERS'}`} title={title}
        note={goaliesOnly ? 'Every goalie on a current roster. Tap one for his file — starts, record, save percentage, game log.' : 'Every player on a current NHL roster, camp invites included. Type a name or a club; tap a row for the file.'}
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'SHOWN', tone: C.text2 }, { value: all.length, label: 'ON ROSTERS', tone: C.text2 }] : null} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or club…" aria-label="Search players" autoCapitalize="off" autoCorrect="off"
          style={{ flex: '1 1 220px', minWidth: 0, height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, font: `600 13px/1 system-ui, sans-serif` }} />
        {!goaliesOnly && <Pills ariaLabel="Position" value={pos} onChange={setPos} options={POS.map(([key, text]) => ({ key, text }))} />}
      </div>
      <DelayedBanner error={error} what="the league’s roster feeds" />
      {loading && !data ? <Loading what="every roster" /> : null}
      {data?.missing?.length ? <div style={{ color: C.text3, fontSize: 11 }}>Roster not answering for: {data.missing.join(', ')}. Everyone else is here.</div> : null}
      {data && rows.length === 0 && <EmptyState title="NO ONE BY THAT NAME" note="Nobody on a current roster matches. Try the surname alone, or the club’s three letters." />}
      {rows.length > 0 && (
        <>
          {/* MOONSHOT's table (2026-09-29, the LAMP walk-through): was a
              hand-built <table>; LampTable sorts, keeps the name column, shows the
              face, and previews the first rows itself (the site-wide long-list rule). */}
          <LampTable
            rows={rows.map((p) => ({ ...p, _key: p.id, _raw: p, num: p.number ?? null }))}
            columns={[
              { key: 'name', label: 'Player', w: 170, heat: false, bold: true, sticky: true },
              { key: 'pos', label: 'Pos', w: 40, heat: false, mono: true },
              { key: 'num', label: '#', w: 36, heat: false, mono: true, dim: true },
              { key: 'team', label: 'Team', w: 62, heat: false, mono: true, teamMark: 'nhl', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
            ]}
            onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).id)}
            faceOf={(r) => ({ sport: 'nhl', photo: r.headshot, name: r.name })}
            initialSort={{ key: 'name', dir: 'asc' }}
            maxHeight={620}
            maxRows={q ? 200 : 25}
            caption="Every player on a current roster. Column headers sort; each row opens his file; the team opens the club." />
        </>
      )}
      <SourceLine>Source: NHL roster/{'{team}'}/current for all 32 clubs via /api/lamp/players, cached thirty minutes. Camp rosters shrink as cuts are made.</SourceLine>
    </div>
  )
}
