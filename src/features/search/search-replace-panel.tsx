import type { TopicSearchEntry } from '../canvas/topic-search'
import { summarizePlan } from './replace'

export interface SearchReplacePanelProps {
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  replaceQuery: string
  onReplaceQueryChange: (query: string) => void
  results: readonly TopicSearchEntry[]
  activeIndex: number
  onActivateResult: (index: number) => void
  onNext: () => void
  onPrevious: () => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  /** 「全部替换」的预演结果，用于在按钮上告知影响面 */
  replaceAllPlan: ReturnType<typeof summarizePlan>
}

const MAX_VISIBLE_RESULTS = 50

/**
 * 查找 / 替换面板（对标批次 C3）。
 *
 * 落位在左栏「主题」Tab 上方，与画布浮层共用同一份查询状态——状态由
 * WorkspaceScreen 持有并通过 props 下发。若这里自己持有一份 query，
 * 左栏输入时画布不会高亮匹配节点，两边结果还会互相打架。
 *
 * 替换逻辑本身不在本组件内，见 ./replace.ts（纯函数，有单测）。
 */
export function SearchReplacePanel({
  searchQuery,
  onSearchQueryChange,
  replaceQuery,
  onReplaceQueryChange,
  results,
  activeIndex,
  onActivateResult,
  onNext,
  onPrevious,
  onReplaceCurrent,
  onReplaceAll,
  replaceAllPlan,
}: SearchReplacePanelProps) {
  const hasQuery = searchQuery.trim().length > 0
  const hasResults = results.length > 0
  const visibleResults = results.slice(0, MAX_VISIBLE_RESULTS)
  const currentPlanReplaceable = results[activeIndex] !== undefined

  return (
    <section className="search-replace" role="search" aria-label="查找与替换">
      <div className="search-replace__row">
        <input
          className="search-replace__input"
          type="text"
          aria-label="查找"
          value={searchQuery}
          placeholder="查找主题文本"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onSearchQueryChange('')
              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.shiftKey) {
                onPrevious()
              } else {
                onNext()
              }
            }
          }}
        />
        <span className="search-replace__count" aria-live="polite">
          {!hasQuery ? '—' : hasResults ? `${Math.min(activeIndex, results.length - 1) + 1} / ${results.length}` : '无匹配'}
        </span>
      </div>

      <div className="search-replace__row">
        <button
          className="scene-toolbar__button"
          type="button"
          onClick={onPrevious}
          disabled={!hasResults}
        >
          上一个
        </button>
        <button
          className="scene-toolbar__button"
          type="button"
          onClick={onNext}
          disabled={!hasResults}
        >
          下一个
        </button>
      </div>

      <div className="search-replace__row">
        <input
          className="search-replace__input"
          type="text"
          aria-label="替换为"
          value={replaceQuery}
          placeholder="替换为（留空即删除）"
          onChange={(event) => onReplaceQueryChange(event.target.value)}
        />
      </div>

      <div className="search-replace__row">
        <button
          className="scene-toolbar__button"
          type="button"
          onClick={onReplaceCurrent}
          disabled={!hasResults || !currentPlanReplaceable}
        >
          替换当前
        </button>
        <button
          className="scene-toolbar__button"
          type="button"
          onClick={onReplaceAll}
          disabled={replaceAllPlan.topicCount === 0}
          title={
            replaceAllPlan.topicCount === 0
              ? '没有可替换的匹配'
              : `将替换 ${replaceAllPlan.topicCount} 个主题、共 ${replaceAllPlan.occurrenceCount} 处`
          }
        >
          全部替换{replaceAllPlan.topicCount > 0 ? ` (${replaceAllPlan.topicCount})` : ''}
        </button>
      </div>

      {hasResults ? (
        <ul className="search-replace__results">
          {visibleResults.map((result, index) => (
            <li key={`${result.topicId}-${index}`}>
              <button
                type="button"
                className={`search-replace__result${index === activeIndex ? ' search-replace__result--active' : ''}`}
                onClick={() => onActivateResult(index)}
              >
                <span className="search-replace__result-text">{result.text}</span>
                {result.path.length > 1 ? (
                  <span className="search-replace__result-path">
                    {result.path.slice(0, -1).join(' / ')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {results.length > MAX_VISIBLE_RESULTS ? (
            <li className="search-replace__more">
              仅显示前 {MAX_VISIBLE_RESULTS} 条，共 {results.length} 条
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}
