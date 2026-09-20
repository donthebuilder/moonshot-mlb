'use client'
import Explain from '../Explain'
import { C } from '../../lib/nfl/theme'
import { NFL_GLOSSARY, NFL_SCORE_TERMS, NFL_RANK_NOT_PERCENT } from '../../lib/nfl/glossary'

// 📖 THE FOOTBALL ⓘ (2026-09-20).
//
// One line of binding, and that is the point: components/Explain.js is the
// mechanism for both sports now (it takes a dictionary and an accent), so this
// file holds no behaviour of its own -- only which dictionary and which colour
// TUDDY uses. A second copy of the component is how one hue comes to mean two
// things and how a fix to the tap target lands on one sport and not the other.
//
// THE CAVEAT TRAVELS WITH THE TERM, the same rule the MLB banner states: a
// score term carries "this is a ranking, not a percentage" whether or not the
// next author remembers to write it. Attached here rather than inside each
// definition so a score explained on a surface nobody has built yet still
// says it.
export default function NflExplain({ label, term, text, style }) {
  const key = String(term || label || '').toLowerCase().trim()
  const extra = NFL_SCORE_TERMS.has(key) ? NFL_RANK_NOT_PERCENT : ''
  return (
    <Explain
      label={label}
      term={term}
      text={text || null}
      dict={NFL_GLOSSARY}
      accent={C.green}
      color={C.green}
      style={style}
      suffix={extra}
    />
  )
}
