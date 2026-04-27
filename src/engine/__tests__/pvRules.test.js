import { describe, it, expect } from 'vitest'
import { getScore } from '../pvRules.js'

// F06: 경계값 점수
describe('F06 — 경계값 점수', () => {
  it('299,999 / 299,999 → 0점', () => {
    expect(getScore(299_999, 299_999)).toBe(0)
  })
  it('300,000 / 300,000 → 15점', () => {
    expect(getScore(300_000, 300_000)).toBe(15)
  })
  it('699,999 / 699,999 → 15점 (70만 미달)', () => {
    expect(getScore(699_999, 699_999)).toBe(15)
  })
  it('700,000 / 700,000 → 30점', () => {
    expect(getScore(700_000, 700_000)).toBe(30)
  })
  it('1,499,999 / 1,499,999 → 30점 (150만 미달)', () => {
    expect(getScore(1_499_999, 1_499_999)).toBe(30)
  })
  it('1,500,000 / 1,500,000 → 60점', () => {
    expect(getScore(1_500_000, 1_500_000)).toBe(60)
  })
  it('2,400,000 / 2,400,000 → 90점', () => {
    expect(getScore(2_400_000, 2_400_000)).toBe(90)
  })
})

// F07: 비대칭 매칭 — 작은 쪽 기준
describe('F07 — 비대칭 매칭', () => {
  it('L=300,000 / R=700,000 → min=30만 → 15점', () => {
    expect(getScore(300_000, 700_000)).toBe(15)
  })
  it('L=700,000 / R=300,000 → min=30만 → 15점 (대칭)', () => {
    expect(getScore(700_000, 300_000)).toBe(15)
  })
  it('L=699,999 / R=700,000 → 15점 (L이 70만 미달)', () => {
    expect(getScore(699_999, 700_000)).toBe(15)
  })
  it('L=0 / R=700,000 → 0점 (L이 30만 미달)', () => {
    expect(getScore(0, 700_000)).toBe(0)
  })
})
