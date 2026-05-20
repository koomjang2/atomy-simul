import { useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import Header from './components/Header.jsx'
import PeriodSelector from './components/PeriodSelector.jsx'
import OrgTreePanel from './components/OrgTreePanel.jsx'
import RankTable from './components/RankTable.jsx'
import CommissionSummary from './components/CommissionSummary.jsx'
import ExportButtons from './components/ExportButtons.jsx'
import { runOptimization } from './engine/optimizer.js'
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

  // --- 스낵바 및 되돌리기 상태 관리 시작 ---
  const [snackbar, setSnackbar] = useState({ isOpen: false, nodeName: '', oldScore: 0, newScore: 0, oldCnt: 0, newCnt: 0 })
  const undoStateRef = useRef(null)
  const isManualAction = useRef(false)
  const snackbarTimer = useRef(null)

  // 입력 발생 직전 상태 백업
  const handleUpdateDayWithUndo = (nodeId, date, field, val) => {
    isManualAction.current = true
    undoStateRef.current = JSON.parse(JSON.stringify(state)) 
    updateDay(nodeId, date, field, val)
  }

  // 변화 감지 시 스낵바 노출
  const handleMetricsChange = (nodeName, oldScore, newScore, oldCnt, newCnt) => {
    if (!isManualAction.current) return
    
    setSnackbar({ isOpen: true, nodeName, oldScore, newScore, oldCnt, newCnt })
    isManualAction.current = false

    if (snackbarTimer.current) clearTimeout(snackbarTimer.current)
    snackbarTimer.current = setTimeout(() => {
      setSnackbar(prev => ({ ...prev, isOpen: false }))
    }, 5000)
  }

  // 되돌리기 실행
  const handleUndo = () => {
    if (undoStateRef.current) {
      loadState(undoStateRef.current)
      setSnackbar(prev => ({ ...prev, isOpen: false }))
      undoStateRef.current = null
    }
  }
  // --- 스낵바 및 되돌리기 상태 관리 끝 ---

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
    const optimized = runOptimization(nodes, year, month, half)
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
                <RankTable 
                  nodeId={selectedNodeId} 
                  allNodes={nodes} 
                  onUpdateDay={handleUpdateDayWithUndo} 
                  onMetricsChange={handleMetricsChange}
                />
              </div>
              <ExportButtons
                nodes={nodes}
                selectedNode={selectedNode}
                onResetDays={() => resetNodeDays(selectedNodeId)}
                onSaveImage={handleSaveRankTableImage}
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

      {/* 스낵바 UI 알림창 */}
      {snackbar.isOpen && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 rounded-xl bg-slate-800/95 px-5 py-3.5 text-white shadow-2xl backdrop-blur-sm border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-sky-400 mb-0.5">[{snackbar.nodeName}] 수당 결과 변경</span>
            <span className="text-sm font-medium">
              점수: <span className="text-slate-300">{snackbar.oldScore}점</span> → <span className="text-green-400 font-bold">{snackbar.newScore}점</span>
              <span className="mx-2 text-slate-600">|</span>
              매칭: <span className="text-slate-300">{snackbar.oldCnt}회</span> → <span className="text-green-400 font-bold">{snackbar.newCnt}회</span>
            </span>
          </div>
          
          <div className="h-8 w-px bg-slate-600 mx-1"></div>
          
          <button
            onClick={handleUndo}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-slate-700 hover:text-amber-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            되돌리기
          </button>
          
          <button 
            onClick={() => setSnackbar(s => ({ ...s, isOpen: false }))} 
            className="ml-1 p-1 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}