import { useMemo, useState } from 'react'
import { computeNodeSimulation } from '../engine/rollup.js'
import { N_VALUE, SCORE_TIERS } from '../engine/pvRules.js'

const TIER_SCORES = SCORE_TIERS.map((t) => t.score) // [15, 30, 60, 90, 150, 250, 300]

export default function CommissionSummary({ nodes }) {
  const [nValue, setNValue] = useState(N_VALUE)

  const summaries = useMemo(() => {
    return nodes.map((node) => {
      const sim = computeNodeSimulation(node.id, nodes)
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

      const totalCommission = totalScore * nValue
      return { node, tierCounts, totalScore, totalMatch, totalCommission }
    })
  }, [nodes, nValue])

  function handleNValue(raw) {
    const val = parseInt(raw.replace(/,/g, ''), 10)
    setNValue(isNaN(val) ? 0 : val)
  }

  return (
    <div className="mt-4 p-3 bg-white rounded border no-print">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">📊 수당 계산 요약</h3>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          예상N가:
          <input
            type="number"
            min={0}
            className="border rounded px-1.5 py-0.5 w-20 text-right text-xs outline-none focus:border-blue-400"
            value={nValue}
            onChange={(e) => handleNValue(e.target.value)}
          />
          원
        </label>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {summaries.map(({ node, tierCounts, totalScore, totalMatch, totalCommission }) => (
          <div key={node.id} className="border-b last:border-0 pb-1.5 pt-1">
            {/* 이름 + 직급 */}
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium text-xs w-20 truncate">{node.name}</span>
              <span className="text-gray-500 text-xs w-10">{node.rank}</span>
              <span className="text-green-700 font-medium text-xs ml-auto">
                {totalCommission.toLocaleString()}원
              </span>
            </div>
            {/* 티어별 매칭 */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-600 pl-1">
              {TIER_SCORES.filter((s) => tierCounts[s] > 0).map((s) => (
                <span key={s} className="text-blue-700">
                  {s}점:<span className="font-semibold">{tierCounts[s]}회</span>
                </span>
              ))}
              {totalMatch === 0 && <span className="text-gray-400">매칭 없음</span>}
              <span className="ml-auto text-gray-500">
                총 <span className="font-semibold text-gray-700">{totalScore}점</span>
                {' · '}
                총 <span className="font-semibold text-gray-700">{totalMatch}회</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
