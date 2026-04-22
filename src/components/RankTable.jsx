import { useMemo } from 'react'
import { computeNodeSimulation, getLeftSubtree, getRightSubtree } from '../engine/rollup.js'
import { checkRank } from '../engine/rankLogic.js'
import { N_VALUE, SCORE_TIERS } from '../engine/pvRules.js'

// 서브트리 노드들의 보름 총합 PV 계산 (모든 날짜의 leftPv+rightPv+bodyPv 합산)
function subTreePeriodTotal(subNodes) {
  return subNodes.reduce((sum, sub) =>
    sum + (sub.days?.reduce((s, d) => s + (d.leftPv || 0) + (d.rightPv || 0) + (d.bodyPv || 0), 0) ?? 0), 0)
}

function detectMatchPairs(simDays) {
  const pairs = {}
  let pendingDate = null

  for (const day of simDays) {
    if (day.isSunday) continue
    if ((day.leftPv || 0) + (day.rightPv || 0) + (day.bodyPv || 0) > 0) {
      pendingDate = day.date
    }
    if (day.score > 0 && pendingDate) {
      pairs[pendingDate] = 'matched'
      pairs[day.date] = 'matched'
      pendingDate = null
    }
  }
  return pairs
}

function detectFlashout(simDays) {
  const warnings = {}
  let leftAcc = 0, rightAcc = 0
  let lastLeftDate = null, lastRightDate = null

  for (const day of simDays) {
    if (day.isSunday) continue
    if ((day.leftPv || 0) > 0 || (day.effLeft || 0) > 0) { leftAcc++; lastLeftDate = day.date }
    if ((day.rightPv || 0) > 0 || (day.effRight || 0) > 0) { rightAcc++; lastRightDate = day.date }
    if (day.score > 0) { leftAcc = 0; rightAcc = 0; lastLeftDate = null; lastRightDate = null }
  }
  if (leftAcc > 0 && rightAcc === 0 && lastLeftDate) warnings[lastLeftDate] = '좌 PV 플래시아웃 위험'
  if (rightAcc > 0 && leftAcc === 0 && lastRightDate) warnings[lastRightDate] = '우 PV 플래시아웃 위험'
  return warnings
}

