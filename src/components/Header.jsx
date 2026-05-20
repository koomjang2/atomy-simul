export default function Header() {
  return (
    <header className="bg-white px-3 md:px-4 py-2.5 flex flex-wrap items-center gap-2 md:gap-3 shadow-sm no-print border-b">
      <span className="text-base md:text-lg font-bold" style={{ color: 'rgb(0, 181, 239)' }}>
        PV 최적화 시뮬레이터
      </span>
      <span className="text-[10px] md:text-xs font-semibold px-1.5 py-0.5 rounded border border-sky-300 bg-sky-50 text-sky-600">
        BETA
      </span>
    </header>
  )
}