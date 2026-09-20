'use client'
import DenseTable from '../DenseTable'
import { C } from '../../lib/nfl/theme'
import { NFL_GLOSSARY, NFL_SCORE_TERMS, NFL_RANK_NOT_PERCENT } from '../../lib/nfl/glossary'

// 📊 TUDDY'S TABLE — DenseTable with the football dictionary in it.
//
// DenseTable has rendered a tappable ⓘ in its column headers since it was
// built, and it looked every term up in the BASEBALL glossary. So on all
// twelve NFL tables it found nothing, no dot ever appeared, and the feature
// looked absent when it was only unfed. The machinery was never the missing
// half; the dictionary was.
//
// This is binding, not behaviour -- the same shape as NflExplain. Twelve call
// sites swap one tag name and every future NFL table gets the glossary for
// free, rather than each one remembering to pass three props.
//
// WHICH COLUMNS GET A DOT is decided by the dictionary and nothing else:
// DenseTable's own comment says "a column opts in by having a glossary entry
// for its key or its label; anything unknown simply gets no dot". So Player,
// Pos, Tm, Opp, # and ☆ stay bare because lib/nfl/glossary.js deliberately
// does not define them -- obvious words do not need a definition, and a dot on
// every header is noise on a phone. Adding a term is how a column earns one.
export default function NflTable(props) {
  return (
    <DenseTable
      {...props}
      dict={NFL_GLOSSARY}
      scoreTerms={NFL_SCORE_TERMS}
      caveat={NFL_RANK_NOT_PERCENT}
      accent={C.green}
    />
  )
}
