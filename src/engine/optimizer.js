import { buildCalendar, getWorkdays } from './calendar.js'
import { getLeftSubtree, getRightSubtree } from './rollup.js'
import { getScore, SCORE_TIERS } from './pvRules.js'

// ═══════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════

const MATCH_UNIT  = 30      // SM 1회 매칭 단위 (만 PV = 30만)
const BODY_CHUNK  = 10      // 몸PV 분할 최소 단위 (만 PV = 10만)
const SHIFT_RANGE = 2       // Shift 허용 범위 (앞으로 당길 수 있는 최대 일수)
const MAN         = 10_000  // 1만 단위 환산 (PV 저장: 만 단위, 계산: 원 단위)

// ═══════════════════════════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════════════════════════

/**
 * workdayObjs 배열에서 count개를 균등 간격으로 선택.
 *
 * 예: 13영업일 중 5개 → 인덱스 [0, 3, 6, 9, 12] → 1, 4, 7, 10, 13일
 * count=1이면 중간 날짜 1개 반환.
 */
function pickEvenSpaced(workdayObjs, count) {
  if (count <= 0 || !workdayObjs.length) return []
  if (count >= workdayObjs.length) return [...workdayObjs]
  if (count === 1) return [workdayObjs[Math.floor((workdayObjs.length - 1) / 2)]]
  const step = (workdayObjs.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => workdayObjs[Math.round(i * step)])
}

/**
 * 노드의 트리 깊이 계산 (bottom-up DM 처리 순서 결정).
 * parentId 체인을 따라 루트까지 올라간 횟수를 반환.
 */
function getDepth(nodeId, allNodes) {
  let depth = 0
  let cur = allNodes.find(n => n.id === nodeId)
  while (cur?.parentId) {
    depth++
    cur = allNodes.find(n => n.id === cur.parentId)
  }
  return depth
}

// ═══════════════════════════════════════════════════════════════════
// Phase 1 ─ SM/SSM 징검다리 간격 분배 (Even-Spacing Array)
// ═══════════════════════════════════════════════════════════════════

/**
 * SM/SSM 기본 PV 일정을 '징검다리 배열'로 생성한다.
 *
 * [기존 문제] 30万+10万 혼합 배치 → 앞쪽 날짜에 Front-loading 발생
 *
 * [새 알고리즘]
 *  1. 소실적(우 PV)을 30만 단위 매칭 횟수로 나눔
 *     예: 210만 → matchCount=7 (7×30=210), remainder=0
 *     예: 220만 → matchCount=7, remainder=10 (7×30+10)
 *  2. 13영업일 중 matchCount개를 2~3일 간격으로 균등 배치
 *     예: 5회 → [1, 4, 7, 10, 13일]
 *  3. 좌 PV는 동일 날짜에 30만 앵커 → 같은 날 매칭으로 DM 롤업 극대화
 *  4. 좌 초과분(leftTarget - matchCount×30)은 조용한 날에 10만씩 분산
 *  5. 몸PV 풀은 이 단계에서 '절대 사용 안 함' → Phase 2에서만 투입
 *     (DM 갭을 채우는 용도로만 사용하기 위해 풀 대기)
 *
 * @param {object}   node        - { targetLeft, targetRight, bodyPvPool }
 * @param {object[]} workdays    - 영업일 배열 [{ date, isSunday, ... }]
 * @param {boolean}  hasLeftSub  - 좌 하위 서브트리 존재 여부
 * @param {boolean}  hasRightSub - 우 하위 서브트리 존재 여부
 * @returns {Object<number, {leftPv, rightPv}>}  { date: { leftPv, rightPv } }
 */
