import { applyBodyPv, MAN } from './simulate.js'

const SSM_TARGET = 1_500_000
const SM_TARGET  = 2_500_000

export function checkSSM(totalLeftMan, totalRightMan, bodyPvMan) {
  const { effLeft, effRight } = applyBodyPv(
    totalLeftMan * MAN,
    totalRightMan * MAN,
    bodyPvMan * MAN,
  )
  return effLeft >= SSM_TARGET && effRight >= SSM_TARGET
}

export function checkSM(totalLeftMan, totalRightMan, bodyPvMan) {
  const { effLeft, effRight } = applyBodyPv(
    totalLeftMan * MAN,
    totalRightMan * MAN,
    bodyPvMan * MAN,
  )
  return effLeft >= SM_TARGET && effRight >= SM_TARGET
}

export function checkRank(rank, totalLeftMan, totalRightMan, bodyPvMan) {
  if (rank === 'SSM') return checkSSM(totalLeftMan, totalRightMan, bodyPvMan)
  if (rank === 'SM')  return checkSM(totalLeftMan, totalRightMan, bodyPvMan)
  return null
}

export function getTargetByRank(rank) {
  if (rank === 'SSM') return { left: 150, right: 110, bodyPv: 40 }
  if (rank === 'SM')  return { left: 250, right: 210, bodyPv: 40 }
  return { left: 0, right: 0, bodyPv: 0 }
}
