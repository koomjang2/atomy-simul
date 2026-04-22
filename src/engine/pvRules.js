export const SCORE_TIERS = [
  { threshold: 300_000,    score: 15  },
  { threshold: 700_000,    score: 30  },
  { threshold: 1_500_000,  score: 60  },
  { threshold: 2_400_000,  score: 90  },
  { threshold: 6_000_000,  score: 150 },
  { threshold: 20_000_000, score: 250 },
  { threshold: 50_000_000, score: 300 },
]

export const N_VALUE = 3_750 // N가 중간값

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

// 누적 PV로 일별 점수/초기화 시뮬레이션
// days: DayEntry[] (leftPv, rightPv, bodyPv 입력됨)
// rank: 'SSM'|'SM'|'DM'|... (DM 이상은 bodyPv 무시)
export function simulateDays(days, rank) {
  const isDMOrAbove = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM'].includes(rank)
  let cumLeft = 0
  let cumRight = 0
  const result = []

  for (const day of days) {
    if (day.isSunday) {
      result.push({ ...day, score: 0, commission: 0, cumLeft, cumRight })
      continue
    }

    cumLeft += day.leftPv * 10_000
    cumRight += day.rightPv * 10_000
    const body = isDMOrAbove ? 0 : day.bodyPv * 10_000

    // 몸PV는 더 적은 쪽에 합산
    let effLeft = cumLeft
    let effRight = cumRight
    if (body > 0) {
      if (cumRight <= cumLeft) effRight += body
      else effLeft += body
    }

    const score = getScore(effLeft, effRight)
    const commission = getCommission(score)

    result.push({ ...day, score, commission, cumLeft: effLeft, cumRight: effRight })

    // 점수 발생 시 다음날 초기화 (소실적)
    if (score > 0) {
      cumLeft = 0
      cumRight = 0
    }
  }
  return result
}
