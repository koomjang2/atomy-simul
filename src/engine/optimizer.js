import { buildCalendar, getWorkdays } from './calendar.js'
import { getLeftSubtree, getRightSubtree, computeDmRollupGaps } from './rollup.js'

const CHUNK       = 30  // 万 단위, 갭 채우기 최대 허용 크기
const SMALL_CHUNK = 10  // 万 단위, 잔여 PV·몸PV 소단위 크기

// ─── 유틸 ────────────────────────────────────────────────────────

function evenSpacing(workdays, count) {
  if (count <= 0) return []
  if (count >= workdays.length) return workdays.map((d) => d.date)
  const step = (workdays.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => workdays[Math.round(i * step)].date)
}

function evenSpacingFromDates(dates, count) {
  if (count <= 0 || !dates.length) return []
  if (count >= dates.length) return [...dates]
  if (count === 1) return [dates[0]]
  const step = (dates.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => dates[Math.round(i * step)])
}

function placeMixedChunks(sched, dates, amount, side) {
  if (amount <= 0 || !dates.length) return 0
  const largeCount = Math.floor(amount / CHUNK)
  const smallCount = Math.floor((amount - (largeCount * CHUNK)) / SMALL_CHUNK)
  const mixedCount = largeCount + smallCount
  if (mixedCount <= 0) return 0

  const selected = evenSpacingFromDates(dates, Math.min(mixedCount, dates.length))
  let l = largeCount
  let s = smallCount
  let rem = amount

  for (const date of selected) {
    if (rem <= 0) break
    let toPlace = 0
    if (l > 0 && s > 0) {
      toPlace = l >= s ? CHUNK : SMALL_CHUNK
      if (toPlace === CHUNK) l -= 1
      else s -= 1
    } else if (l > 0) {
      toPlace = CHUNK
      l -= 1
    } else if (s > 0) {
      toPlace = SMALL_CHUNK
      s -= 1
    }

    if (toPlace > 0) {
      sched[date][side] = (sched[date][side] || 0) + toPlace
      rem -= toPlace
    }
  }

  return amount - rem
}

/**
 * PV 잔여량을 SMALL_CHUNK 단위로 조용한 날에 분산 배치.
 * usedDates에 없는 날(조용한 날)을 우선 선택, 부족 시 전체 영업일로 확장.
 */
function scatterSmallChunks(sched, workdays, usedDates, amount, side) {
  if (amount <= 0 || !workdays.length) return
  const usedSet = new Set(usedDates)
  const quiet = workdays.filter((d) => !usedSet.has(d.date))
  const chunks = Math.ceil(amount / SMALL_CHUNK)
  const candidates = quiet.length >= chunks ? quiet : workdays
  const selected = evenSpacingFromDates(
    candidates.map((d) => d.date),
    Math.min(chunks, candidates.length),
  )

  let rem = amount
  for (const date of selected) {
    if (rem <= 0) break
    const toPlace = Math.min(SMALL_CHUNK, rem)
    sched[date][side] = (sched[date][side] || 0) + toPlace
    rem -= toPlace
  }
  if (rem > 0 && selected.length > 0) {
    const last = selected[selected.length - 1]
    sched[last][side] = (sched[last][side] || 0) + rem
  }
}

// ─── 1단계: 좌/우 PV 기본 일정 ────────────────────────────────────

