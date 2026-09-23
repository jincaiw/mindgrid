/**
 * 自定义风格编辑器（XMind「工具 → 创建自定义风格」的对应物）。
 *
 * 让用户从一个内置（或已存）配色出发，改一改颜色、起个名字，
 * 存成一份**跨文档可复用**的风格，之后出现在检查器「文档主题」的自定义分组里。
 *
 * ## 三条设计约束
 *
 * 1. **预览必须走真实解析器**。预览里画出来的颜色由 `resolveTopicStyleFrom(草稿主题, …)`
 *    算出——就是画布/导出用的那一个函数。若预览自己再算一遍色（尤其"缤纷分支"那套
 *    深度分级：一级实色白字、二级淡底深字），预览迟早与保存后的画布不一致。
 *
 * 2. **不死控件**。`branchPalette` 的渲染优先级高于单色 `branch` 配色，所以基准带色板时
 *    "分支背景"这个输入框改了也不会生效。这里选的做法是**改分支配色就自动清空色板并明说**
 *    （见 `applyThemeColor`），而不是把输入框置灰——用户随时能把色板加回来。
 *
 * 3. **Esc 由 Esc 链统一处理**。本组件自己也监听 Esc（自成一体、可单测），
 *    外层 `workspace-screen` 的 Esc 链会**先关掉本编辑器再返回**，两者结果一致（都关闭），
 *    所以不存在"一次 Esc 关两层"的问题。
 */

import { useEffect, useMemo, useState } from 'react'
import {
  CUSTOM_THEME_MAX_PALETTE_COLORS,
  CUSTOM_THEME_MIN_PALETTE_COLORS,
  CUSTOM_THEME_NAME_MAX_LENGTH,
  DEFAULT_THEME_ID,
  THEME_COLOR_FIELDS,
  THEME_COLOR_GROUPS,
  applyThemeColor,
  createCustomTheme,
  defaultCustomThemeName,
  draftPaletteFrom,
  getTheme,
  isThemeColor,
  listThemes,
  makeCustomThemeId,
  materializeTheme,
  readThemeColor,
  type CustomTheme,
  type CustomThemePalette,
  type ThemeColorPath,
} from '../../lib/document/themes'
import { resolveTopicStyleFrom } from '../canvas/runtime/style-resolver'

export interface StyleEditorProps {
  /** 编辑既有风格时传入；新建时为 null。 */
  theme: CustomTheme | null
  /** 新建时的基准主题 id（通常是当前文档主题，"改一改另存"最省事）。 */
  baseThemeId: string | undefined
  /** 现有风格库：用于生成不重名的 id 与默认名。 */
  existing: readonly CustomTheme[]
  onCancel: () => void
  onSave: (theme: CustomTheme) => void
  onDelete?: (themeId: string) => void
}

/** 基准没有色板时，"开始用缤纷分支"的初始色组。 */
const SEED_BRANCH_PALETTE: readonly string[] = [
  '#5b8def',
  '#e8804a',
  '#4aa06a',
  '#8a6ad0',
  '#c8a03c',
  '#3aa0b8',
]

const NEW_COLOR = '#5b8def'

