import { Clipboard, Save, Printer, FolderOpen, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { computeNodeSimulation } from '../engine/rollup.js'

// ─── 선택 노드 데이터를 행 배열로 변환 ────────────────────────────
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

// ─── TSV: 클립보드 붙여넣기 시 엑셀 열 분리 ──────────────────────
function rowsToTsv(rows) {
  return rows.map((r) => r.join('\t')).join('\n')
}

export default function ExportButtons({ nodes, selectedNode, onLoad, state }) {

  // 표 복사: TSV 형식 → 엑셀 붙여넣기 시 셀 분리
  function handleCopy() {
    if (!selectedNode) return
    const rows = buildRows(selectedNode, nodes)
    const tsv = rowsToTsv(rows)
    navigator.clipboard.writeText(tsv)
      .then(() => alert('클립보드에 복사됐습니다 (엑셀에 붙여넣기 하세요)'))
      .catch(() => alert('복사 실패'))
  }

  // 저장: 엑셀(.xlsx) 파일 다운로드 (선택 노드 기준)
  function handleSave() {
    if (!selectedNode) {
      alert('노드를 선택하세요')
      return
    }
    try {
      const rows = buildRows(selectedNode, nodes)
      const ws = XLSX.utils.aoa_to_sheet(rows)

      // 열 너비 자동 설정
      ws['!cols'] = rows[0].map((_, ci) => ({
        wch: Math.max(...rows.map((r) => String(r[ci] ?? '').length), 6) + 2,
      }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, selectedNode.name)
      XLSX.writeFile(wb, `${selectedNode.name}_직급표.xlsx`)
    } catch (e) {
      alert('엑셀 저장 실패: ' + e.message)
    }
  }

  // 전체 저장: localStorage에 시뮬레이터 상태 보존
  function handleSaveState() {
    try {
      localStorage.setItem('atomy-simulator', JSON.stringify(state ?? { nodes }))
      alert('저장됐습니다')
    } catch (_) {
      alert('저장 실패')
    }
  }

  function handleLoad() {
    try {
      const raw = localStorage.getItem('atomy-simulator')
      if (!raw) { alert('저장된 데이터가 없습니다'); return }
      const parsed = JSON.parse(raw)
      if (!parsed?.nodes?.length) { alert('저장 데이터가 올바르지 않습니다'); return }
      onLoad?.(parsed)
      alert('불러왔습니다')
    } catch (_) {
      alert('불러오기 실패')
    }
  }

  function handlePrint() {
    window.print()
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
        onClick={handleSave}
        className="glass-btn h-9 min-w-[108px] px-4 text-blue-700"
        title="선택 노드 직급표를 엑셀 파일로 저장"
      >
        <FileSpreadsheet size={14} /> 엑셀 저장
      </button>
      <button
        onClick={handleSaveState}
        className="glass-btn h-9 min-w-[108px] px-4"
        title="현재 시뮬레이터 상태를 브라우저에 저장"
      >
        <Save size={14} /> 저장
      </button>
      <button
        onClick={handleLoad}
        className="glass-btn h-9 min-w-[108px] px-4"
      >
        <FolderOpen size={14} /> 불러오기
      </button>
      <button
        onClick={handlePrint}
        className="glass-btn h-9 min-w-[108px] px-4"
      >
        <Printer size={14} /> 인쇄
      </button>
    </div>
  )
}
