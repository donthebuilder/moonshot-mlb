// lamp-preplay-v1, the measured numbers behind lib/nhl/preplay.js. GENERATED -- do not edit by hand.
// Regenerate: node --import ./scripts/_esm-resolve.mjs scripts/eval-lamp-preplay.mjs <dir> --write
// Fit on 2025-26 regular-season games before 2026-02-01; judged on the games from 2026-02-01 on (heldOut). measured is true only
// when every band of the favourite's win share with 50+ held-out games lands within 5 points of what happened.
export default {
  "version": "lamp-preplay-v1",
  "measured": true,
  "homeIce": 1.005,
  "otSeconds": 300,
  "otFactor": 1.8,
  "shootoutHome": 0.4902,
  "spread": 0.8,
  "shared": 1.55,
  "shrinkGames": 10,
  "fit": {
    "before": "2026-02-01",
    "games": 542,
    "homeWinRate": 0.5074,
    "shootouts": 52,
    "tiedAfter60": 131,
    "tiedShare": {
      "said": 24.1,
      "happened": 24.2
    },
    "otShare": {
      "said": 0.6,
      "happened": 0.603
    }
  },
  "heldOut": {
    "from": "2026-02-01",
    "games": 441,
    "logLoss": {
      "model": 0.6731,
      "baseline": 0.6924
    },
    "brier": {
      "model": 0.2402,
      "baseline": 0.2496
    },
    "tiedAfter60": {
      "said": 24,
      "happened": 23.1
    },
    "bands": [
      {
        "band": "50-55%",
        "n": 229,
        "said": 52.6,
        "happened": 54.1,
        "off": 1.6
      },
      {
        "band": "55-60%",
        "n": 148,
        "said": 57.3,
        "happened": 58.8,
        "off": 1.5
      },
      {
        "band": "60-65%",
        "n": 46,
        "said": 62.1,
        "happened": 69.6,
        "off": 7.5
      },
      {
        "band": "65-70%",
        "n": 17,
        "said": 66.3,
        "happened": 82.4,
        "off": 16
      },
      {
        "band": "70-75%",
        "n": 1,
        "said": 71.2,
        "happened": 0,
        "off": -71.2
      }
    ],
    "gate": "PASS: every band with 50+ games within 5 points"
  }
}
