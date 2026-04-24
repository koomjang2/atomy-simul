export default function PeriodSelector({ year, month, half, onChange }) {
  const years = [2025, 2026, 2027]
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-white no-print">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 font-medium">기간</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={year}
          onChange={(e) => onChange(+e.target.value, month, half)}
        >
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={month}
          onChange={(e) => onChange(year, +e.target.value, half)}
        >
          {months.map((m) => <option key={m} value={m}>{m}월</option>)}
        </select>
      </div>
      <div className="flex gap-3 w-full sm:w-auto mt-1 sm:mt-0">
        {['first', 'second'].map((h) => (
          <label key={h} className="flex items-center gap-1 cursor-pointer text-sm">
            <input
              type="radio"
              name="half"
              value={h}
              checked={half === h}
              onChange={() => onChange(year, month, h)}
            />
            {h === 'first' ? '상반기 (1~15일)' : '하반기 (16~말일)'}
          </label>
        ))}
      </div>
    </div>
  )
}