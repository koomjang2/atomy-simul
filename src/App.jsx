import { useRef, useState, useEffect } from 'react'
import { useStore } from './store/useStore.js'
import Header from './components/Header.jsx'
import PeriodSelector from './components/PeriodSelector.jsx'
import OrgTreePanel from './components/OrgTreePanel.jsx'
import RankTable from './components/RankTable.jsx'
import CommissionSummary from './components/CommissionSummary.jsx'
import ExportButtons from './components/ExportButtons.jsx'
import { runOptimization } from './engine/optimizer.js'
import { computeNodeSimulation } from './engine/rollup.js' // 전체 노드 연쇄 반응 계산용
import { Settings2 } from 'lucide-react'

const RANK_BADGE_CLASS = {
  SSM: 'bg-gray-200 text-gray-700 border-gray-400',
  SM:  'bg-blue-100 text-blue-800 border-blue-400',
  DM:  'bg-orange-100 text-orange-800 border-orange-400',
  SRM: 'bg-green-100 text-green-700 border-green-500',
  STM: 'bg-purple-100 text-purple-800 border-purple-500',
  RM:  'bg-yellow-100 text-yellow-800 border-yellow-500',
  CM:  'bg-pink-100 text-pink-800 border-pink-500',
  IM:  'bg-red-100 text-red-800 border-red-500',
}

