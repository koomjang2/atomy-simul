import { useMemo } from 'react'
import { computeNodeSimulation, getLeftSubtree, getRightSubtree } from '../engine/rollup.js'
import { checkRank } from '../engine/rankLogic.js'
import { N_VALUE, SCORE_TIERS } from '../engine/pvRules.js'

// 서브트리 노드들의 보름 총합 PV 계산
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
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-[10px] md:text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b border-slate-200 px-1 py-1.5 md:px-2 md:py-2 text-center w-8 md:w-9 font-semibold">일</th>
            <th className="border-b border-slate-200 px-1 py-1.5 md:px-2 md:py-2 text-center w-10 md:w-14 whitespace-nowrap font-semibold">요일</th>
            {showLeftInput  && <th className="border-b border-slate-200 px-1 py-1.5 text-center font-semibold">좌PV</th>}
            {showRightInput && <th className="border-b border-slate-200 px-1 py-1.5 text-center font-semibold">우PV</th>}
            {showBodyInput  && <th className="border-b border-slate-200 px-1 py-1.5 text-center font-semibold">몸PV</th>}
            <th className="border-b border-slate-200 px-1 md:px-3 py-1.5 text-center bg-blue-50/50 whitespace-nowrap min-w-[60px] md:min-w-[74px] font-semibold">누적 좌</th>
            <th className="border-b border-slate-200 px-1 md:px-3 py-1.5 text-center bg-orange-50/50 whitespace-nowrap min-w-[60px] md:min-w-[74px] font-semibold">누적 우</th>
            <th className="border-b border-slate-200 px-1 py-1.5 text-center w-12 md:w-16 font-semibold">점수</th>
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
                  <td className="border-b border-slate-100 px-1 py-1 text-center">{day.date}</td>
                  <td className="border-b border-slate-100 px-1 py-1 text-center font-medium text-red-400">일</td>
                  <td className="border-b border-slate-100 px-1 py-1 text-center text-[9px] md:text-xs" colSpan={totalCols - 2}>
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
                <td className="border-b border-slate-100 px-1 py-1 text-center">{day.date}</td>
                <td className="border-b border-slate-100 px-1 py-1 text-center text-gray-600">{day.dayOfWeek}</td>

                {showLeftInput && (
                  <td className="border-b border-slate-100 px-0.5 py-1">
                    <input
                      type="number" min={0}
                      className={`w-full text-center rounded px-0.5 py-0.5 md:px-1 outline-none text-[10px] md:text-sm
                        ${entry?.manualLeft
                          ? 'bg-white/70 border-2 border-amber-400 text-amber-800 font-semibold focus:border-amber-500'
                          : 'bg-white/70 border border-slate-200 focus:border-sky-400'}`}
                      value={entry?.leftPv || ''}
                      onChange={(e) => handleInput(day.date, 'leftPv', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                )}
                {showRightInput && (
                  <td className="border-b border-slate-100 px-0.5 py-1">
                    <input
                      type="number" min={0}
                      className={`w-full text-center rounded px-0.5 py-0.5 md:px-1 outline-none text-[10px] md:text-sm
                        ${entry?.manualRight
                          ? 'bg-white/70 border-2 border-amber-400 text-amber-800 font-semibold focus:border-amber-500'
                          : 'bg-white/70 border border-slate-200 focus:border-sky-400'}`}
                      value={entry?.rightPv || ''}
                      onChange={(e) => handleInput(day.date, 'rightPv', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                )}
                {showBodyInput && (
                  <td className="border-b border-slate-100 px-0.5 py-1">
                    <input
                      type="number" min={0}
                      className={`w-full text-center rounded px-0.5 py-0.5 md:px-1 outline-none text-[10px] md:text-sm
                        ${entry?.manualBody
                          ? 'bg-white/70 border-2 border-amber-400 text-amber-800 font-semibold focus:border-amber-500'
                          : 'bg-white/70 border border-slate-200 focus:border-sky-400'}`}
                      value={entry?.bodyPv || ''}
                      onChange={(e) => handleInput(day.date, 'bodyPv', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                )}

                <td className="border-b border-slate-100 px-1 py-1 text-center text-blue-700 bg-blue-50/40 font-mono text-[9px] md:text-xs">
                  {day.effLeft > 0 ? day.effLeft : ''}
                </td>
                <td className="border-b border-slate-100 px-1 py-1 text-center text-orange-700 bg-orange-50/40 font-mono text-[9px] md:text-xs">
                  {day.effRight > 0 ? day.effRight : ''}
                </td>
                <td className="border-b border-slate-100 px-1 py-1 text-center font-medium text-blue-700 bg-blue-50/50 whitespace-nowrap">
                  {day.score > 0 ? `${day.score}점` : ''}
                  {flashWarn && <span title={flashWarn} className="ml-0.5 text-yellow-500">⚠️</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100/70 font-semibold">
            <td className="border-t border-slate-200 px-1 py-2 text-center" colSpan={2}>합계</td>
            {showLeftInput  && <td className="border-t border-slate-200 px-1 py-2 text-center">{totalLeft}만</td>}
            {showRightInput && <td className="border-t border-slate-200 px-1 py-2 text-center">{totalRight}만</td>}
            {showBodyInput  && <td className="border-t border-slate-200 px-1 py-2 text-center">{totalBody}만</td>}
            <td className="border-t border-slate-200 px-1 py-2 text-center text-blue-700 bg-blue-50/60 font-mono">
              {periodLeft > 0 ? `${periodLeft}만` : '—'}
            </td>
            <td className="border-t border-slate-200 px-1 py-2 text-center text-orange-700 bg-orange-50/60 font-mono">
              {periodRight > 0 ? `${periodRight}만` : '—'}
            </td>
            <td className="border-t border-slate-200 px-1 py-2 text-center text-blue-700">{totalScore}점</td>
          </tr>
          {achieved !== null && (
            <tr>
              <td className="border-t border-slate-200 px-2 py-2 text-center" colSpan={totalCols}>
                {achieved
                  ? <span className="text-green-600 font-bold">✅ {node.rank} 달성</span>
                  : <div className="text-red-500 font-bold text-[9px] md:text-xs leading-tight">
                      ❌ {node.rank} 미달성<br/>
                      좌 {periodLeft}만 / 우 {periodRight}만 + 몸PV {periodBody}만<br/>
                      (목표 좌 {node.targetLeft}만 / 우 {node.targetRight}만)
                    </div>
                }
              </td>
            </tr>
          )}
          <tr>
            <td className="border-t border-slate-200 px-2 py-2 bg-slate-50 text-[9px] md:text-[12px] text-slate-700" colSpan={totalCols}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">수당 요약</span>
                  <span>{totalCommission.toLocaleString()}원</span>
                  <span>{totalScore}점 ({totalMatch}회)</span>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  {tierSummary.length
                    ? tierSummary.map((t) => (
                        <span key={t.score} className="text-blue-700 whitespace-nowrap">
                          {t.score}점 <span className="font-bold">{t.count}회</span>
                        </span>
                      ))
                    : <span className="text-slate-400">매칭 없음</span>}
                </div>
                <div className="flex items-center gap-1 sm:ml-auto">
                  <span className="inline-block w-2.5 h-2.5 md:w-4 md:h-4 rounded border border-amber-400 bg-white" />
                  <span className="text-amber-700">수동 고정</span>
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}