export const SCORE_TIERS = [
  { threshold: 300_000,    score: 15  },
  { threshold: 700_000,    score: 30  },
  { threshold: 1_500_000,  score: 60  },
  { threshold: 2_400_000,  score: 90  },
  { threshold: 6_000_000,  score: 150 },
  { threshold: 20_000_000, score: 250 },
  { threshold: 50_000_000, score: 300 },
]

export const N_VALUE = 3_750

export function getScore(leftPv, rightPv) {
  for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
    if (leftPv >= SCORE_TIERS[i].threshold && rightPv >= SCORE_TIERS[i].threshold) {
      return SCORE_TIERS[i].score
    }
  }
  return 0
}

export function getCommission(score) {
  return score * N_VALUE
}
