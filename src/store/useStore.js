import { useReducer, useCallback } from 'react'
import { buildCalendar } from '../engine/calendar.js'
import { getTargetByRank } from '../engine/rankLogic.js'
import { generateId } from '../utils/format.js'

function makeDays(year, month, half) {
  return buildCalendar(year, month, half)
}

function makeNode(name, rank, parentId, side, year, month, half) {
  const target = getTargetByRank(rank)
  return {
    id: generateId(),
    name,
    rank,
    parentId,
    side,
    bodyPvPool: target.bodyPv,
    targetLeft: target.left,
    targetRight: target.right,
    days: makeDays(year, month, half),
  }
}

function makeDefaultState() {
  const year = 2026, month = 4, half = 'second'
  const root = makeNode('나', 'DM', null, 'root', year, month, half)
  return { year, month, half, nodes: [root], selectedNodeId: root.id }
}

const initialState = (() => {
  try {
    const saved = localStorage.getItem('atomy-simulator')
    if (saved) return JSON.parse(saved)
  } catch (_) {}
  return makeDefaultState()
})()

function rebuildDays(nodes, year, month, half) {
  return nodes.map((n) => ({ ...n, days: makeDays(year, month, half) }))
}

function reducer(state, action) {
  switch (action.type) {

    case 'SET_PERIOD': {
      const { year, month, half } = action
      return { ...state, year, month, half, nodes: rebuildDays(state.nodes, year, month, half) }
    }

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.id }

    case 'ADD_NODE': {
      const { parentId, side, rank, name } = action
      const exists = state.nodes.some((n) => n.parentId === parentId && n.side === side)
      if (exists) return state
      const node = makeNode(name, rank, parentId, side, state.year, state.month, state.half)
      return { ...state, nodes: [...state.nodes, node], selectedNodeId: node.id }
    }

    case 'REMOVE_NODE': {
      const toRemove = new Set()
      const queue = [action.id]
      while (queue.length) {
        const id = queue.shift()
        toRemove.add(id)
        state.nodes.filter((n) => n.parentId === id).forEach((n) => queue.push(n.id))
      }
      const nodes = state.nodes.filter((n) => !toRemove.has(n.id))
      const selectedNodeId = toRemove.has(state.selectedNodeId)
        ? (nodes[0]?.id ?? null)
        : state.selectedNodeId
      return { ...state, nodes, selectedNodeId }
    }

    case 'UPDATE_NODE':
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.id ? { ...n, ...action.updates } : n)),
      }

    // 직급 변경: bodyPvPool/targets 자동 재설정 + 이름에 포함된 (직급) 자동 갱신
    case 'CHANGE_RANK': {
      const { id, rank } = action
      const target = getTargetByRank(rank)
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.id !== id) return n
          // "(이전직급)" → "(새직급)" 패턴 교체
          const newName = n.name.replace(/\([A-Z]+\)/, `(${rank})`)
          return {
            ...n,
            rank,
            name: newName,
            bodyPvPool: target.bodyPv,
            targetLeft: target.left,
            targetRight: target.right,
          }
        }),
      }
    }

    // 이름 변경
    case 'RENAME_NODE':
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.id ? { ...n, name: action.name } : n)),
      }

    case 'UPDATE_DAY': {
      const { nodeId, date, field, value } = action
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n
          return {
            ...n,
            days: n.days.map((d) => {
              if (d.date !== date) return d
              const updated = { ...d, [field]: value }
              // 입력값이 하나라도 있으면 locked, 모두 0이면 해제
              const hasValue = (updated.leftPv || 0) + (updated.rightPv || 0) + (updated.bodyPv || 0) > 0
              return { ...updated, locked: hasValue }
            }),
          }
        }),
      }
    }

    case 'RESET_NODE_DAYS': {
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.id !== action.nodeId) return n
          return {
            ...n,
            days: n.days.map((d) => ({ ...d, leftPv: 0, rightPv: 0, bodyPv: 0, locked: false })),
          }
        }),
      }
    }

    case 'APPLY_OPTIMIZATION': {
      const map = Object.fromEntries(action.updatedNodes.map((n) => [n.id, n]))
      return { ...state, nodes: state.nodes.map((n) => map[n.id] ?? n) }
    }

    case 'LOAD_STATE':
      return action.state

    case 'LOAD_TREE': {
      // treeNodes: [{ id, name, rank, parentId, side }]
      // Rebuild with fresh days for current period, preserving original IDs so parent refs work
      const newNodes = action.treeNodes.map((n) => ({
        ...makeNode(n.name, n.rank, n.parentId, n.side, state.year, state.month, state.half),
        id: n.id,
      }))
      return { ...state, nodes: newNodes, selectedNodeId: newNodes[0]?.id ?? null }
    }

    case 'RESET_TREE': {
      const root = makeNode('나', 'DM', null, 'root', state.year, state.month, state.half)
      return { ...state, nodes: [root], selectedNodeId: root.id }
    }

    default:
      return state
  }
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setPeriod       = useCallback((y, m, h) => dispatch({ type: 'SET_PERIOD', year: y, month: m, half: h }), [])
  const selectNode      = useCallback((id) => dispatch({ type: 'SELECT_NODE', id }), [])
  const addNode         = useCallback((parentId, side, rank, name) => dispatch({ type: 'ADD_NODE', parentId, side, rank, name }), [])
  const removeNode      = useCallback((id) => dispatch({ type: 'REMOVE_NODE', id }), [])
  const updateNode      = useCallback((id, updates) => dispatch({ type: 'UPDATE_NODE', id, updates }), [])
  const changeRank      = useCallback((id, rank) => dispatch({ type: 'CHANGE_RANK', id, rank }), [])
  const renameNode      = useCallback((id, name) => dispatch({ type: 'RENAME_NODE', id, name }), [])
  const updateDay       = useCallback((nodeId, date, field, value) => dispatch({ type: 'UPDATE_DAY', nodeId, date, field, value }), [])
  const applyOptimization = useCallback((updatedNodes) => dispatch({ type: 'APPLY_OPTIMIZATION', updatedNodes }), [])
  const resetNodeDays     = useCallback((nodeId) => dispatch({ type: 'RESET_NODE_DAYS', nodeId }), [])
  const loadState         = useCallback((s) => dispatch({ type: 'LOAD_STATE', state: s }), [])
  const loadTree          = useCallback((treeNodes) => dispatch({ type: 'LOAD_TREE', treeNodes }), [])
  const resetTree         = useCallback(() => dispatch({ type: 'RESET_TREE' }), [])

  return { state, setPeriod, selectNode, addNode, removeNode, updateNode, changeRank, renameNode, updateDay, applyOptimization, loadState, loadTree, resetTree, resetNodeDays }
}
