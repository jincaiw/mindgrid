import { afterEach, describe, expect, it } from 'vitest'
import type { DocumentSessionSnapshot } from '../document/types'
import { findTopicById } from '../document/tree'
import { invokeBrowserCommand, resetBrowserSessionForTests } from './browser-session'

afterEach(() => {
  resetBrowserSessionForTests()
})

describe('invokeBrowserCommand', () => {
  it('creates a document and supports child creation with undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopicId = created.document.sheets[0].rootTopic.id
    const childCreated = await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: rootTopicId,
    })
    const undone =
      await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')

    expect(created.summary.topicCount).toBe(4)
    expect(childCreated.summary.topicCount).toBe(5)
    expect(childCreated.nextUndoAction).toBe('创建子主题')
    expect(childCreated.nextRedoAction).toBeNull()
    expect(undone.summary.topicCount).toBe(4)
    expect(undone.nextRedoAction).toBe('创建子主题')
  })

  it('moves a topic to a new parent', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopic = created.document.sheets[0].rootTopic
    const sourceTopicId = rootTopic.children[0].id
    const targetParentId = rootTopic.children[1].id
    const moved = await invokeBrowserCommand<DocumentSessionSnapshot>('move_topic', {
      topic_id: sourceTopicId,
      target_parent_id: targetParentId,
    })
    const movedTargetParent = findTopicById(
      moved.document.sheets[0].rootTopic,
      targetParentId,
    )

    expect(moved.activeTopicId).toBe(sourceTopicId)
    expect(movedTargetParent?.children[0].id).toBe(sourceTopicId)
  })

  it('reorders a topic within the same parent', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopic = created.document.sheets[0].rootTopic
    const movingTopicId = rootTopic.children[2].id
    const moved = await invokeBrowserCommand<DocumentSessionSnapshot>('move_topic_in_parent', {
      topic_id: movingTopicId,
      direction: 'up',
    })
    const reorderedChildren = moved.document.sheets[0].rootTopic.children
    const undone =
      await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')

    expect(moved.activeTopicId).toBe(movingTopicId)
    expect(reorderedChildren[1]?.id).toBe(movingTopicId)
    expect(reorderedChildren[2]?.text).toBe('行动项')
    expect(undone.document.sheets[0].rootTopic.children[2]?.id).toBe(movingTopicId)
  })

  it('moves a topic branch to another sheet root', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sourceTopicId = created.document.sheets[0].rootTopic.children[0].id
    const secondSheet = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const moved = await invokeBrowserCommand<DocumentSessionSnapshot>('move_topic_to_sheet', {
      topic_id: sourceTopicId,
      target_sheet_id: secondSheet.summary.activeSheetId,
    })
    const destinationSheet = moved.document.sheets.find(
      (sheet) => sheet.id === secondSheet.summary.activeSheetId,
    )

    expect(moved.summary.activeSheetId).toBe(secondSheet.summary.activeSheetId)
    expect(moved.activeTopicId).toBe(sourceTopicId)
    expect(destinationSheet?.rootTopic.children.some((child) => child.id === sourceTopicId)).toBe(true)
  })

  it('moves a topic branch under the chosen parent in another sheet', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sourceTopicId = created.document.sheets[0].rootTopic.children[0].id
    const secondSheet = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const targetRootId =
      secondSheet.document.sheets.find((sheet) => sheet.id === secondSheet.summary.activeSheetId)
        ?.rootTopic.id ?? ''
    const bucketCreated = await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: targetRootId,
    })
    const targetParentId = bucketCreated.activeTopicId
    await invokeBrowserCommand<DocumentSessionSnapshot>('select_sheet', {
      sheet_id: created.document.sheets[0].id,
    })
    const moved = await invokeBrowserCommand<DocumentSessionSnapshot>('move_topic_to_sheet', {
      topic_id: sourceTopicId,
      target_sheet_id: secondSheet.summary.activeSheetId,
      target_parent_id: targetParentId,
      action_label: '移动主题到画布“画布 2”的“画布 2 / 新建子主题”下面',
    })
    const destinationSheet = moved.document.sheets.find(
      (sheet) => sheet.id === secondSheet.summary.activeSheetId,
    )
    const targetParent = destinationSheet && findTopicById(destinationSheet.rootTopic, targetParentId)

    expect(targetParent?.children.some((child) => child.id === sourceTopicId)).toBe(true)
    expect(moved.nextUndoAction).toBe('移动主题到画布“画布 2”的“画布 2 / 新建子主题”下面')
  })

  it('moves multiple topic branches to another parent in one command', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopic = created.document.sheets[0].rootTopic
    const moved = await invokeBrowserCommand<DocumentSessionSnapshot>('move_topics', {
      topic_ids: [rootTopic.children[0].id, rootTopic.children[1].id],
      target_parent_id: rootTopic.children[2].id,
    })
    const targetParent = findTopicById(moved.document.sheets[0].rootTopic, rootTopic.children[2].id)

    expect(targetParent?.children.map((child) => child.id)).toEqual([
      rootTopic.children[0].id,
      rootTopic.children[1].id,
    ])
    expect(moved.activeTopicId).toBe(rootTopic.children[1].id)
  })

  it('moves multiple topic branches to another sheet in one command', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const secondSheet = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    await invokeBrowserCommand<DocumentSessionSnapshot>('select_sheet', {
      sheet_id: created.document.sheets[0].id,
    })
    const moved = await invokeBrowserCommand<DocumentSessionSnapshot>('move_topics_to_sheet', {
      topic_ids: [
        created.document.sheets[0].rootTopic.children[0].id,
        created.document.sheets[0].rootTopic.children[1].id,
      ],
      target_sheet_id: secondSheet.summary.activeSheetId,
    })
    const destinationSheet = moved.document.sheets.find(
      (sheet) => sheet.id === secondSheet.summary.activeSheetId,
    )

    expect(
      destinationSheet?.rootTopic.children.some(
        (child) => child.id === created.document.sheets[0].rootTopic.children[0].id,
      ),
    ).toBe(true)
    expect(
      destinationSheet?.rootTopic.children.some(
        (child) => child.id === created.document.sheets[0].rootTopic.children[1].id,
      ),
    ).toBe(true)
    expect(moved.activeTopicId).toBe(created.document.sheets[0].rootTopic.children[1].id)
  })

  it('copies a topic branch under the chosen parent in another sheet', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sourceTopic = created.document.sheets[0].rootTopic.children[0]
    const secondSheet = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const targetRootId =
      secondSheet.document.sheets.find((sheet) => sheet.id === secondSheet.summary.activeSheetId)
        ?.rootTopic.id ?? ''
    const bucketCreated = await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: targetRootId,
    })
    const targetParentId = bucketCreated.activeTopicId
    await invokeBrowserCommand<DocumentSessionSnapshot>('select_sheet', {
      sheet_id: created.document.sheets[0].id,
    })
    const copied = await invokeBrowserCommand<DocumentSessionSnapshot>('copy_topic_to_sheet', {
      topic_id: sourceTopic.id,
      target_sheet_id: secondSheet.summary.activeSheetId,
      target_parent_id: targetParentId,
    })
    const sourceSheet = copied.document.sheets.find((sheet) => sheet.id === created.document.sheets[0].id)
    const destinationSheet = copied.document.sheets.find(
      (sheet) => sheet.id === secondSheet.summary.activeSheetId,
    )
    const targetParent = destinationSheet && findTopicById(destinationSheet.rootTopic, targetParentId)
    const copiedTopic = targetParent?.children[targetParent.children.length - 1]

    expect(sourceSheet?.rootTopic.children.some((child) => child.id === sourceTopic.id)).toBe(true)
    expect(copiedTopic?.text).toBe(sourceTopic.text)
    expect(copiedTopic?.id).not.toBe(sourceTopic.id)
    expect(copied.activeTopicId).toBe(copiedTopic?.id)
  })

  it('copies multiple topic branches under the chosen parent in another sheet', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopic = created.document.sheets[0].rootTopic
    const secondSheet = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const targetRootId =
      secondSheet.document.sheets.find((sheet) => sheet.id === secondSheet.summary.activeSheetId)
        ?.rootTopic.id ?? ''
    const bucketCreated = await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: targetRootId,
    })
    await invokeBrowserCommand<DocumentSessionSnapshot>('select_sheet', {
      sheet_id: created.document.sheets[0].id,
    })
    const copied = await invokeBrowserCommand<DocumentSessionSnapshot>('copy_topics_to_sheet', {
      topic_ids: [rootTopic.children[0].id, rootTopic.children[1].id],
      target_sheet_id: secondSheet.summary.activeSheetId,
      target_parent_id: bucketCreated.activeTopicId,
    })
    const destinationSheet = copied.document.sheets.find(
      (sheet) => sheet.id === secondSheet.summary.activeSheetId,
    )
    const targetParent =
      destinationSheet && findTopicById(destinationSheet.rootTopic, bucketCreated.activeTopicId)

    expect(targetParent?.children).toHaveLength(2)
    expect(targetParent?.children[0]?.text).toBe(rootTopic.children[0].text)
    expect(targetParent?.children[1]?.text).toBe(rootTopic.children[1].text)
  })

  it('deletes multiple topics in one command', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopic = created.document.sheets[0].rootTopic
    const deleted = await invokeBrowserCommand<DocumentSessionSnapshot>('delete_topics', {
      topic_ids: [rootTopic.children[0].id, rootTopic.children[2].id],
    })

    expect(deleted.summary.topicCount).toBe(2)
    expect(deleted.document.sheets[0].rootTopic.children).toHaveLength(1)
  })

  it('toggles topic collapsed state and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopicId = created.document.sheets[0].rootTopic.id
    const childCreated = await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: created.document.sheets[0].rootTopic.children[0].id,
    })
    const collapseTargetId = childCreated.document.sheets[0].rootTopic.children[0].id
    const collapsed = await invokeBrowserCommand<DocumentSessionSnapshot>('toggle_topic_collapsed', {
      topic_id: collapseTargetId,
    })
    const collapsedTopic = findTopicById(collapsed.document.sheets[0].rootTopic, collapseTargetId)
    const undone =
      await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    const restoredTopic = findTopicById(undone.document.sheets[0].rootTopic, collapseTargetId)

    expect(rootTopicId).toBe(created.activeTopicId)
    expect(collapsedTopic?.collapsed).toBe(true)
    expect(restoredTopic?.collapsed).toBe(false)
  })

  it('pastes copied branches with new ids and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sourceTopic = created.document.sheets[0].rootTopic.children[0]
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: sourceTopic.id,
    })
    const sourceWithChild = (
      await invokeBrowserCommand<DocumentSessionSnapshot>('get_document_state')
    )!.document.sheets[0].rootTopic.children[0]
    const targetParentId = created.document.sheets[0].rootTopic.children[1].id
    const pasted = await invokeBrowserCommand<DocumentSessionSnapshot>('paste_topics', {
      topics: [sourceWithChild],
      target_parent_id: targetParentId,
    })
    const targetParent = findTopicById(pasted.document.sheets[0].rootTopic, targetParentId)
    const pastedTopic = targetParent?.children[0]
    const undone =
      await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    const restoredTarget = findTopicById(undone.document.sheets[0].rootTopic, targetParentId)

    expect(targetParent?.children).toHaveLength(1)
    expect(pastedTopic?.text).toBe(sourceWithChild.text)
    expect(pastedTopic?.id).not.toBe(sourceWithChild.id)
    expect(pastedTopic?.children).toHaveLength(1)
    expect(restoredTarget?.children).toHaveLength(0)
  })

  it('preserves rich topic fields when pasting a branch with a new id', async () => {
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const root = (
      await invokeBrowserCommand<DocumentSessionSnapshot>('get_document_state')
    )!.document.sheets[0].rootTopic
    const targetParentId = root.children[1].id
    const richSource = {
      id: root.children[0].id,
      text: '富内容主题',
      collapsed: false,
      children: [],
      styleRef: 'style/level-2',
      markers: [{ id: 'priority-1', label: '高' }],
      labels: ['Q3', '重点'],
      notes: '重要备注',
      link: { url: 'https://mindgrid.app', title: '官网' },
      task: { status: 'started' as const, dueDateMs: 1700000000000, priority: 1 },
      layoutHints: { direction: 'right' as const, offsetX: 12, offsetY: -8 },
    }
    const pasted = await invokeBrowserCommand<DocumentSessionSnapshot>('paste_topics', {
      topics: [richSource],
      target_parent_id: targetParentId,
    })
    const pastedTopic = findTopicById(pasted.document.sheets[0].rootTopic, targetParentId)
      ?.children[0]

    expect(pastedTopic?.id).not.toBe(richSource.id)
    expect(pastedTopic?.text).toBe('富内容主题')
    expect(pastedTopic?.styleRef).toBe('style/level-2')
    expect(pastedTopic?.markers).toEqual([{ id: 'priority-1', label: '高' }])
    expect(pastedTopic?.labels).toEqual(['Q3', '重点'])
    expect(pastedTopic?.notes).toBe('重要备注')
    expect(pastedTopic?.link).toEqual({ url: 'https://mindgrid.app', title: '官网' })
    expect(pastedTopic?.task?.status).toBe('started')
    expect(pastedTopic?.layoutHints?.direction).toBe('right')
  })

  it('restores the latest browser recovery snapshot after an in-memory reset', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const rootTopicId = created.document.sheets[0].rootTopic.id

    const edited = await invokeBrowserCommand<DocumentSessionSnapshot>('create_child_topic', {
      parent_id: rootTopicId,
    })

    resetBrowserSessionForTests(true)

    const restored =
      await invokeBrowserCommand<DocumentSessionSnapshot | null>('get_document_state')

    expect(restored?.summary.topicCount).toBe(edited.summary.topicCount)
    expect(restored?.lastAutosavedAtMs).not.toBeNull()
    expect(restored?.recoveredFromAutosave).toBe(true)
  })

  it('keeps the current document stable when clearing a missing repair summary', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const cleared =
      await invokeBrowserCommand<DocumentSessionSnapshot>('clear_repair_report')

    expect(cleared.repairReport).toBeNull()
    expect(cleared.summary.documentId).toBe(created.summary.documentId)
    expect(cleared.summary.topicCount).toBe(created.summary.topicCount)
  })

  it('creates, switches, renames, and deletes sheets', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const nextSheet = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const secondSheetId = nextSheet.summary.activeSheetId
    const renamed = await invokeBrowserCommand<DocumentSessionSnapshot>('rename_sheet', {
      sheet_id: secondSheetId,
      title: '拆解画布',
    })
    const selected = await invokeBrowserCommand<DocumentSessionSnapshot>('select_sheet', {
      sheet_id: created.document.sheets[0].id,
    })
    const deleted = await invokeBrowserCommand<DocumentSessionSnapshot>('delete_sheet', {
      sheet_id: secondSheetId,
    })

    expect(nextSheet.summary.sheetCount).toBe(2)
    expect(renamed.document.sheets[1].title).toBe('拆解画布')
    expect(selected.summary.activeSheetId).toBe(created.document.sheets[0].id)
    expect(deleted.summary.sheetCount).toBe(1)
  })

  it('reorders sheets inside the current document', async () => {
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const second = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const secondSheetId = second.summary.activeSheetId
    const third = await invokeBrowserCommand<DocumentSessionSnapshot>('create_sheet')
    const thirdSheetId = third.summary.activeSheetId
    const movedUp = await invokeBrowserCommand<DocumentSessionSnapshot>('move_sheet', {
      sheet_id: thirdSheetId,
      direction: 'up',
    })
    const movedDown = await invokeBrowserCommand<DocumentSessionSnapshot>('move_sheet', {
      sheet_id: movedUp.document.sheets[1].id,
      direction: 'down',
    })

    expect(movedUp.document.sheets.map((sheet) => sheet.id)).toEqual([
      movedUp.document.sheets[0].id,
      thirdSheetId,
      secondSheetId,
    ])
    expect(movedDown.document.sheets[2].id).toBe(thirdSheetId)
  })

  it('switches the active sheet chart type and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const activeSheetId = created.summary.activeSheetId

    // 默认画布没有 chartType，回退为 mindmap
    expect(created.document.sheets[0].chartType).toBeUndefined()

    const switched = await invokeBrowserCommand<DocumentSessionSnapshot>('set_sheet_chart_type', {
      sheet_id: activeSheetId,
      chart_type: 'logic',
    })

    expect(switched.document.sheets[0].chartType).toBe('logic')
    expect(switched.canUndo).toBe(true)

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    expect(undone.document.sheets[0].chartType).toBeUndefined()

    const redone = await invokeBrowserCommand<DocumentSessionSnapshot>('redo_document_command')
    expect(redone.document.sheets[0].chartType).toBe('logic')
  })

  it('rejects unsupported chart type strings', async () => {
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('set_sheet_chart_type', {
        sheet_id: 'whatever',
        chart_type: 'radial',
      }),
    ).rejects.toThrow(/不支持的图表类型/)
  })

  it('sets topic notes and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.document.sheets[0].rootTopic.children[0].id

    const updated = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_notes', {
      topic_id: topicId,
      notes: '这是备注内容',
    })

    const topic = findTopicById(updated.document.sheets[0].rootTopic, topicId)
    expect(topic?.notes).toBe('这是备注内容')
    expect(updated.canUndo).toBe(true)
    expect(updated.nextUndoAction).toBe('编辑备注')

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    const undoneTopic = findTopicById(undone.document.sheets[0].rootTopic, topicId)
    expect(undoneTopic?.notes).toBeUndefined()
  })

  it('clears topic notes by passing null', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.document.sheets[0].rootTopic.children[0].id

    await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_notes', {
      topic_id: topicId,
      notes: '临时备注',
    })

    const cleared = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_notes', {
      topic_id: topicId,
      notes: null,
    })

    const topic = findTopicById(cleared.document.sheets[0].rootTopic, topicId)
    expect(topic?.notes).toBeUndefined()
  })

  it('sets topic link and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.document.sheets[0].rootTopic.children[0].id

    const updated = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_link', {
      topic_id: topicId,
      link: { url: 'https://example.com', title: '示例' },
    })

    const topic = findTopicById(updated.document.sheets[0].rootTopic, topicId)
    expect(topic?.link).toEqual({ url: 'https://example.com', title: '示例' })
    expect(updated.nextUndoAction).toBe('编辑链接')
  })

  it('sets topic labels and markers', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.document.sheets[0].rootTopic.children[0].id

    const labeled = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_labels', {
      topic_id: topicId,
      labels: ['重要', '待办'],
    })

    const topic1 = findTopicById(labeled.document.sheets[0].rootTopic, topicId)
    expect(topic1?.labels).toEqual(['重要', '待办'])

    const marked = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_markers', {
      topic_id: topicId,
      markers: [{ id: 'm1', label: '旗帜' }],
    })

    const topic2 = findTopicById(marked.document.sheets[0].rootTopic, topicId)
    expect(topic2?.markers).toEqual([{ id: 'm1', label: '旗帜' }])
  })

  it('sets topic task and style ref', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.document.sheets[0].rootTopic.children[0].id

    const tasked = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_task', {
      topic_id: topicId,
      task: { status: 'started', priority: 2 },
    })

    const topic1 = findTopicById(tasked.document.sheets[0].rootTopic, topicId)
    expect(topic1?.task).toEqual({ status: 'started', priority: 2 })

    const styled = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_style_ref', {
      topic_id: topicId,
      style_ref: 'highlight-blue',
    })

    const topic2 = findTopicById(styled.document.sheets[0].rootTopic, topicId)
    expect(topic2?.styleRef).toBe('highlight-blue')
  })

  it('sets topic style overrides and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.document.sheets[0].rootTopic.children[0].id

    const overridden = await invokeBrowserCommand<DocumentSessionSnapshot>(
      'set_topic_style_overrides',
      {
        topic_id: topicId,
        style_overrides: { fill: '#ea580c', textColor: '#ffffff' },
      },
    )

    const topic1 = findTopicById(overridden.document.sheets[0].rootTopic, topicId)
    expect(topic1?.styleOverrides).toEqual({ fill: '#ea580c', textColor: '#ffffff' })
    expect(overridden.canUndo).toBe(true)

    // 清除覆盖（传 null）
    const cleared = await invokeBrowserCommand<DocumentSessionSnapshot>(
      'set_topic_style_overrides',
      { topic_id: topicId, style_overrides: null },
    )
    const topic2 = findTopicById(cleared.document.sheets[0].rootTopic, topicId)
    expect(topic2?.styleOverrides).toBeUndefined()

    // undo 恢复覆盖
    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    const topic3 = findTopicById(undone.document.sheets[0].rootTopic, topicId)
    expect(topic3?.styleOverrides).toEqual({ fill: '#ea580c', textColor: '#ffffff' })
  })

  it('switches the document theme and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    expect(created.document.theme).toBeUndefined()

    const switched = await invokeBrowserCommand<DocumentSessionSnapshot>('set_document_theme', {
      theme_id: 'dark',
    })

    expect(switched.document.theme).toEqual({ id: 'dark' })
    expect(switched.canUndo).toBe(true)

    // 清除主题（传 null → 回退默认）
    const cleared = await invokeBrowserCommand<DocumentSessionSnapshot>('set_document_theme', {
      theme_id: null,
    })
    expect(cleared.document.theme).toBeUndefined()

    // undo 恢复 dark 主题
    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    expect(undone.document.theme).toEqual({ id: 'dark' })

    // 相同主题为 noop，不入历史栈（revision 不增、canUndo 不变）
    const noop = await invokeBrowserCommand<DocumentSessionSnapshot>('set_document_theme', {
      theme_id: 'dark',
    })
    expect(noop.document.theme).toEqual({ id: 'dark' })
    expect(noop.summary.revision).toBe(undone.summary.revision)
    expect(noop.canUndo).toBe(undone.canUndo)
  })

  it('rejects rich field edits on missing topics', async () => {
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_notes', {
        topic_id: 'nonexistent',
        notes: 'x',
      }),
    ).rejects.toThrow(/找不到需要编辑备注的主题/)
  })

  it('creates a document from template with regenerated IDs', async () => {
    // 构建模板文档
    const templateDocument = {
      schemaVersion: '1.1.0',
      documentId: 'doc_template',
      revision: 1,
      activeSheetId: 'sheet_template',
      sheets: [
        {
          id: 'sheet_template',
          title: '模板画布',
          rootTopic: {
            id: 'topic_root',
            text: '模板根主题',
            collapsed: false,
            children: [
              { id: 'topic_a', text: 'A', collapsed: false, children: [] },
              { id: 'topic_b', text: 'B', collapsed: false, children: [] },
            ],
          },
        },
      ],
    }

    const result = await invokeBrowserCommand<DocumentSessionSnapshot>(
      'create_document_from_template',
      { document: templateDocument },
    )

    // documentId 应重新生成
    expect(result.document.documentId).not.toBe('doc_template')
    // activeSheetId 应指向新 sheet
    expect(result.document.activeSheetId).toBe(result.document.sheets[0].id)
    expect(result.document.sheets[0].id).not.toBe('sheet_template')
    // 主题结构保持不变
    expect(result.document.sheets[0].rootTopic.text).toBe('模板根主题')
    expect(result.document.sheets[0].rootTopic.children).toHaveLength(2)
    expect(result.document.sheets[0].rootTopic.children[0].text).toBe('A')
    expect(result.document.sheets[0].rootTopic.children[1].text).toBe('B')
    // 所有 ID 应重新生成
    expect(result.document.sheets[0].rootTopic.id).not.toBe('topic_root')
    expect(result.document.sheets[0].rootTopic.children[0].id).not.toBe('topic_a')
    expect(result.document.sheets[0].rootTopic.children[1].id).not.toBe('topic_b')
  })

  it('creates a relationship and supports undo/redo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const root = created.document.sheets[0].rootTopic
    const fromId = root.children[0].id
    const toId = root.children[1].id

    const created_ = await invokeBrowserCommand<DocumentSessionSnapshot>('create_relationship', {
      from_topic_id: fromId,
      to_topic_id: toId,
      label: '依赖',
    })

    expect(created_.document.relationships).toHaveLength(1)
    expect(created_.document.relationships?.[0]).toMatchObject({
      fromTopicId: fromId,
      toTopicId: toId,
      label: '依赖',
    })
    expect(created_.nextUndoAction).toBe('创建关系线')

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    expect(undone.document.relationships ?? []).toHaveLength(0)

    const redone = await invokeBrowserCommand<DocumentSessionSnapshot>('redo_document_command')
    expect(redone.document.relationships).toHaveLength(1)
    expect(redone.document.relationships?.[0].fromTopicId).toBe(fromId)
  })

  it('rejects a relationship with identical endpoints', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const fromId = created.document.sheets[0].rootTopic.children[0].id

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('create_relationship', {
        from_topic_id: fromId,
        to_topic_id: fromId,
        label: null,
      }),
    ).rejects.toThrow(/同一个主题/)
  })

  it('deletes a relationship and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const root = created.document.sheets[0].rootTopic
    const fromId = root.children[0].id
    const toId = root.children[1].id

    const withRel = await invokeBrowserCommand<DocumentSessionSnapshot>('create_relationship', {
      from_topic_id: fromId,
      to_topic_id: toId,
      label: null,
    })
    const relId = withRel.document.relationships?.[0].id ?? ''

    const deleted = await invokeBrowserCommand<DocumentSessionSnapshot>('delete_relationship', {
      relationship_id: relId,
    })
    expect(deleted.document.relationships ?? []).toHaveLength(0)
    expect(deleted.nextUndoAction).toBe('删除关系线')

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    expect(undone.document.relationships).toHaveLength(1)
    expect(undone.document.relationships?.[0].id).toBe(relId)
  })

  it('creates a boundary from selected topics and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sheetId = created.summary.activeSheetId
    const root = created.document.sheets[0].rootTopic
    const topicIds = [root.children[0].id, root.children[1].id]

    const withBoundary = await invokeBrowserCommand<DocumentSessionSnapshot>('create_boundary', {
      sheet_id: sheetId,
      topic_ids: topicIds,
      label: '核心模块',
    })

    const sheet = withBoundary.document.sheets.find((s) => s.id === sheetId)
    expect(sheet?.boundaries).toHaveLength(1)
    expect(sheet?.boundaries?.[0]).toMatchObject({ label: '核心模块', topicIds })
    expect(withBoundary.nextUndoAction).toBe('创建边界')

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    const undoneSheet = undone.document.sheets.find((s) => s.id === sheetId)
    expect(undoneSheet?.boundaries ?? []).toHaveLength(0)
  })

  it('creates a summary and supports undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sheetId = created.summary.activeSheetId
    const root = created.document.sheets[0].rootTopic
    const topicIds = [root.children[0].id, root.children[1].id]

    const withSummary = await invokeBrowserCommand<DocumentSessionSnapshot>('create_summary', {
      sheet_id: sheetId,
      topic_ids: topicIds,
      label: '归纳',
    })

    const sheet = withSummary.document.sheets.find((s) => s.id === sheetId)
    expect(sheet?.summaries).toHaveLength(1)
    expect(sheet?.summaries?.[0]).toMatchObject({ label: '归纳', topicIds })

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    const undoneSheet = undone.document.sheets.find((s) => s.id === sheetId)
    expect(undoneSheet?.summaries ?? []).toHaveLength(0)
  })

  it('rejects boundary and summary on missing sheet or topic', async () => {
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('create_boundary', {
        sheet_id: 'missing-sheet',
        topic_ids: ['a'],
        label: null,
      }),
    ).rejects.toThrow(/找不到需要创建边界的画布/)

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('create_summary', {
        sheet_id: 'missing-sheet',
        topic_ids: ['a'],
        label: 'x',
      }),
    ).rejects.toThrow(/找不到需要创建概要的画布/)
  })

  it('deletes a boundary and a summary with undo', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const sheetId = created.summary.activeSheetId
    const root = created.document.sheets[0].rootTopic
    const topicIds = [root.children[0].id, root.children[1].id]

    const withBoundary = await invokeBrowserCommand<DocumentSessionSnapshot>('create_boundary', {
      sheet_id: sheetId,
      topic_ids: topicIds,
      label: null,
    })
    const boundaryId = withBoundary.document.sheets.find((s) => s.id === sheetId)?.boundaries?.[0].id ?? ''

    const withSummary = await invokeBrowserCommand<DocumentSessionSnapshot>('create_summary', {
      sheet_id: sheetId,
      topic_ids: topicIds,
      label: '归纳',
    })
    const summaryId = withSummary.document.sheets.find((s) => s.id === sheetId)?.summaries?.[0].id ?? ''

    const afterBoundaryDelete = await invokeBrowserCommand<DocumentSessionSnapshot>('delete_boundary', {
      sheet_id: sheetId,
      boundary_id: boundaryId,
    })
    expect(afterBoundaryDelete.document.sheets.find((s) => s.id === sheetId)?.boundaries ?? []).toHaveLength(0)

    const afterSummaryDelete = await invokeBrowserCommand<DocumentSessionSnapshot>('delete_summary', {
      sheet_id: sheetId,
      summary_id: summaryId,
    })
    expect(afterSummaryDelete.document.sheets.find((s) => s.id === sheetId)?.summaries ?? []).toHaveLength(0)
  })

  it('rejects markdown and opml import/export commands in browser dev mode', async () => {
    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('export_markdown_file', { path: '/tmp/x.md' }),
    ).rejects.toThrow(/浏览器开发态暂不支持 Markdown 导出/)

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('import_markdown_file', { path: '/tmp/x.md' }),
    ).rejects.toThrow(/浏览器开发态暂不支持 Markdown 导入/)

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('export_opml_file', { path: '/tmp/x.opml' }),
    ).rejects.toThrow(/浏览器开发态暂不支持 OPML 导出/)

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('import_opml_file', { path: '/tmp/x.opml' }),
    ).rejects.toThrow(/浏览器开发态暂不支持 OPML 导入/)

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('export_png_file', {
        path: '/tmp/x.png',
        data: [0x89, 0x50],
      }),
    ).rejects.toThrow(/浏览器开发态暂不支持 PNG 导出/)

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('export_svg_file', {
        path: '/tmp/x.svg',
        content: '<svg></svg>',
      }),
    ).rejects.toThrow(/浏览器开发态暂不支持 SVG 导出/)
  })
})

