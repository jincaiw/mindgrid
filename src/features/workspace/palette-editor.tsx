/**
 * 自定义配色编辑器（XMind「配色方案 → +」的对应物）。
 *
 * 只做一件事：让用户改一组颜色、起个名字，存成一份可复用的配色方案。
 * 数据落回 `document.settings` 的 `canvas.customPalettes`，与内置预设共用
 * `canvas.branchPalette` 的 id 空间——保存后立即选中新建的那套。
 */

import { useState } from 'react'
import {
  CUSTOM_PALETTE_ID_PREFIX,
  CUSTOM_PALETTE_MAX_COLORS,
  CUSTOM_PALETTE_MIN_COLORS,
  type CustomPalette,
} from '../../lib/document/canvas-settings'

export interface PaletteEditorProps {
  /** 编辑既有方案时传入；新建时为 null。 */
  palette: CustomPalette | null
  /** 新建时的初始颜色（通常是当前方案的配色，方便"改一改另存"）。 */
  seedColors: string[]
  onCancel: () => void
  onSave: (palette: CustomPalette) => void
  onDelete?: (paletteId: string) => void
}

const DEFAULT_NEW_COLOR = '#5b8def'

export function PaletteEditor({
  palette,
  seedColors,
  onCancel,
  onSave,
  onDelete,
}: PaletteEditorProps) {
  const [name, setName] = useState(palette?.name ?? '')
  const [colors, setColors] = useState<string[]>(
    palette?.colors ?? (seedColors.length > 0 ? seedColors.slice(0, 6) : [DEFAULT_NEW_COLOR]),
  )

  const canSave = name.trim().length > 0 && colors.length >= CUSTOM_PALETTE_MIN_COLORS

  const updateColor = (index: number, color: string) => {
    setColors((current) => current.map((c, i) => (i === index ? color : c)))
  }

  const removeColor = (index: number) => {
    setColors((current) => current.filter((_, i) => i !== index))
  }

  return (
    <div className="palette-editor" role="dialog" aria-label="编辑配色方案">
      <label className="panel__field">
        <span>名称</span>
        <input
          type="text"
          aria-label="配色方案名称"
          value={name}
          placeholder="例如：品牌色"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="panel__field">
        <span>颜色（{colors.length}）</span>
        <div className="palette-editor__colors">
          {colors.map((color, index) => (
            <span className="palette-editor__row" key={`${color}-${index}`}>
              <input
                type="color"
                aria-label={`第 ${index + 1} 个颜色`}
                value={color}
                onChange={(event) => updateColor(index, event.target.value)}
              />
              <span className="palette-editor__hex">{color}</span>
              <button
                type="button"
                className="palette-editor__remove"
                aria-label={`删除第 ${index + 1} 个颜色`}
                disabled={colors.length <= CUSTOM_PALETTE_MIN_COLORS}
                onClick={() => removeColor(index)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="panel__action panel__action--ghost"
          disabled={colors.length >= CUSTOM_PALETTE_MAX_COLORS}
          onClick={() => setColors((current) => [...current, DEFAULT_NEW_COLOR])}
        >
          添加颜色
        </button>
      </div>

      <div className="panel__field-row">
        <button
          type="button"
          className="panel__action"
          disabled={!canSave}
          onClick={() =>
            onSave({
              id: palette?.id ?? `${CUSTOM_PALETTE_ID_PREFIX}${Date.now().toString(36)}`,
              name: name.trim(),
              colors,
            })
          }
        >
          保存
        </button>
        <button type="button" className="panel__action panel__action--ghost" onClick={onCancel}>
          取消
        </button>
        {palette && onDelete ? (
          <button
            type="button"
            className="panel__action panel__action--ghost"
            onClick={() => onDelete(palette.id)}
          >
            删除
          </button>
        ) : null}
      </div>
    </div>
  )
}
