import { describe, it, expect } from 'vitest'
import { runOptimization } from '../optimizer.js'
import { buildCalendar } from '../calendar.js'
import { computeNodeSimulation } from '../rollup.js'

// 2026년 5월 상반기 사용 (영업일 ~13일)
const YEAR = 2026, MONTH = 5, HALF = 'first'
const calDays = buildCalendar(YEAR, MONTH, HALF)

// 노드 생성 헬퍼
function makeNode(id, rank, parentId, side, targetLeft, targetRight, bodyPvPool) {
  return {
    id,
    rank,
    parentId: parentId || null,
    side: side || null,
    targetLeft,
    targetRight,
    bodyPvPool: bodyPvPool || 0,
    days: calDays.map((d) => ({ ...d, leftPv: 0, rightPv: 0, bodyPv: 0 })),
  }
}

// SM 자체 총점 계산 헬퍼
function smTotalScore(nodeId, nodes) {
  return computeNodeSimulation(nodeId, nodes).reduce((s, d) => s + (d.score || 0), 0)
}

// ───────────────────────────────────────────
// F11: 단독 SM 105점 (7회 × 15점)
// ───────────────────────────────────────────
describe('F11 — 단독 SM 105점 (target: L=250, R=210, body=40)', () => {
  it('최적화 후 SM 자체 점수 = 105점', () => {
    const nodes = [makeNode('sm1', 'SM', null, null, 250, 210, 40)]
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    expect(smTotalScore('sm1', result)).toBe(105)
  })
})

// ───────────────────────────────────────────
// F11b: 단독 SM 120점 (8회 × 15점)
// ───────────────────────────────────────────
describe('F11b — 단독 SM 120점 (target: L=250, R=250, body=0)', () => {
  it('최적화 후 SM 자체 점수 = 120점', () => {
    const nodes = [makeNode('sm1', 'SM', null, null, 250, 250, 0)]
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    expect(smTotalScore('sm1', result)).toBe(120)
  })
})

// ───────────────────────────────────────────
// F12: DM 최소 달성 트리 (롤업 검증)
// DM
// ├── 좌: SM1 → SM2 (SM1 하위 좌)
// └── 우: SM3 → SM4 (SM3 하위 우)
// ───────────────────────────────────────────
describe('F12 — DM 최소 달성 트리 (롤업 검증)', () => {
  const buildF12Nodes = () => [
    makeNode('dm',  'DM', null,  null,   0,   0, 0),
    makeNode('sm1', 'SM', 'dm',  'left', 250, 250, 0),
    makeNode('sm2', 'SM', 'sm1', 'left', 250, 250, 0),
    makeNode('sm3', 'SM', 'dm',  'right',250, 250, 0),
    makeNode('sm4', 'SM', 'sm3', 'right',250, 250, 0),
  ]

  it('각 SM 자체 점수 = 120점 (8회)', () => {
    const nodes = buildF12Nodes()
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    expect(smTotalScore('sm1', result)).toBe(120)
    expect(smTotalScore('sm2', result)).toBe(120)
    expect(smTotalScore('sm3', result)).toBe(120)
    expect(smTotalScore('sm4', result)).toBe(120)
  })

  it('DM 점수 ≠ SM 4명 점수 합산(480점) — 롤업 후 새 계산', () => {
    const nodes = buildF12Nodes()
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    const dmScore = computeNodeSimulation('dm', result).reduce((s, d) => s + (d.score || 0), 0)
    // DM의 롤업 PV가 SM보다 훨씬 크므로 tier가 높아 SM 4명 합산(480점)과 다름
    expect(dmScore).not.toBe(480)
    expect(dmScore).toBeGreaterThan(0)
  })
})

