// lamp-goalw-v1, the numbers behind lib/nhl/goalWeightedModel.js. GENERATED -- do not edit by hand.
// Regenerate: node scripts/nhl/goal-v2-backtest.mjs --cache <dir> --data <dir> --write-model lib/nhl/goalWeightedV1.js
export default {
  "version": "lamp-goalw-v1",
  "note": "Written by scripts/nhl/goal-v2-backtest.mjs --write-model. Ridge logistic regression (ridge 1) of \"scored 1+ goal\" on the live board's three legs plus a defenceman flag; features standardised by mean/sd of the fit set. Frozen: a refit is a new model_version.",
  "features": [
    "goalsPg",
    "shotsPg",
    "toiMin",
    "isD"
  ],
  "intercept": -1.88585,
  "weights": {
    "goalsPg": 0.16332,
    "shotsPg": 0.21976,
    "toiMin": 0.26761,
    "isD": -0.48006
  },
  "mean": {
    "goalsPg": 0.17197,
    "shotsPg": 1.58021,
    "toiMin": 16.6085,
    "isD": 0.33588
  },
  "sd": {
    "goalsPg": 0.12665,
    "shotsPg": 0.69074,
    "toiMin": 3.94995,
    "isD": 0.4723
  },
  "fitted_on": {
    "from": "2025-11-15",
    "to": "2026-04-16",
    "nights": 129,
    "skater_games": 36239,
    "goals": 5552
  },
  "held_out": {
    "FOLD A (clean): fit 11-15..01-31, test 02-01..end": {
      "test_nights": 55,
      "test_skater_games": 15536,
      "live": {
        "called": {
          "n": 882,
          "h": 310,
          "rate": 0.35147392290249435
        },
        "called_board": {
          "n": 5196,
          "h": 1310,
          "rate": 0.25211701308698997
        },
        "log_loss": 0.40596055112601587
      },
      "model": {
        "called": {
          "n": 882,
          "h": 318,
          "rate": 0.36054421768707484
        },
        "called_board": {
          "n": 5194,
          "h": 1403,
          "rate": 0.2701193685021178
        },
        "log_loss": 0.39744890811350087
      },
      "paired_vs_live": {
        "called": {
          "lo": -0.014018691588785048,
          "hi": 0.029761904761904767,
          "pBetter": 0.7725
        },
        "called_board": {
          "lo": 0.012439807383627599,
          "hi": 0.023394905344709283,
          "pBetter": 1
        }
      }
    },
    "FOLD B (xG has seen these nights): fit 02-01..end, test 11-15..01-31": {
      "test_nights": 74,
      "test_skater_games": 20703,
      "live": {
        "called": {
          "n": 1178,
          "h": 391,
          "rate": 0.33191850594227507
        },
        "called_board": {
          "n": 6929,
          "h": 1725,
          "rate": 0.24895367296868234
        },
        "log_loss": 0.4010798414475778
      },
      "model": {
        "called": {
          "n": 1178,
          "h": 408,
          "rate": 0.3463497453310696
        },
        "called_board": {
          "n": 6929,
          "h": 1779,
          "rate": 0.2567470053398759
        },
        "log_loss": 0.3949436289255929
      },
      "paired_vs_live": {
        "called": {
          "lo": -0.0040322580645161255,
          "hi": 0.03470919324577859,
          "pBetter": 0.922
        },
        "called_board": {
          "lo": 0.002503681885125175,
          "hi": 0.013259507504007007,
          "pBetter": 0.997
        }
      }
    }
  }
}
