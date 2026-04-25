import { Clipboard, Printer, RotateCcw, Image } from 'lucide-react'
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

export default function ExportButtons({ nodes, selectedNode, onResetDays, onSaveImage }) {

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

  function handleResetDays() {
    if (window.confirm('이 노드의 입력값을 모두 초기화할까요?')) {
      onResetDays?.()
    }
  }

  return (
    <div className="mt-3 flex gap-2 no-print flex-wrap">
      <button
        onClick={handleCopy}
        className="glass-btn h-9 min-w-[108px] px-4"
        title="탭 구분 형식으로 복사 → 엑셀 붙여넣기 시 셀 분리"
      >
        <Clipboard size={14} /> 표 복사
      </button>
      <button
        onClick={handleResetDays}
        className="glass-btn h-9 min-w-[108px] px-4"
        title="이 노드의 날짜별 입력값 초기화"
      >
        <RotateCcw size={14} /> 입력 초기화
      </button>
      <button
        onClick={handlePrint}
        className="glass-btn h-9 min-w-[108px] px-4"
      >
        <Printer size={14} /> 인쇄
      </button>
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
