import { useEffect, useRef, useState } from 'react'
import { Plus, ChevronDown, Check, Pencil } from 'lucide-react'
import { computeNodeSimulation } from '../engine/rollup.js'
import { N_VALUE, SCORE_TIERS } from '../engine/pvRules.js'

const RANK_COLORS = {
  SSM: 'bg-gray-200 text-gray-700 border-gray-400',
  SM:  'bg-blue-100 text-blue-800 border-blue-400',
  DM:  'bg-orange-100 text-orange-800 border-orange-400',
  SRM: 'bg-green-100 text-green-700 border-green-500',
  STM: 'bg-purple-100 text-purple-800 border-purple-500',
  RM:  'bg-yellow-100 text-yellow-800 border-yellow-500',
  CM:  'bg-pink-100 text-pink-800 border-pink-500',
  IM:  'bg-red-100 text-red-800 border-red-500',
}

const ALL_RANKS = ['SSM', 'SM', 'DM', 'SRM', 'STM', 'RM', 'CM', 'IM']
const ADD_RANKS = ['SSM', 'SM', 'DM', 'SRM', 'STM']
const NODE_CARD_WIDTH = 84
const EMPTY_LANE_WIDTH = 120
const BRANCH_GAP = 48

function summarizeNodePerformance(node, allNodes) {
  const sim = computeNodeSimulation(node.id, allNodes)
  const tierCounts = {}
  let totalScore = 0
  let totalMatch = 0

  for (const day of sim) {
    if (day.score > 0) {
      tierCounts[day.score] = (tierCounts[day.score] || 0) + 1
      totalScore += day.score
      totalMatch += 1
    }
  }

  return {
    totalScore,
    totalMatch,
    totalCommission: totalScore * N_VALUE,
    tierCounts,
  }
}