function buildSmEvenSpacingSchedule(node, workdays, hasLeftSub, hasRightSub) {
  const rightTarget = node.targetRight || 0
  const leftTarget  = node.targetLeft  || 0

  // 소실적 우 PV → 30만 단위 매칭 횟수 분해
  const matchCount     = Math.floor(rightTarget / MATCH_UNIT)
  const rightRemainder = rightTarget - matchCount * MATCH_UNIT

  // 균등 배치 날짜 선택 (workday 객체 배열)
  const matchWds   = pickEvenSpaced(workdays, matchCount)
  const matchDates = new Set(matchWds.map(d => d.date))

  // 빈 일정표 초기화
  const sched = {}
  for (const wd of workdays) sched[wd.date] = { leftPv: 0, rightPv: 0 }

  // ── 우 PV: 매칭 날짜에 30만씩 (하위 서브트리 없을 때만) ──────────
  if (!hasRightSub) {
    for (const date of matchDates) sched[date].rightPv = MATCH_UNIT
    // 나머지(< 30만): 마지막 영업일에 추가
    if (rightRemainder > 0 && workdays.length > 0) {
      sched[workdays[workdays.length - 1].date].rightPv += rightRemainder
    }
  }

  // ── 좌 PV: 매칭 날짜에 30만 앵커 + 초과분 조용한 날에 10만씩 분산 ──
  if (!hasLeftSub) {
    for (const date of matchDates) sched[date].leftPv = MATCH_UNIT

    // 좌 초과분: leftTarget - matchCount×30
    // (비대칭 케이스: leftTarget < matchCount×30이면 음수 → 건너뜀)
    const leftRem = leftTarget - matchCount * MATCH_UNIT
    if (leftRem > 0) {
      const quietWds = workdays.filter(d => !matchDates.has(d.date))
      const cands    = quietWds.length > 0 ? quietWds : workdays
      const chunks   = Math.ceil(leftRem / BODY_CHUNK)
      const selected = pickEvenSpaced(cands, Math.min(chunks, cands.length))

      let rem = leftRem
      for (const wd of selected) {
        if (rem <= 0) break
        const chunk = Math.min(BODY_CHUNK, rem)
        sched[wd.date].leftPv += chunk
        rem -= chunk
      }
      // 잔여 PV: 마지막 선택 날짜에 합산
      if (rem > 0 && selected.length > 0) {
        sched[selected[selected.length - 1].date].leftPv += rem
      }
    }
  }

  // bodyPv는 여기서 배치하지 않음 (Phase 2에서 DM 갭 채우기 용도로만 사용)
  return sched
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 헬퍼 ─ DM 롤업 시뮬레이션
// ═══════════════════════════════════════════════════════════════════

/**
 * DM의 하위 서브트리 PV를 날짜 순으로 누적 시뮬레이션.
 * 점수 발생 시 다음 날 0으로 초기화 (소실적 원리 적용).
 *
 * 시뮬레이션 방식: leftSub·rightSub 각 노드의 (leftPv + rightPv + bodyPv)를
 * DM의 해당 날짜 좌/우 누적에 합산한 뒤 getScore 호출.
 *
 * @param {object}   dmNode   - DM 노드 (days 배열은 날짜 열거 기준으로만 사용)
 * @param {object[]} leftSub  - 좌 서브트리 노드 배열
 * @param {object[]} rightSub - 우 서브트리 노드 배열
 * @returns {Array<{date, cumLeft, cumRight, score, isSunday}>}
 */
function simulateDmRollup(dmNode, leftSub, rightSub) {
  let cumLeft  = 0
  let cumRight = 0
  const result = []

  for (const day of (dmNode.days || [])) {
    if (day.isSunday) {
      result.push({ date: day.date, cumLeft, cumRight, score: 0, isSunday: true })
      continue
    }

    // 좌 서브트리: 해당 날짜 모든 PV 합산 (leftPv + rightPv + bodyPv 모두 상위로 롤업)
    const addLeft = leftSub.reduce((sum, n) => {
      const d = n.days?.find(x => x.date === day.date)
      return d ? sum + ((d.leftPv || 0) + (d.rightPv || 0) + (d.bodyPv || 0)) * MAN : sum
    }, 0)

    // 우 서브트리: 동일
    const addRight = rightSub.reduce((sum, n) => {
      const d = n.days?.find(x => x.date === day.date)
      return d ? sum + ((d.leftPv || 0) + (d.rightPv || 0) + (d.bodyPv || 0)) * MAN : sum
    }, 0)

    // DM 자신의 직접 입력 PV (DM 이상은 보통 0) + 서브트리 합산
    cumLeft  += (day.leftPv  || 0) * MAN + addLeft
    cumRight += (day.rightPv || 0) * MAN + addRight

    const score = getScore(cumLeft, cumRight)
    result.push({ date: day.date, cumLeft, cumRight, score })

    // 점수 발생 → 다음 날 초기화
    if (score > 0) { cumLeft = 0; cumRight = 0 }
  }

  return result
}

/**
 * 롤업 시뮬레이션에서 Tier 업그레이드 가능한 득점 날짜를 탐색.
 *
 * [반환 조건]
 *  - 득점 발생 날짜 (score > 0)
 *  - 한 단계 위 Tier가 존재
 *  - 좌/우 갭이 모두 0 < gap ≤ MATCH_UNIT (실질적으로 조정 가능한 범위)
 *
 * Tier 찾기: SCORE_TIERS.filter().pop() 방식 — cumLeft/cumRight로 실제 달성 tier를
 * 직접 역산하므로 score 값 비교보다 정확하고 명료.
 *
 * @returns {Array<{date, currentScore, nextScore, leftGap, rightGap}>}
 */
function findUpgradeOpportunities(rollupSim) {
  const opps = []

  for (const entry of rollupSim) {
    if (!entry.score || entry.isSunday) continue

    // 현재 누적 기준으로 실제 달성한 가장 높은 tier
    const currentTier = SCORE_TIERS
      .filter(t => entry.cumLeft >= t.threshold && entry.cumRight >= t.threshold)
      .pop()
    if (!currentTier) continue

    const nextTier = SCORE_TIERS[SCORE_TIERS.indexOf(currentTier) + 1]
    if (!nextTier) continue  // 이미 최상위 tier

    const leftGap  = Math.max(0, nextTier.threshold - entry.cumLeft)  / MAN
    const rightGap = Math.max(0, nextTier.threshold - entry.cumRight) / MAN

    // Shift 1회로 해결 가능한 범위(≤ MATCH_UNIT)만 대상
    if (leftGap <= MATCH_UNIT && rightGap <= MATCH_UNIT) {
      opps.push({
        date:         entry.date,
        currentScore: entry.score,
        nextScore:    nextTier.score,
        leftGap,
        rightGap,
      })
    }
  }

  return opps
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2a ─ 소갭(≤ BODY_CHUNK) → 몸PV 즉시 투입
// ═══════════════════════════════════════════════════════════════════

/**
 * DM 특정 날짜의 좌/우 갭을 하위 SM의 몸PV로 채운다.
 *
 * 조건:
 *  - 해당 날짜가 일요일 아닐 것
 *  - 투입 대상 SM의 bodyPvPool ≥ gap
 *
 * @param {string} side - 'left' | 'right' (DM의 어느 쪽 갭을 채울지)
 * @param {number} date - 투입할 날짜
 * @param {number} gap  - 채워야 할 만 PV 양
 * @returns {object[]} 업데이트된 nodes (변경 없으면 원본 참조 반환)
 */
function assignBodyPvToGap(nodes, dmNode, side, date, gap) {
  if (gap <= 0) return nodes

  const subNodes = side === 'left'
    ? getLeftSubtree(dmNode.id, nodes)
    : getRightSubtree(dmNode.id, nodes)

  // 해당 날짜에 bodyPv를 투입 가능한 SM 탐색
  const targetSm = subNodes
    .filter(n => ['SM', 'SSM'].includes(n.rank))
    .find(n => {
      const dayEntry = n.days?.find(d => d.date === date)
      return dayEntry && !dayEntry.isSunday && (n.bodyPvPool || 0) >= gap
    })

  if (!targetSm) return nodes  // 가용 SM 없음 → 원본 반환

  return nodes.map(n => {
    if (n.id !== targetSm.id) return n
    return {
      ...n,
      bodyPvPool: n.bodyPvPool - gap,
      days: n.days.map(d =>
        d.date !== date ? d : { ...d, bodyPv: (d.bodyPv || 0) + gap }
      ),
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2b ─ 중갭(BODY_CHUNK < gap ≤ MATCH_UNIT) → Shift 로직
// ═══════════════════════════════════════════════════════════════════

/**
 * 하위 SM의 30만 매칭 날짜를 targetDate로 앞당겨 DM tier 업그레이드를 시도.
 *
 * [Shift 방향] fromDate(미래) → targetDate(오늘 득점일) 방향으로만 당김.
 * fromDate 범위: targetDate 이후 SHIFT_RANGE일 이내.
 *
 * [검증 방식] ⚠️ 단일 날짜 비교 ❌ → 보름 전체 득점 합계 비교 ✅
 *  - Shift는 미래 PV를 현재로 당기는 행위 → 미래 사이클이 약화될 수 있음
 *  - trialTotal > originalTotal 이어야만 확정 (net-negative Shift 방지)
 *
 * @param {object[]} subNodes    - 해당 side 서브트리 노드
 * @param {string}   pvKey       - 'leftPv' | 'rightPv'
 * @param {number}   targetDate  - Shift 목표 날짜 (= opp.date)
 * @param {number}   origTotal   - Shift 이전 DM 보름 총 득점
 * @returns {object[]} 개선됐으면 새 nodes, 아니면 원본 nodes 참조
 */
function tryShiftToDate(nodes, dmNode, subNodes, pvKey, targetDate, origTotal) {
  // targetDate가 일요일이면 Shift 불가
  const targetDay = (dmNode.days || []).find(d => d.date === targetDate)
  if (!targetDay || targetDay.isSunday) return nodes

  const smCands = subNodes.filter(n => ['SM', 'SSM'].includes(n.rank))

  for (const sm of smCands) {
    // targetDate 이후 SHIFT_RANGE일 이내에서 30만 매칭이 있는 날 탐색
    const matchDays = (sm.days || []).filter(d =>
      !d.isSunday &&
      d.date > targetDate &&
      d.date <= targetDate + SHIFT_RANGE &&
      (d[pvKey] || 0) >= MATCH_UNIT
    )

    for (const fromDay of matchDays) {
      // 시험용 이동: fromDay.date → targetDate
      const trialNodes = nodes.map(n => {
        if (n.id !== sm.id) return n
        return {
          ...n,
          days: n.days.map(d => {
            if (d.date === fromDay.date)
              return { ...d, [pvKey]: Math.max(0, (d[pvKey] || 0) - MATCH_UNIT) }
            if (d.date === targetDate)
              return { ...d, [pvKey]: (d[pvKey] || 0) + MATCH_UNIT }
            return d
          }),
        }
      })

      // Shift 후 DM 보름 전체 득점 재계산
      const trialSim   = simulateDmRollup(
        dmNode,
        getLeftSubtree(dmNode.id, trialNodes),
        getRightSubtree(dmNode.id, trialNodes),
      )
      const trialTotal = trialSim.reduce((s, e) => s + e.score, 0)

      // 총점이 실제로 오를 때만 확정 (같거나 줄면 롤백)
      if (trialTotal > origTotal) return trialNodes
    }
  }

  return nodes  // 효과 있는 Shift 없음 → 원본 반환
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 메인 ─ DM 최우선 롤업·타겟 퍼즐링
// ═══════════════════════════════════════════════════════════════════

/**
 * 단일 DM 노드에 대해 bodyPv 갭 채우기 + Shift 최적화를 반복 실행.
 *
 * [re-simulate 루프 전략]
 *  bodyPv 투입이나 Shift 후 기회 목록(opps)이 stale해지므로,
 *  매 조치 직후 simulateDmRollup → findUpgradeOpportunities를 재실행.
 *  DM당 기회 횟수가 보통 2~4회이므로 성능 영향 없음.
 *
 * [처리 순서 per opportunity]
 *  1. 소갭(≤ BODY_CHUNK) 좌 → bodyPv 투입
 *  2. 소갭(≤ BODY_CHUNK) 우 → bodyPv 투입
 *  3. 중갭(BODY_CHUNK < gap ≤ MATCH_UNIT) 좌 → Shift
 *  4. 중갭(BODY_CHUNK < gap ≤ MATCH_UNIT) 우 → Shift
 *  기회 하나에서 좌·우 모두 처리 후 re-simulate.
 */
function optimizeDmNode(dmNode, nodes) {
  const MAX_ITER = 20  // 무한루프 방지

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const leftSub  = getLeftSubtree(dmNode.id, nodes)
    const rightSub = getRightSubtree(dmNode.id, nodes)
    const sim      = simulateDmRollup(dmNode, leftSub, rightSub)
    const opps     = findUpgradeOpportunities(sim)

    if (!opps.length) break

    const origTotal = sim.reduce((s, e) => s + e.score, 0)
    let anyChange   = false

    for (const opp of opps) {
      // ── 2a: 소갭 → 몸PV 투입 ────────────────────────────────────
      if (opp.leftGap > 0 && opp.leftGap <= BODY_CHUNK) {
        const prev = nodes
        nodes = assignBodyPvToGap(nodes, dmNode, 'left', opp.date, opp.leftGap)
        if (nodes !== prev) anyChange = true
      }
      if (opp.rightGap > 0 && opp.rightGap <= BODY_CHUNK) {
        const prev = nodes
        nodes = assignBodyPvToGap(nodes, dmNode, 'right', opp.date, opp.rightGap)
        if (nodes !== prev) anyChange = true
      }

      // ── 2b: 중갭 → Shift ─────────────────────────────────────────
      if (opp.leftGap > BODY_CHUNK && opp.leftGap <= MATCH_UNIT) {
        const prev = nodes
        nodes = tryShiftToDate(
          nodes, dmNode,
          getLeftSubtree(dmNode.id, nodes), 'leftPv',
          opp.date, origTotal,
        )
        if (nodes !== prev) anyChange = true
      }
      if (opp.rightGap > BODY_CHUNK && opp.rightGap <= MATCH_UNIT) {
        const prev = nodes
        nodes = tryShiftToDate(
          nodes, dmNode,
          getRightSubtree(dmNode.id, nodes), 'rightPv',
          opp.date, origTotal,
        )
        if (nodes !== prev) anyChange = true
      }

      // 이번 기회에서 변경 발생 → 즉시 re-simulate (opps가 stale해졌으므로)
      if (anyChange) break
    }

    // 이 iteration에서 아무것도 개선 안 됐으면 수렴 → 종료
    if (!anyChange) break
  }

  return nodes
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 ─ 잔여 bodyPv 균등 분산
// ═══════════════════════════════════════════════════════════════════

/**
 * Phase 2 이후 SM 잔여 bodyPv를 '조용한 날'에 10만씩 균등 분산.
 *
 * 조용한 날: leftPv, rightPv, bodyPv 모두 0인 영업일.
 * 조용한 날이 없으면 전체 영업일에 분산.
 */
function scatterRemainingBodyPv(nodes) {
  return nodes.map(node => {
    if (!['SM', 'SSM'].includes(node.rank)) return node
    const pool = node.bodyPvPool || 0
    if (pool <= 0) return node

    const workDays  = (node.days || []).filter(d => !d.isSunday)
    const quietDays = workDays.filter(d => !d.leftPv && !d.rightPv && !d.bodyPv)
    const cands     = quietDays.length > 0 ? quietDays : workDays
    if (!cands.length) return node

    const chunks   = Math.ceil(pool / BODY_CHUNK)
    const selected = pickEvenSpaced(cands, Math.min(chunks, cands.length))

    let rem = pool
    const bodyMap = {}
    for (const d of selected) {
      if (rem <= 0) break
      const chunk = Math.min(BODY_CHUNK, rem)
      bodyMap[d.date] = (bodyMap[d.date] || 0) + chunk
      rem -= chunk
    }
    // 잔여: 마지막 선택 날짜에 합산
    if (rem > 0 && selected.length > 0) {
      const lastDate = selected[selected.length - 1].date
      bodyMap[lastDate] = (bodyMap[lastDate] || 0) + rem
    }

    return {
      ...node,
      bodyPvPool: 0,
      days: node.days.map(d => ({
        ...d,
        bodyPv: (d.bodyPv || 0) + (bodyMap[d.date] ?? 0),
      })),
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// 진입점 ─ runOptimization
// ═══════════════════════════════════════════════════════════════════

export function runOptimization(allNodes, year, month, half) {
  const calDays  = buildCalendar(year, month, half)
  const workdays = getWorkdays(calDays)

  // ── Phase 1: SM/SSM 징검다리 배열 생성 ──────────────────────────
  // SSM → SM 순으로 처리 (상위 SSM 먼저 배치하여 DM 롤업 기준 설정)
  let nodes = allNodes
  for (const rank of ['SSM', 'SM']) {
    nodes = nodes.map(node => {
      if (node.rank !== rank) return node

      const hasLeftSub  = getLeftSubtree(node.id, nodes).length > 0
      const hasRightSub = getRightSubtree(node.id, nodes).length > 0
      const sched       = buildSmEvenSpacingSchedule(node, workdays, hasLeftSub, hasRightSub)

      return {
        ...node,
        days: calDays.map(d => ({
          ...d,
          leftPv:  hasLeftSub  ? 0 : (sched[d.date]?.leftPv  || 0),
          rightPv: hasRightSub ? 0 : (sched[d.date]?.rightPv || 0),
          bodyPv:  0,  // Phase 2까지 풀에서 대기
        })),
      }
    })
  }

  // ── Phase 2: DM 최적화 (bottom-up: 깊은 DM 먼저) ────────────────
  // 하위 DM이 bodyPv/Shift를 소진한 뒤 상위 DM이 남은 자원으로 최적화.
  // getDepth 내림차순 정렬 = 트리 말단 DM 우선.
  const DM_RANKS = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM']
  const dmsSorted = nodes
    .filter(n => DM_RANKS.includes(n.rank))
    .sort((a, b) => getDepth(b.id, nodes) - getDepth(a.id, nodes))

  for (const dm of dmsSorted) {
    // 이전 반복에서 nodes가 갱신됐을 수 있으므로 최신 노드 참조
    const liveDm = nodes.find(n => n.id === dm.id)
    if (liveDm) nodes = optimizeDmNode(liveDm, nodes)
  }

  // ── Phase 3: 잔여 bodyPv 분산 ─────────────────────────────────
  nodes = scatterRemainingBodyPv(nodes)

  return nodes
}
