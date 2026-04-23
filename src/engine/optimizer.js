import { buildCalendar, getWorkdays } from './calendar.js'
import { getLeftSubtree, getRightSubtree, getAllDescendants } from './rollup.js'
import { MAN } from './simulate.js'
import {
  BODY_CHUNK,
  FITNESS_ZONES,
  generateSmCandidates,
  optimizeAllDms,
  rollupDmDaily,
} from './fitness.js'

const SM_RANKS = ['SSM', 'SM']
const DM_RANKS = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM']

// ═══════════════════════════════════════════════════════════════════
// Phase A · 각 SSM/SM 초기화 (스케줄 탐색 시작점)
// ═══════════════════════════════════════════════════════════════════

// 모든 SSM/SM의 days[]를 0으로 리셋해 Phase B의 후보 탐색에 깨끗한
// 시작점을 제공한다. locked: true 인 날짜(수동 입력)는 건드리지 않는다.
function resetSmSchedules(nodes, calDays) {
  return nodes.map((n) => {
    if (!SM_RANKS.includes(n.rank)) return n
    return {
      ...n,
      days: calDays.map((d) => {
        const existing = n.days?.find((e) => e.date === d.date)
        if (existing?.locked) return existing  // 수동 입력 날짜 보존
        return { ...d, leftPv: 0, rightPv: 0, bodyPv: 0, locked: false }
      }),
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// Phase B보정 · DM 없는 solo SM/SSM에 기본 스케줄 적용
// ═══════════════════════════════════════════════════════════════════

// optimizeAllDms는 DM을 중심으로 돌아가므로, 트리에 DM이 없거나 DM 소유 범위
// 바깥에 있는 SM은 PV가 비어 있다. 그 경우 generateSmCandidates의 첫 후보를
// 그대로 적용한다 (solo SM 직급 달성 보장).
function applyDefaultForOrphans(nodes, workdays) {
  return nodes.map((n) => {
    if (!SM_RANKS.includes(n.rank)) return n
    const hasAnyPv = (n.days || []).some((d) => (d.leftPv || 0) + (d.rightPv || 0) > 0)
    if (hasAnyPv) return n
    const [first] = generateSmCandidates(n, workdays, nodes)
    const sched = first?.scheduleByDate || {}
    return {
      ...n,
      days: (n.days || []).map((d) => ({
        ...d,
        leftPv:  sched[d.date]?.leftPv  ?? (d.leftPv  || 0),
        rightPv: sched[d.date]?.rightPv ?? (d.rightPv || 0),
      })),
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// Phase C · Trap Boost (trap 경계에 살짝 못 미친 날 → 몸PV 투입)
// ═══════════════════════════════════════════════════════════════════

// DM의 해당 날짜 특정 side(subtree)에 있는 SM 중 잔여 bodyPvPool이
// 충분한 놈을 찾아 bodyPv를 추가한다. 성공 시 새 nodes를, 실패 시 원본 반환.
function injectBodyPv(nodes, dmId, side, date, gapMan) {
  if (gapMan <= 0) return nodes
  const subNodes =
    side === 'left' ? getLeftSubtree(dmId, nodes) : getRightSubtree(dmId, nodes)

  const target = subNodes
    .filter((n) => SM_RANKS.includes(n.rank))
    .find((n) => {
      const day = n.days?.find((d) => d.date === date)
      return day && !day.isSunday && (n.bodyPvPool || 0) >= gapMan
    })
  if (!target) return nodes

  return nodes.map((n) => {
    if (n.id !== target.id) return n
    return {
      ...n,
      bodyPvPool: n.bodyPvPool - gapMan,
      days: n.days.map((d) =>
        d.date !== date ? d : { ...d, bodyPv: (d.bodyPv || 0) + gapMan },
      ),
    }
  })
}

// Fitness zone 중 '간발 차로 trap 미달'인 날을 찾아 bodyPv로 끌어올린다.
// 예: min(L,R) = 52만 → tier2_trap(60~70)까지 8만 부족 → 좌·우 각 8만 투입.
// 투입 한도: BODY_CHUNK(10만) 이하만 시도 (대량 이동은 탐색 단계에서 이미 수행).
function applyTrapBoosts(nodes) {
  const TRAPS = FITNESS_ZONES.filter((z) => z.score > 0 && z.label.includes('trap'))
  const dms = nodes.filter((n) => DM_RANKS.includes(n.rank))

  for (const dm of dms) {
    // bodyPv 투입 직후 롤업이 바뀌므로 각 entry마다 재계산한다.
    const live = nodes.find((n) => n.id === dm.id)
    if (!live) continue
    const initialRollup = rollupDmDaily(live, nodes)

    for (const ref of initialRollup) {
      if (ref.isSunday) continue

      // 최신 상태로 해당 날짜의 누적 재평가
      const freshRollup = rollupDmDaily(nodes.find((n) => n.id === dm.id), nodes)
      const entry = freshRollup.find((e) => e.date === ref.date)
      if (!entry || entry.isSunday) continue

      const mL = (entry.cumLeft  || 0) / MAN
      const mR = (entry.cumRight || 0) / MAN

      const trap = TRAPS.find((z) => {
        const minLR = Math.min(mL, mR)
        return minLR >= z.min - BODY_CHUNK && minLR < z.min
      })
      if (!trap) continue

      const gapL = Math.max(0, trap.min - mL)
      const gapR = Math.max(0, trap.min - mR)
      if (gapL > 0 && gapL <= BODY_CHUNK) {
        nodes = injectBodyPv(nodes, dm.id, 'left', entry.date, gapL)
      }
      if (gapR > 0 && gapR <= BODY_CHUNK) {
        nodes = injectBodyPv(nodes, dm.id, 'right', entry.date, gapR)
      }
    }
  }
  return nodes
}

// ═══════════════════════════════════════════════════════════════════
// Phase D · 잔여 bodyPv 분산 (Quiet-Day Scatter)
// ═══════════════════════════════════════════════════════════════════

function pickEvenSpaced(arr, count) {
  if (count <= 0 || !arr.length) return []
  if (count >= arr.length) return [...arr]
  if (count === 1) return [arr[Math.floor((arr.length - 1) / 2)]]
  const step = (arr.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => arr[Math.round(i * step)])
}

// 각 SSM/SM의 남은 bodyPvPool을 조용한 날(좌/우/몸 모두 0인 영업일)에 10만
// chunk로 균등 분산. 조용한 날이 없으면 전체 영업일에 분산.
function scatterRemainingBodyPv(nodes) {
  return nodes.map((node) => {
    if (!SM_RANKS.includes(node.rank)) return node
    const pool = node.bodyPvPool || 0
    if (pool <= 0) return node

    const workDays  = (node.days || []).filter((d) => !d.isSunday)
    const quietDays = workDays.filter((d) => !d.leftPv && !d.rightPv && !d.bodyPv)
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
    if (rem > 0 && selected.length > 0) {
      const last = selected[selected.length - 1].date
      bodyMap[last] = (bodyMap[last] || 0) + rem
    }

    return {
      ...node,
      bodyPvPool: 0,
      days: node.days.map((d) => ({
        ...d,
        bodyPv: (d.bodyPv || 0) + (bodyMap[d.date] ?? 0),
      })),
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// 진입점
// ═══════════════════════════════════════════════════════════════════

// App.jsx:35가 호출하는 공개 API. 시그니처 불변.
//
// 전체 흐름:
//   A. SM 스케줄 리셋 (탐색 시작점)
//   B. Fitness 기반 조합 탐색 (깊은 DM 먼저, 소유 SM 범위 내 local search)
//   C. Trap Boost — 간발 차 미달 날 bodyPv로 끌어올리기
//   D. 잔여 bodyPv → 조용한 날에 분산 (SM/SSM 직급 달성도 여기서 수렴)
export function runOptimization(allNodes, year, month, half) {
  const calDays  = buildCalendar(year, month, half)
  const workdays = getWorkdays(calDays)

  let nodes = resetSmSchedules(allNodes, calDays)
  nodes = optimizeAllDms(nodes, workdays)
  nodes = applyDefaultForOrphans(nodes, workdays)
  nodes = applyTrapBoosts(nodes)
  nodes = scatterRemainingBodyPv(nodes)
  return nodes
}