function EditableName({ name, onChange, summary }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  function commit() {
    if (value.trim()) onChange(value.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="text-xs text-center bg-white border-b border-gray-500 outline-none w-full min-w-0 px-0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() ; if (e.key === 'Escape') setEditing(false) }}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <div
      className="relative text-xs mt-0.5 whitespace-nowrap cursor-text flex items-center gap-0.5 justify-center group/name"
      title="클릭하여 이름 수정"
    >
      <button
        type="button"
        className="outline-none rounded-sm px-0.5 focus-visible:ring-1 focus-visible:ring-sky-400"
        onClick={(e) => { e.stopPropagation(); setValue(name); setEditing(true) }}
      >
        {name}
      </button>
      <Pencil size={8} className="opacity-0 group-hover/name:opacity-40 flex-shrink-0" />
      <div className="pointer-events-none absolute z-[9999] hidden group-hover/name:block top-full mt-1 left-1/2 -translate-x-1/2">
        <div className="rounded-md border border-sky-200 bg-white shadow-xl px-2 py-1.5 text-[10px] text-gray-700 min-w-[170px] text-left">
          <div className="font-semibold text-sky-700 mb-0.5">예상 오버뷰</div>
          <ul className="space-y-0.5">
            <li>• 예상수당: {summary.totalCommission.toLocaleString()}원</li>
            <li>• 총 점수: {summary.totalScore}점</li>
            <li>• 총 매칭: {summary.totalMatch}회</li>
            <li>
              • {SCORE_TIERS.map((tier) => (
                summary.tierCounts[tier.score] > 0
                  ? `${tier.score}점 ${summary.tierCounts[tier.score]}회`
                  : null
              )).filter(Boolean).join(' · ') || '매칭 없음'}
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function calcSubtreeWidth(nodeId, allNodes, cache) {
  if (cache.has(nodeId)) return cache.get(nodeId)
  const left = allNodes.find((n) => n.parentId === nodeId && n.side === 'left')
  const right = allNodes.find((n) => n.parentId === nodeId && n.side === 'right')
  if (!left && !right) {
    const width = Math.max(NODE_CARD_WIDTH, EMPTY_LANE_WIDTH)
    cache.set(nodeId, width)
    return width
  }

  const leftWidth = left ? calcSubtreeWidth(left.id, allNodes, cache) : Math.max(NODE_CARD_WIDTH, EMPTY_LANE_WIDTH)
  const rightWidth = right ? calcSubtreeWidth(right.id, allNodes, cache) : Math.max(NODE_CARD_WIDTH, EMPTY_LANE_WIDTH)
  const width = leftWidth + rightWidth + BRANCH_GAP
  cache.set(nodeId, width)
  return width
}

function NodeCard({ node, isSelected, onSelect, canAddLeft, canAddRight,
  onAddLeft, onAddRight, onRemove, onChangeRank, onChangeName, allNodes, onUpdateNode }) {
  const [showRankMenu, setShowRankMenu] = useState(false)
  const colorClass = RANK_COLORS[node.rank] ?? 'bg-gray-100 text-gray-700 border-gray-300'
  const summary = summarizeNodePerformance(node, allNodes)
  const canEditTargets = node.rank === 'SM' || node.rank === 'SSM'

  return (
    <div className="relative flex flex-col items-center z-10 hover:z-[500]">
      <div
        className={`
          relative border-2 rounded-lg px-3 py-1.5 cursor-pointer min-w-[84px] text-center
          transition-all duration-300 select-none
          shadow-[0_6px_14px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.65)]
          bg-gradient-to-b from-white/65 via-white/20 to-black/5 backdrop-blur-[1px]
          ${colorClass}
          ${isSelected
            ? 'ring-2 ring-offset-1 ring-blue-500 shadow-[0_10px_20px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.75)]'
            : 'hover:-translate-y-[2px] hover:shadow-[0_12px_22px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.75)]'}
        `}
        onClick={() => onSelect()}
      >
        <button
          className="flex items-center gap-0.5 mx-auto text-xs font-bold underline decoration-dotted hover:opacity-70"
          onClick={(e) => { e.stopPropagation(); setShowRankMenu(!showRankMenu) }}
          title="클릭하여 직급 변경"
        >
          {node.rank}
          <ChevronDown size={9} />
        </button>

        <EditableName
          name={node.name}
          onChange={onChangeName}
          summary={summary}
        />

        {onRemove && (
          <button
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 text-[10px]
                       flex items-center justify-center opacity-0 hover:opacity-100 z-10
                       peer-hover:opacity-100"
            style={{ lineHeight: 1 }}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            title="노드 삭제"
          >
            ×
          </button>
        )}
      </div>

      {canEditTargets && (
        <div
          className="mt-1 w-[150px] rounded-md border border-sky-100 bg-white/95 px-1.5 py-1 shadow-[0_2px_8px_rgba(2,132,199,0.12)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-600">
            <label className="flex flex-col items-center gap-0.5">
              <span>좌목표</span>
              <input
                type="number"
                min={0}
                className="w-full border rounded px-1 py-0.5 text-center text-[10px] outline-none focus:border-sky-400"
                value={node.targetLeft ?? 0}
                onChange={(e) => onUpdateNode?.(node.id, { targetLeft: +e.target.value || 0 })}
              />
            </label>
            <label className="flex flex-col items-center gap-0.5">
              <span>우목표</span>
              <input
                type="number"
                min={0}
                className="w-full border rounded px-1 py-0.5 text-center text-[10px] outline-none focus:border-sky-400"
                value={node.targetRight ?? 0}
                onChange={(e) => onUpdateNode?.(node.id, { targetRight: +e.target.value || 0 })}
              />
            </label>
            <label className="flex flex-col items-center gap-0.5">
              <span>몸PV</span>
              <input
                type="number"
                min={0}
                className="w-full border rounded px-1 py-0.5 text-center text-[10px] outline-none focus:border-sky-400"
                value={node.bodyPvPool ?? 0}
                onChange={(e) => onUpdateNode?.(node.id, { bodyPvPool: +e.target.value || 0 })}
              />
            </label>
          </div>
        </div>
      )}

      {showRankMenu && (
        <div
          className="absolute top-full mt-1 z-50 bg-white border rounded-lg shadow-xl py-1 min-w-[72px]"
          onClick={(e) => e.stopPropagation()}
        >
          {ALL_RANKS.map((r) => (
            <button
              key={r}
              className={`w-full flex items-center gap-1 px-3 py-1 text-xs hover:bg-gray-100
                          ${node.rank === r ? 'font-bold text-blue-600' : 'text-gray-700'}`}
              onClick={() => { onChangeRank(r); setShowRankMenu(false) }}
            >
              {node.rank === r && <Check size={10} />}
              {node.rank !== r && <span className="w-2.5" />}
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 mt-1.5">
        <button
          disabled={!canAddLeft}
          onClick={(e) => { e.stopPropagation(); onAddLeft?.() }}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border font-medium transition-colors
            ${!canAddLeft
              ? 'opacity-20 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400'
              : 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100 cursor-pointer'}`}
          title={!canAddLeft ? '좌 자식 이미 존재' : '좌 하위 추가'}
        >
          <Plus size={8} /><span>좌</span>
        </button>
        <button
          disabled={!canAddRight}
          onClick={(e) => { e.stopPropagation(); onAddRight?.() }}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border font-medium transition-colors
            ${!canAddRight
              ? 'opacity-20 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400'
              : 'bg-orange-50 border-orange-300 text-orange-600 hover:bg-orange-100 cursor-pointer'}`}
          title={!canAddRight ? '우 자식 이미 존재' : '우 하위 추가'}
        >
          <Plus size={8} /><span>우</span>
        </button>
      </div>
    </div>
  )
}

function BinaryTreeNode({ nodeId, allNodes, selectedId, onSelect, onAdd, onRemove, onChangeRank, onChangeName, onUpdateNode }) {
  const [addSide, setAddSide] = useState(null)
  const [newRank, setNewRank] = useState('SM')
  const [newName, setNewName] = useState('')

  const node = allNodes.find((n) => n.id === nodeId)
  if (!node) return null

  const leftChild  = allNodes.find((n) => n.parentId === nodeId && n.side === 'left')
  const rightChild = allNodes.find((n) => n.parentId === nodeId && n.side === 'right')
  const hasLeft    = !!leftChild
  const hasRight   = !!rightChild
  const hasChildren = hasLeft || hasRight
  const isRoot = !node.parentId
  const widthCache = new Map()

  const leftLaneWidth = hasLeft
    ? calcSubtreeWidth(leftChild.id, allNodes, widthCache)
    : Math.max(NODE_CARD_WIDTH, EMPTY_LANE_WIDTH)
  const rightLaneWidth = hasRight
    ? calcSubtreeWidth(rightChild.id, allNodes, widthCache)
    : Math.max(NODE_CARD_WIDTH, EMPTY_LANE_WIDTH)
  const childRowWidth = leftLaneWidth + rightLaneWidth + BRANCH_GAP
  const leftCenterX = leftLaneWidth / 2
  const rightCenterX = leftLaneWidth + BRANCH_GAP + (rightLaneWidth / 2)

  function handleAdd() {
    const name = newName.trim() || `${addSide === 'left' ? '좌' : '우'} ${newRank}`
    onAdd(nodeId, addSide, newRank, name)
    setAddSide(null); setNewName(''); setNewRank('SM')
  }

  return (
    <div className="flex flex-col items-center" style={{ minWidth: hasChildren ? childRowWidth : NODE_CARD_WIDTH }}>
      <NodeCard
        node={node}
        isSelected={node.id === selectedId}
        onSelect={() => onSelect(node.id)}
        canAddLeft={!hasLeft}
        canAddRight={!hasRight}
        onAddLeft={() => setAddSide(addSide === 'left' ? null : 'left')}
        onAddRight={() => setAddSide(addSide === 'right' ? null : 'right')}
        onRemove={isRoot ? undefined : () => onRemove(node.id)}
        onChangeRank={(rank) => onChangeRank(node.id, rank)}
        onChangeName={(name) => onChangeName(node.id, name)}
        allNodes={allNodes}
        onUpdateNode={onUpdateNode}
      />

      {addSide && (
        <div
          className="mt-1.5 p-2 bg-white border rounded-lg shadow-lg text-xs w-44 z-40"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-semibold text-gray-600 mb-1.5">
            <span className={addSide === 'left' ? 'text-blue-600' : 'text-orange-500'}>
              {addSide === 'left' ? '좌' : '우'}
            </span> 하위 추가
          </p>
          <select
            className="border rounded px-1 py-0.5 w-full mb-1 text-xs"
            value={newRank}
            onChange={(e) => setNewRank(e.target.value)}
          >
            {ADD_RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input
            className="border rounded px-1 py-0.5 w-full mb-1.5 text-xs"
            placeholder="이름 입력 (Enter)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <div className="flex gap-1">
            <button
              className="flex-1 bg-blue-500 text-white rounded px-2 py-0.5 text-xs hover:bg-blue-600"
              onClick={handleAdd}
            >추가</button>
            <button
              className="bg-gray-100 rounded px-2 py-0.5 text-xs hover:bg-gray-200"
              onClick={() => { setAddSide(null); setNewName('') }}
            >취소</button>
          </div>
        </div>
      )}

      {hasChildren && (
        <>
          <div className="flex flex-col items-center" style={{ width: childRowWidth }}>
            <div className="w-px h-3 bg-gray-400" />
            <div className="relative" style={{ width: childRowWidth, height: 12 }}>
              {hasLeft && hasRight && (
                <>
                  <div className="absolute bg-gray-400" style={{ top: 0, left: leftCenterX, width: rightCenterX - leftCenterX, height: 2 }} />
                  <div className="absolute w-px bg-gray-400" style={{ top: 0, left: leftCenterX, height: 12 }} />
                  <div className="absolute w-px bg-gray-400" style={{ top: 0, left: rightCenterX, height: 12 }} />
                </>
              )}
              {hasLeft && !hasRight && (
                <>
                  <div className="absolute bg-gray-400" style={{ top: 0, left: leftCenterX, width: (childRowWidth / 2) - leftCenterX, height: 2 }} />
                  <div className="absolute w-px bg-gray-400" style={{ top: 0, left: leftCenterX, height: 12 }} />
                </>
              )}
              {!hasLeft && hasRight && (
                <>
                  <div className="absolute bg-gray-400" style={{ top: 0, left: childRowWidth / 2, width: rightCenterX - (childRowWidth / 2), height: 2 }} />
                  <div className="absolute w-px bg-gray-400" style={{ top: 0, left: rightCenterX, height: 12 }} />
                </>
              )}
            </div>
            <div className="flex" style={{ width: childRowWidth }}>
              <div className="flex flex-col items-center" style={{ width: leftLaneWidth }}>
                {hasLeft && (
                  <>
                    <div className="text-[10px] font-bold text-blue-500 mb-0.5">좌</div>
                    <BinaryTreeNode
                      nodeId={leftChild.id}
                      allNodes={allNodes}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      onAdd={onAdd}
                      onRemove={onRemove}
                      onChangeRank={onChangeRank}
                      onChangeName={onChangeName}
                      onUpdateNode={onUpdateNode}
                    />
                  </>
                )}
              </div>
              <div style={{ width: BRANCH_GAP }} />
              <div className="flex flex-col items-center" style={{ width: rightLaneWidth }}>
                {hasRight && (
                  <>
                    <div className="text-[10px] font-bold text-orange-500 mb-0.5">우</div>
                    <BinaryTreeNode
                      nodeId={rightChild.id}
                      allNodes={allNodes}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      onAdd={onAdd}
                      onRemove={onRemove}
                      onChangeRank={onChangeRank}
                      onChangeName={onChangeName}
                      onUpdateNode={onUpdateNode}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function OrgTreePanel({
  nodes, selectedId, onSelect, onAdd, onRemove, onChangeRank, onChangeName, onUpdateNode,
  onSaveTree, onLoadTree, onPrintTree, onResetTree,
}) {
  const roots = nodes.filter((n) => !n.parentId)
  const treePrintRef = useRef(null)

  useEffect(() => {
    function handlePrintEvent() {
      if (!treePrintRef.current) return
      document.body.classList.add('print-org-tree-mode')
      const cleanup = () => {
        document.body.classList.remove('print-org-tree-mode')
        window.removeEventListener('afterprint', cleanup)
      }
      window.addEventListener('afterprint', cleanup)
      window.print()
    }

    window.addEventListener('print-org-tree', handlePrintEvent)
    return () => window.removeEventListener('print-org-tree', handlePrintEvent)
  }, [])

  return (
    <aside className="org-tree-panel bg-white border-b md:border-b-0 md:border-r flex flex-col no-print flex-shrink-0 w-full h-[45vh] md:h-auto md:w-1/2 lg:w-5/12" style={{ minWidth: 220 }}>
      <div className="px-3 py-2 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">조직 트리</span>
          <p className="text-[10px] text-gray-400 mt-0.5">직급 클릭 → 변경 · 이름 클릭 → 수정 · 좌·우 → 하위 추가</p>
        </div>
        <div className="flex overflow-x-auto lg:overflow-visible gap-2 flex-shrink-0 pb-1 lg:pb-0">
          <button
            onClick={onSaveTree}
            className="glass-btn h-9 min-w-[90px] px-3 text-xs"
            title="조직 구조만 저장 (PV 데이터 제외)"
          >🗂 저장</button>
          <button
            onClick={onLoadTree}
            className="glass-btn h-9 min-w-[90px] px-3 text-xs"
            title="저장된 조직 구조 불러오기"
          >📂 불러오기</button>
          <button
            onClick={onPrintTree}
            className="glass-btn h-9 min-w-[90px] px-3 text-xs"
            title="조직 트리 인쇄"
          >🖨 인쇄</button>
          <button
            onClick={onResetTree}
            className="glass-btn h-9 min-w-[90px] px-3 text-xs"
            title="조직 트리 초기화"
          >♻ 초기화</button>
        </div>
      </div>
      <div ref={treePrintRef} className="org-tree-print-area overflow-auto flex-1 p-4">
        {roots.map((root) => (
          <BinaryTreeNode
            key={root.id}
            nodeId={root.id}
            allNodes={nodes}
            selectedId={selectedId}
            onSelect={onSelect}
            onAdd={onAdd}
            onRemove={onRemove}
            onChangeRank={onChangeRank}
            onChangeName={onChangeName}
            onUpdateNode={onUpdateNode}
          />
        ))}
      </div>
    </aside>
  )
}