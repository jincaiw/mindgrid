import type { TopicSnapshot } from '../../lib/document/types'

interface TopicTreeNodeProps {
  topic: TopicSnapshot
  activeTopicId: string | null
  selectedTopicIds?: string[]
  matchedTopicIds?: Set<string>
  activeSearchTopicId?: string | null
  draggingTopicId?: string | null
  dropTargetTopicId?: string | null
  invalidDropTopicId?: string | null
  recentDropTopicId?: string | null
  historyFocusTopicId?: string | null
  depth?: number
  onSelect: (topicId: string, options?: { toggle?: boolean }) => void
  onToggleCollapsed: (topicId: string) => void
  onCanDragTopic?: (topicId: string) => boolean
  onDragStartTopic?: (topicId: string) => void
  onDragOverTopic?: (topicId: string) => boolean
  onDragLeaveTopic?: (topicId: string) => void
  onDropTopic?: (topicId: string) => void
  onDragEndTopic?: () => void
}

export function TopicTreeNode({
  topic,
  activeTopicId,
  selectedTopicIds,
  matchedTopicIds,
  activeSearchTopicId,
  draggingTopicId,
  dropTargetTopicId,
  invalidDropTopicId,
  recentDropTopicId,
  historyFocusTopicId,
  depth = 0,
  onSelect,
  onToggleCollapsed,
  onCanDragTopic,
  onDragStartTopic,
  onDragOverTopic,
  onDragLeaveTopic,
  onDropTopic,
  onDragEndTopic,
}: TopicTreeNodeProps) {
  const isActive = activeTopicId === topic.id
  const isSelected = selectedTopicIds?.includes(topic.id) ?? false
  const isMatched = matchedTopicIds?.has(topic.id) ?? false
  const isSearchActive = activeSearchTopicId === topic.id
  const isDragging = draggingTopicId === topic.id
  const isDropTarget = dropTargetTopicId === topic.id
  const isInvalidDropTarget = invalidDropTopicId === topic.id
  const isRecentDropTarget = recentDropTopicId === topic.id
  const isHistoryFocusTarget = historyFocusTopicId === topic.id
  const canDrag = onCanDragTopic?.(topic.id) ?? false

  return (
    <li className="topic-tree__item">
      <div className="topic-tree__row">
        <button
          className={`topic-tree__button${isActive ? ' topic-tree__button--active' : ''}${isSelected && !isActive ? ' topic-tree__button--selected' : ''}${isMatched ? ' topic-tree__button--matched' : ''}${isSearchActive ? ' topic-tree__button--search-active' : ''}${isDropTarget ? ' topic-tree__button--drop-target' : ''}${isInvalidDropTarget ? ' topic-tree__button--drop-invalid' : ''}${isRecentDropTarget ? ' topic-tree__button--drop-success' : ''}${isHistoryFocusTarget ? ' topic-tree__button--history-focus' : ''}${isDragging ? ' topic-tree__button--dragging' : ''}`}
          style={{ paddingLeft: `${16 + depth * 20}px` }}
          data-topic-id={topic.id}
          type="button"
          draggable={canDrag}
          onClick={(event) =>
            onSelect(topic.id, {
              toggle: event.metaKey || event.ctrlKey || event.shiftKey,
            })
          }
          onDragStart={(event) => {
            if (!canDrag) {
              event.preventDefault()
              return
            }

            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', topic.id)
            onDragStartTopic?.(topic.id)
          }}
          onDragOver={(event) => {
            if (!onDragOverTopic?.(topic.id)) {
              return
            }

            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDragLeave={() => onDragLeaveTopic?.(topic.id)}
          onDrop={(event) => {
            event.preventDefault()
            onDropTopic?.(topic.id)
          }}
          onDragEnd={() => onDragEndTopic?.()}
        >
          <span className="topic-tree__bullet" />
          <span>{topic.text}</span>
          <span className="topic-tree__meta">
            {topic.children.length}
            {topic.children.length > 0 && topic.collapsed ? ' 已折叠' : ''}
          </span>
        </button>
        {topic.children.length > 0 ? (
          <button
            className="topic-tree__toggle"
            type="button"
            aria-label={topic.collapsed ? '展开主题' : '折叠主题'}
            onClick={() => onToggleCollapsed(topic.id)}
          >
            {topic.collapsed ? '展开' : '折叠'}
          </button>
        ) : null}
      </div>

      {topic.children.length > 0 && !topic.collapsed ? (
        <ul className="topic-tree">
          {topic.children.map((child) => (
            <TopicTreeNode
              key={child.id}
              topic={child}
              activeTopicId={activeTopicId}
              selectedTopicIds={selectedTopicIds}
              matchedTopicIds={matchedTopicIds}
              activeSearchTopicId={activeSearchTopicId}
              draggingTopicId={draggingTopicId}
              dropTargetTopicId={dropTargetTopicId}
              invalidDropTopicId={invalidDropTopicId}
              recentDropTopicId={recentDropTopicId}
              historyFocusTopicId={historyFocusTopicId}
              depth={depth + 1}
              onSelect={onSelect}
              onToggleCollapsed={onToggleCollapsed}
              onCanDragTopic={onCanDragTopic}
              onDragStartTopic={onDragStartTopic}
              onDragOverTopic={onDragOverTopic}
              onDragLeaveTopic={onDragLeaveTopic}
              onDropTopic={onDropTopic}
              onDragEndTopic={onDragEndTopic}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
