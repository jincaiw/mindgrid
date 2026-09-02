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

const brainstormTemplate: DocumentTemplate = {
  id: 'brainstorm',
  name: '头脑风暴',
  description: '发散想法、快速归类与筛选的创意收集框架',
  category: 'business',
  document: makeTemplateDocument(
    '头脑风暴',
    topic('中心议题', [
      topic('想法发散', leaves(['想法 1', '想法 2', '想法 3', '想法 4'])),
      topic('归类整理', leaves(['类别 A', '类别 B', '类别 C'])),
      topic('可行性评估', leaves(['投入产出', '技术难度', '时间成本'])),
      topic('优先级排序', leaves(['立刻做', '计划做', '暂缓'])),
    ]),
  ),
}

const weeklyReportTemplate: DocumentTemplate = {
  id: 'weekly-report',
  name: '周报',
  description: '本周进展、问题与下周计划的固定汇报结构',
  category: 'business',
  document: makeTemplateDocument(
    '周报',
    topic('本周周报', [
      topic('本周进展', leaves(['完成事项 1', '完成事项 2'])),
      topic('问题与风险', leaves(['阻塞点', '需要的支持'])),
      topic('下周计划', leaves(['计划 1', '计划 2'])),
      topic('数据指标', leaves(['关键指标变化'])),
    ]),
  ),
}

const okrTemplate: DocumentTemplate = {
  id: 'okr-plan',
  name: 'OKR 规划',
  description: '目标（O）与关键结果（KR）对齐的季度规划',
  category: 'business',
  document: makeTemplateDocument(
    'OKR 规划',
    topic('季度 OKR', [
      topic('O1：目标一', [
        topic('KR1：关键结果'),
        topic('KR2：关键结果'),
        topic('KR3：关键结果'),
      ]),
      topic('O2：目标二', [
        topic('KR1：关键结果'),
        topic('KR2：关键结果'),
      ]),
      topic('复盘与风险', leaves(['达成度评估', '调整策略'])),
    ]),
  ),
}

const studyPlanTemplate: DocumentTemplate = {
  id: 'study-plan',
  name: '学习计划',
  description: '按阶段拆解的学习路径与检验标准',
  category: 'education',
  document: makeTemplateDocument(
    '学习计划',
    topic('学习主题', [
      topic('基础阶段', leaves(['知识点 1', '知识点 2', '练习'])),
      topic('进阶阶段', leaves(['专题深入', '实战项目'])),
      topic('检验标准', leaves(['自测题', '输出笔记'])),
      topic('时间安排', leaves(['每日 1 小时', '周末复盘'])),
    ]),
  ),
}

const travelPlanTemplate: DocumentTemplate = {
  id: 'travel-plan',
  name: '旅行计划',
  description: '行程、预算、装备与注意事项一页规划',
  category: 'personal',
  document: makeTemplateDocument(
    '旅行计划',
    topic('目的地', [
      topic('行程安排', leaves(['Day 1', 'Day 2', 'Day 3'])),
      topic('预算', leaves(['交通', '住宿', '餐饮', '门票'])),
      topic('装备清单', leaves(['证件', '衣物', '电子设备'])),
      topic('注意事项', leaves(['天气预报', '当地风俗', '紧急联系'])),
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
  brainstormTemplate,
  weeklyReportTemplate,
  okrTemplate,
  studyPlanTemplate,
  travelPlanTemplate,
]
