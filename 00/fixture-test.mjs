// Node runner for Fixture A/B/C. Run: node 00/fixture-test.mjs
import { runOptimization } from '../src/engine/optimizer.js'
import { rollupDmDaily, calculateFitness, FITNESS_ZONES } from '../src/engine/fitness.js'
import { computeNodeSimulation, getLeftSubtree, getRightSubtree, sumSubtreePv } from '../src/engine/rollup.js'
import { checkSM } from '../src/engine/rankLogic.js'
import { buildCalendar } from '../src/engine/calendar.js'

// SM 직급 체크용 total 집계 (자기 days + 좌/우 서브트리 전체 롤업 포함)
function smTotalsWithRollup(nodeId, nodes) {
  const n = nodes.find(x => x.id === nodeId)
  if (!n) return { tL: 0, tR: 0, tB: 0 }
  const leftSub  = getLeftSubtree(nodeId, nodes)
  const rightSub = getRightSubtree(nodeId, nodes)
  let tL = 0, tR = 0, tB = 0
  for (const d of n.days || []) {
    if (d.isSunday) continue
    tL += (d.leftPv  || 0) + Math.round(sumSubtreePv(leftSub,  d.date) / 10000)
    tR += (d.rightPv || 0) + Math.round(sumSubtreePv(rightSub, d.date) / 10000)
    tB += (d.bodyPv  || 0)
  }
  return { tL, tR, tB }
}

const YEAR = 2026, MONTH = 4, HALF = 'second'

function mkNode(id, name, rank, parentId, side, { left = 0, right = 0, body = 0 } = {}) {
  return {
    id, name, rank, parentId, side,
    targetLeft: left, targetRight: right, bodyPvPool: body,
    days: buildCalendar(YEAR, MONTH, HALF),
  }
}

function targets(rank) {
  if (rank === 'SSM') return { left: 150, right: 110, body: 40 }
  if (rank === 'SM')  return { left: 250, right: 210, body: 40 }
  return { left: 0, right: 0, body: 0 }
}

function sm(id, name, parentId, side) {
  return mkNode(id, name, 'SM', parentId, side, targets('SM'))
}
function dm(id, name, parentId, side) {
  return mkNode(id, name, 'DM', parentId, side, targets('DM'))
}

function formatRollup(nodes, dmId, label) {
  const live = nodes.find(n => n.id === dmId)
  const r = rollupDmDaily(live, nodes)
  const fit = calculateFitness(r)
  console.log(`\n[${label}] DM '${live.name}' rollup (fitness=${fit}):`)
  console.log('date | dow | cumL(만) | cumR(만) | min(만) | score | zone')
  for (const e of r) {
    if (e.isSunday) continue
    const mL = Math.round((e.cumLeft  || 0) / 10000)
    const mR = Math.round((e.cumRight || 0) / 10000)
    const m  = Math.min(mL, mR)
    const zone = FITNESS_ZONES.find(z => m >= z.min && m < z.max)?.label ?? (m >= 150 ? 'high' : '-')
    console.log(`  ${String(e.date).padStart(2)} | ${e.dayOfWeek} |  ${String(mL).padStart(5)}  |  ${String(mR).padStart(5)}  |  ${String(m).padStart(5)} | ${String(e.score).padStart(3)}  | ${zone}`)
  }
  return { rollup: r, fitness: fit }
}

