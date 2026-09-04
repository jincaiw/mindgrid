import { useState } from 'react'
import type { DocumentSession } from '../document/use-document-session'
import { MarkerLabelPanel } from './marker-label-panel'
import { NotesPanel } from './notes-panel'
import { Sidebar } from './sidebar'

export type NavTab = 'topics' | 'notes' | 'markers'

const NAV_TABS: ReadonlyArray<{ id: NavTab; label: string }> = [
  { id: 'topics', label: '主题' },
  { id: 'notes', label: '笔记' },
  { id: 'markers', label: '标记 & 标签' },
]

interface NavPanelProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
}

/**
 * XMind 式左栏导航面板：3 个 Tab（主题 / 笔记 / 标记 & 标签）。
 *
 * 原先左栏是「文档导航 + 画布管理 + 当前画布大纲」三段堆叠表单，
 * 与 XMind 的 Tab 导航结构不一致，且三段同时展开后大纲树被挤到折叠线以下。
 *
 * Tab 条复用 Inspector 的 `.panel__tabs` / `.panel__tab` 样式，两侧面板视觉一致。
 *
 * 外层 `<aside>` 保留 `aria-label="左侧边栏"`：workspace-screen 的测试与
 * 折叠逻辑都按这个标签定位，Tab 化不应改变对外可访问性契约。
 */
export function NavPanel({
  session,
  selectedTopicIds,
  onSelectedTopicIdsChange,
}: NavPanelProps) {
  const [activeTab, setActiveTab] = useState<NavTab>('topics')

  return (
    <aside className="panel panel--sidebar" aria-label="左侧边栏">
      <div className="panel__tabs" role="tablist" aria-label="左侧导航分类">
        {NAV_TABS.map((tab) => {
          const selected = tab.id === activeTab

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`nav-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`nav-tabpanel-${tab.id}`}
              className={`panel__tab${selected ? ' panel__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="panel__tab-body">
        {activeTab === 'topics' ? (
          <div
            id="nav-tabpanel-topics"
            role="tabpanel"
            aria-labelledby="nav-tab-topics"
            className="panel__tab-panel"
          >
            <Sidebar
              session={session}
              selectedTopicIds={selectedTopicIds}
              onSelectedTopicIdsChange={onSelectedTopicIdsChange}
            />
          </div>
        ) : null}

        {activeTab === 'notes' ? (
          <div
            id="nav-tabpanel-notes"
            role="tabpanel"
            aria-labelledby="nav-tab-notes"
            className="panel__tab-panel"
          >
            <NotesPanel session={session} />
          </div>
        ) : null}

        {activeTab === 'markers' ? (
          <div
            id="nav-tabpanel-markers"
            role="tabpanel"
            aria-labelledby="nav-tab-markers"
            className="panel__tab-panel"
          >
            <MarkerLabelPanel
              session={session}
              onSelectedTopicIdsChange={onSelectedTopicIdsChange}
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