// ───────────────────────────────────────────
// F13: 중첩 DM 8회 회귀 ★ (한계1 버그 재현)
// SRM
// └── 좌: DM1
//     ├── 좌: DM2
//     │   ├── 좌: SM1 → SM2
//     │   └── 우: SM3 → SM4
//     └── 우: SM5 → SM6
// ───────────────────────────────────────────
describe('F13 — 중첩 DM 8회 회귀 ★', () => {
  const buildF13Nodes = () => [
    makeNode('srm', 'SRM', null,   null,   0, 0, 0),
    makeNode('dm1', 'DM',  'srm',  'left', 0, 0, 0),
    makeNode('dm2', 'DM',  'dm1',  'left', 0, 0, 0),
    makeNode('sm1', 'SM',  'dm2',  'left', 250, 250, 0),
    makeNode('sm2', 'SM',  'sm1',  'left', 250, 250, 0),
    makeNode('sm3', 'SM',  'dm2',  'right',250, 250, 0),
    makeNode('sm4', 'SM',  'sm3',  'right',250, 250, 0),
    makeNode('sm5', 'SM',  'dm1',  'right',250, 250, 0),
    makeNode('sm6', 'SM',  'sm5',  'right',250, 250, 0),
  ]

  it('DM2 소유 SM1~4 각 120점 (7회로 깎이면 실패)', () => {
    const nodes = buildF13Nodes()
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    expect(smTotalScore('sm1', result)).toBe(120)
    expect(smTotalScore('sm2', result)).toBe(120)
    expect(smTotalScore('sm3', result)).toBe(120)
    expect(smTotalScore('sm4', result)).toBe(120)
  })

  it('DM1 소유 SM5~6 각 120점 (7회로 깎이면 실패)', () => {
    const nodes = buildF13Nodes()
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    expect(smTotalScore('sm5', result)).toBe(120)
    expect(smTotalScore('sm6', result)).toBe(120)
  })
})

// ───────────────────────────────────────────
// F14: SRM 완전 트리 독립성
// SRM
// ├── 좌: DM1
// │   ├── 좌: DM2 (SM1→SM2 좌, SM3→SM4 우)
// │   └── 우: SM5→SM6
// └── 우: DM3
//     ├── 좌: DM4 (SM7→SM8 좌, SM9→SM10 우)
//     └── 우: SM11→SM12
// ───────────────────────────────────────────
describe('F14 — SRM 완전 트리 독립성', () => {
  const buildF14Nodes = () => [
    makeNode('srm',  'SRM', null,   null,   0, 0, 0),
    makeNode('dm1',  'DM',  'srm',  'left', 0, 0, 0),
    makeNode('dm2',  'DM',  'dm1',  'left', 0, 0, 0),
    makeNode('sm1',  'SM',  'dm2',  'left', 250, 250, 0),
    makeNode('sm2',  'SM',  'sm1',  'left', 250, 250, 0),
    makeNode('sm3',  'SM',  'dm2',  'right',250, 250, 0),
    makeNode('sm4',  'SM',  'sm3',  'right',250, 250, 0),
    makeNode('sm5',  'SM',  'dm1',  'right',250, 250, 0),
    makeNode('sm6',  'SM',  'sm5',  'right',250, 250, 0),
    makeNode('dm3',  'DM',  'srm',  'right',0, 0, 0),
    makeNode('dm4',  'DM',  'dm3',  'left', 0, 0, 0),
    makeNode('sm7',  'SM',  'dm4',  'left', 250, 250, 0),
    makeNode('sm8',  'SM',  'sm7',  'left', 250, 250, 0),
    makeNode('sm9',  'SM',  'dm4',  'right',250, 250, 0),
    makeNode('sm10', 'SM',  'sm9',  'right',250, 250, 0),
    makeNode('sm11', 'SM',  'dm3',  'right',250, 250, 0),
    makeNode('sm12', 'SM',  'sm11', 'right',250, 250, 0),
  ]

  it('모든 SM(12명) 각 120점 달성', () => {
    const nodes = buildF14Nodes()
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    const smIds = ['sm1','sm2','sm3','sm4','sm5','sm6','sm7','sm8','sm9','sm10','sm11','sm12']
    for (const id of smIds) {
      expect(smTotalScore(id, result)).toBe(120)
    }
  })
})

// ───────────────────────────────────────────
// F15: bodyPv 전량 배분
// ───────────────────────────────────────────
describe('F15 — bodyPv 전량 배분', () => {
  it('bodyPvPool=40 → 최적화 후 days bodyPv 합계 = 40', () => {
    const nodes = [makeNode('sm1', 'SM', null, null, 250, 210, 40)]
    const result = runOptimization(nodes, YEAR, MONTH, HALF)
    const sm = result.find((n) => n.id === 'sm1')
    const totalBody = sm.days.reduce((s, d) => s + (d.bodyPv || 0), 0)
    expect(totalBody).toBe(40)
  })
})
