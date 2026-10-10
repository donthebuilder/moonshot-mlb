'use client'
// THE CARD AND THE TWO-MAN, ONE COMPONENT FOR EVERY PRODUCT (2026-10-10, Donovan: "3 straights and 1 two-man by the bot, frozen at lock;
// Inside Line Two-Man in its own lane"). A table, not cards: the card's rows are the bot's three straights (flat 1 unit), the bot's Two-Man
// (flat 0.5 unit, two players from different games) and, once its lock has passed, Inside Line Two-Man with his note. Every row is the row the
// lock stored; the CALLED word is drawn by DenseTable's status stamp from STATUS_WORD, never typed here. `Table` is the product's own
// DenseTable wrapper (LampTable, NflTable; MOONSHOT passes DenseTable), so the glossary, the logos and the accent are the product's.
//
//   mode 'slate'   on the Slate / Games tab. COLLAPSED BY DEFAULT behind one 44px line, so the games table's first row moves down by that
//                  line and no more; opening it is the reader's choice (remembered on the device, never required).
//   mode 'record'  the three running records in words (the Ledger's Record view)
// A record is K of N, the count the legs' stored rates expect if they were independent ("if independent"), the 95% range, and units only
// from 100 priced calls. The page never prints a model chance.
import { useEffect, useMemo, useState } from 'react'
import DenseTable from '../DenseTable'
import { useSportTheme } from '../SportTheme'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { TeamTap, GameTap } from '../EntityTap'
import { playerHref } from '../../lib/routes'
import { CARD_WORDS, CARD_RULE, MARKETS, SAME_GAME_NOTE, rowPrice, legPriceOf, marketWords, fmtAmerican } from '../../lib/card/core'
import { TYPE } from '../../lib/theme'

const RES = { hit: 'HIT', miss: 'MISS', void: 'VOID', push: 'PUSH' }
const hm = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const prettyDay = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '')
const KEY = 'dash_card_open_v1'
const readOpen = () => { try { return window.localStorage.getItem(KEY) === '1' } catch { return false } }
const writeOpen = (v) => { try { window.localStorage.setItem(KEY, v ? '1' : '0') } catch { /* a convenience only */ } }

function Leg({ sport: page, leg }) {
  const sport = leg.sport || page      // a Double's legs carry their own sport
  const m = leg.market && leg.market !== 'anytime' && MARKETS[sport]?.[leg.market] ? marketWords(sport, leg.market, leg.line) : null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <a className="tap-link" href={playerHref(sport, leg.player_id)} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 800 }}>{leg.name}</a>
      <span style={{ fontSize: 11, opacity: 0.75, whiteSpace: 'nowrap' }}>
        <TeamTap abbr={leg.team} sport={sport} /> vs <TeamTap abbr={leg.opp} sport={sport} /> <GameTap pk={leg.game_id} style={{ fontSize: 11 }}>game</GameTap>
      </span>
      {m && <span style={{ fontSize: 10, opacity: 0.75, flexBasis: '100%' }}>{m}</span>}
    </span>
  )
}

