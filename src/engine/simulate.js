import { getScore, getCommission } from './pvRules.js'

export const MAN = 10_000

// 몸PV는 좌/우 중 작은 쪽에 합산 (SSM/SM 직급 달성 규칙)
export function applyBodyPv(leftPv, rightPv, bodyPv) {
  if (bodyPv <= 0) return { effLeft: leftPv, effRight: rightPv }
  return rightPv <= leftPv
    ? { effLeft: leftPv, effRight: rightPv + bodyPv }
    : { effLeft: leftPv + bodyPv, effRight: rightPv }
}

// 누적-리셋 시뮬레이션의 유일한 구현.
// 하루 단위로 좌/우 PV를 누적하고, 점수 발생 시 다음 날 좌/우를 0으로 초기화한다.
//
// 점수 계산 기준: 좌/우 PV만 사용. bodyPv는 일별 매칭 점수에 관여 안 함.
// bodyPv는 상위 노드 롤업(sumSubtreePv)과 SM 직급달성 검사(checkSM)에서만 사용.
export function simulateCumulative(days, {
  getDailyLeft,
  getDailyRight,
}) {
  let cumL = 0
  let cumR = 0
  const out = []

  for (const day of days || []) {
    if (day.isSunday) {
      out.push({ ...day, score: 0, commission: 0, cumLeft: cumL, cumRight: cumR, effLeft: 0, effRight: 0 })
      continue
    }

    cumL += getDailyLeft(day) || 0
    cumR += getDailyRight(day) || 0

    const score = getScore(cumL, cumR)
    const commission = getCommission(score)

    out.push({
      ...day,
      score,
      commission,
      cumLeft: cumL,
      cumRight: cumR,
      effLeft: Math.round(cumL / MAN),
      effRight: Math.round(cumR / MAN),
    })

    if (score > 0) {
      cumL = 0
      cumR = 0
    }
  }

  return out
}