function buildBaseSchedule(node, year, month, half, hasLeftSub, hasRightSub) {
  const days = buildCalendar(year, month, half)
  const workdays = getWorkdays(days)
  const sched = Object.fromEntries(days.map((d) => [d.date, { leftPv: 0, rightPv: 0 }]))
  const wdDates = workdays.map((d) => d.date)

  if (!hasLeftSub && !hasRightSub) {
    // ─── 리프 노드: 큰 쪽 먼저 배치 → 작은 쪽은 같은 날짜(앵커)에 맞춰 배치 ───
    // 좌·우가 같은 날 입력되어야 DM 롤업 합산 효과가 극대화되어 DM 매칭 횟수가 증가
    const targetL = node.targetLeft  || 0
    const targetR = node.targetRight || 0

    const [bigTarget, bigSide, smallTarget, smallSide] = targetL >= targetR
      ? [targetL, 'leftPv', targetR, 'rightPv']
      : [targetR, 'rightPv', targetL, 'leftPv']

    // 1) 큰 쪽: 30/10万 혼합 균등 배치
    const bigPlaced = placeMixedChunks(sched, wdDates, bigTarget, bigSide)
    const bigRem = bigTarget - bigPlaced
    if (bigRem > 0) {
      const usedBig = Object.entries(sched).filter(([, v]) => v[bigSide] > 0).map(([k]) => k)
      scatterSmallChunks(sched, workdays, usedBig, bigRem, bigSide)
    }

    // 2) 작은 쪽: 큰 쪽이 배치된 날짜(앵커)에 우선 배치
    const anchorDates = Object.entries(sched)
      .filter(([, v]) => v[bigSide] > 0)
      .map(([k]) => Number(k))
      .sort((a, b) => a - b)
    const smallPlaced = placeMixedChunks(sched, anchorDates, smallTarget, smallSide)
    const smallRem = smallTarget - smallPlaced
    if (smallRem > 0) {
      const usedSmall = Object.entries(sched).filter(([, v]) => v[smallSide] > 0).map(([k]) => k)
      scatterSmallChunks(sched, workdays, usedSmall, smallRem, smallSide)
    }

  } else {
    // ─── 한쪽 서브트리 있음: 직접 투입 가능한 쪽만 30/10万 배치 ───
    if (!hasRightSub) {
      const rightTarget   = node.targetRight || 0
      const rightWorkdays = workdays.length > 1 ? workdays.slice(1) : workdays
      const rightPlaced   = placeMixedChunks(sched, rightWorkdays.map((d) => d.date), rightTarget, 'rightPv')
      const rightDates    = Object.entries(sched).filter(([, v]) => v.rightPv > 0).map(([k]) => k)
      const rightRem      = rightTarget - rightPlaced
      if (rightRem > 0) scatterSmallChunks(sched, workdays, rightDates, rightRem, 'rightPv')
    }
    if (!hasLeftSub) {
      const totalLeft  = Object.values(sched).reduce((s, d) => s + d.leftPv, 0)
      const leftRemain = (node.targetLeft || 0) - totalLeft
      if (leftRemain > 0) {
        const placed = placeMixedChunks(sched, wdDates, leftRemain, 'leftPv')
        const rem    = leftRemain - placed
        if (rem > 0) {
          const usedLeft  = Object.entries(sched).filter(([, v]) => v.leftPv  > 0).map(([k]) => k)
          const usedRight = Object.entries(sched).filter(([, v]) => v.rightPv > 0).map(([k]) => k)
          scatterSmallChunks(sched, workdays, [...usedLeft, ...usedRight], rem, 'leftPv')
        }
      }
    }
  }

  return days.map((d) => ({
    ...d,
    leftPv:  hasLeftSub  ? 0 : (sched[d.date].leftPv  || 0),
    rightPv: hasRightSub ? 0 : (sched[d.date].rightPv || 0),
    bodyPv:  0,
  }))
}

// ─── 2단계: bodyPv DM 갭 인식 배치 후 잔여 균등 분산 ─────────────