export default function CardSection({ sport, mode = 'slate', Table = DenseTable }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const w = CARD_WORDS[sport]
  // A signed-in visitor asks for the whole Card (`full=1`, never cached); the server gives it to an admin only. Everyone else -- logged out or
  // logged in -- gets the free view (the lead straight, the Long Shot, the admin's pair, graded rows) until members access ships.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => { try { setSignedIn(/(?:^|;\s*)sb-[^=;]*-auth-token/.test(document.cookie)) } catch { setSignedIn(false) } }, [])
  const { data, error, loading } = useLiveFetch(`/api/card?sport=${sport}${signedIn ? '&full=1' : ''}`, { enabled: Boolean(w) })
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(readOpen()) }, [])
  const toggle = () => setOpen((v) => { writeOpen(!v); return !v })

  const rows = useMemo(() => {
    const prices = data?.prices || {}
    const out = []
    const sameGame = (r) => r.rule === CARD_RULE.two_man_same_game
    const label = { straight: (r) => `S${r.slot}`, two_man: (r) => (r.lane === 'donovan' ? 'D2' : sameGame(r) ? 'SG' : '2M'), long_shot: () => 'LS', double: (r) => (r.lane === 'donovan' ? 'DD' : 'DB') }
    const order = (r) => (r.lane === 'bot' ? 0 : 20) + ({ straight: r.slot, two_man: 5, long_shot: 7, double: 8 }[r.product] ?? 9)
    for (const r of data?.rows || []) {
      const legPrices = r.legs.map((l) => legPriceOf(l, prices[String(l.player_id)] || null))
      const price = rowPrice(r, legPrices)
      out.push({
        _key: `${r.sport}-${r.lane}-${r.product}-${r.slot}`, lane: r.lane, product: r.product, same: sameGame(r), tag: label[r.product](r), legs: r.legs, note: r.note,
        score: Math.min(...r.legs.map((l) => (Number.isFinite(l.score) ? l.score : Infinity))), stake: r.stake, price, result: r.result,
        status: r.lane === 'bot' ? (r.legs.some((l) => l.status === 'board') ? 'board' : 'called') : null, start: r.start_at, _order: order(r),
      })
    }
    return out.sort((a, b) => a._order - b._order)
  }, [data])

  const columns = useMemo(() => [
    { key: 'tag', label: '#', w: 34, heat: false, group: 'CALL', fmt: (v, r) => <b title={r.product === 'double' ? (r.lane === 'donovan' ? "Inside Line Double: its own lane and record" : 'The Double: two sports, both must land') : r.product === 'long_shot' ? 'The Long Shot of the day: a plus-money pick, most of these miss' : r.lane === 'donovan' ? "Inside Line Two-Man: his own lane and record" : r.same ? 'The same-game Two-Man: both legs from one game, so they are correlated' : r.product === 'two_man' ? 'The Two-Man: both must land' : `Straight ${v}`}>{v}</b> },
    { key: 'legs', label: 'Player', w: 190, heat: false, sticky: true, group: 'CALL', fmt: (v, r) => (
      <span style={{ display: 'grid', gap: 3, whiteSpace: 'normal', lineHeight: 1.2 }}>
        {r.lane === 'donovan' && <span style={{ fontSize: 10, color: accent, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>{r.product === 'double' ? "INSIDE LINE DOUBLE" : "INSIDE LINE TWO-MAN"}</span>}
        {r.product === 'long_shot' && <span style={{ fontSize: 10, color: accent, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>LONG SHOT OF THE DAY</span>}
        {r.product === 'double' && r.lane === 'bot' && <span style={{ fontSize: 10, color: accent, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>THE DOUBLE</span>}
        {r.same && <span style={{ fontSize: 10, color: C.text3 }}>same game</span>}
        {v.map((l) => <Leg key={l.player_id} sport={sport} leg={l} />)}
        {r.note && <span style={{ fontSize: 11, color: C.text2, whiteSpace: 'pre-wrap' }}>{r.note}</span>}
        {r.legs[0]?.pair_note && <span style={{ fontSize: 10, color: C.text3 }}>{r.legs[0].pair_note}</span>}
      </span>) },
    { key: 'score', label: 'Score', w: 52, dp: 0, primary: true, group: 'MODEL', blankWhen: (n) => !Number.isFinite(n), title: 'The model score at the lock (a rank, not a chance). A Two-Man shows its weaker leg: both must land' },
    { key: 'price', label: 'Price', w: 84, heat: false, group: 'PRICE', fmt: (v, r) => (v
      ? <span style={{ display: 'grid', lineHeight: 1.15 }}><b>{fmtAmerican(r.legs.every((l) => l.price) ? v.median : v.best)}</b><span style={{ fontSize: 10, color: C.text3 }}>{r.product === 'two_man' || r.product === 'double' ? 'multiplied' : r.legs[0]?.price ? 'median at lock' : 'best on file'}</span></span>
      : <span style={{ color: C.text3, fontSize: 11 }}>none yet</span>), title: 'Best price on file. A Two-Man is the two legs\' prices multiplied (your book\'s parlay price will differ); blank when a leg has no price on file' },
    { key: 'stake', label: 'Stake', w: 48, heat: false, group: 'PRICE', fmt: (v) => `${v}u`, title: 'Flat stake in units' },
    { key: 'result', label: 'Result', w: 60, heat: false, group: 'RESULT', fmt: (v) => (v ? <b style={{ color: v === 'hit' ? accent : C.text2 }}>{RES[v] || v}</b> : <span style={{ color: C.text3 }}>{'—'}</span>), title: 'Graded from the box score. A Two-Man needs both legs; a player who did not play voids it' },
  ], [sport, accent, C, NUM_FONT])

  if (!w) return null                       // a product the Card does not run in (BUCKETS) renders nothing and asks nothing
  const ready = rows.length > 0
  const nothing = !loading && !error && !ready
  const nS = rows.filter((r) => r.lane === 'bot' && r.product === 'straight').length
  const summary = ready ? `${nS} straight${nS === 1 ? '' : 's'}${rows.some((r) => r.lane === 'bot' && r.product === 'two_man') ? ' + Two-Man' : ''}${rows.some((r) => r.product === 'long_shot') ? ' + Long Shot' : ''}${rows.some((r) => r.product === 'double') ? ' + Double' : ''}${rows.some((r) => r.lane === 'donovan') ? " + Donovan's" : ''}` : 'locks an hour before the first game'

  if (mode === 'record') {
    const volume = Object.entries(data?.words?.volume || {}).map(([k, ws]) => [(MARKETS[sport]?.[k]?.label || k).toUpperCase(), ws])
    const lines = [['STRAIGHTS', data?.words?.straight], ...volume, ['TWO-MAN', data?.words?.two_man], ['SAME-GAME TWO-MAN', data?.words?.two_man_same_game], ["INSIDE LINE TWO-MAN", data?.words?.donovan], ['LONG SHOT OF THE DAY', data?.words?.long_shot], ['THE DOUBLE', data?.words?.double], ["INSIDE LINE DOUBLE", data?.words?.donovan_double]].filter(([, ws]) => ws?.length)
    if (!lines.length) return null
    return (
      <section aria-label="The card record" data-card-record={sport} style={{ margin: '4px 0 12px' }}>
        <div style={{ color: accent, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>THE CARD RECORD</div>
        {lines.map(([k, ws]) => (
          <p key={k} style={{ margin: '0 0 6px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
            <span style={{ color: C.text3, font: `800 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{k} </span>
            <b style={{ color: C.text }}>{ws[0]}</b> {ws.slice(1).join(' ')}
          </p>
        ))}
      </section>
    )
  }

  return (
    <section aria-label="The card" data-card={sport} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, margin: '0 0 8px' }}>
      <button type="button" aria-expanded={open} onClick={toggle}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '0 12px', border: 0, background: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <b style={{ color: accent, fontFamily: NUM_FONT, fontSize: 11, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>THE CARD</b>
        <span style={{ color: C.text3, fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data?.date ? `${prettyDay(data.date)} · ` : ''}{loading ? 'reading…' : summary}</span>
        <span aria-hidden="true" style={{ color: C.text3, fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ color: C.text3, fontSize: 11, lineHeight: 1.45, marginBottom: 6 }}>
            One to three straights by the size of the slate, one unit each, a shots, yards or hits pick as an over at its stored line, and a Two-Man of the two best, half a unit. Fixed {data?.lockLeadMin || 60} minutes before the first game and never edited. Graded from the box score; a Two-Man needs both.
          </div>
          {error && !loading && <div style={{ fontSize: 12, color: C.text3 }}>The card is not loading right now. Pull to refresh in a minute.</div>}
          {nothing && <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text3 }}>No card is locked yet. It locks {data?.lockLeadMin || 60} minutes before the first game of the {w.window}.</div>}
          {ready && (
            <Table rows={rows} columns={columns} statusOf={(r) => r.status} heatMode="primary" bare maxRows={5} maxHeight={9999}
              initialSort={null}
              caption={`${data.date}${rows[0]?.start ? ` · first game ${hm(rows[0].start)}` : ''}. Ties go to the higher model rate, then the earlier start, then the player id. Inside Line picks appear once their entry has closed.${rows.some((r) => r.same) ? ` ${SAME_GAME_NOTE}` : ''}`} />
          )}
        </div>
      )}
    </section>
  )
}
