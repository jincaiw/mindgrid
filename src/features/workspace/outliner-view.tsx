import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveSheet } from '../../lib/document/sheets'
import type { TopicSnapshot } from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { TopicTreeNode } from './topic-tree'

/**
 * 大纲全屏视图（批次 19）。
 *
 * 对标 XMind 的 Outliner 模式：隐藏画布，全宽展示当前画布的主题树，
 * 配合操作栏完成选中/折叠/重命名/增删/排序等编辑，Esc 返回画布。
 * 复用画布侧已有的 IPC 命令（selectTopic / renameTopic / createChildTopic …），
 * 不引入新后端能力。
 */
interface OutlinerViewProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
  onExit: () => void
}

/** 仅展开（未折叠祖先分支）的主题，按显示顺序扁平化。 */
function flattenVisibleTopics(root: TopicSnapshot): TopicSnapshot[] {
  const result: TopicSnapshot[] = []
  function walk(node: TopicSnapshot) {
    result.push(node)
    if (!node.collapsed) {
      for (const child of node.children) walk(child)
    }
  }
  walk(root)
  return result
}

/** 统计画布内全部主题（含折叠分支），用于头部计数。 */
function countAllTopics(node: TopicSnapshot): number {
  let count = 1
  for (const child of node.children) count += countAllTopics(child)
  return count
}

