// THE BOARD HUB'S MARKET LIST, ONE PLACE (TWO-SCORE batch, 2026-10-11). The seven scored markets (lib/nfl/theme MARKETS)
// plus the boards that are NOT part of the bot's scoring: 2+ TD, our own new model (lib/nfl/twoScore.js), placed right
// after Anytime TD. A market here is a registry entry; the hub renders it by key, with no sport test.
import { MARKETS } from './theme'

export const TWO_MARKET = ['TD2', '2+ TD', '2+ rush/rec TDs, our new model']
export const FIRST_MARKET = ['FTD', 'FIRST TD', 'first touchdown of the game, our new model']
export const HUB_MARKETS = [MARKETS[0], TWO_MARKET, FIRST_MARKET, ...MARKETS.slice(1)]
/** Boards the bot does not score: no Called view, no bot components, no stored band filters. */
export const OWN_MODEL_MARKETS = new Set(['TD2', 'FTD'])
/** Markets with no 📸 ranking card: 2+ TD is our own model (no bot score) and Defense/ST TD ranks clubs, not the players the share card draws (faces, clubs, his number). */
export const NO_RANK_CARD = new Set(['TD2', 'FTD', 'DEF_TD'])
