'use client'
// THE LEDGER'S ORDER, ONCE (BATCH-ONE-SITE step 1, 2026-10-05). Every sport's Ledger
// draws the same blocks (components/ledger/LedgerBlocks.js) in the same order; this is
// that order, so a section added here reaches MOONSHOT, TUDDY, LAMP and BUCKETS at once
// instead of one hand-built page at a time.
//
// `sections` -- each key is either the props for its block or a ready node (MOONSHOT's
// own pieces: its look-out wrapper, its number-pattern box), and absent = not drawn:
//   empty · intro · round · watch · align · lookout · names · nextUp · pattern · scorers · spots · note
import { Fragment, isValidElement } from 'react'
import { RoundLine, WatchStrip, AlignBox, LookOutBox, NextUpBox, ScorerChips, SpotBars } from './LedgerBlocks'
import NamePatterns from '../NamePatterns'

const BLOCK = {
  round: RoundLine, watch: WatchStrip, align: AlignBox, lookout: LookOutBox,
  names: NamePatterns, nextUp: NextUpBox, scorers: ScorerChips, spots: SpotBars,
}
export const LEDGER_ORDER = ['empty', 'intro', 'round', 'watch', 'align', 'lookout', 'names', 'nextUp', 'pattern', 'scorers', 'spots', 'note']

export default function LedgerBody({ sections = {} }) {
  return LEDGER_ORDER.map((k) => {
    const s = sections[k]
    if (s == null || s === false) return null
    if (isValidElement(s) || typeof s === 'string' || !BLOCK[k]) return <Fragment key={k}>{s}</Fragment>   // a ready node, no wrapper element
    const Block = BLOCK[k]
    return <Block key={k} {...s} />
  })
}