export function StyleEditor({
  theme,
  baseThemeId,
  existing,
  onCancel,
  onSave,
  onDelete,
}: StyleEditorProps) {
  const [name, setName] = useState(() => theme?.name ?? defaultCustomThemeName(existing))
  const [baseId, setBaseId] = useState(() => baseThemeId ?? DEFAULT_THEME_ID)
  const [palette, setPalette] = useState<CustomThemePalette>(() =>
    theme
      ? draftPaletteFrom(materializeTheme(theme))
      : draftPaletteFrom(getTheme(baseThemeId ?? DEFAULT_THEME_ID)),
  )
  /** 「改分支配色顺手清空了色板」这类**用户没预料到**的结果，必须说出来。 */
  const [notice, setNotice] = useState<string | null>(null)

  const themes = useMemo(() => listThemes(), [])
  const branchPalette = palette.branchPalette ?? []
  const hasPalette = branchPalette.length > 0
  const canSave = name.trim().length > 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const preview = useMemo(() => {
    const materialized = materializeTheme(
      createCustomTheme({ name: name.trim() || 'preview', palette }, 'style-editor-preview'),
    )
    return {
      materialized,
      root: resolveTopicStyleFrom(materialized, 0, 'center', undefined, null),
      branches: [0, 1, 2].map((index) =>
        resolveTopicStyleFrom(materialized, 1, 'right', undefined, index),
      ),
    }
  }, [name, palette])

  const handleBaseChange = (nextId: string) => {
    setBaseId(nextId)
    setPalette(draftPaletteFrom(getTheme(nextId)))
    setNotice(null)
  }

  const handleColorChange = (path: ThemeColorPath, color: string) => {
    const result = applyThemeColor(palette, path, color)
    setPalette(result.palette)
    setNotice(
      result.clearedBranchPalette
        ? '已清空分支色板：改「分支主题」的颜色会改用单色分支。想要缤纷分支，在下面重新加回色板即可。'
        : null,
    )
  }

  const startPalette = () => {
    const seed = getTheme(baseId).branchPalette ?? SEED_BRANCH_PALETTE
    setPalette((current) => ({ ...current, branchPalette: seed.slice(0, 6) }))
    setNotice(null)
  }

  const updatePaletteColor = (index: number, color: string) => {
    if (!isThemeColor(color)) return
    setPalette((current) => {
      const list = [...(current.branchPalette ?? [])]
      list[index] = color.trim().toLowerCase()
      return { ...current, branchPalette: list }
    })
    setNotice(null)
  }

  const addPaletteColor = () => {
    setPalette((current) => {
      const list = current.branchPalette ?? []
      if (list.length >= CUSTOM_THEME_MAX_PALETTE_COLORS) return current
      return { ...current, branchPalette: [...list, NEW_COLOR] }
    })
    setNotice(null)
  }

  const removePaletteColor = (index: number) => {
    setPalette((current) => {
      const list = current.branchPalette ?? []
      if (list.length <= CUSTOM_THEME_MIN_PALETTE_COLORS) return current
      return { ...current, branchPalette: list.filter((_, i) => i !== index) }
    })
    setNotice(null)
  }

  const handleSave = () => {
    if (!canSave) return
    const id = theme?.id ?? makeCustomThemeId(existing, Date.now().toString(36))
    onSave(createCustomTheme({ name, palette }, id))
  }

  return (
    <div
      className="style-editor__overlay"
      role="dialog"
      aria-modal="true"
      aria-label={theme ? '编辑自定义风格' : '创建自定义风格'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="style-editor">
        <div className="style-editor__header">
          <div>
            <p className="panel__eyebrow">Custom Style</p>
            <h2 className="style-editor__title">{theme ? '编辑自定义风格' : '创建自定义风格'}</h2>
          </div>
          <button className="style-editor__close" type="button" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>

        <p className="style-editor__hint">
          风格存在本机，可在任意文档的「文档主题」里直接选用。元信息文字色跟随文字色自动调整；
          基准里的半透明色会合成成不透明色（取色控件只支持不透明色）。
        </p>

        <div className="style-editor__body">
          <div className="style-editor__fields">
            <label className="panel__field">
              <span>名称</span>
              <input
                type="text"
                aria-label="风格名称"
                value={name}
                maxLength={CUSTOM_THEME_NAME_MAX_LENGTH}
                placeholder="例如：我的品牌色"
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="panel__field">
              <span>基准</span>
              <select
                aria-label="基准配色"
                value={baseId}
                onChange={(event) => handleBaseChange(event.target.value)}
              >
                {themes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {THEME_COLOR_GROUPS.map((group) => (
              <div className="style-editor__group" key={group.id}>
                <p className="style-editor__group-title">{group.title}</p>
                {THEME_COLOR_FIELDS.filter((field) => field.group === group.id).map((field) => (
                  <label className="panel__field" key={field.path}>
                    <span>{field.label}</span>
                    <span className="style-editor__color">
                      <input
                        type="color"
                        // 无障碍名 = 组标题 + 组内相对名（如「画布」+「背景」），
                        // 保证同一分组下的几个字段互不重名、且能唯一定位
                        aria-label={`${group.title}${field.label}`}
                        value={readThemeColor(palette, field.path)}
                        onChange={(event) => handleColorChange(field.path, event.target.value)}
                      />
                      <code className="style-editor__hex">
                        {readThemeColor(palette, field.path)}
                      </code>
                    </span>
                  </label>
                ))}
              </div>
            ))}

            <div className="style-editor__group">
              <p className="style-editor__group-title">分支色板</p>
              {hasPalette ? (
                <>
                  <p className="panel__muted">
                    每条一级分支按顺序取一色（一级实色白字、二级及更深为同色淡底）。改动上方
                    「分支主题」任一颜色会清空这组色板、改用单色。
                  </p>
                  <div className="style-editor__palette">
                    {branchPalette.map((color, index) => (
                      <span className="style-editor__palette-row" key={`${color}-${index}`}>
                        <input
                          type="color"
                          aria-label={`色板第 ${index + 1} 色`}
                          value={color}
                          onChange={(event) => updatePaletteColor(index, event.target.value)}
                        />
                        <code className="style-editor__hex">{color}</code>
                        <button
                          type="button"
                          className="style-editor__remove"
                          aria-label={`删除色板第 ${index + 1} 色`}
                          disabled={branchPalette.length <= CUSTOM_THEME_MIN_PALETTE_COLORS}
                          onClick={() => removePaletteColor(index)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="panel__action panel__action--ghost"
                    disabled={branchPalette.length >= CUSTOM_THEME_MAX_PALETTE_COLORS}
                    onClick={addPaletteColor}
                  >
                    添加颜色
                  </button>
                </>
              ) : (
                <>
                  <p className="panel__muted">
                    当前分支用上面的单色。加一组色板即为缤纷分支（对齐 XMind 的彩虹分支）。
                  </p>
                  <button type="button" className="panel__action panel__action--ghost" onClick={startPalette}>
                    使用缤纷分支色板
                  </button>
                </>
              )}
            </div>

            {notice ? (
              <p className="style-editor__notice" role="status">
                {notice}
              </p>
            ) : null}
          </div>

          <div className="style-editor__preview">
            <p className="style-editor__group-title">预览</p>
            {/* 预览用**真实解析器**算出的颜色画（见文件头约束 1） */}
            <svg className="style-editor__thumb" viewBox="0 0 200 110" role="presentation" aria-hidden="true">
              <rect x="0" y="0" width="200" height="110" rx="8" fill={preview.materialized.background} />
              {[20, 40, 60, 80, 100].map((y) => (
                <line
                  key={`h${y}`}
                  x1="0"
                  y1={y}
                  x2="200"
                  y2={y}
                  stroke={preview.materialized.gridLine}
                  strokeWidth="1"
                />
              ))}
              {[40, 80, 120, 160].map((x) => (
                <line
                  key={`v${x}`}
                  x1={x}
                  y1="0"
                  x2={x}
                  y2="110"
                  stroke={preview.materialized.gridLine}
                  strokeWidth="1"
                />
              ))}
              {preview.branches.map((branch, index) => {
                const y = 16 + index * 30
                return (
                  <g key={index}>
                    <path
                      d={`M62 55 L104 ${y + 12}`}
                      stroke={preview.materialized.edge}
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <rect
                      x="104"
                      y={y}
                      width="82"
                      height="24"
                      rx="5"
                      fill={branch.fill}
                      stroke={branch.borderColor}
                    />
                    <text x="112" y={y + 16} fontSize="9" fill={branch.textColor}>
                      分支 {index + 1}
                    </text>
                  </g>
                )
              })}
              <rect
                x="8"
                y="43"
                width="54"
                height="24"
                rx="5"
                fill={preview.root.fill}
                stroke={preview.root.borderColor}
              />
              <text x="16" y="59" fontSize="9" fill={preview.root.textColor}>
                中心主题
              </text>
            </svg>
          </div>
        </div>

        <div className="style-editor__footer">
          <button type="button" className="panel__action" disabled={!canSave} onClick={handleSave}>
            保存
          </button>
          <button type="button" className="panel__action panel__action--ghost" onClick={onCancel}>
            取消
          </button>
          {theme && onDelete ? (
            <button
              type="button"
              className="panel__action panel__action--ghost"
              onClick={() => onDelete(theme.id)}
            >
              删除
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
