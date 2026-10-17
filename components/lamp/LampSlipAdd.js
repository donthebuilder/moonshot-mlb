'use client'
// + slip on a LAMP player page (2026-10-17): the goal (1+) and shots (3+) prices the Props cards use, only where the book's line IS the bar
// (lampQuoteOf), at the book's real price. No quote, no button.
import SlipAdd from '../SlipAdd'
import { lampQuoteOf } from '../../lib/nhl/lampQuote'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { C, NUM_FONT } from '../../lib/nhl/theme'

const WORD = { GOAL: 'Goal', SOG: 'Shots 3+' }
const LINE = { GOAL: 'o0.5', SOG: 'o2.5' }

export default function LampSlipAdd({ id, name, team = null, opp = null, style = null }) {
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nhl')
  const r = { id }
  const game = team && opp ? { key: [team, opp].sort().join('-'), label: [team, opp].sort().join(' · ') } : null
  const legs = ['GOAL', 'SOG'].map((k) => {
    const q = lampQuoteOf(odds, r, k)
    return q ? { key: `${id}|${k}`, id: String(id), name, team, market: WORD[k], line: LINE[k], side: 'over', price: Number(q.best_over ?? q.over), game } : null
  }).filter(Boolean)
  return <SlipAdd sport="nhl" legs={legs} C={C} NUM_FONT={NUM_FONT} accent={C.ice} style={style} />
}
