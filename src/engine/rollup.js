import { getScore, getCommission, SCORE_TIERS } from './pvRules.js'

export function getAllDescendants(nodeId, allNodes) {
  const direct = allNodes.filter((n) => n.parentId === nodeId)
  const result = [...direct]
  for (const child of direct) {
    result.push(...getAllDescendants(child.id, allNodes))
  }
  return result
}

export function getLeftSubtree(nodeId, allNodes) {
  const leftChildren = allNodes.filter((n) => n.parentId === nodeId && n.side === 'left')
  const result = [...leftChildren]
  for (const child of leftChildren) result.push(...getAllDescendants(child.id, allNodes))
  return result
}

export function getRightSubtree(nodeId, allNodes) {
  const rightChildren = allNodes.filter((n) => n.parentId === nodeId && n.side === 'right')
  const result = [...rightChildren]
  for (const child of rightChildren) result.push(...getAllDescendants(child.id, allNodes))
  return result
}

function sumSubtreePv(subtreeNodes, date) {
  return subtreeNodes.reduce((sum, node) => {
    const entry = node.days?.find((d) => d.date === date)
    if (!entry) return sum
    return sum + ((entry.leftPv || 0) + (entry.rightPv || 0) + (entry.bodyPv || 0)) * 10_000
  }, 0)
}

// 노드 전체 시뮬레이션 (자신 PV + 하위 서브트리 롤업 포함)
export function computeNodeSimulation(nodeId, allNodes) {
  const node = allNodes.find((n) => n.id === nodeId)
  if (!node || !node.days) return []

  const isDMOrAbove = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM'].includes(node.rank)
  const leftSub = getLeftSubtree(nodeId, allNodes)
  const rightSub = getRightSubtree(nodeId, allNodes)

  let leftAcc = 0
  let rightAcc = 0
  const result = []

  for (const day of node.days) {
    if (day.isSunday) {
      result.push({ ...day, score: 0, commission: 0, effLeft: 0, effRight: 0 })
      continue
    }

    const ownLeft = (day.leftPv || 0) * 10_000
    const ownRight = (day.rightPv || 0) * 10_000
    const subLeft = sumSubtreePv(leftSub, day.date)
    const subRight = sumSubtreePv(rightSub, day.date)

    leftAcc += ownLeft + subLeft
    rightAcc += ownRight + subRight

    // 몸PV는 보름 총합 기준으로 직급 달성에 적용 (일별 누계에는 포함 안 함)
    // DM 점수 계산에서는 sumSubtreePv를 통해 bodyPv가 자동 포함됨

    const score = getScore(leftAcc, rightAcc)
    const commission = getCommission(score)

    result.push({
      ...day,
      score,
      commission,
      effLeft: Math.round(leftAcc / 10_000),
      effRight: Math.round(rightAcc / 10_000),
    })

    if (score > 0) {
      leftAcc = 0
      rightAcc = 0
    }
  }

  return result
}

// DM 기준 하위 서브트리 일별 갭 계산 (자동 최적화용)
export function computeDmRollupGaps(dmNodeId, allNodes) {
  const leftSub = getLeftSubtree(dmNodeId, allNodes)
  const rightSub = getRightSubtree(dmNodeId, allNodes)
  const dmNode = allNodes.find((n) => n.id === dmNodeId)
  if (!dmNode || !dmNode.days) return []

  let leftAcc = 0
  let rightAcc = 0
  const gaps = []

  for (const day of dmNode.days) {
    if (day.isSunday) continue

    leftAcc += sumSubtreePv(leftSub, day.date)
    rightAcc += sumSubtreePv(rightSub, day.date)

    const currentScore = getScore(leftAcc, rightAcc)
    const nextTier = SCORE_TIERS.find((t) => t.score > currentScore)

    if (nextTier) {
      const leftGap = Math.max(0, nextTier.threshold - leftAcc) / 10_000
      const rightGap = Math.max(0, nextTier.threshold - rightAcc) / 10_000
      gaps.push({ date: day.date, leftGap, rightGap })
    }

    if (currentScore > 0) {
      leftAcc = 0
      rightAcc = 0
    }
  }

  return gaps
}