describe('invokeBrowserCommand 主题图片', () => {
  it('在浏览器开发态以 data URL 插入图片并可回读，移除后可撤销', async () => {
    const created = await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')
    const topicId = created.activeTopicId
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='

    const inserted = await invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_image', {
      topic_id: topicId,
      source_path: dataUrl,
    })
    const assetId = findTopicById(inserted.document.sheets[0].rootTopic, topicId)?.image?.assetId

    expect(assetId).toBeTruthy()
    expect(inserted.nextUndoAction).toBe('插入图片')

    await expect(
      invokeBrowserCommand<string>('read_asset_data_url', { asset_id: assetId }),
    ).resolves.toBe(dataUrl)

    const removed = await invokeBrowserCommand<DocumentSessionSnapshot>('remove_topic_image', {
      topic_id: topicId,
    })
    expect(findTopicById(removed.document.sheets[0].rootTopic, topicId)?.image).toBeUndefined()

    const undone = await invokeBrowserCommand<DocumentSessionSnapshot>('undo_document_command')
    expect(findTopicById(undone.document.sheets[0].rootTopic, topicId)?.image?.assetId).toBe(
      assetId,
    )
  })

  it('读取不存在的资源返回空串，渲染层据此静默降级', async () => {
    await expect(
      invokeBrowserCommand<string>('read_asset_data_url', { asset_id: 'asset_missing' }),
    ).resolves.toBe('')
  })

  it('浏览器开发态拒绝本地绝对路径', async () => {
    await invokeBrowserCommand<DocumentSessionSnapshot>('create_document')

    await expect(
      invokeBrowserCommand<DocumentSessionSnapshot>('set_topic_image', {
        topic_id: 'topic_x',
        source_path: '/Users/demo/a.png',
      }),
    ).rejects.toThrow(/浏览器开发态暂不支持读取本地图片路径/)
  })
})
