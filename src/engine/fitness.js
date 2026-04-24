import { simulateCumulative, MAN } from './simulate.js'
import { getLeftSubtree, getRightSubtree, getAllDescendants, sumSubtreePv } from './rollup.js'

// ═══════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════

export const MATCH_UNIT = 30  // 30만 PV — 기본 매칭 단위
export const BODY_CHUNK = 10  // 10만 PV — 몸PV 분할 최소 단위
const SM_RANKS = ['SSM', 'SM']
const DM_RANKS = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM']

// Threshold Trap 전략: DM의 일일 누적 min(L,R)가 다음 tier 경계 직전에
// 머물면 파트너 초과 PV + 자연발생 PV가 보태졌을 때 한 단계 위 수당으로
// 점프할 수 있는 '그물'이 된다. 구간별 가중치는 사용자 튜닝 대상.
//
// 판정값 m은 '만 단위'이며 [min, max) 구간이다.
export const FITNESS_ZONES = [
  { min: 30,  max: 40,  score: +10, label: 'tier1_safe'  }, // 30만 매칭 확보
  { min: 40,  max: 60,  score: -20, label: 'waste_low'   }, // 60만 trap 닿기 애매
  { min: 60,  max: 70,  score: +50, label: 'tier2_trap'  }, // ★ 70만/30점 점프 가능
  { min: 70,  max: 80,  score:   0, label: 'tier2_safe'  }, // tier2 확보, trap 없음
  { min: 80,  max: 140, score: -20, label: 'waste_mid'   }, // 150만 trap 너무 멀음
  { min: 140, max: 150, score: +40, label: 'tier3_trap'  }, // ★ 150만/60점 점프 가능
]

// ═══════════════════════════════════════════════════════════════════
// 유틸 — 트리 순회
// ═══════════════════════════════════════════════════════════════════

function closestDmAncestor(nodeId, allNodes) {
  let cur = allNodes.find((n) => n.id === nodeId)
  while (cur?.parentId) {
    const parent = allNodes.find((n) => n.id === cur.parentId)
    if (!parent) return null
    if (DM_RANKS.includes(parent.rank)) return parent.id
    cur = parent
  }
  return null
}

// dmNodeId에 속하는 SM/SSM leaf만 반환.
// (중첩 DM이 있으면 그 하위 SM은 안쪽 DM이 소유하므로 제외)
function findOwnedSmLeaves(dmNodeId, allNodes) {
  const descendants = getAllDescendants(dmNodeId, allNodes)
  return descendants.filter(
    (n) => SM_RANKS.includes(n.rank) && closestDmAncestor(n.id, allNodes) === dmNodeId,
  )
}

function getDepth(nodeId, allNodes) {
  let depth = 0
  let cur = allNodes.find((n) => n.id === nodeId)
  while (cur?.parentId) {
    depth++
    cur = allNodes.find((n) => n.id === cur.parentId)
  }
  return depth
}

// workdays 배열에서 count개를 균등 간격으로 선택. offset만큼 시작점을 밀어
// 같은 SM이라도 여러 phase candidate를 생성할 수 있게 한다.
function pickEvenSpaced(workdays, count, offset = 0) {
  if (count <= 0 || !workdays.length) return []
  if (count >= workdays.length) return [...workdays]
  if (count === 1) {
    const idx = Math.max(0, Math.min(workdays.length - 1, Math.floor((workdays.length - 1) / 2) + offset))
    return [workdays[idx]]
  }
  const step = (workdays.length - 1) / (count - 1)
  const out = []
  for (let i = 0; i < count; i++) {
    const idx = Math.max(0, Math.min(workdays.length - 1, Math.round(i * step) + offset))
    out.push(workdays[idx])
  }
  // 중복 제거 (offset이 커지면 뒤쪽에서 포화 가능)
  return [...new Set(out)]
}

