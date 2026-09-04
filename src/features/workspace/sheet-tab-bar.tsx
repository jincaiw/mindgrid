import { useEffect, useRef, useState } from 'react'
import type { DocumentSession } from '../document/use-document-session'

/**
 * 画布标签栏（批次 19 初版 → 批次 26 移至画布顶部 → 对标批次 A1 归位底部状态条）。
 *
 * XMind 官方用户指南对状态条的描述是「左边显示画布名称，右边显示统计信息/缩放
 * 比例/大纲」，即画布标签属于**底部状态条左段**，不在画布顶部、也不在侧栏。
 *
 * 标签栏横跨整个窗口宽度（原先放在画布列顶部时会被 280px 侧栏切断）。
 * 新建 / 重命名 / 删除 / 排序都在这里完成，因此侧栏「画布管理」折叠区只保留
 * 图表类型切换与跨画布拖拽等低频能力，默认折叠。
 */
interface SheetTabBarProps {
  session: DocumentSession
}

export function SheetTabBar({ session }: SheetTabBarProps) {
  const sheets = session.document?.sheets ?? []
  const activeSheetId = session.document?.activeSheetId ?? sheets[0]?.id ?? ''

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // 切换画布或文档变化时退出重命名/菜单态，避免悬挂输入指向失效画布
  useEffect(() => {
    setRenamingId(null)
    setMenuId(null)
  }, [activeSheetId, session.document?.revision])

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renamingId])

  // 点击菜单外部关闭右键菜单
  useEffect(() => {
    if (!menuId) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (!target.closest('[data-sheet-menu]') && !target.closest('[data-sheet-tab]')) {
        setMenuId(null)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [menuId])

  if (sheets.length === 0) return null

  function startRename(sheetId: string, currentTitle: string) {
    setRenamingId(sheetId)
    setRenameDraft(currentTitle)
    setMenuId(null)
  }

  async function commitRename(sheetId: string) {
    const trimmed = renameDraft.trim()
    setRenamingId(null)
    if (!trimmed) return
    const current = sheets.find((s) => s.id === sheetId)?.title ?? ''
    if (trimmed === current) return
    await session.renameSheet(sheetId, trimmed)
  }

  function moveSheetIndex(sheetId: string) {
    return sheets.findIndex((s) => s.id === sheetId)
  }

  return (
    <div className="sheet-tab-bar" role="tablist" aria-label="画布标签栏">
      <div className="sheet-tab-bar__scroll" role="presentation">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId
          const isRenaming = renamingId === sheet.id
          const index = moveSheetIndex(sheet.id)
          return (
            <div
              key={sheet.id}
              className={`sheet-tab-bar__tab${isActive ? ' sheet-tab-bar__tab--active' : ''}`}
              data-sheet-tab
            >
              {isRenaming ? (
                <input
                  ref={renamingId === sheet.id ? renameInputRef : undefined}
                  className="sheet-tab-bar__rename-input"
                  value={renameDraft}
                  aria-label="重命名画布"
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitRename(sheet.id)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      setRenamingId(null)
                    }
                  }}
                  onBlur={() => void commitRename(sheet.id)}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="sheet-tab-bar__button"
                  title={sheet.title}
                  onClick={() => void session.selectSheet(sheet.id)}
                  onDoubleClick={() => startRename(sheet.id, sheet.title)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenuId(menuId === sheet.id ? null : sheet.id)
                  }}
                >
                  <span className="sheet-tab-bar__label">{sheet.title}</span>
                </button>
              )}
              {!isRenaming && sheets.length > 1 ? (
                <button
                  type="button"
                  className="sheet-tab-bar__close"
                  aria-label={`关闭画布 ${sheet.title}`}
                  title="关闭画布"
                  onClick={(event) => {
                    event.stopPropagation()
                    void session.deleteSheet(sheet.id)
                  }}
                >
                  ×
                </button>
              ) : null}
              {menuId === sheet.id ? (
                <div className="sheet-tab-bar__menu" data-sheet-menu role="menu" aria-label="画布操作">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => startRename(sheet.id, sheet.title)}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={sheets.length <= 1}
                    onClick={async () => {
                      setMenuId(null)
                      await session.deleteSheet(sheet.id)
                    }}
                  >
                    删除画布
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={index <= 0}
                    onClick={async () => {
                      setMenuId(null)
                      await session.moveSheet(sheet.id, 'up')
                    }}
                  >
                    左移
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={index >= sheets.length - 1}
                    onClick={async () => {
                      setMenuId(null)
                      await session.moveSheet(sheet.id, 'down')
                    }}
                  >
                    右移
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="sheet-tab-bar__add"
        aria-label="新建画布"
        title="新建画布"
        onClick={() => void session.createSheet()}
      >
        +
      </button>
    </div>
  )
}
