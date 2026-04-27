import { describe, it, expect } from 'vitest'
import { generateSmCandidates } from '../fitness.js'
import { buildCalendar, getWorkdays } from '../calendar.js'

// 2026년 5월 상반기 (1~15일) 기준 영업일
const calDays = buildCalendar(2026, 5, 'first')
const workdays = getWorkdays(calDays)

// 기본 SM 노드 생성 헬퍼
function makeSmNode(targetLeft, targetRight, bodyPv = 40) {
  return {
    id: 'sm1',
    rank: 'SM',
    parentId: null,
    targetLeft,
    targetRight,
    bodyPvPool: bodyPv,
    days: calDays.map((d) => ({ ...d, leftPv: 0, rightPv: 0, bodyPv: 0 })),
  }
}

// F08: SM 배치 총합
describe('F08 — SM 배치 총합', () => {
  it('targetLeft=250, targetRight=210 → 모든 후보에서 L합=250, R합=210', () => {
    const sm = makeSmNode(250, 210, 40)
    const candidates = generateSmCandidates(sm, workdays, [sm])

    expect(candidates.length).toBeGreaterThan(0)

    for (const { scheduleByDate } of candidates) {
      let totalL = 0, totalR = 0
      for (const entry of Object.values(scheduleByDate)) {
        totalL += entry.leftPv || 0
        totalR += entry.rightPv || 0
      }
      expect(totalL).toBe(250)
      expect(totalR).toBe(210)
    }
  })
})

// F09: 이틀매칭 허용
describe('F09 — 이틀매칭 허용', () => {
  it('적어도 하나의 후보에서 L만 있고 R=0인 날이 존재', () => {
    const sm = makeSmNode(250, 210, 40)
    const candidates = generateSmCandidates(sm, workdays, [sm])

    const hasLonlyDay = candidates.some(({ scheduleByDate }) =>
      Object.values(scheduleByDate).some(
        (e) => (e.leftPv || 0) > 0 && (e.rightPv || 0) === 0
      )
    )
    expect(hasLonlyDay).toBe(true)
  })
})

// F10: 영업일 배치 (일요일 제외)
describe('F10 — 영업일 배치', () => {
  it('일요일 날짜에는 모든 후보에서 PV=0', () => {
    const sm = makeSmNode(250, 210, 40)
    const candidates = generateSmCandidates(sm, workdays, [sm])
    const sundayDates = new Set(calDays.filter((d) => d.isSunday).map((d) => d.date))

    for (const { scheduleByDate } of candidates) {
      for (const [dateStr, entry] of Object.entries(scheduleByDate)) {
        if (sundayDates.has(Number(dateStr))) {
          expect(entry.leftPv || 0).toBe(0)
          expect(entry.rightPv || 0).toBe(0)
        }
      }
    }
  })
})
