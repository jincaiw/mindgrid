/**
 * 模板选择器：展示内置模板画廊，用户选择后从模板创建新文档。
 */

import { useEffect, useRef } from 'react'
import type { DocumentSession } from '../document/use-document-session'
import { listTemplates } from '../../lib/document/templates'
import type { TemplateCategory } from '../../lib/document/templates'

interface TemplatePickerProps {
  session: DocumentSession
  onClose: () => void
}

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  blank: '空白',
  personal: '个人',
  business: '商务',
  education: '教育',
}

export function TemplatePicker({ session, onClose }: TemplatePickerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const templates = listTemplates()

  // Escape 关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSelect = (document: Parameters<DocumentSession['createFromTemplate']>[0]) => {
    void session.createFromTemplate(document)
    onClose()
  }

  return (
    <div
      className="template-picker__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="从模板新建文档"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="template-picker" ref={dialogRef}>
        <div className="template-picker__header">
          <div>
            <p className="panel__eyebrow">Templates</p>
            <h2 className="template-picker__title">从模板新建</h2>
          </div>
          <button
            className="template-picker__close"
            type="button"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="template-picker__hint">
          选择一个模板快速开始，所有模板的主题结构会自动加载到新文档中。
        </p>

        <div className="template-picker__grid">
          {templates.map((template) => (
            <button
              key={template.id}
              className="template-card"
              type="button"
              onClick={() => handleSelect(template.document)}
            >
              <span className="template-card__category">
                {CATEGORY_LABELS[template.category]}
              </span>
              <span className="template-card__name">{template.name}</span>
              <span className="template-card__desc">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
