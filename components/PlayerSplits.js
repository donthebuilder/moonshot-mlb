'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, obj } from '../lib/player'
import { splitsUrl } from '../lib/dataSource'
import DenseTable from './DenseTable'

// Situational splits — day/night, home/away, day of week, win/loss.
//
// player_splits.py has been writing one of these per hitter since the Streamlit
// migration and publish_data.sh has been copying current/splits/ to the data
// branch the whole time. 297 files on the live slate. Nothing on this site read
// a single one of them until this tab existed.
//
// A caution that belongs on the page rather than in a comment: these are the
// splits people most often over-read. A season divides into day/night at maybe
// 380 and 250 plate appearances, which is thin but arguable; it divides into
// seven days of the week at roughly 60 PA each, which is not. A .263 Monday
// against a .125 Tuesday is one extra hit a week. The rows carry their PA and
// anything under 100 is called out, because the shape of this data invites
// exactly the wrong conclusion.

const GROUPS = [
  { key: 'day_night',   label: 'Day / Night',  order: ['Day', 'Night'] },
  { key: 'home_away',   label: 'Home / Away',  order: ['Home', 'Away'] },
  { key: 'win_loss',    label: 'Team won / lost', order: ['Win', 'Loss', 'W', 'L'] },
  { key: 'day_of_week', label: 'Day of week',  order: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
]

const THIN_PA = 100

export default function PlayerSplits({ player, slateMode }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')

  const pid = player?.player_id || player?.id

  useEffect(() => {
    if (!pid) return
    let alive = true
    setState('loading'); setData(null)
    fetch(splitsUrl(pid, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState(j ? 'done' : 'missing') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pid, slateMode])

  const tables = useMemo(() => GROUPS.map((g) => {
    const src = obj(data?.[g.key])
    const keys = Object.keys(src)
    if (!keys.length) return null
    keys.sort((a, b) => {
      const ia = g.order.indexOf(a), ib = g.order.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    return {
      ...g,
      rows: keys.map((k) => {
        const s = obj(src[k])
        return {
          _key: k,
          split: k,
          g: n(s.G, 0),
          pa: n(s.PA, 0),
          h: n(s.H, 0),
          hr: n(s.HR, 0),
          xbh: n(s.XBH, 0),
          rbi: n(s.RBI, 0),
          avg: n(s.AVG, 0),
          obp: n(s.OBP, 0),
          slg: n(s.SLG, 0),
          ops: n(s.OPS, 0),
          iso: n(s.ISO, 0),
          hrPa: n(s['HR/PA'], 0) * 100,
          kPct: n(s['K%'], 0) * 100,
        }
      }),
    }
  }).filter(Boolean), [data])

  if (!pid) return null
  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading splits…</div>
  if (state === 'missing' || state === 'error' || !tables.length) {
    return (
      <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
        No splits file published for this hitter. These come from{' '}
        <code>player_splits.py</code>, which runs inside the Today and Tomorrow workflows and can be
        skipped on a slow slate — it&apos;s set to <code>continue-on-error</code>, so a miss here means
        that step timed out rather than that anything is broken.
      </div>
    )
  }

  const thin = tables.some((t) => t.rows.some((r) => r.pa < THIN_PA))
  const cols = [
    { key: 'split', label: 'Split', heat: false, w: 78, bold: true, sticky: true },
    { key: 'g',     label: 'G',   w: 38 },
    { key: 'pa',    label: 'PA',  w: 44, title: 'The sample. Read this before any rate on the row.' },
    { key: 'avg',   label: 'AVG', w: 52, dp: 3 },
    { key: 'obp',   label: 'OBP', w: 52, dp: 3 },
    { key: 'slg',   label: 'SLG', w: 52, dp: 3 },
    { key: 'ops',   label: 'OPS', w: 54, dp: 3 },
    { key: 'iso',   label: 'ISO', w: 52, dp: 3 },
    { key: 'hr',    label: 'HR',  w: 40 },
    { key: 'hrPa',  label: 'HR/PA%', w: 56, dp: 2 },
    { key: 'xbh',   label: 'XBH', w: 42 },
    { key: 'rbi',   label: 'RBI', w: 42 },
    { key: 'kPct',  label: 'K%',  w: 46, dp: 1, invert: true,
      title: 'Inverted — a low strikeout rate is the good outcome for the hitter.' },
  ]

  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10, lineHeight: 1.6, maxWidth: 760 }}>
        {clean(data?.name, '')} · {n(data?.games_logged, 0)} games logged · {clean(data?.season, '')} season.
        {' '}Every column is shaded against its own range <b style={{ color: C.text2 }}>within each table</b>,
        so a bright cell means high for this hitter across that one split — never across splits or
        against the league. K% is inverted; everything else reads bright-is-better for the bat.
      </div>

      {tables.map((t) => {
        const thinnest = Math.min(...t.rows.map((r) => r.pa))
        return (
          <div key={t.key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{t.label}</span>
              <span style={{ fontSize: 9.5, color: thinnest < THIN_PA ? C.orange : C.text3, fontFamily: NUM_FONT }}>
                {t.rows.length} rows · thinnest {thinnest} PA
              </span>
            </div>
            <DenseTable
              rows={t.rows}
              columns={cols}
              initialSort={null}
              maxHeight={260}
              caption={
                t.key === 'day_of_week'
                  ? 'Seven ways to cut one season. Every row here is a few dozen plate appearances, which is not enough to separate any hitter from himself — a 130-point gap between two weekdays is two or three hits. This table is here because the bot publishes it, not because it should move a decision.'
                  : thinnest < THIN_PA
                    ? `The smallest row here is ${thinnest} plate appearances. Under about 100, batting average moves 30 points on three hits, so treat the gap between these rows as noise unless it is very large.`
                    : 'Both rows clear 100 plate appearances, which is enough to be worth a look — though a season split is still one season, and the gap you see is usually smaller next year.'
              }
            />
          </div>
        )
      })}

      {thin && (
        <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginTop: -4 }}>
          Situational splits are the most over-read numbers in baseball. A hitter who is &quot;better at
          night&quot; usually just faced different pitchers at night. Nothing here is park- or
          opponent-adjusted, so a home/away gap partly measures the two ballparks and not the hitter.
        </div>
      )}
    </div>
  )
}
