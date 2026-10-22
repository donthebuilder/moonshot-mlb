#!/usr/bin/env node
// 💰 HOW BIG FAVOURITES DID (2026-10-22, Donovan: "blowout watches help with ... moneyline odds"). MEASURED: every 2025-26
// regular-season final with the book's CLOSING spread and moneylines (ESPN's odds feed, the cache backtest-nba-gamelines.mjs
// --cache writes). For each spread band: games, how many the favourite won, how many by 15+, and the favourite's median
// moneyline. Prints the table lib/nba/favourites.js carries.
//   node scripts/measure-nba-favourites.mjs <lines cache>
import { readFileSync } from 'node:fs'
import { BLOWOUT_FINAL } from '../lib/blowout.js'

const { cur } = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const BANDS = [{ lo: 0.5, hi: 4.5 }, { lo: 5, hi: 9.5 }, { lo: 10, hi: 12.5 }, { lo: 13, hi: 99 }]
const out = BANDS.map(({ lo, hi }) => {
  let games = 0, won = 0, big = 0
  const mls = []
  for (const g of cur) {
    const s = g.line?.close?.spreadHome
    if (s == null || s === 0 || Math.abs(s) < lo || Math.abs(s) > hi) continue
    const favHome = s < 0, margin = favHome ? g.hs - g.as : g.as - g.hs
    games++
    if (margin > 0) won++
    if (margin >= BLOWOUT_FINAL.nba) big++
    const ml = favHome ? g.line.close.mlHome : g.line.close.mlAway
    if (Number.isFinite(ml)) mls.push(ml)
  }
  mls.sort((a, b) => a - b)
  return { lo, hi, games, won, big, medianMl: mls[mls.length >> 1] ?? null }
})
console.log(JSON.stringify(out))
