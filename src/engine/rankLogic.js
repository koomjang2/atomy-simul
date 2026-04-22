const SSM_TARGET = 1_500_000
const SM_TARGET  = 2_500_000

function applyBodyPv(totalLeft, totalRight, bodyPv) {
  if (bodyPv <= 0) return { effLeft: totalLeft, effRight: totalRight }
  if (totalRight <= totalLeft) {
    return { effLeft: totalLeft, effRight: totalRight + bodyPv }
  }
  return { effLeft: totalLeft + bodyPv, effRight: totalRight }
}

export function checkSSM(totalLeftMan, totalRightMan, bodyPvMan) {
  const { effLeft, effRight } = applyBodyPv(
    totalLeftMan * 10_000,
    totalRightMan * 10_000,
    bodyPvMan * 10_000,
  )
  return effLeft >= SSM_TARGET && effRight >= SSM_TARGET
}

export function checkSM(totalLeftMan, totalRightMan, bodyPvMan) {
  const { effLeft, effRight } = applyBodyPv(
    totalLeftMan * 10_000,
    totalRightMan * 10_000,
    bodyPvMan * 10_000,
  )
  return effLeft >= SM_TARGET && effRight >= SM_TARGET
}

export function checkRank(rank, totalLeftMan, totalRightMan, bodyPvMan) {
  if (rank === 'SSM') return checkSSM(totalLeftMan, totalRightMan, bodyPvMan)
  if (rank === 'SM')  return checkSM(totalLeftMan, totalRightMan, bodyPvMan)
  return null // DM 이상은 조직 구조로 판정
}

export function getTargetByRank(rank) {
  if (rank === 'SSM') return { left: 150, right: 110, bodyPv: 40 } // 만 단위
  if (rank === 'SM')  return { left: 250, right: 210, bodyPv: 40 }
  return { left: 0, right: 0, bodyPv: 0 }
}
