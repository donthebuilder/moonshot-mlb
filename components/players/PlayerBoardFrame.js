'use client'
import { useEffect, useMemo, useState } from 'react'
import { TYPE } from '../../lib/theme'
import { hashParams, writeHash } from '../../lib/urlState'
import { alpha } from '../../lib/scales'
import { Empty, inputStyle } from '../ui'
import { rampColor, inkFor } from '../Heatmap'
import { useSportTheme } from '../SportTheme'
import { usePickLight, pickColorOf } from '../../lib/pickLight'
import { useSport } from '../../lib/sport'

// MOONSHOT'S PLAYERS PAGE, AS A FRAME (2026-09-30, Donovan: "the mlb players
// page is the base i like that, use those components"). components/tabs/
// PlayerBoard.js's layout lifted out so TUDDY's and LAMP's Players pages are
// the same page: search, question chips and a 🎲, the ranked list with a
// score chip on the ramp, the card inline on the right, the phone's
// master-detail (the list gets out of the way; ← brings it back), and the
// pick in the address (`player=`). MOONSHOT reads no SportTheme provider and
// draws exactly what PlayerBoard drew; the sport passes its rows, words and
// the card.
//
// rows       ranked, best first
// idOf       row -> the list key            urlIdOf  row -> the `player=` value
// nameOf     row -> name                     metaOf   row -> the small line under it
// badgesOf   row -> node after the name      scoreOf  row -> number (the chip) or null
// asks       [{ key, label, test, why }]      renderDetail(row) -> the card
// sideTop    node above the search box (TUDDY's team filter)
export default function PlayerBoardFrame({
  rows, idOf, urlIdOf, nameOf, metaOf, badgesOf = () => null, scoreOf, scoreTitle = () => undefined,
  asks = [], placeholder = 'Search a hitter…', noun = 'hitter', nounPlural = 'hitters',
  renderDetail, notice = null, listCap = 40, searchText = (r) => nameOf(r), sideTop = null,
}) {
  const { C, NUM_FONT, accent, themed } = useSportTheme()
  // ✨ The tap highlight (lib/pickLight.js) marks his row here too.
  const pick = usePickLight(useSport())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedIdRaw] = useState(null)
  const [ask, setAsk] = useState(null)

  // THE PICK IS IN THE ADDRESS (2026-09-29, nav audit): `player=<id>`.
  const setSelectedId = (id) => {
    setSelectedIdRaw(id)
    const h = hashParams()
    const row = id ? rows.find((p) => idOf(p) === id) : null
    if (row) h.set('player', String(urlIdOf(row))); else h.delete('player')
    writeHash(h, { push: Boolean(row) })
  }
  useEffect(() => {
    if (selectedId || !rows.length) return
    const want = hashParams().get('player')
    const row = want ? rows.find((p) => String(urlIdOf(p)) === String(want)) : null
    if (row) setSelectedIdRaw(idOf(row))
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    const asked = ask ? rows.filter(asks.find((a) => a.key === ask)?.test || (() => true)) : rows
    if (!q) return asked.slice(0, listCap)
    return asked.filter((p) => searchText(p).toLowerCase().includes(q)).slice(0, listCap)
  }, [rows, query, ask]) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => rows.find((p) => idOf(p) === selectedId) || null, [rows, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hooks above the early return (PlayerBoard's rules-of-hooks note). 700px
  // is where MobileCSS stacks .playerboard to one column.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  useEffect(() => {
    if (phone && selectedId) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phone, selectedId])

  if (!rows.length) return <Empty text="No players on this slate yet." />

  const shownScores = matches.map((p) => Number(scoreOf(p)) || 0)
  const sLo = Math.min(...shownScores, 0)
  const sHi = Math.max(...shownScores, 1)
  const selected = phone ? picked : (picked || matches[0] || null)
  const showList = !phone || !selected
  const showDetail = !phone || !!selected
  const tint = (a) => (themed ? alpha(accent, a) : `rgba(249,115,22,${String(a).replace(/^0/, '')})`)

  return (
    <div className="playerboard" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
      {showList && (
      <div className="playerboard-side" style={{ position: 'sticky', top: 12 }}>
        {sideTop}
        <input
          style={{ ...inputStyle(), width: '100%', marginBottom: 6 }}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          {asks.map((a) => {
            const on = ask === a.key
            return (
              <button key={a.key} onClick={() => setAsk(on ? null : a.key)} title={a.why}
                style={{
                  padding: '2px 8px', fontSize: TYPE.label, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${on ? accent : C.border}`,
                  background: on ? tint(0.12) : 'transparent',
                  color: on ? accent : C.text3, whiteSpace: 'nowrap',
                }}>{a.label}</button>
            )
          })}
          <button
            onClick={() => { const pool = matches.length ? matches : rows; const pick = pool[Math.floor(Math.random() * pool.length)]; if (pick) setSelectedId(idOf(pick)) }}
            title={`Open a random ${noun} from the current list — for the nights you want the site to start the conversation`}
            style={{
              padding: '2px 8px', fontSize: TYPE.label, fontWeight: 700, borderRadius: 999, cursor: 'pointer', minWidth: 34,   // past the 32px tap floor
              border: `1px dashed ${C.border2}`, background: 'transparent', color: C.text3, whiteSpace: 'nowrap',
            }} aria-label={`Open a random ${noun}`}>🎲</button>
        </div>
        <div className="playerboard-list" style={{
          border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
          maxHeight: '72vh', overflowY: 'auto', background: C.bg2,
        }}>
          {matches.map((p) => {
            const id = idOf(p)
            const on = selected && idOf(selected) === id
            const lit = pick.count > 0 && pick.has(String(urlIdOf(p)))
            const sc = scoreOf(p)
            const has = Number.isFinite(Number(sc)) && sc !== null
            const bg = has ? rampColor(Number(sc), sLo, sHi) : null
            return (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: 'none', cursor: 'pointer',
                  textAlign: 'left', color: on ? C.text : C.text2,
                  background: on ? C.bg3 : 'transparent',
                  borderLeft: `2px solid ${on ? C.green : lit ? pickColorOf(C) : 'transparent'}`,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: TYPE.name, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lit && <span title="You highlighted him" style={{ color: pickColorOf(C), marginRight: 4 }}>✨</span>}
                    {nameOf(p)}
                    {badgesOf(p)}
                  </span>
                  <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
                    {metaOf(p)}
                  </span>
                </span>
                <span
                  title={scoreTitle(p)}
                  style={{
                    fontFamily: NUM_FONT, fontSize: TYPE.body, fontWeight: 800,
                    background: bg || C.bg3, color: bg ? inkFor(bg) : C.text3,
                    padding: '2px 6px', borderRadius: 5, minWidth: 30, textAlign: 'center',
                  }}
                >{has ? Number(sc).toFixed(0) : '—'}</span>
              </button>
            )
          })}
          {!matches.length && (
            <div style={{ padding: 14, fontSize: TYPE.body, color: C.text3 }}>No {noun} matches that.</div>
          )}
        </div>
      </div>
      )}

      {showDetail && (
      <div>
        {notice}
        {phone && selected && (
          <button onClick={() => setSelectedId(null)} className="tap-row" style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
            border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.04)',
            color: C.text2, borderRadius: 9, padding: '7px 12px', fontSize: TYPE.body,
            fontWeight: 700, cursor: 'pointer', width: '100%',
          }}>← <span>All {nounPlural}</span>
            <span style={{ marginLeft: 'auto', fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
              {matches.length} in the list
            </span>
          </button>
        )}
        {selected ? renderDetail(selected) : (
          <Empty text={phone ? `Pick a ${noun} above.` : `Pick a ${noun} on the left.`} />
        )}
      </div>
      )}
    </div>
  )
}
