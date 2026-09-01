import { useEffect } from 'react'
import { groupShortcutsByCategory, formatCombo, type ShortcutDef } from './registry'

/**
 * 快捷键帮助浮层（批次 20）。
 *
 * 对标 XMind 的 Hotkeys 面板：按分类分组展示全部快捷键，
 * 精确显示修饰键（⌘/⇧/⌥）与主键。Esc 或点击遮罩关闭。
 */
interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  // Esc 关闭浮层（浮层打开时）
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose])

  if (!open) return null

  const groups = groupShortcutsByCategory()

  return (
    <div
      className="shortcuts-help-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="快捷键"
      onClick={onClose}
    >
      <div className="shortcuts-help" onClick={(e) => e.stopPropagation()}>
        <header className="shortcuts-help__header">
          <h2 className="shortcuts-help__title">键盘快捷键</h2>
          <button
            type="button"
            className="shortcuts-help__close"
            aria-label="关闭快捷键面板"
            onClick={onClose}
          >
            关闭
          </button>
        </header>
        <div className="shortcuts-help__body">
          {groups.map((group) => (
            <section key={group.category} className="shortcuts-help__group">
              <h3 className="shortcuts-help__group-title">{group.category}</h3>
              <dl className="shortcuts-help__list">
                {group.items.map((item) => (
                  <ShortcutRow key={item.id} item={item} />
                ))}
              </dl>
            </section>
          ))}
        </div>
        <footer className="shortcuts-help__footer">
          <p>⌘ = Cmd（macOS）/ Ctrl（Windows）　·　⇧ = Shift　·　⌥ = Alt / Option</p>
        </footer>
      </div>
    </div>
  )
}

function ShortcutRow({ item }: { item: ShortcutDef }) {
  return (
    <div className="shortcuts-help__row">
      <dt className="shortcuts-help__label" title={item.description}>
        {item.label}
      </dt>
      <dd className="shortcuts-help__keys">
        <kbd className="shortcuts-help__kbd">{formatCombo(item.combo)}</kbd>
      </dd>
    </div>
  )
}
