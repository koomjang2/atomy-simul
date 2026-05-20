import { Clipboard, Printer, RotateCcw, Image, Undo2 } from 'lucide-react' // Undo2 아이콘 추가
import { computeNodeSimulation } from '../engine/rollup.js'

function buildRows(selectedNode, nodes) {
  if (!selectedNode) return []
  const sim = computeNodeSimulation(selectedNode.id, nodes)
  const isDM = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM'].includes(selectedNode.rank)

  const headers = ['일', '요일']
  if (!isDM) headers.push('직접 좌(만)', '직접 우(만)', '몸PV(만)')
  headers.push('누적 좌(만)', '누적 우(만)', '점수')

  const rows = [headers]
  for (const day of sim) {
    if (day.isSunday) continue
    const entry = selectedNode.days.find((d) => d.date === day.date)
    const row = [day.date, day.dayOfWeek]
    if (!isDM) {
      row.push(entry?.leftPv || 0, entry?.rightPv || 0, entry?.bodyPv || 0)
    }
    row.push(
      day.effLeft > 0 ? day.effLeft : '',
      day.effRight > 0 ? day.effRight : '',
      day.score > 0 ? day.score : '',
    )
    rows.push(row)
  }
  return rows
}

// 부모 컴포넌트(App.jsx)로부터 상시 되돌리기를 위한 onUndo, hasUndo 속성과 수정된 초기화용 onResetToOptimize를 전달받습니다.
export default function ExportButtons({ nodes, selectedNode, onResetToOptimize, onSaveImage, onUndo, hasUndo, undoCount = 0 }) {

  function handleCopy() {
    if (!selectedNode) return
    const rows = buildRows(selectedNode, nodes)
    const tsv = rows.map((r) => r.join('\t')).join('\n')
    navigator.clipboard.writeText(tsv)
      .then(() => alert('클립보드에 복사됐습니다 (엑셀에 붙여넣기 하세요)'))
      .catch(() => alert('복사 실패'))
  }

  function handlePrint() {
    window.print()
  }

  // 변경 사항: 단순히 0으로 지워버리는 초기화가 아니라, 수동 입력을 해제하고 자동 최적화 상태로 복귀시킵니다.
  function handleResetToOptimize() {
    if (!selectedNode) return
    if (window.confirm(`[${selectedNode.name}] 노드의 수동 입력값을 해제하고 자동 최적화 상태로 되돌릴까요?`)) {
      onResetToOptimize?.()
    }
  }

  return (
    <div className="mt-3 flex gap-2 no-print flex-wrap">
      
      {/* 1. [신규 추가] 상시 대기형 '되돌리기' 버튼 (맨 왼쪽에 배치) */}
      <button
        onClick={onUndo}
        disabled={!hasUndo}
        className={`glass-btn h-9 min-w-[108px] px-4 flex items-center justify-center gap-1.5 transition-all
          ${hasUndo 
            ? 'bg-amber-50/90 text-amber-700 border border-amber-300 hover:bg-amber-100 font-bold shadow-sm' 
            : 'opacity-40 cursor-not-allowed text-slate-400'}`}
        title="스낵바가 닫혀도 직전 수동 입력 또는 초기화 작업을 최대 30단계까지 되돌릴 수 있습니다."
      >
        <Undo2 size={14} /> 되돌리기{hasUndo ? ` (${undoCount})` : ''}
      </button>

      {/* 2. 기존 기능 유지: 표 복사 버튼 */}
      <button
        onClick={handleCopy}
        className="glass-btn h-9 min-w-[108px] px-4"
        title="탭 구분 형식으로 복사 → 엑셀 붙여넣기 시 셀 분리"
      >
        <Clipboard size={14} /> 표 복사
      </button>

      {/* 3. 기능 수정: 자동 최적화 복귀형 입력 초기화 버튼 */}
      <button
        onClick={handleResetToOptimize}
        className="glass-btn h-9 min-w-[108px] px-4"
        title="수동으로 변경했던 값들을 지우고 최초 기본 자동최적화 계획표 상태로 복귀합니다."
      >
        <RotateCcw size={14} /> 입력 초기화
      </button>

      {/* 4. 기존 기능 유지: 인쇄 버튼 */}
      <button
        onClick={handlePrint}
        className="glass-btn h-9 min-w-[108px] px-4"
      >
        <Printer size={14} /> 인쇄
      </button>

      {/* 5. 기존 기능 유지: 그림 저장 버튼 */}
      <button
        onClick={onSaveImage}
        className="glass-btn h-9 min-w-[108px] px-4"
        title="계획표와 수당요약을 JPG로 저장"
      >
        <Image size={14} /> 그림 저장
      </button>

    </div>
  )
}