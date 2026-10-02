// THE ODDS PAGE, PER SPORT (2026-10-02, Donovan: the Odds page "for all
// sports, like a component"). MOONSHOT's Odds page (components/tabs/
// OddsBoard.js + OddsSignals + OddsDiscrepancies) is the page; this is what
// changes from sport to sport, as data, not branches:
//   markets      the price markets in the payload (lib/odds/latest.js SPORTS),
//                each with its standard bar, label and colour
//   scoreFor     the site's 0-100 score for a market (null = the site has none)
//   rateMarket   the one market with a REAL per-game rate (MLB home runs:
//                hr_per_pa). Only it may carry an edge, a fair price, the
//                calibration picture, the gaps view and the named calls. NFL
//                and NHL publish scores, and a score is never subtracted from a
//                break-even, so they have none.
//   quotesOf     the player's quotes: by id, then the name fallback
//   lead / trueprice   MOONSHOT's prose read and its season archive (MLB only)
//   words        the nouns the copy needs
// MLB's values are MOONSHOT's current page exactly, so its page is unchanged.
import { nameOf, n } from '../player'
import { hrScore, hitScore, prodScore, tbScore } from '../player'
import { hrPerGame, normName } from '../odds'
import { hrGameBand } from '../hrRateBand'
import { hrOverlayRead } from '../hrOverlay'
import { normName as nflNormName } from '../nfl/oddsMatch'
import { ODDS_MARKET_INK as INK } from '../theme'
import { C as NFL_C } from '../nfl/theme'
import { C as NHL_C } from '../nhl/theme'

const MLB_MARKETS = [
  { key: 'batter_home_runs', label: 'HR', std: 0.5, color: INK.hr, verb: 'to go deep' },
  { key: 'batter_hits', label: 'Hits', std: 0.5, color: INK.hits, verb: 'for a hit' },
  { key: 'batter_hits_runs_rbis', label: 'H+R+RBI', std: 1.5, color: INK.hrr, verb: 'for two of hits / runs / RBI' },
  { key: 'batter_total_bases', label: 'Bases', std: 1.5, color: INK.tb, verb: 'for two total bases' },
  { key: 'batter_runs_scored', label: 'Runs', std: 0.5, color: INK.runs, verb: 'to score' },
  { key: 'batter_rbis', label: 'RBI', std: 0.5, color: INK.rbi, verb: 'to drive one in' },
  { key: 'batter_doubles', label: '2B', std: 0.5, color: INK.doubles, verb: 'for a double' },
  { key: 'batter_triples', label: '3B', std: 0.5, color: INK.triples, verb: 'for a triple' },
]
const MLB_SCORE = { batter_home_runs: hrScore, batter_hits: hitScore, batter_hits_runs_rbis: prodScore, batter_total_bases: tbScore }

const byIdOrName = (norm) => (odds, p) => odds?.by_player_id?.[String(p?.player_id ?? p?.playerId ?? p?.id)] || odds?.by_name?.[norm(nameOf(p))] || null

export const ODDS_ADAPTERS = {
  mlb: {
    sport: 'mlb', markets: MLB_MARKETS,
    scoreFor: (p, mk) => (MLB_SCORE[mk] ? MLB_SCORE[mk](p) : 0),
    hasScore: (mk) => Boolean(MLB_SCORE[mk]),
    rateMarket: 'batter_home_runs', rateOf: (p) => hrPerGame(p), sampleOf: (p) => n(p?.season_pa, 0),
    bandOf: (p) => hrGameBand(p), overlayOf: (p) => hrOverlayRead(p),   // the rate's sampling band, its tier
    quotesOf: byIdOrName(normName), rowKey: (p) => `${p?.player_id}-${p?.game_pk}`,
    lead: true, trueprice: true, priceBands: true,
    words: { noun: 'Hitter', players: 'hitters', when: 'tonight', start: 'first pitch', pulled: 'every price the bot pulled tonight', slate: "tonight's slate" },
  },
  nfl: {
    sport: 'nfl',
    // the score keys TUDDY's week file publishes (players[].scores), market by market
    markets: [
      { key: 'player_anytime_td', label: 'TD', std: 0.5, color: NFL_C.green, verb: 'to score', score: 'TD' },
      { key: 'player_reception_yds', label: 'Rec yds', std: 39.5, color: NFL_C.cyan, verb: 'in receiving yards', score: 'REC_YDS' },
      { key: 'player_receptions', label: 'Rec', std: 3.5, color: NFL_C.blue, verb: 'in catches', score: 'REC' },
      { key: 'player_rush_yds', label: 'Rush yds', std: 49.5, color: NFL_C.orange, verb: 'in rushing yards', score: 'RUSH_YDS' },
      { key: 'player_rush_attempts', label: 'Carries', std: 11.5, color: NFL_C.amber, verb: 'in carries', score: 'RUSH_ATT' },
      { key: 'player_pass_yds', label: 'Pass yds', std: 224.5, color: NFL_C.purple, verb: 'in passing yards', score: 'PASS_YDS' },
      { key: 'player_kicking_points', label: 'Kick pts', std: 5.5, color: NFL_C.pink, verb: 'in kicking points', score: 'KICK_PTS' },
    ],
    scoreFor(p, mk) { const m = this.markets.find((x) => x.key === mk); const v = m?.score ? Number(p?.scores?.[m.score]) : NaN; return Number.isFinite(v) ? v : 0 },
    hasScore(mk) { const m = this.markets.find((x) => x.key === mk); return Boolean(m?.score) },
    rateMarket: null, rateOf: () => null, sampleOf: () => 0, bandOf: () => null, overlayOf: () => null,
    quotesOf: byIdOrName(nflNormName), rowKey: (p) => String(p?.player_id),
    lead: false, trueprice: false, priceBands: false,
    words: { noun: 'Player', players: 'players', when: 'this week', start: 'kickoff', pulled: 'every price we read this week', slate: "this week's players" },
  },
  nhl: {
    sport: 'nhl',
    // LAMP's board publishes one score (the goal score); the other markets carry a price and no score
    markets: [
      { key: 'player_anytime_goal', label: 'Goal', std: 0.5, color: NHL_C.lamp, verb: 'to score', score: true },
      { key: 'player_shots_on_goal', label: 'SOG', std: 2.5, color: NHL_C.ice, verb: 'in shots on goal' },
      { key: 'player_points', label: 'Points', std: 0.5, color: NHL_C.teal, verb: 'for a point' },
      { key: 'player_assists', label: 'Assists', std: 0.5, color: NHL_C.purple, verb: 'for an assist' },
      { key: 'player_saves', label: 'Saves', std: 25.5, color: NHL_C.amber, verb: 'in saves' },
    ],
    scoreFor(p, mk) { const v = mk === 'player_anytime_goal' ? Number(p?.score) : NaN; return Number.isFinite(v) ? v : 0 },
    hasScore: (mk) => mk === 'player_anytime_goal',
    rateMarket: null, rateOf: () => null, sampleOf: () => 0, bandOf: () => null, overlayOf: () => null,
    quotesOf: byIdOrName(normName), rowKey: (p) => String(p?.playerId ?? p?.player_id),
    lead: false, trueprice: false, priceBands: false,
    words: { noun: 'Skater', players: 'skaters', when: 'tonight', start: 'puck drop', pulled: 'every price we read tonight', slate: "tonight's board" },
  },
}
export const oddsAdapter = (sport) => ODDS_ADAPTERS[sport] || ODDS_ADAPTERS.mlb