function optimizeBodyPv(allNodes) {
  let nodes = allNodes

  // DM 노드마다 롤업 갭 계산 → 하위 SM/SSM bodyPv를 갭 해소에 우선 배치
  const dmRanks = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM']
  for (const dm of nodes.filter((n) => dmRanks.includes(n.rank))) {
    const gaps = computeDmRollupGaps(dm.id, nodes)
    const leftSubIds  = new Set(getLeftSubtree(dm.id, nodes).map((n) => n.id))
    const rightSubIds = new Set(getRightSubtree(dm.id, nodes).map((n) => n.id))

    for (const { date, leftGap, rightGap } of gaps) {
      // 좌 갭 (CHUNK 이하): 좌 서브트리 SM에서 bodyPv 할당
      if (leftGap > 0 && leftGap <= CHUNK) {
        const idx = nodes.findIndex((n) =>
          leftSubIds.has(n.id) && ['SM', 'SSM'].includes(n.rank) &&
          (n.bodyPvPool || 0) >= leftGap &&
          !n.days?.find((d) => d.date === date)?.isSunday,
        )
        if (idx >= 0) {
          nodes = nodes.map((n, i) => i !== idx ? n : {
            ...n,
            bodyPvPool: n.bodyPvPool - leftGap,
            days: n.days.map((d) => d.date === date ? { ...d, bodyPv: (d.bodyPv || 0) + leftGap } : d),
          })
        }
      }
      // 우 갭 (CHUNK 이하): 우 서브트리 SM에서 bodyPv 할당
      if (rightGap > 0 && rightGap <= CHUNK) {
        const idx = nodes.findIndex((n) =>
          rightSubIds.has(n.id) && ['SM', 'SSM'].includes(n.rank) &&
          (n.bodyPvPool || 0) >= rightGap &&
          !n.days?.find((d) => d.date === date)?.isSunday,
        )
        if (idx >= 0) {
          nodes = nodes.map((n, i) => i !== idx ? n : {
            ...n,
            bodyPvPool: n.bodyPvPool - rightGap,
            days: n.days.map((d) => d.date === date ? { ...d, bodyPv: (d.bodyPv || 0) + rightGap } : d),
          })
        }
      }
    }
  }

  // 잔여 bodyPv: 조용한 날에 SMALL_CHUNK씩 균등 분산
  nodes = nodes.map((node) => {
    if (!['SM', 'SSM'].includes(node.rank) || (node.bodyPvPool || 0) <= 0) return node

    const quietDates = node.days
      .filter((d) => !d.isSunday && !(d.leftPv || 0) && !(d.rightPv || 0) && !(d.bodyPv || 0))
      .map((d) => d.date)
    const allWorkDates = node.days
      .filter((d) => !d.isSunday && !(d.bodyPv || 0))
      .map((d) => d.date)
    const candidates = quietDates.length > 0 ? quietDates : allWorkDates
    if (!candidates.length) return node

    const pool = node.bodyPvPool
    const chunks = Math.ceil(pool / SMALL_CHUNK)
    const selected = evenSpacingFromDates(candidates, Math.min(chunks, candidates.length))

    let rem = pool
    const bodyMap = {}
    for (const date of selected) {
      if (rem <= 0) break
      const amount = Math.min(SMALL_CHUNK, rem)
      bodyMap[date] = (bodyMap[date] || 0) + amount
      rem -= amount
    }
    if (rem > 0 && selected.length > 0) {
      const last = selected[selected.length - 1]
      bodyMap[last] = (bodyMap[last] || 0) + rem
    }

    return {
      ...node,
      bodyPvPool: 0,
      days: node.days.map((d) => ({ ...d, bodyPv: (d.bodyPv || 0) + (bodyMap[d.date] ?? 0) })),
    }
  })

  return nodes
}

// ─── 진입점 ──────────────────────────────────────────────────────

export function runOptimization(allNodes, year, month, half) {
  // 1단계: SSM 우선 배치 후 SM 배치
  let nodes = [...allNodes]
  const schedulingOrder = ['SSM', 'SM']
  for (const rank of schedulingOrder) {
    nodes = nodes.map((node) => {
      if (node.rank !== rank) return node
      const hasLeftSub  = getLeftSubtree(node.id, nodes).length > 0
      const hasRightSub = getRightSubtree(node.id, nodes).length > 0
      return { ...node, days: buildBaseSchedule(node, year, month, half, hasLeftSub, hasRightSub) }
    })
  }

  // 2단계: bodyPv DM 갭 인식 배치 + 잔여 균등 분산
  nodes = optimizeBodyPv(nodes)

  return nodes
}
