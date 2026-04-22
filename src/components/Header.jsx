export default function Header() {
  return (
    <header className="bg-white px-4 py-2.5 flex items-center gap-3 shadow-sm no-print border-b">
      <img
        src="/atomy-logo.png"
        alt="Atomy logo"
        className="h-9 w-auto object-contain"
      />
      <span className="text-lg font-bold" style={{ color: 'rgb(0, 181, 239)' }}>
        서울최고센터 직급표 시뮬레이터
      </span>
      <span className="text-xs ml-1" style={{ color: 'rgb(0, 181, 239)' }}>
        바이너리 수당 최적화
      </span>
    </header>
  )
}
