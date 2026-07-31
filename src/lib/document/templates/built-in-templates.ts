/**
 * 内置文档模板集合。
 *
 * 每个模板定义一个预构建的 DocumentSnapshot，包含主题树结构。
 * 创建时 Rust `regenerate_ids` 会重新生成所有 ID，因此模板内可使用任意占位 ID。
 */

import { CURRENT_SCHEMA_VERSION, createId, createTopic } from '../default-document'
import type { DocumentSnapshot, TopicSnapshot } from '../types'
import type { DocumentTemplate } from './types'

/** 构建模板文档：单个 sheet + 指定根主题。 */
function makeTemplateDocument(sheetTitle: string, rootTopic: TopicSnapshot): DocumentSnapshot {
  const sheetId = createId('sheet')
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentId: createId('doc'),
    revision: 1,
    activeSheetId: sheetId,
    sheets: [
      {
        id: sheetId,
        title: sheetTitle,
        rootTopic,
      },
    ],
  }
}

/** 便捷函数：构建主题（文字 + 子主题文字数组）。 */
function topic(text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return createTopic(text, children)
}

/** 便捷函数：从文字数组构建叶子主题列表。 */
function leaves(texts: string[]): TopicSnapshot[] {
  return texts.map((text) => topic(text))
}

// ---- 内置模板定义 ----

const blankTemplate: DocumentTemplate = {
  id: 'blank',
  name: '空白文档',
  description: '从零开始，只有一个中心主题',
  category: 'blank',
  document: makeTemplateDocument('主画布', topic('中心主题')),
}

const todoTemplate: DocumentTemplate = {
  id: 'todo-list',
  name: '待办清单',
  description: '按时间段组织的任务清单，适合日常规划',
  category: 'personal',
  document: makeTemplateDocument(
    '待办清单',
    topic('待办清单', [
      topic('本周任务', leaves(['完成需求文档', '代码评审', '修复 Bug'])),
      topic('下周计划', leaves(['功能开发', '测试验收'])),
      topic('长期目标', leaves(['技术学习', '项目复盘'])),
    ]),
  ),
}

const swotTemplate: DocumentTemplate = {
  id: 'swot-analysis',
  name: 'SWOT 分析',
  description: '优势/劣势/机会/威胁四象限分析框架',
  category: 'business',
  document: makeTemplateDocument(
    'SWOT 分析',
    topic('SWOT 分析', [
      topic('优势 (Strengths)', leaves(['核心竞争力', '资源优势', '团队能力'])),
      topic('劣势 (Weaknesses)', leaves(['技术短板', '资源不足', '经验欠缺'])),
      topic('机会 (Opportunities)', leaves(['市场趋势', '合作机会', '政策支持'])),
      topic('威胁 (Threats)', leaves(['竞争对手', '政策风险', '技术变革'])),
    ]),
  ),
}

const readingNotesTemplate: DocumentTemplate = {
  id: 'reading-notes',
  name: '读书笔记',
  description: '结构化记录书籍核心观点与读后思考',
  category: 'education',
  document: makeTemplateDocument(
    '读书笔记',
    topic('《书名》读书笔记', [
      topic('基本信息', leaves(['作者', '出版社', '出版日期'])),
      topic('核心观点', leaves(['主要论点', '关键证据', '逻辑推演'])),
      topic('精彩摘录', leaves(['金句一', '金句二'])),
      topic('读后思考', leaves(['启发', '行动计划'])),
    ]),
  ),
}

const projectPlanTemplate: DocumentTemplate = {
  id: 'project-plan',
  name: '项目计划',
  description: '项目目标、里程碑、资源与风险管理',
  category: 'business',
  document: makeTemplateDocument(
    '项目计划',
    topic('项目名称', [
      topic('项目目标', leaves(['核心目标', '成功标准'])),
      topic('里程碑', [
        topic('阶段一：需求分析'),
        topic('阶段二：设计开发'),
        topic('阶段三：测试上线'),
      ]),
      topic('资源分配', leaves(['人员', '预算', '工具'])),
      topic('风险管理', leaves(['风险识别', '应对策略'])),
    ]),
  ),
}

const meetingNotesTemplate: DocumentTemplate = {
  id: 'meeting-notes',
  name: '会议纪要',
  description: '记录会议信息、讨论内容、决议与待办事项',
  category: 'business',
  document: makeTemplateDocument(
    '会议纪要',
    topic('会议纪要', [
      topic('会议信息', leaves(['时间', '参会人', '议题'])),
      topic('讨论内容', leaves(['议题一', '议题二'])),
      topic('决议事项', leaves(['决定一', '决定二'])),
      topic('待办事项', leaves(['任务一（负责人/截止日期）', '任务二（负责人/截止日期）'])),
    ]),
  ),
}

/** 所有内置模板，按分类排列。 */
export const BUILT_IN_TEMPLATES: DocumentTemplate[] = [
  blankTemplate,
  todoTemplate,
  swotTemplate,
  readingNotesTemplate,
  projectPlanTemplate,
  meetingNotesTemplate,
]
