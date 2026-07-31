/**
 * 文档模板类型定义。
 *
 * 模板是预定义的文档结构，用户可从模板快速创建新文档。
 * 内置模板在应用中静态定义；未来可支持用户自定义模板。
 * 创建时由 Rust `regenerate_ids` 重新生成所有 ID，确保唯一性。
 */

import type { DocumentSnapshot } from '../types'

export type TemplateCategory = 'blank' | 'personal' | 'business' | 'education'

export interface DocumentTemplate {
  /** 模板唯一标识（稳定，用于查找） */
  id: string
  /** 显示名称 */
  name: string
  /** 简短描述 */
  description: string
  /** 分类 */
  category: TemplateCategory
  /** 模板的文档结构（ID 在创建时由 Rust 重新生成） */
  document: DocumentSnapshot
}