export function OutlinerView({
  session,
  selectedTopicIds,
  onSelectedTopicIdsChange,
  onExit,
}: OutlinerViewProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const activeTopicId = session.activeTopicId ?? selectedTopicIds[0] ?? activeSheet?.rootTopic.id ?? null

  const visibleTopics = useMemo(
    () => (activeSheet ? flattenVisibleTopics(activeSheet.rootTopic) : []),
    [activeSheet],
  )
  const activeTopic = useMemo(
    () => visibleTopics.find((topic) => topic.id === activeTopicId) ?? null,
    [visibleTopics, activeTopicId],
  )

  const [titleDraft, setTitleDraft] = useState(activeTopic?.text ?? '')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // 活动主题切换时同步重命名草稿
  useEffect(() => {
    setTitleDraft(activeTopic?.text ?? '')
  }, [activeTopic?.id, activeTopic?.text])

  // 当请求聚焦重命名输入（如双击节点）时聚焦
  const [renameFocusNonce, setRenameFocusNonce] = useState(0)
  useEffect(() => {
    if (renameFocusNonce === 0) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [renameFocusNonce])

  const activeIndex = activeTopicId
    ? visibleTopics.findIndex((topic) => topic.id === activeTopicId)
    : -1
  const prevTopic = activeIndex > 0 ? visibleTopics[activeIndex - 1] : null
  const nextTopic =
    activeIndex >= 0 && activeIndex < visibleTopics.length - 1 ? visibleTopics[activeIndex + 1] : null

  function handleSelect(topicId: string, options?: { toggle?: boolean }) {
    if (options?.toggle) {
      const set = new Set(selectedTopicIds)
      if (set.has(topicId)) set.delete(topicId)
      else set.add(topicId)
      onSelectedTopicIdsChange([...set])
      return
    }
    onSelectedTopicIdsChange([topicId])
    void session.selectTopic(topicId)
  }

  function navigate(direction: 'up' | 'down') {
    const target = direction === 'up' ? prevTopic : nextTopic
    if (!target) return
    onSelectedTopicIdsChange([target.id])
    void session.selectTopic(target.id)
  }

  async function commitRename() {
    const trimmed = titleDraft.trim()
    if (!activeTopic || !trimmed || trimmed === activeTopic.text) return
    await session.renameTopic(activeTopic.id, trimmed)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    // 重命名输入聚焦时仅处理 Enter/Escape，其余按键交给输入框
    if (document.activeElement === titleInputRef.current) {
      if (event.key === 'Enter') {
        event.preventDefault()
        void commitRename().then(() => {
          titleInputRef.current?.blur()
        })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setTitleDraft(activeTopic?.text ?? '')
        titleInputRef.current?.blur()
      }
      return
    }

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        navigate('up')
        break
      case 'ArrowDown':
        event.preventDefault()
        navigate('down')
        break
      case 'Tab':
        event.preventDefault()
        if (activeTopic) void session.createChildTopic(activeTopic.id)
        break
      case 'Enter':
        event.preventDefault()
        if (activeTopic) void session.createSiblingTopic(activeTopic.id, 'after')
        break
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        if (activeTopic && activeSheet && activeTopic.id !== activeSheet.rootTopic.id) {
          void session.deleteTopic(activeTopic.id)
        }
        break
      case 'Escape':
        event.preventDefault()
        onExit()
        break
      case 'F2':
        event.preventDefault()
        setRenameFocusNonce((n) => n + 1)
        break
    }
  }

  if (!activeSheet) {
    return (
      <div className="outliner-view outliner-view--empty" role="region" aria-label="大纲视图">
        <div className="outliner-view__header">
          <strong>大纲</strong>
          <button type="button" className="outliner-view__exit" onClick={onExit}>
            返回画布（Esc）
          </button>
        </div>
        <p className="outliner-view__empty">当前没有可显示的画布。</p>
      </div>
    )
  }

  const topicCount = countAllTopics(activeSheet.rootTopic)
  const isRootActive = activeTopic?.id === activeSheet.rootTopic.id

  return (
    <section
      className="outliner-view"
      role="region"
      aria-label="大纲全屏视图"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="outliner-view__header">
        <div className="outliner-view__heading">
          <span className="outliner-view__badge">大纲</span>
          <strong>{activeSheet.title}</strong>
          <span className="outliner-view__count">{topicCount} 个主题</span>
        </div>
        <div className="outliner-view__actions">
          <button
            type="button"
            className="outliner-view__action"
            disabled={!activeTopic}
            onClick={() => activeTopic && void session.createChildTopic(activeTopic.id)}
            title="新建子主题（Tab）"
          >
            子主题
          </button>
          <button
            type="button"
            className="outliner-view__action"
            disabled={!activeTopic || isRootActive}
            onClick={() => activeTopic && void session.createSiblingTopic(activeTopic.id, 'after')}
            title="新建同级（Enter）"
          >
            同级
          </button>
          <button
            type="button"
            className="outliner-view__action"
            disabled={!activeTopic || isRootActive}
            onClick={() => activeTopic && void session.moveTopicInParent(activeTopic.id, 'up')}
            title="上移"
          >
            上移
          </button>
          <button
            type="button"
            className="outliner-view__action"
            disabled={!activeTopic || isRootActive}
            onClick={() => activeTopic && void session.moveTopicInParent(activeTopic.id, 'down')}
            title="下移"
          >
            下移
          </button>
          <button
            type="button"
            className="outliner-view__action outliner-view__action--danger"
            disabled={!activeTopic || isRootActive}
            onClick={() => activeTopic && void session.deleteTopic(activeTopic.id)}
            title="删除（Delete）"
          >
            删除
          </button>
        </div>
        <button type="button" className="outliner-view__exit" onClick={onExit} title="返回画布（Esc）">
          返回画布
        </button>
      </header>

      <div className="outliner-view__rename">
        <label className="outliner-view__rename-label">
          <span>重命名</span>
          <input
            ref={titleInputRef}
            type="text"
            className="outliner-view__rename-input"
            value={titleDraft}
            placeholder={activeTopic ? activeTopic.text : '选择一个主题后重命名'}
            disabled={!activeTopic}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commitRename().then(() => {
                  titleInputRef.current?.blur()
                })
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setTitleDraft(activeTopic?.text ?? '')
                titleInputRef.current?.blur()
              }
            }}
          />
        </label>
      </div>

      <div className="outliner-view__body">
        <ul className="outliner-view__tree topic-tree" aria-label="大纲主题树">
          <TopicTreeNode
            topic={activeSheet.rootTopic}
            activeTopicId={activeTopicId}
            selectedTopicIds={selectedTopicIds}
            onSelect={handleSelect}
            onToggleCollapsed={(topicId) => void session.toggleTopicCollapsed(topicId)}
          />
        </ul>
      </div>
    </section>
  )
}
