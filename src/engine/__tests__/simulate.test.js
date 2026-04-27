import { describe, it, expect } from 'vitest'
import { simulateCumulative, MAN } from '../simulate.js'

// 헬퍼: 날짜 배열 생성
function makeDays(entries) {
  return entries.map((e, i) => ({
    date: i + 1,
    isSunday: e.isSunday ?? false,
  }))
}

// 헬퍼: 만 단위 입력을 받아 simulate 실행
function runSim(entries) {
  const days = makeDays(entries)
  return simulateCumulative(days, {
    getDailyLeft:  (day) => (entries[day.date - 1].leftPv  || 0) * MAN,
    getDailyRight: (day) => (entries[day.date - 1].rightPv || 0) * MAN,
    getBodyPv:     ()    => 0, // bodyPv는 일별 매칭 점수에 관여 안 함
  })
}

// F01: 하루 매칭
describe('F01 — 하루 매칭', () => {
  it('같은 날 L30만+R30만 → score=15, 다음날 cumL=cumR=0', () => {
    const result = runSim([
      { leftPv: 30, rightPv: 30 },
      { leftPv: 0,  rightPv: 0  },
    ])
    expect(result[0].score).toBe(15)
    expect(result[0].cumLeft).toBe(300_000)
    expect(result[0].cumRight).toBe(300_000)
    // 다음날 리셋 확인: 1일 점수 → 2일 cumL/R은 0에서 시작
    expect(result[1].cumLeft).toBe(0)
    expect(result[1].cumRight).toBe(0)
    expect(result[1].score).toBe(0)
  })
})

// F02: 이틀 매칭
describe('F02 — 이틀 매칭 ★', () => {
  it('1일 L30만만, 2일 R30만 → 1일 score=0, 2일 score=15', () => {
    const result = runSim([
      { leftPv: 30, rightPv: 0 },
      { leftPv: 0,  rightPv: 30 },
    ])
    // 1일: L누적=30만, R누적=0 → 미매칭
    expect(result[0].score).toBe(0)
    expect(result[0].cumLeft).toBe(300_000)
    expect(result[0].cumRight).toBe(0)
    // 2일: cumL=30만(이어서), cumR=30만 → 매칭!
    expect(result[1].score).toBe(15)
    expect(result[1].cumLeft).toBe(300_000)
    expect(result[1].cumRight).toBe(300_000)
  })
})

// F03: 일요일 skip
describe('F03 — 일요일 skip', () => {
  it('일요일은 PV 누적 없음, 다음날 단독 매칭', () => {
    const result = runSim([
      { leftPv: 30, rightPv: 30, isSunday: true },
      { leftPv: 30, rightPv: 30 },
    ])
    expect(result[0].score).toBe(0)
    // 일요일 PV가 누적에 반영되지 않음
    // 2일: 2일 단독 30만+30만 → score=15
    expect(result[1].score).toBe(15)
    expect(result[1].cumLeft).toBe(300_000)
    expect(result[1].cumRight).toBe(300_000)
  })
})

// F04: 몸PV는 매칭 점수에 무관
describe('F04 — 몸PV는 매칭 점수에 무관 ★', () => {
  it('cumL=20만, cumR=40만, bodyPv=10만 → score=0 (bodyPv 미적용)', () => {
    // bodyPv를 매칭에 적용하면 effL=30만 → score=15 (틀린 동작)
    // 올바른 동작: L=20만 < 30만 → score=0
    const days = [{ date: 1, isSunday: false }]
    const result = simulateCumulative(days, {
      getDailyLeft:  () => 20 * MAN,
      getDailyRight: () => 40 * MAN,
      getBodyPv:     () => 10 * MAN, // bodyPv가 있어도 점수에 영향 없어야 함
    })
    // simulateCumulative가 bodyPv를 적용하지 않으면 score=0
    // 만약 현재 코드가 bodyPv를 적용한다면 이 테스트가 FAIL → 버그 발견
    expect(result[0].score).toBe(0)
    expect(result[0].cumLeft).toBe(20 * MAN)
    expect(result[0].cumRight).toBe(40 * MAN)
  })
})

// F05: 점수 없는 날 누적 유지
describe('F05 — 점수 없는 날 누적 유지', () => {
  it('L30만만 2일 연속 → cumL=60만, score=0', () => {
    const result = runSim([
      { leftPv: 30, rightPv: 0 },
      { leftPv: 30, rightPv: 0 },
    ])
    expect(result[0].score).toBe(0)
    expect(result[0].cumLeft).toBe(300_000)
    expect(result[1].score).toBe(0)
    expect(result[1].cumLeft).toBe(600_000)
    expect(result[1].cumRight).toBe(0)
  })
})
