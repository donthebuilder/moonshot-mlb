'use client'

// THE CHAMPIONSHIP PANEL, FOLDED ON HOME, ABSENT UNTIL THERE IS A FILE (2026-10-13).
//
// MLB's October fold has always been there, with a plain "fills in with the next update"
// line inside when the bot has not published. The other three leagues get the same fold with
// one difference Donovan asked for: until their odds file exists the fold is not drawn at
// all. No empty header, no placeholder, no number. The answer to "is there a file" is one
// small fetch (shared with the panel inside, lib/championship.js loadChampionship) made on
// Home's mount; a missing file costs one request and nothing renders.
//
// Everything the fold says comes from the sport's registry entry (lib/championship.js), so
// a new league is one entry there and one line on its Home.
import { useEffect, useState } from 'react'
import Fold from './Fold'
import PennantRace from './PennantRace'
import { championshipConfig, loadChampionship } from '../lib/championship'

export default function ChampionshipFold({ sport }) {
  const cfg = championshipConfig(sport)
  const [has, setHas] = useState(false)
  useEffect(() => {
    let alive = true
    loadChampionship(sport).then((r) => { if (alive) setHas(Boolean(r.ok)) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  if (!has) return null
  return (
    <Fold id={cfg.foldId} title={cfg.foldTitle} meta={cfg.foldMeta}>
      <PennantRace sport={sport} />
    </Fold>
  )
}
