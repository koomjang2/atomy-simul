// 만 단위 숫자를 "30만" 형태로 표시
export function fmtMan(value) {
  if (!value) return ''
  return `${value}만`
}

// 원 단위 금액을 "약 6만원" 형태로 표시
export function fmtWon(value) {
  if (!value) return '-'
  const man = Math.round(value / 10_000)
  return `약 ${man}만원`
}

// 만 단위 합계를 "250만 PV" 형태로 표시
export function fmtPv(valueMan) {
  if (!valueMan) return '0만'
  return `${valueMan}만`
}

export function generateId() {
  return Math.random().toString(36).slice(2, 9)
}