export default function RankTable({ nodeId, allNodes, onUpdateDay }) {
  // ── 모든 훅을 조건부 return 이전에 호출 (Rules of Hooks) ──
  const node = allNodes.find((n) => n.id === nodeId)

  const isDMOrAbove = ['DM', 'SRM', 'STM', 'RM', 'CM', 'IM'].includes(node?.rank)
  const hasLeftSub  = useMemo(() => getLeftSubtree(nodeId, allNodes).length > 0,  [nodeId, allNodes])
  const hasRightSub = useMemo(() => getRightSubtree(nodeId, allNodes).length > 0, [nodeId, allNodes])
  const simDays     = useMemo(() => node ? computeNodeSimulation(nodeId, allNodes) : [], [nodeId, allNodes, node])
  const matchPairs  = useMemo(() => detectMatchPairs(simDays), [simDays])
  const flashouts   = useMemo(() => detectFlashout(simDays),   [simDays])
  const leftSubTotal  = useMemo(() => subTreePeriodTotal(getLeftSubtree(nodeId, allNodes)),  [nodeId, allNodes])
  const rightSubTotal = useMemo(() => subTreePeriodTotal(getRightSubtree(nodeId, allNodes)), [nodeId, allNodes])

  if (!node) return <p className="text-gray-400 p-4">노드를 선택하세요.</p>

  // 표시할 컬럼 결정
  const showLeftInput  = !isDMOrAbove && !hasLeftSub
  const showRightInput = !isDMOrAbove && !hasRightSub
  const showBodyInput  = !isDMOrAbove
  const totalCols = 2 + (showLeftInput ? 1 : 0) + (showRightInput ? 1 : 0) + (showBodyInput ? 1 : 0) + 3

  const totalLeft  = showLeftInput  ? node.days.reduce((s, d) => s + (d.leftPv  || 0), 0) : 0
  const totalRight = showRightInput ? node.days.reduce((s, d) => s + (d.rightPv || 0), 0) : 0
  const totalBody  = showBodyInput  ? node.days.reduce((s, d) => s + (d.bodyPv  || 0), 0) : 0
  const totalScore = simDays.reduce((s, d) => s + (d.score || 0), 0)
  const totalMatch = simDays.reduce((s, d) => s + (d.score > 0 ? 1 : 0), 0)
  const totalCommission = totalScore * N_VALUE
  const tierSummary = SCORE_TIERS
    .map((t) => ({ score: t.score, count: simDays.filter((d) => d.score === t.score).length }))
    .filter((t) => t.count > 0)

  // 직급 달성 판정: 보름 총합 기준
  const periodLeft  = totalLeft  + leftSubTotal
  const periodRight = totalRight + rightSubTotal
  const periodBody  = totalBody

  const achieved =
    node.rank === 'SSM' || node.rank === 'SM'
      ? checkRank(node.rank, periodLeft, periodRight, periodBody)
      : null

  function handleInput(date, field, raw) {
    const val = parseInt(raw, 10)
    onUpdateDay(node.id, date, field, isNaN(val) ? 0 : val)
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-gradient-to-r from-slate-50 to-slate-100">
            <th className="border-b border-slate-200 px-2 py-2 text-center w-9 font-semibold">일</th>
            <th className="border-b border-slate-200 px-2 py-2 text-center w-14 whitespace-nowrap font-semibold">요일</th>
            {showLeftInput  && <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">좌PV</th>}
            {showRightInput && <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">우PV</th>}
            {showBodyInput  && <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">몸PV</th>}
            <th className="border-b border-slate-200 px-3 py-2 text-center bg-blue-50/70 whitespace-nowrap min-w-[74px] font-semibold">누적 좌</th>
            <th className="border-b border-slate-200 px-3 py-2 text-center bg-orange-50/70 whitespace-nowrap min-w-[74px] font-semibold">누적 우</th>
            <th className="border-b border-slate-200 px-2 py-2 text-center w-16 font-semibold">점수</th>
          </tr>
        </thead>
        <tbody>
          {simDays.map((day) => {
            const isMatchedPair = !!matchPairs[day.date]
            const flashWarn  = flashouts[day.date]
            const entry = node.days.find((d) => d.date === day.date)

            if (day.isSunday) {
              return (
                <tr key={day.date} className="bg-slate-50 text-gray-400">
                  <td className="border-b border-slate-100 px-2 py-1.5 text-center">{day.date}</td>
                  <td className="border-b border-slate-100 px-2 py-1.5 text-center font-medium text-red-400">일</td>
                  <td className="border-b border-slate-100 px-2 py-1.5 text-center text-xs" colSpan={totalCols - 2}>
                    휴무
                  </td>
                </tr>
              )
            }

            return (
              <tr
                key={day.date}
                className={`${isMatchedPair ? 'bg-slate-50/60' : 'odd:bg-white even:bg-slate-50/40'} hover:bg-slate-100/70`}
              >
                <td className="border-b border-slate-100 px-2 py-1.5 text-center">{day.date}</td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-center text-gray-600">{day.dayOfWeek}</td>

                {showLeftInput && (
                  <td className="border-b border-slate-100 px-1 py-1">
                    <input
                      type="number" min={0}
                      className="w-full text-center bg-white/70 border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-sky-400"
                      value={entry?.leftPv || ''}
                      onChange={(e) => handleInput(day.date, 'leftPv', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                )}
                {showRightInput && (
                  <td className="border-b border-slate-100 px-1 py-1">
                    <input
                      type="number" min={0}
                      className="w-full text-center bg-white/70 border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-sky-400"
                      value={entry?.rightPv || ''}
                      onChange={(e) => handleInput(day.date, 'rightPv', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                )}
                {showBodyInput && (
                  <td className="border-b border-slate-100 px-1 py-1">
                    <input
                      type="number" min={0}
                      className="w-full text-center bg-white/70 border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-sky-400"
                      value={entry?.bodyPv || ''}
                      onChange={(e) => handleInput(day.date, 'bodyPv', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                )}

                <td className="border-b border-slate-100 px-2 py-1.5 text-center text-blue-700 bg-blue-50/60 font-mono text-xs">
                  {day.effLeft > 0 ? day.effLeft : ''}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-center text-orange-700 bg-orange-50/60 font-mono text-xs">
                  {day.effRight > 0 ? day.effRight : ''}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-center font-medium text-blue-700 bg-blue-50/70">
                  {day.score > 0 ? `${day.score}점` : ''}
                  {flashWarn && <span title={flashWarn} className="ml-1 text-yellow-500">⚠️</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100/70 font-semibold">
            <td className="border-t border-slate-200 px-2 py-2 text-center" colSpan={2}>합계</td>
            {showLeftInput  && <td className="border-t border-slate-200 px-2 py-2 text-center">{totalLeft}만</td>}
            {showRightInput && <td className="border-t border-slate-200 px-2 py-2 text-center">{totalRight}만</td>}
            {showBodyInput  && <td className="border-t border-slate-200 px-2 py-2 text-center">{totalBody}만</td>}
            <td className="border-t border-slate-200 px-2 py-2 text-center text-blue-700 bg-blue-50/70 font-mono">
              {periodLeft > 0 ? `${periodLeft}만` : '—'}
            </td>
            <td className="border-t border-slate-200 px-2 py-2 text-center text-orange-700 bg-orange-50/70 font-mono">
              {periodRight > 0 ? `${periodRight}만` : '—'}
            </td>
            <td className="border-t border-slate-200 px-2 py-2 text-center text-blue-700">{totalScore}점</td>
          </tr>
          {achieved !== null && (
            <tr>
              <td className="border-t border-slate-200 px-2 py-2 text-center" colSpan={totalCols}>
                {achieved
                  ? <span className="text-green-600 font-bold">✅ {node.rank} 달성</span>
                  : <span className="text-red-500 font-bold">
                      ❌ {node.rank} 미달성 — 좌 {periodLeft}만 / 우 {periodRight}만 + 몸PV {periodBody}만
                      (목표 좌 {node.targetLeft}만 / 우 {node.targetRight}만)
                    </span>
                }
              </td>
            </tr>
          )}
          <tr>
            <td className="border-t border-slate-200 px-2 py-2 bg-slate-50 text-[12px] text-slate-700" colSpan={totalCols}>
              <span className="font-semibold">개인 수당 계산 요약</span>
              <span className="ml-2">예상수당 {totalCommission.toLocaleString()}원</span>
              <span className="ml-2">총 점수 {totalScore}점</span>
              <span className="ml-2">총 매칭 {totalMatch}회</span>
              <span className="ml-2">
                {tierSummary.length
                  ? tierSummary.map((t) => `${t.score}점 ${t.count}회`).join(' · ')
                  : '매칭 없음'}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