// ═══════════════════════════════════════════════════════════════════
// SM 후보 스케줄 생성
// ═══════════════════════════════════════════════════════════════════

// SM/SSM 1명에 대해 여러 "징검다리 배열" 후보를 만든다.
// 좌/우 phase를 서로 독립 배정해 '이틀매칭'이 자연스럽게 허용되도록 한다.
//
// 반환: [{ scheduleByDate: { [date]: {leftPv, rightPv} } }, ...]
//   - scheduleByDate에 없는 날은 0으로 간주
//   - bodyPv는 여기서 배치하지 않음 (Phase 2에서 투입)
export function generateSmCandidates(smNode, workdays, allNodes) {
  const hasLeftSub  = getLeftSubtree(smNode.id, allNodes).length > 0
  const hasRightSub = getRightSubtree(smNode.id, allNodes).length > 0

  // 수동 입력(manual* 플래그)된 PV만 목표에서 차감한다.
  // locked는 날짜 단위라 "좌만 수동 입력한 날"의 우PV(optimizer 배치)까지
  // 차감해버리는 오류가 생기므로, 칸별 manualLeft/Right로 정확히 구분한다.
  const lockedDates = new Set((smNode.days || []).filter((d) => d.locked).map((d) => d.date))
  const lockedLeft  = (smNode.days || []).filter((d) => d.manualLeft).reduce((s, d) => s + (d.leftPv  || 0), 0)
  const lockedRight = (smNode.days || []).filter((d) => d.manualRight).reduce((s, d) => s + (d.rightPv || 0), 0)

  const leftTarget  = hasLeftSub  ? 0 : Math.max(0, (smNode.targetLeft  || 0) - lockedLeft)
  const rightTarget = hasRightSub ? 0 : Math.max(0, (smNode.targetRight || 0) - lockedRight)

  // locked 날짜를 후보 영업일에서 제외
  const freeWorkdays = workdays.filter((d) => !lockedDates.has(d.date))

  const matchCountL = Math.floor(leftTarget  / MATCH_UNIT)
  const matchCountR = Math.floor(rightTarget / MATCH_UNIT)
  const leftRem     = leftTarget  - matchCountL * MATCH_UNIT
  const rightRem    = rightTarget - matchCountR * MATCH_UNIT

  // 양쪽 모두 자식 있거나 배치할 PV가 없으면 — 후보 1개(빈 스케줄)만.
  if (matchCountL === 0 && matchCountR === 0 && leftRem === 0 && rightRem === 0) {
    return [{ scheduleByDate: {} }]
  }

  // phase 조합: (L-phase, R-phase). freeWorkdays 기준으로 배치.
  // (0,0) = 동일 시점, (0,1) = L→R 이틀매칭, (1,0) = R→L 이틀매칭.
  // (2,0) / (0,2) = 2일 간격 교차.
  // (-2,0) / (0,-2) = 마지막 chunk를 앞으로 당기기 (음수 offset, 하한 클램프 적용)
  const PHASE_COMBOS = [
    [0, 0],
    [0, 1],
    [1, 0],
    [0, 2],
    [2, 0],
    [-2, 0],
    [0, -2],
  ]

  // leftRem/rightRem 배치 위치 후보: 앞(0), 중간(35%), 끝(last)
  // 기존 동작(last)이 항상 포함되므로 하위 호환성 유지
  const remPositions = freeWorkdays.length > 0
    ? [
        freeWorkdays[0],
        freeWorkdays[Math.floor(freeWorkdays.length * 0.35)],
        freeWorkdays[freeWorkdays.length - 1],
      ].filter(Boolean)
    : []

  const candidates = []
  for (const [phaseL, phaseR] of PHASE_COMBOS) {
    for (const remDay of (remPositions.length > 0 ? remPositions : [null])) {
      const sched = {}
      for (const wd of workdays) sched[wd.date] = { leftPv: 0, rightPv: 0 }

      // 좌 배치 (freeWorkdays 기준)
      if (matchCountL > 0) {
        const datesL = pickEvenSpaced(freeWorkdays, matchCountL, phaseL)
        for (const wd of datesL) sched[wd.date].leftPv += MATCH_UNIT
      }
      if (leftRem > 0 && remDay) {
        sched[remDay.date].leftPv += leftRem
      }

      // 우 배치 (freeWorkdays 기준)
      if (matchCountR > 0) {
        const datesR = pickEvenSpaced(freeWorkdays, matchCountR, phaseR)
        for (const wd of datesR) sched[wd.date].rightPv += MATCH_UNIT
      }
      if (rightRem > 0 && remDay) {
        sched[remDay.date].rightPv += rightRem
      }

      candidates.push({ scheduleByDate: sched })
    }
  }

  // 중복 후보 제거 (phase 포화로 같은 날짜 배열이 나올 수 있음)
  const seen = new Set()
  return candidates.filter(({ scheduleByDate }) => {
    const key = JSON.stringify(scheduleByDate)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ═══════════════════════════════════════════════════════════════════
// DM 롤업 시뮬레이션
// ═══════════════════════════════════════════════════════════════════

// 주어진 nodes 상태에서 dmNode 기준 일별 누적 (cumLeft, cumRight, score) 계산.
// simulateCumulative를 그대로 재사용 — 이 곳에 자체 루프를 두지 않는다.
export function rollupDmDaily(dmNode, allNodes) {
  const leftSub  = getLeftSubtree(dmNode.id, allNodes)
  const rightSub = getRightSubtree(dmNode.id, allNodes)

  return simulateCumulative(dmNode.days || [], {
    getDailyLeft:  (day) => (day.leftPv  || 0) * MAN + sumSubtreePv(leftSub,  day.date),
    getDailyRight: (day) => (day.rightPv || 0) * MAN + sumSubtreePv(rightSub, day.date),
    getBodyPv:     () => 0, // DM 이상은 본인 몸PV 없음
  })
}

// ═══════════════════════════════════════════════════════════════════
// Fitness 평가
// ═══════════════════════════════════════════════════════════════════

function zoneScore(manValue) {
  for (const z of FITNESS_ZONES) {
    if (manValue >= z.min && manValue < z.max) return z.score
  }
  return 0
}

// 하루치 누적 min(L,R) 값이 '만 단위'로 어느 FITNESS_ZONE에 들어가는지에 따라
// 점수를 부여하고 전체 합을 반환한다.
export function calculateFitness(dailyRollup) {
  let total = 0
  for (const entry of dailyRollup) {
    if (entry.isSunday) continue
    const m = Math.min(entry.cumLeft || 0, entry.cumRight || 0) / MAN
    total += zoneScore(m)
  }
  return total
}

// ═══════════════════════════════════════════════════════════════════
// 조합 탐색
// ═══════════════════════════════════════════════════════════════════

// SM 후보 스케줄을 nodes에 적용한 새 배열 반환 (immutable).
// locked: true 인 날짜(수동 입력)는 덮어쓰지 않는다.
function applyScheduleToNode(nodes, smNodeId, scheduleByDate) {
  return nodes.map((n) => {
    if (n.id !== smNodeId) return n
    return {
      ...n,
      days: (n.days || []).map((d) => {
        if (d.locked) return d  // 수동 입력 날짜 보존
        return {
          ...d,
          leftPv:  scheduleByDate[d.date]?.leftPv  ?? 0,
          rightPv: scheduleByDate[d.date]?.rightPv ?? 0,
          // bodyPv는 Phase 1에서 건드리지 않음 — Phase C(scatter)에서만 배치
          bodyPv:  0,
        }
      }),
    }
  })
}

// DM 1개에 대해 소유 SM들의 후보 조합을 탐색하고 최고 fitness 조합을 nodes에 적용.
//
// 탐색 공간: 각 SM마다 K(=3) 후보 × N명 → K^N.
//   - N ≤ 6 (≤729): 완전탐색
//   - N >  6: beam search (폭 B=20) — SM 하나씩 추가하며 부분 fitness top-B 유지
//
// 반환: 최적 조합이 적용된 nodes (변경 없으면 원본).
export function searchBestCombination(dmNode, allNodes, workdays, { beamWidth = 20, fullSearchLimit = 5 } = {}) {
  const owned = findOwnedSmLeaves(dmNode.id, allNodes)
  if (owned.length === 0) return allNodes

  // 각 SM 후보 생성
  const candidatesPerSm = owned.map((sm) => ({
    smId:       sm.id,
    candidates: generateSmCandidates(sm, workdays, allNodes),
  }))

  // 후보가 사실상 1개뿐인 SM은 탐색 공간에서 제외(가속)
  const varying = candidatesPerSm.filter((c) => c.candidates.length > 1)
  const fixed   = candidatesPerSm.filter((c) => c.candidates.length <= 1)

  // 고정 SM은 첫 후보 그대로 적용
  let baseNodes = allNodes
  for (const f of fixed) {
    baseNodes = applyScheduleToNode(baseNodes, f.smId, f.candidates[0].scheduleByDate)
  }

  if (varying.length === 0) return baseNodes

  // 평가 함수
  const evaluate = (nodes) => {
    const liveDm = nodes.find((n) => n.id === dmNode.id)
    if (!liveDm) return -Infinity
    return calculateFitness(rollupDmDaily(liveDm, nodes))
  }

  // 완전탐색 (N ≤ fullSearchLimit)
  if (varying.length <= fullSearchLimit) {
    let best = { fitness: -Infinity, nodes: baseNodes }

    const enumerate = (idx, curNodes) => {
      if (idx === varying.length) {
        const f = evaluate(curNodes)
        if (f > best.fitness) best = { fitness: f, nodes: curNodes }
        return
      }
      const { smId, candidates } = varying[idx]
      for (const cand of candidates) {
        const next = applyScheduleToNode(curNodes, smId, cand.scheduleByDate)
        enumerate(idx + 1, next)
      }
    }
    enumerate(0, baseNodes)
    return best.nodes
  }

  // Beam search (N > fullSearchLimit)
  let beam = [{ nodes: baseNodes, fitness: evaluate(baseNodes) }]
  for (const { smId, candidates } of varying) {
    const expanded = []
    for (const b of beam) {
      for (const cand of candidates) {
        const next = applyScheduleToNode(b.nodes, smId, cand.scheduleByDate)
        expanded.push({ nodes: next, fitness: evaluate(next) })
      }
    }
    expanded.sort((a, b) => b.fitness - a.fitness)
    beam = expanded.slice(0, beamWidth)
  }
  return beam[0]?.nodes ?? baseNodes
}

// ═══════════════════════════════════════════════════════════════════
// 트리 전체 최적화 (깊은 DM 먼저)
// ═══════════════════════════════════════════════════════════════════

// 모든 DM 이상 노드에 대해 깊은 것부터 searchBestCombination 적용.
// 깊은 DM 결과가 상위 SRM 등의 롤업 입력이 된다. 단, '강제 target'이 아닌
// 해당 DM의 소유 SM 범위 내에서의 local search이므로 상위 탐색이 하위 결과를
// 덮어쓰지 않는다.
export function optimizeAllDms(allNodes, workdays, opts) {
  const dms = allNodes
    .filter((n) => DM_RANKS.includes(n.rank))
    .sort((a, b) => getDepth(b.id, allNodes) - getDepth(a.id, allNodes))

  let nodes = allNodes
  for (const dm of dms) {
    const live = nodes.find((n) => n.id === dm.id)
    if (!live) continue
    nodes = searchBestCombination(live, nodes, workdays, opts)
  }
  return nodes
}
