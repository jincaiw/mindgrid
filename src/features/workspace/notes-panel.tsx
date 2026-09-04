import { useMemo, useState } from 'react'
import { findTopicById } from '../../lib/document/tree'
import { getActiveSheet } from '../../lib/document/sheets'
import type { DocumentSession } from '../document/use-document-session'

interface NotesPanelProps {
  session: DocumentSession
}

/**
 * XMind 左栏「笔记」页：编辑当前选中主题的备注。
 *
 * 与 Inspector「富内容编辑」里的备注框共用 `session.setTopicNotes`，两处互为镜像——
 * 草稿态随选中主题切换重置，失焦即提交，与 Inspector 的行为保持一致。
 *
 * 之所以还要在左栏做一份：XMind 的笔记是左栏固定 Tab，用户写长文时不需要
 * 在右侧面板里翻找；这里给的是全宽、纵向铺满的输入区。
 */
export function NotesPanel({ session }: NotesPanelProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const activeTopic = useMemo(
    () =>
      activeSheet && session.activeTopicId
        ? findTopicById(activeSheet.rootTopic, session.activeTopicId)
        : null,
    [activeSheet, session.activeTopicId],
  )
  const topicId = activeTopic?.id
  const persistedNotes = activeTopic?.notes ?? ''
  const revision = session.document?.revision

  /**
   * 草稿同步用「渲染期校正」而非 useEffect：effect 要等一次提交后才重置，
   * 中间那一帧会把旧主题的文本渲染到新主题的输入框里。
   *
   * revision 也纳入同步依据：撤销（Cmd+Z）会改文档但不改选中主题，
   * 若不同步，草稿仍是被撤销掉的文本，失焦提交时会把撤销结果又写回去。
   *
   * 渲染期 setState 会让 React 丢弃本帧输出并立刻重渲染，
   * 因此最终提交的那一次渲染里 draft 已是校正后的值，各处直接读 draft.value 即可。
   */
  const [draft, setDraft] = useState({
    topicId,
    revision,
    value: persistedNotes,
  })

  if (draft.topicId !== topicId || draft.revision !== revision) {
    setDraft({ topicId, revision, value: persistedNotes })
  }

  function commit() {
    if (!topicId) {
      return
    }

    const next = draft.value.trim() || null

    if ((persistedNotes || null) !== next) {
      void session.setTopicNotes(topicId, next)
    }
  }

  return (
    <div className="panel__tab-panel notes-panel">
      <div className="panel__section">
        <p className="panel__eyebrow">Notes</p>
        <h3 className="panel__title">{activeTopic ? activeTopic.text : '未选中主题'}</h3>
        <p className="panel__muted">
          {activeTopic
            ? '备注会随文档一起保存，也能在右侧检查器里同步编辑。失焦后自动提交，支持撤销。'
            : '先在「主题」页里选中一个主题，再为它补充备注。'}
        </p>
      </div>

      {activeTopic ? (
        <label className="panel__field notes-panel__field">
          <span>备注内容</span>
          <textarea
            className="notes-panel__input"
            value={draft.value}
            aria-label="备注内容"
            placeholder="写下这个主题的背景、结论或待办……"
            onChange={(event) => setDraft({ topicId, revision, value: event.target.value })}
            onBlur={commit}
          />
        </label>
      ) : null}
    </div>
  )
}
