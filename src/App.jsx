import { useRef } from 'react'
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
    updateNode, changeRank, renameNode, updateDay, applyOptimization, loadState, resetTree,
  } = useStore()
  const { year, month, half, nodes, selectedNodeId } = state
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const loadTreeInputRef = useRef(null)

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
    <div className="flex flex-col h-screen overflow-hidden">
      <input
        ref={loadTreeInputRef}
        type="file"
        accept=".atomy.json,.json,application/json"
        className="hidden"
        onChange={handleLoadTreeFile}
      />
      <Header />

      <div className="flex items-center bg-white border-b no-print overflow-x-auto flex-shrink-0">
        <PeriodSelector year={year} month={month} half={half} onChange={setPeriod} />
        <button
          onClick={handleOptimize}
          disabled={!canOptimize}
          className={`ml-auto mr-3 flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5
                     text-sm rounded font-medium ${canOptimize
                       ? 'bg-blue-600 text-white hover:bg-blue-700'
                       : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          title={!canOptimize ? 'SM 또는 SSM 노드가 없습니다' : ''}
        >
          <Settings2 size={14} />
          자동 최적화
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
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

        <main className="flex-1 overflow-auto p-4 min-w-0">
          {selectedNode ? (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className="text-base font-bold">{selectedNode.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded border ${RANK_BADGE_CLASS[selectedNode.rank] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                  {selectedNode.rank}
                </span>

                {(selectedNode.rank === 'SSM' || selectedNode.rank === 'SM') && (
                  <div className="flex items-center gap-2 ml-auto text-xs text-gray-600 flex-wrap rounded-lg border border-sky-100 bg-white px-2 py-1.5 shadow-[0_2px_8px_rgba(2,132,199,0.1)]">
                    <label className="flex items-center gap-1.5 bg-white/90 border border-sky-100 rounded-md px-2 py-1">
                      <span className="text-sky-700 font-medium">좌 목표</span>
                      <input
                        type="number"
                        className="border rounded px-1 py-0.5 w-16 text-center"
                        value={selectedNode.targetLeft}
                        onChange={(e) => updateNode(selectedNode.id, { targetLeft: +e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 bg-white/90 border border-sky-100 rounded-md px-2 py-1">
                      <span className="text-sky-700 font-medium">우 목표</span>
                      <input
                        type="number"
                        className="border rounded px-1 py-0.5 w-16 text-center"
                        value={selectedNode.targetRight}
                        onChange={(e) => updateNode(selectedNode.id, { targetRight: +e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 bg-white/90 border border-sky-100 rounded-md px-2 py-1">
                      <span className="text-sky-700 font-medium">몸PV 목표</span>
                      <input
                        type="number"
                        className="border rounded px-1 py-0.5 w-16 text-center"
                        value={selectedNode.bodyPvPool}
                        onChange={(e) => updateNode(selectedNode.id, { bodyPvPool: +e.target.value })}
                      />
                    </label>
                  </div>
                )}
              </div>

              <RankTable nodeId={selectedNodeId} allNodes={nodes} onUpdateDay={updateDay} />
              <ExportButtons nodes={nodes} selectedNode={selectedNode} state={state} onLoad={loadState} />
            </>
          ) : (
            <p className="text-gray-400">좌측 트리에서 노드를 선택하세요.</p>
          )}

          <CommissionSummary nodes={nodes} />
        </main>
      </div>
    </div>
  )
}
