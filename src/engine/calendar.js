const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export function buildCalendar(year, month, half) {
  const startDay = half === 'first' ? 1 : 16
  const lastDay = new Date(year, month, 0).getDate()
  const endDay = half === 'first' ? 15 : lastDay

  const days = []
  for (let d = startDay; d <= endDay; d++) {
    const date = new Date(year, month - 1, d)
    const dow = date.getDay() // 0=일, 6=토
    days.push({
      date: d,
      dayOfWeek: DAY_NAMES[dow],
      isSunday: dow === 0,
      leftPv: 0,
      rightPv: 0,
      bodyPv: 0,
    })
  }
  return days
}

export function getWorkdays(days) {
  return days.filter((d) => !d.isSunday)
}
