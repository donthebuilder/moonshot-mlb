// THE CALLED CARD (server only, JSX; 2026-10-25, Donovan: "the picture card thing" of the called list, after the text). One game's
// CALLED men on the N-man card (lib/cards/nManCard.js nManDesign: the same frame, tiles, fonts and fit rules -- built FROM it, not a
// look-alike): the title is the game, each tile is a man with the lanes he is CALLED in (the 0c rule: any public market), no price,
// and the plate says how many men and when the game starts. More than six men = more than one card ("1 OF 2"). Nothing is graded,
// ranked or priced here; the statuses are the boards' own (lib/calledList.js gathers them). No probability, no serial.
import { assets, renderPng, sizeOf } from './cardKit'
import { initMetrics } from './fit'
import { nManDesign } from './nManCard'

import { CALLED_PER_CARD } from '../calledList'
export { CALLED_PER_CARD }
// the start's word, by sport (the registry rule: a lookup, no sport ternaries)
const START_WORD = { nba: 'tip-off', nhl: 'puck drop', nfl: 'kickoff', mlb: 'first pitch' }

const etTime = (iso, weekday) => {
  try { return `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', ...(weekday ? { weekday: 'short' } : {}), hour: 'numeric', minute: '2-digit' })} ET` } catch { return '' }
}

/**
 * One game -> its card models (six men a card). men: [{ m (lib/cards/dayData legModel), lanes: ['PTS 25+', ...] }].
 * Pure; the faces / logos are already in each m.
 */
export function calledModels({ sport, brandName, dayWord, title, start = null, weekday = false, men }) {
  const out = []
  const parts = Math.max(1, Math.ceil((men || []).length / CALLED_PER_CARD))
  for (let i = 0; i < (men || []).length; i += CALLED_PER_CARD) {
    const chunk = men.slice(i, i + CALLED_PER_CARD)
    const part = i / CALLED_PER_CARD + 1
    out.push({
      sport, brandName, dayWord, market: '', serial: null, shared: '', graded: null, rule: '',
      label: parts > 1 ? `${title} · ${part} OF ${parts}` : title,
      legs: chunk.map((x) => ({ m: x.m, lanes: x.lanes, market: x.lanes.join(' · '), price: null, outcome: null })),
      combined: { text: null, all: true, priced: 0, n: chunk.length },
      plate: {
        l1: start ? `${START_WORD[sport] || 'start'} ${etTime(start, weekday)}` : 'start time not on file',
        l2: 'CALLED in any lane = CALLED',
        caption: parts > 1 ? `CALLED · ${part} OF ${parts}` : 'CALLED',
        big: `${men.length} ${men.length === 1 ? 'MAN' : 'MEN'}`,
      },
    })
  }
  return out
}

const opts = (d) => ({ hidePrice: true, headWord: 'CALLED', plate: d.plate, footRight: 'every CALLED man · graded in public' })

/** PNG bytes of one called card at `width` px (4:5). */
export async function renderCalled(d, { width } = {}) {
  const { fonts, grain, mark } = await assets()
  initMetrics(fonts)
  return renderPng(nManDesign(d, grain, mark, opts(d)), sizeOf(width), { card: 'called', design: nManDesign(d, null, mark, opts(d)) })
}