export default function App() {
  const {
    state, setPeriod, selectNode, addNode, removeNode,
    updateNode, changeRank, renameNode, updateDay, applyOptimization, loadState, resetTree, resetNodeDays,
  } = useStore()
  const { year, month, half, nodes, selectedNodeId } = state
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const loadTreeInputRef = useRef(null)
  const rankPrintAreaRef = useRef(null)

  // --- 연쇄 반응 스낵바 및 되돌리기 상태 관리 ---
  const UNDO_LIMIT = 30
  const [snackbar, setSnackbar] = useState({ isOpen: false, changes: [] })
  const [undoCount, setUndoCount] = useState(0) // 스택 깊이 (UI 활성화 판단용)
  const undoStackRef = useRef([])               // 최근 5개의 직전 상태 스냅샷 (가장 최근이 마지막)
  const beforeMetricsRef = useRef(null)
  const isManualAction = useRef(false)
  const hasUndo = undoCount > 0

  // 직전 상태를 스택에 push. 5개 초과 시 가장 오래된 것 제거.
  const pushUndoSnapshot = (snapshot) => {
    const stack = undoStackRef.current
    stack.push(snapshot)
    if (stack.length > UNDO_LIMIT) stack.shift()
    setUndoCount(stack.length)
  }

  // 1. 특정 시점의 모든 노드 점수/매칭 횟수 계산 함수
  const calculateAllNodesMetrics = (currentNodes) => {
    const metrics = {}
    currentNodes.forEach(n => {
      const simDays = computeNodeSimulation(n.id, currentNodes)
      const score = simDays.reduce((s, d) => s + (d.score || 0), 0)
      const match = simDays.reduce((s, d) => s + (d.score > 0 ? 1 : 0), 0)
      metrics[n.id] = { name: n.name, score, match }
    })
    return metrics
  }

  // 2. 사용자가 엔터/포커스아웃으로 값을 확정(Commit)했을 때
  const handleUpdateDayWithUndo = (nodeId, date, field, val) => {
    // 변경 전 전체 조직도 상태와 수당 결과를 백업 (최대 5단계까지 누적)
    pushUndoSnapshot(JSON.parse(JSON.stringify(state)))
    beforeMetricsRef.current = calculateAllNodesMetrics(state.nodes)
    isManualAction.current = true

    // 값 업데이트 (store 변경)
    updateDay(nodeId, date, field, val)
  }

  // 3. store(nodes)가 변경된 직후 연쇄 반응 결과를 비교
  useEffect(() => {
    if (isManualAction.current && beforeMetricsRef.current) {
      const afterMetrics = calculateAllNodesMetrics(nodes)
      const detectedChanges = []

      // 백업해둔 이전 점수와 현재 점수를 비교하여 바뀐 노드만 추출
      nodes.forEach(node => {
        const before = beforeMetricsRef.current[node.id]
        const after = afterMetrics[node.id]
        
        if (before && (before.score !== after.score || before.match !== after.match)) {
          detectedChanges.push({
            name: node.name,
            oldScore: before.score, newScore: after.score,
            oldMatch: before.match, newMatch: after.match
          })
        }
      })

      // 변경된 사항이 하나라도 있으면 스낵바 오픈 (자동 닫힘 없음)
      if (detectedChanges.length > 0) {
        setSnackbar({ isOpen: true, changes: detectedChanges })
      }

      isManualAction.current = false
      beforeMetricsRef.current = null
    }
  }, [nodes])

  // 4. 되돌리기 실행 — 스택 top 1단계만 복원 (반복 호출 시 최대 5단계)
  const handleUndo = () => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const prev = stack.pop()
    loadState(prev)
    setSnackbar({ isOpen: false, changes: [] })
    setUndoCount(stack.length)
  }

  // 5. 🔴 새로 추가된 로직: 수동 입력값을 지우고 자동 최적화 상태로 덮어쓰기
  const handleResetToOptimize = () => {
    // 만약을 위해 이 작업도 '되돌리기'가 가능하도록 백업
    pushUndoSnapshot(JSON.parse(JSON.stringify(state)));
    setSnackbar({ isOpen: false, changes: [] }); // 열려있는 스낵바 닫기

    // nodes를 깊은 복사하여 해당 노드의 수동 기록(days)을 완전히 날림
    const tempNodes = JSON.parse(JSON.stringify(nodes));
    const targetNode = tempNodes.find(n => n.id === selectedNodeId);
    if (targetNode) {
      targetNode.days = []; 
    }

    // 수동 기록이 초기화된 상태를 기준으로 자동 최적화 재계산 후 적용
    const optimizedNodes = runOptimization(tempNodes, year, month, half);
    applyOptimization(optimizedNodes);
  }
  // --- 스낵바 및 되돌리기 끝 ---

  async function handleSaveRankTableImage() {
    const el = rankPrintAreaRef.current
    if (!el || !selectedNode) return
    try {
      const { toJpeg } = await import('html-to-image')
      const dataUrl = await toJpeg(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        quality: 0.92,
      })
      const a = document.createElement('a')
      a.download = `${selectedNode.name}_계획표.jpg`
      a.href = dataUrl
      a.click()
    } catch (e) {
      alert('이미지 저장 실패: ' + e.message)
    }
  }

  const canOptimize = nodes.some((n) => n.rank === 'SM' || n.rank === 'SSM')

  function handleOptimize() {
    // 수동 입력(locked/manual 플래그 + PV값) 전부 초기화 후 전체 재최적화.
    // 옵티마이저는 locked 셀을 보존하므로 여기서 미리 풀어줘야 한다.
    pushUndoSnapshot(JSON.parse(JSON.stringify(state)))
    const cleanNodes = nodes.map((n) => ({
      ...n,
      days: (n.days || []).map((d) => ({
        ...d,
        leftPv: 0, rightPv: 0, bodyPv: 0,
        locked: false, manualLeft: false, manualRight: false, manualBody: false,
      })),
    }))
    const optimized = runOptimization(cleanNodes, year, month, half)
    applyOptimization(optimized)
  }

  function handleSaveTree() {
    try {
      const payload = {
        format: 'atomy-simulator-state-v1',
        savedAt: new Date().toISOString(),
        data: state,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = `${year}-${String(month).padStart(2, '0')}-${half}`
      a.href = url
      a.download = `atomy-simulator-${stamp}.atomy.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (_) {
      alert('파일 저장 실패')
    }
  }

  function handleLoadTree() {
    loadTreeInputRef.current?.click()
  }

  function handlePrintTree() {
    window.dispatchEvent(new CustomEvent('print-org-tree'))
  }

  function handleResetTree() {
    if (!window.confirm('조직 트리를 초기화할까요? 현재 트리 구조와 입력값이 초기화됩니다.')) return
    resetTree()
  }

  function handleLoadTreeFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result ?? '{}'))
          const restored = parsed?.format === 'atomy-simulator-state-v1' ? parsed.data : parsed
          if (!restored?.nodes?.length) {
            alert('파일 형식이 올바르지 않습니다')
            return
          }
          loadState(restored)
          alert('파일을 불러왔습니다')
        } catch (_) {
          alert('파일 파싱 실패')
        } finally {
          event.target.value = ''
        }
      }
      reader.onerror = () => {
        alert('파일 읽기 실패')
        event.target.value = ''
      }
      reader.readAsText(file, 'utf-8')
    } catch (_) {
      alert('불러오기 실패')
      event.target.value = ''
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 relative">
      <input
        ref={loadTreeInputRef}
        type="file"
        accept=".atomy.json,.json,application/json"
        className="hidden"
        onChange={handleLoadTreeFile}
      />
      <Header />

      <div className="flex flex-wrap md:flex-nowrap items-center bg-white border-b no-print flex-shrink-0">
        <PeriodSelector year={year} month={month} half={half} onChange={setPeriod} />
        <button
          onClick={handleOptimize}
          disabled={!canOptimize}
          className={`my-2 ml-3 md:ml-auto mr-3 flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5
                     text-sm rounded font-medium ${canOptimize
                       ? 'bg-blue-600 text-white hover:bg-blue-700'
                       : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          <Settings2 size={14} />
          자동 최적화
        </button>
      </div>

      <div className="flex flex-col md:flex-row flex-1">
        <OrgTreePanel
          nodes={nodes}
          selectedId={selectedNodeId}
          onSelect={selectNode}
          onAdd={addNode}
          onRemove={removeNode}
          onChangeRank={changeRank}
          onChangeName={renameNode}
          onUpdateNode={updateNode}
          onSaveTree={handleSaveTree}
          onLoadTree={handleLoadTree}
          onPrintTree={handlePrintTree}
          onResetTree={handleResetTree}
        />

        <main className="flex-1 p-3 md:p-4 min-w-0 bg-white">
          {selectedNode ? (
            <>
              <div ref={rankPrintAreaRef}>
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold">{selectedNode.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded border ${RANK_BADGE_CLASS[selectedNode.rank] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                      {selectedNode.rank}
                    </span>
                  </div>

                  {(selectedNode.rank === 'SSM' || selectedNode.rank === 'SM') && (
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:ml-auto text-[11px] text-gray-600 rounded-lg border border-sky-100 bg-slate-50 px-2 py-1.5 shadow-sm">
                      <label className="flex flex-1 sm:flex-none items-center justify-between gap-1 bg-white border border-sky-100 rounded px-1.5 py-0.5">
                        <span className="text-sky-700 font-medium">좌 목표</span>
                        <input
                          type="number"
                          className="border-none bg-transparent w-12 text-center outline-none"
                          value={selectedNode.targetLeft}
                          onChange={(e) => updateNode(selectedNode.id, { targetLeft: +e.target.value })}
                        />
                      </label>
                      <label className="flex flex-1 sm:flex-none items-center justify-between gap-1 bg-white border border-orange-100 rounded px-1.5 py-0.5">
                        <span className="text-orange-700 font-medium">우 목표</span>
                        <input
                          type="number"
                          className="border-none bg-transparent w-12 text-center outline-none"
                          value={selectedNode.targetRight}
                          onChange={(e) => updateNode(selectedNode.id, { targetRight: +e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
                {/* onUpdateDay를 오버라이딩하여 연쇄 반응 계산 로직 연결 */}
                <RankTable 
                  nodeId={selectedNodeId} 
                  allNodes={nodes} 
                  onUpdateDay={handleUpdateDayWithUndo}
                />
              </div>
              
              {/* 🔴 수정됨: ExportButtons에 onResetToOptimize, onUndo, hasUndo를 전달합니다. */}
              <ExportButtons
                nodes={nodes}
                selectedNode={selectedNode}
                onResetToOptimize={handleResetToOptimize} 
                onSaveImage={handleSaveRankTableImage}
                onUndo={handleUndo}
                hasUndo={hasUndo}
                undoCount={undoCount}
              />
              <CommissionSummary nodes={nodes} />
            </>
          ) : (
            <>
              <p className="text-gray-400 p-10 text-center">좌측 트리에서 노드를 선택하세요.</p>
              <CommissionSummary nodes={nodes} />
            </>
          )}
        </main>
      </div>

      {/* 연쇄 반응 스낵바 (사용자가 직접 닫기 전까지 유지) */}
      {snackbar.isOpen && snackbar.changes.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 rounded-xl bg-slate-800/95 px-5 py-4 text-white shadow-2xl backdrop-blur-sm border border-slate-700 animate-in fade-in slide-in-from-bottom-4 w-[90%] md:w-[450px] max-h-[50vh]">
          
          {/* 헤더 부분 */}
          <div className="flex items-center justify-between border-b border-slate-600 pb-2">
            <span className="text-sm font-bold text-sky-400">
              ⚡ 수당 연쇄 반응 (총 {snackbar.changes.length}건)
            </span>
            <button 
              onClick={() => setSnackbar({ isOpen: false, changes: [] })} 
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* 변경된 노드 리스트 (여러 개일 경우 스크롤) */}
          <div className="flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar">
            {snackbar.changes.map((change, idx) => (
              <div key={idx} className="flex flex-col bg-slate-700/50 rounded px-3 py-2 text-sm border border-slate-600/50">
                <span className="font-bold text-amber-300 mb-1">[{change.name}]</span>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <span>점수: <span className="text-slate-300">{change.oldScore}</span> <span className="text-slate-500">→</span> <span className="text-green-400 font-bold">{change.newScore}</span></span>
                  <span className="text-slate-500 mx-1">|</span>
                  <span>매칭: <span className="text-slate-300">{change.oldMatch}</span> <span className="text-slate-500">→</span> <span className="text-green-400 font-bold">{change.newMatch}</span></span>
                </div>
              </div>
            ))}
          </div>

          {/* 하단 되돌리기 버튼 */}
          <div className="border-t border-slate-600 pt-3 flex justify-end">
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-slate-600 hover:text-amber-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              입력 되돌리기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}