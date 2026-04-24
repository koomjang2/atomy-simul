export default function Header() {
  return (
    <header className="bg-white px-3 md:px-4 py-2.5 flex flex-wrap items-center gap-2 md:gap-3 shadow-sm no-print border-b">
      <img
        src="/atomy-logo.png"
        alt="Atomy logo"
        className="h-7 md:h-9 w-auto object-contain"
      />
      <span className="text-base md:text-lg font-bold" style={{ color: 'rgb(0, 181, 239)' }}>
        서울최고센터 직급표 시뮬레이터
      </span>
      <span className="text-[10px] md:text-xs ml-auto md:ml-1" style={{ color: 'rgb(0, 181, 239)' }}>
        바이너리 수당 최적화
      </span>
    </header>
  )
}