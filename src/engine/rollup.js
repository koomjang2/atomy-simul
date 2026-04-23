import { simulateCumulative, MAN } from './simulate.js'

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

// 서브트리 노드들의 해당 날짜 (leftPv + rightPv + bodyPv) 합을 원 단위로 반환.
// 상위 노드에 롤업될 때 사용된다.
export function sumSubtreePv(subtreeNodes, date) {
  return subtreeNodes.reduce((sum, node) => {
    const entry = node.days?.find((d) => d.date === date)
    if (!entry) return sum
    return sum + ((entry.leftPv || 0) + (entry.rightPv || 0) + (entry.bodyPv || 0)) * MAN
  }, 0)
}

// 노드 자신의 PV + 하위 서브트리 롤업을 포함한 일별 시뮬레이션.
// simulateCumulative의 얇은 래퍼이며 UI 4곳(OrgTreePanel/CommissionSummary/
// ExportButtons/RankTable)이 의존하는 반환 shape을 유지한다.
export function computeNodeSimulation(nodeId, allNodes) {
  const node = allNodes.find((n) => n.id === nodeId)
  if (!node || !node.days) return []

  const isDMOrAbove = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM'].includes(node.rank)
  const leftSub = getLeftSubtree(nodeId, allNodes)
  const rightSub = getRightSubtree(nodeId, allNodes)

  return simulateCumulative(node.days, {
    getDailyLeft:  (day) => (day.leftPv || 0) * MAN + sumSubtreePv(leftSub, day.date),
    getDailyRight: (day) => (day.rightPv || 0) * MAN + sumSubtreePv(rightSub, day.date),
    // DM 이상은 본인 몸PV 0. SSM/SM은 자신의 날짜별 bodyPv를 약한 쪽에 합산.
    getBodyPv:     (day) => (isDMOrAbove ? 0 : (day.bodyPv || 0) * MAN),
  })
}
