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
// 하루 단위로 좌/우 PV를 누적하고, 몸PV는 약한 쪽에 합산,
// 점수 발생 시 다음 날 좌/우를 0으로 초기화한다.
//
// getDailyLeft/Right/BodyPv는 해당 노드의 "그날 기여분"을 반환해야 하며
// 단위는 원(MAN 곱한 값) 단위. DM 이상은 getBodyPv가 0을 반환.
export function simulateCumulative(days, {
  getDailyLeft,
  getDailyRight,
  getBodyPv = () => 0,
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

    const body = getBodyPv(day) || 0
    const { effLeft, effRight } = applyBodyPv(cumL, cumR, body)

    const score = getScore(effLeft, effRight)
    const commission = getCommission(score)

    out.push({
      ...day,
      score,
      commission,
      cumLeft: effLeft,
      cumRight: effRight,
      effLeft: Math.round(effLeft / MAN),
      effRight: Math.round(effRight / MAN),
    })

    if (score > 0) {
      cumL = 0
      cumR = 0
    }
  }

  return out
}
