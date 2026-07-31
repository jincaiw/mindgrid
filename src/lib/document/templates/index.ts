/**
 * 模板注册表：提供模板查找与列表能力。
 *
 * 当前仅支持内置模板；未来可扩展用户自定义模板（从磁盘加载）。
 */

import { BUILT_IN_TEMPLATES } from './built-in-templates'
import type { DocumentTemplate, TemplateCategory } from './types'

export type { DocumentTemplate, TemplateCategory } from './types'

/** 获取所有可用模板（内置 + 用户）。 */
export function listTemplates(): DocumentTemplate[] {
  return BUILT_IN_TEMPLATES
}

/** 按 ID 查找模板。 */
export function findTemplate(id: string): DocumentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id)
}

/** 按分类筛选模板。 */
export function templatesByCategory(category: TemplateCategory): DocumentTemplate[] {
  return BUILT_IN_TEMPLATES.filter((t) => t.category === category)
}
