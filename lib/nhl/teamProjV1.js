// lamp-team-v1, the numbers behind lib/nhl/teamProj.js. GENERATED -- do not edit by hand.
// Regenerate: node --import ./scripts/_esm-resolve.mjs scripts/eval-lamp-xg-games.mjs <dir> --write-team
export default {
  "version": "lamp-team-v1",
  "note": "Written by scripts/eval-lamp-xg-games.mjs --write-team. The team model (lib/nhl/teamProj.js): shots x xG a shot x the opposing defence x the opposing goalie + empty-net goals, shrunk to the league; the shrink strengths were tuned on 2025-12-01..2026-02-01 games and frozen.",
  "windowGames": 82,
  "goalieGames": 10,
  "league": {
    "gf": 3.06659,
    "sog": 27.8008,
    "xgPerSog": 0.103533,
    "emptyNet": 0.188289
  },
  "k": {
    "rate": 20,
    "sog": 20,
    "q": 1600,
    "goalie": 320
  },
  "tuned_on": {
    "from": "2025-12-01",
    "to": "2026-02-01",
    "games": 466
  },
  "dist": {
    "xg": {
      "n": 505,
      "p10": 5.78677,
      "p25": 5.9484,
      "p50": 6.11466,
      "p75": 6.27352,
      "p90": 6.40607,
      "min": 5.53622,
      "max": 6.71334,
      "mean": 6.10945
    },
    "rate": {
      "n": 505,
      "p10": 5.68282,
      "p25": 5.91895,
      "p50": 6.13012,
      "p75": 6.42885,
      "p90": 6.6683,
      "min": 5.13569,
      "max": 7.13456,
      "mean": 6.15974
    }
  },
  "eval": {
    "cutoff": "2026-02-01",
    "siteVsEval": {
      "maxAbsDiffTeam": 8.88178e-16,
      "maxAbsDiffRate": 0
    },
    "heldOut": {
      "valid 2025-26 (>= 2026-02-01)": {
        "games": 441,
        "const": {
          "nll": -0.419616,
          "mse": 2.98737,
          "mae": 1.3888
        },
        "rate": {
          "nll": -0.425157,
          "mse": 2.95275,
          "mae": 1.40005
        },
        "rateOpp": {
          "nll": -0.430092,
          "mse": 2.92063,
          "mae": 1.39191
        },
        "xgGC": {
          "nll": -0.434229,
          "mse": 2.89697,
          "mae": 1.37876
        },
        "team": {
          "nll": -0.434229,
          "mse": 2.89697,
          "mae": 1.37876
        },
        "blendOpp": {
          "nll": -0.434386,
          "mse": 2.89509,
          "mae": 1.38203
        },
        "gameTotalCorr": {
          "rate": {
            "pearson": 0.0193555,
            "spearman": 0.0150317
          },
          "rateGoalie": {
            "pearson": 0.0233346,
            "spearman": 0.0166592
          },
          "rateOpp": {
            "pearson": 0.0592767,
            "spearman": 0.0480122
          },
          "xg": {
            "pearson": 0.104022,
            "spearman": 0.105102
          },
          "xgGoalie": {
            "pearson": 0.117797,
            "spearman": 0.115205
          },
          "xgGC": {
            "pearson": 0.118034,
            "spearman": 0.114891
          },
          "team": {
            "pearson": 0.118034,
            "spearman": 0.114891
          },
          "blendRate": {
            "pearson": 0.0677504,
            "spearman": 0.0630763
          },
          "blendOpp": {
            "pearson": 0.0894845,
            "spearman": 0.0741656
          }
        }
      },
      "next 2026-27 regular season": {
        "games": 64,
        "const": {
          "nll": -0.146283,
          "mse": 3.40493,
          "mae": 1.49945
        },
        "rate": {
          "nll": -0.176795,
          "mse": 3.22182,
          "mae": 1.48818
        },
        "rateOpp": {
          "nll": -0.185361,
          "mse": 3.16723,
          "mae": 1.48818
        },
        "xgGC": {
          "nll": -0.184577,
          "mse": 3.17307,
          "mae": 1.46215
        },
        "team": {
          "nll": -0.184577,
          "mse": 3.17307,
          "mae": 1.46215
        },
        "blendOpp": {
          "nll": -0.186708,
          "mse": 3.15896,
          "mae": 1.4724
        },
        "gameTotalCorr": {
          "rate": {
            "pearson": 0.1054,
            "spearman": 0.0527983
          },
          "rateGoalie": {
            "pearson": 0.107532,
            "spearman": 0.0465019
          },
          "rateOpp": {
            "pearson": 0.135784,
            "spearman": 0.0570759
          },
          "xg": {
            "pearson": 0.300639,
            "spearman": 0.245114
          },
          "xgGoalie": {
            "pearson": 0.306784,
            "spearman": 0.231531
          },
          "xgGC": {
            "pearson": 0.310319,
            "spearman": 0.233162
          },
          "team": {
            "pearson": 0.310319,
            "spearman": 0.233162
          },
          "blendRate": {
            "pearson": 0.230738,
            "spearman": 0.146658
          },
          "blendOpp": {
            "pearson": 0.220165,
            "spearman": 0.120332
          }
        }
      }
    },
    "realDial": {
      "clubGames": 164,
      "dial": {
        "nll": 0.204336,
        "mse": 4.27933,
        "meanProjected": 1.99543,
        "pearson": 0.0358093,
        "spearman": 0.0152384
      },
      "xg": {
        "nll": -0.145816,
        "mse": 3.07273,
        "meanProjected": 3.05041,
        "pearson": 0.249337,
        "spearman": 0.189887
      },
      "team": {
        "nll": -0.149435,
        "mse": 3.04979,
        "meanProjected": 3.03231,
        "pearson": 0.266359,
        "spearman": 0.208797
      },
      "xgGC": {
        "nll": -0.149435,
        "mse": 3.04979,
        "meanProjected": 3.03231,
        "pearson": 0.266359,
        "spearman": 0.208797
      },
      "blendRate": {
        "nll": -0.14646,
        "mse": 3.06807,
        "meanProjected": 3.05607,
        "pearson": 0.272063,
        "spearman": 0.236343
      },
      "blendOpp": {
        "nll": -0.151842,
        "mse": 3.03569,
        "meanProjected": 3.05674,
        "pearson": 0.276685,
        "spearman": 0.23559
      },
      "rate": {
        "nll": -0.139005,
        "mse": 3.11688,
        "meanProjected": 3.07983,
        "pearson": 0.21644,
        "spearman": 0.193891
      }
    }
  }
}
