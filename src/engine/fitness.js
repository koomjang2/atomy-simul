import { simulateCumulative, MAN } from './simulate.js'
import { getLeftSubtree, getRightSubtree, getAllDescendants, sumSubtreePv, computeNodeSimulation } from './rollup.js'

// ═══════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════

export const MATCH_UNIT = 30  // 30만 PV — 기본 매칭 단위
export const BODY_CHUNK = 10  // 10만 PV — 몸PV 분할 최소 단위
const SM_RANKS = ['SSM', 'SM']
const DM_RANKS = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM']

// [수정 핵심 1] 매일 수당 보너스를 압도적으로 높임 (8 -> 100)
export const STRANDED_THRESHOLD = 3;  // N영업일 이상 불균형 지속될 때만 penalty 부과
export const DAILY_PAYOUT_BONUS = 100; // ★ 이틀 매칭을 무조건 유도하는 마법의 숫자 ★

// [수정 핵심 2] FITNESS_ZONES 밸런스 패치
// 30만 매칭의 가치를 높이고, 60만/140만의 가치를 조정하여 매일 끊기지 않는 수당을 최우선으로 유도.
export const FITNESS_ZONES = [
  { min: 30,  max: 40,  score: +20, label: 'tier1_safe'  }, // 30만 매칭 확보 (매일 보너스 100점이 더해지면 무조건 이득)
  { min: 40,  max: 60,  score: -20, label: 'waste_low'   }, // 애매한 점수 지양
  { min: 60,  max: 70,  score: +30, label: 'tier2_trap'  }, // 60만 트랩 (보너스 포함해도 30만 이틀(120점*2) 분할을 못 이기게 세팅)
  { min: 70,  max: 80,  score:   0, label: 'tier2_safe'  }, 
  { min: 80,  max: 140, score: -20, label: 'waste_mid'   }, 
  { min: 140, max: 150, score: +50, label: 'tier3_trap'  }, // 140만 트랩 (자연발생 PV를 노리는 고점수 부여)
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
  const used = new Set()
  const out = []
  for (let i = 0; i < count; i++) {
    let idx = Math.max(0, Math.min(workdays.length - 1, Math.round(i * step) + offset))
    // 중복이면 가장 가까운 미사용 인덱스로 이동 (hi 우선)
    if (used.has(idx)) {
      let lo = idx - 1, hi = idx + 1, found = false
      while (!found && (lo >= 0 || hi < workdays.length)) {
        if (hi < workdays.length && !used.has(hi)) { idx = hi; found = true }
        else if (lo >= 0 && !used.has(lo))         { idx = lo; found = true }
        else { lo--; hi++ }
      }
    }
    used.add(idx)
    out.push(workdays[idx])
  }
  return out
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

  // phase 조합: [phaseL, phaseR, sliceL, sliceR]
  // phaseL/R: pickEvenSpaced offset (양수 = 뒤로, 0 = 중앙)
  // sliceL/R: freeWorkdays 끝에서 제외할 일수 → 마지막 chunk가 앞으로 당겨짐
  //           (음수 offset 대신 slice를 쓰면 dedup 없이도 총합이 보장됨)
  const PHASE_COMBOS = [
    [0, 0, 0, 0],
    [0, 1, 0, 0],
    [1, 0, 0, 0],
    [0, 2, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 2, 0],   // L 마지막 chunk를 2영업일 앞으로
    [0, 0, 0, 2],   // R 마지막 chunk를 2영업일 앞으로
  ]

  const candidates = []
  for (const [phaseL, phaseR, sliceL, sliceR] of PHASE_COMBOS) {
    const sched = {}
    for (const wd of workdays) sched[wd.date] = { leftPv: 0, rightPv: 0 }

    // slice: chunk 수용 가능한 경우에만 적용
    const daysL = sliceL > 0 && freeWorkdays.length - sliceL >= matchCountL
      ? freeWorkdays.slice(0, -sliceL)
      : freeWorkdays
    const daysR = sliceR > 0 && freeWorkdays.length - sliceR >= matchCountR
      ? freeWorkdays.slice(0, -sliceR)
      : freeWorkdays

    // 좌 배치 (freeWorkdays 기준)
    if (matchCountL > 0) {
      const datesL = pickEvenSpaced(daysL, matchCountL, phaseL)
      for (const wd of datesL) sched[wd.date].leftPv += MATCH_UNIT
    }
    if (leftRem > 0 && freeWorkdays.length > 0) {
      // chunk 없는 마지막 날에 rem 배치 → chunk+rem 합산으로 40万 초과 방지
      const lRemDay = [...freeWorkdays].reverse().find(d => sched[d.date].leftPv === 0)
        ?? freeWorkdays[freeWorkdays.length - 1]
      sched[lRemDay.date].leftPv += leftRem
    }

    // 우 배치 (freeWorkdays 기준)
    if (matchCountR > 0) {
      const datesR = pickEvenSpaced(daysR, matchCountR, phaseR)
      for (const wd of datesR) sched[wd.date].rightPv += MATCH_UNIT
    }
    if (rightRem > 0 && freeWorkdays.length > 0) {
      const rRemDay = [...freeWorkdays].reverse().find(d => sched[d.date].rightPv === 0)
        ?? freeWorkdays[freeWorkdays.length - 1]
      sched[rRemDay.date].rightPv += rightRem
    }

    candidates.push({ scheduleByDate: sched })
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

// [수정된 부분] 매일 수당 보너스 및 N일 방치 패널티 로직이 적용된 함수
export function calculateFitness(dailyRollup) {
  let total = 0
  let strandedDays = 0 // 추가된 변수: 한쪽으로만 점수가 쌓여 매칭이 안되는 일수 카운트
  
  for (const entry of dailyRollup) {
    if (entry.isSunday) continue
    
    const minLR = Math.min(entry.cumLeft || 0, entry.cumRight || 0) / MAN
    const maxLR = Math.max(entry.cumLeft || 0, entry.cumRight || 0) / MAN
    
    total += zoneScore(minLR)
    
    // 수당 발생 및 패널티 억제 로직
    if ((entry.score || 0) > 0) {
      total += DAILY_PAYOUT_BONUS // 수당 발생 시 보너스 추가
      strandedDays = 0 // 정체 일수 초기화
    } else if (minLR < MATCH_UNIT && maxLR >= MATCH_UNIT * 2) {
      strandedDays++
      // 정체 일수가 STRANDED_THRESHOLD(3일) 이상 지속될 때만 패널티 부과
      if (strandedDays >= STRANDED_THRESHOLD) {
        total -= (maxLR - minLR)
      }
    } else {
      strandedDays = 0 // 정상 밸런스일 경우 정체 일수 초기화
    }
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
export function searchBestCombination(dmNode, allNodes, workdays, { beamWidth = 20, fullSearchLimit = 6 } = {}) {
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

  // 평가 함수 — lexicographic 튜플 [smScore, dmFitness] 반환.
  // 1순위: 소유 SM들의 자체 점수 합 (사용자 원칙: 하위 직급자 최대점수 절대 우선).
  // 2순위: DM rollup fitness (SM 점수 동점 시 trap zone 유도용 tiebreak).
  const evaluate = (nodes) => {
    const liveDm = nodes.find((n) => n.id === dmNode.id)
    if (!liveDm) return [-Infinity, -Infinity]
    const smScore = sumOwnedSmScore(dmNode.id, nodes)
    const dmFit   = calculateFitness(rollupDmDaily(liveDm, nodes))
    return [smScore, dmFit]
  }

  // 완전탐색 (N ≤ fullSearchLimit)
  if (varying.length <= fullSearchLimit) {
    let best = { fitness: [-Infinity, -Infinity], nodes: baseNodes }

    const enumerate = (idx, curNodes) => {
      if (idx === varying.length) {
        const f = evaluate(curNodes)
        if (isBetter(f, best.fitness)) best = { fitness: f, nodes: curNodes }
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
    expanded.sort((a, b) => cmpFitness(b.fitness, a.fitness))
    beam = expanded.slice(0, beamWidth)
  }
  return beam[0]?.nodes ?? baseNodes
}

// dmNodeId에 직접 소유된 SM/SSM leaf들의 자체 점수 합산.
// findOwnedSmLeaves가 closestDmAncestor 기준으로 필터하므로 중첩 DM의
// 하위 SM은 포함되지 않는다 (그쪽은 안쪽 DM이 소유).
function sumOwnedSmScore(dmNodeId, allNodes) {
  const owned = findOwnedSmLeaves(dmNodeId, allNodes)
  let total = 0
  for (const sm of owned) {
    const sim = computeNodeSimulation(sm.id, allNodes)
    for (const day of sim) {
      if (day.score > 0) total += day.score
    }
  }
  return total
}

// Lexicographic 비교: a = [smScore, dmFit], b = 동형.
// SM 점수 우선, 동점이면 DM fitness 비교.
function isBetter(a, b) {
  if (a[0] !== b[0]) return a[0] > b[0]
  return a[1] > b[1]
}

// sort용 비교 함수 — a > b이면 양수 ('a - b' 의미).
// 호출 측에서 인자 순서를 뒤집어 descending sort를 얻는다.
function cmpFitness(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0]
  return a[1] - b[1]
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