function countTrapDays(rollup) {
  let t2 = 0, t3 = 0
  for (const e of rollup) {
    if (e.isSunday) continue
    const m = Math.min(e.cumLeft || 0, e.cumRight || 0) / 10000
    if (m >= 60  && m < 70)  t2++
    if (m >= 140 && m < 150) t3++
  }
  return { t2, t3 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture A: 단일 DM + 4 SM (2좌 + 2우)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('\n═══ Fixture A: 1 DM + 4 SM (2L + 2R) ═══')
  const root = dm('dm1', 'DM-root', null, 'root')
  const nodes = [
    root,
    sm('sm1', 'SM-L1', 'dm1', 'left'),
    sm('sm2', 'SM-L2', 'sm1',  'left'),   // L1 하위 L
    sm('sm3', 'SM-R1', 'dm1', 'right'),
    sm('sm4', 'SM-R2', 'sm3',  'right'),  // R1 하위 R
  ]

  const optimized = runOptimization(nodes, YEAR, MONTH, HALF)
  const { rollup, fitness } = formatRollup(optimized, 'dm1', 'A')
  const { t2, t3 } = countTrapDays(rollup)

  console.log(`\nA 결과:`)
  console.log(`  - tier2_trap(60~70) 일수: ${t2}`)
  console.log(`  - tier3_trap(140~150) 일수: ${t3}`)
  console.log(`  - total fitness: ${fitness}`)

  // SM 직급 달성 확인 (서브트리 롤업 포함)
  for (const id of ['sm1', 'sm2', 'sm3', 'sm4']) {
    const n = optimized.find(x => x.id === id)
    const { tL, tR, tB } = smTotalsWithRollup(id, optimized)
    const achieved = checkSM(tL, tR, tB)
    console.log(`  - ${n.name}: L=${tL}만(+rollup), R=${tR}만(+rollup), body=${tB}만 → SM ${achieved ? '✓' : '✗'}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture B: 1 SRM + 2 DM + 8 SM (중첩)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('\n═══ Fixture B: 1 SRM + 2 DM + 8 SM (nested) ═══')
  const nodes = [
    mkNode('srm', 'SRM-root', 'SRM', null, 'root'),
    dm('dmL', 'DM-L', 'srm', 'left'),
    sm('smL1', 'SM-LL1', 'dmL', 'left'),
    sm('smL2', 'SM-LL2', 'smL1', 'left'),
    sm('smL3', 'SM-LR1', 'dmL', 'right'),
    sm('smL4', 'SM-LR2', 'smL3', 'right'),
    dm('dmR', 'DM-R', 'srm', 'right'),
    sm('smR1', 'SM-RL1', 'dmR', 'left'),
    sm('smR2', 'SM-RL2', 'smR1', 'left'),
    sm('smR3', 'SM-RR1', 'dmR', 'right'),
    sm('smR4', 'SM-RR2', 'smR3', 'right'),
  ]
  const optimized = runOptimization(nodes, YEAR, MONTH, HALF)
  const a = formatRollup(optimized, 'dmL', 'B·DM-L')
  const b = formatRollup(optimized, 'dmR', 'B·DM-R')
  const c = formatRollup(optimized, 'srm', 'B·SRM')
  const aT = countTrapDays(a.rollup)
  const bT = countTrapDays(b.rollup)
  const cT = countTrapDays(c.rollup)
  console.log(`\nB 결과:`)
  console.log(`  - DM-L: trap2=${aT.t2}, trap3=${aT.t3}, fit=${a.fitness}`)
  console.log(`  - DM-R: trap2=${bT.t2}, trap3=${bT.t3}, fit=${b.fitness}`)
  console.log(`  - SRM : trap2=${cT.t2}, trap3=${cT.t3}, fit=${c.fitness}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture C: 솔로 SM (DM 부모 없음)
// ─────────────────────────────────────────────────────────────────────────────
{
  console.log('\n═══ Fixture C: solo SM ═══')
  const nodes = [ sm('smSolo', 'SM-solo', null, 'root') ]
  const optimized = runOptimization(nodes, YEAR, MONTH, HALF)
  const { tL, tR, tB } = smTotalsWithRollup('smSolo', optimized)
  console.log(`SM-solo: L=${tL}만, R=${tR}만, body=${tB}만 → SM ${checkSM(tL, tR, tB) ? '✓' : '✗'}`)
  // 일자별 PV
  console.log(`\n[C] SM-solo 일자별:`)
  console.log('date | dow | L  | R  | body | score')
  const sim = computeNodeSimulation('smSolo', optimized)
  for (const e of sim) {
    if (e.isSunday) continue
    console.log(`  ${String(e.date).padStart(2)} | ${e.dayOfWeek} | ${String(e.leftPv).padStart(2)} | ${String(e.rightPv).padStart(2)} | ${String(e.bodyPv).padStart(4)} | ${String(e.score).padStart(3)}`)
  }
}
