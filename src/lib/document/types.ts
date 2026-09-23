/**
 * MindGrid 文档数据模型类型（Domain Layer 投影）。
 *
 * 与 Rust 侧 `domain::document` 保持结构一致，通过 Tauri IPC 以 camelCase JSON 传输。
 * 所有 V1 富字段（styleRef / markers / labels / notes / link / image / task / layoutHints /
 * relationships / boundaries / summaries / chartType / theme / extensions）均为可选，
 * 缺省时回退到默认行为，保证 1.0.0 旧文档可直接加载。
 *
 * 未知字段保留（spec 16：不静默删除未知字段）：Rust 侧通过 `#[serde(flatten)] extra` 捕获
 * schema 未识别字段并在序列化时展开为顶层键；TS 侧 `JSON.parse` 天然保留所有键，IPC 往返
 * 不丢失。此处不为未知字段声明 index signature，以保持编译期类型安全。
 */

export type ChartType =
  | 'mindmap'
  | 'logic'
  | 'tree'
  | 'org'
  | 'fishbone'
  | 'timeline'
  | 'brace'
  | 'matrix'
  | 'bubble'
  | 'treetable'

/** 主题标记（图标库引用），例如优先级、进度、旗帜等。 */
export interface TopicMarker {
  id: string
  label?: string
}

/**
 * 贴在主题上的一张贴纸（一个**实例**）。
 *
 * 同一个内置贴纸可贴多次，故每条记录各有 `id`；`stickerId` 才表示"是哪张图"。
 * 位置相对**节点中心**（世界单位）——节点尺寸随文字变化，用绝对坐标会让贴纸跑掉。
 */
export interface TopicSticker {
  id: string
  stickerId: string
  offsetX?: number
  offsetY?: number
  rotation?: number
}

/**
 * 主题标注（callout）：画布上挂在节点外侧的说明框 + 一条指向节点的引线。
 *
 * 与备注不同：它在画布上直接可见，且带位置。
 * 位置相对节点中心；没显式摆放过（offsetX/offsetY 缺省）时由渲染端按默认落点现算。
 */
export interface TopicCallout {
  text: string
  offsetX?: number
  offsetY?: number
}

/** 主题超链接。 */
export interface TopicLink {
  url: string
  title?: string
}

/** 主题图片，通过 Asset ID 引用 assets/ 资源，避免 Base64 内嵌。 */
export interface TopicImage {
  assetId: string
  width?: number
  height?: number
}

/**
 * 主题附件：文件本身随 .mgd 存进 `assets/attachments/`，这里只放引用与展示元数据。
 *
 * 与 `TopicImage` 的关键差别：附件**不参与节点尺寸**——节点上只有一个回形针图标。
 * `name` 是原始文件名，用于列表显示与"导出到临时目录后交给系统默认应用打开"。
 */
export interface TopicAttachment {
  assetId: string
  name: string
  mimeType?: string
  byteSize?: number
}

export type TopicTaskStatus = 'none' | 'started' | 'completed' | 'pending'

/** 轻量任务属性，用于在思维导图中跟踪行动项。 */
export interface TopicTask {
  status: TopicTaskStatus
  /** 开始日期（毫秒时间戳，当日 00:00 本地时间），甘特图条形起点。 */
  startDateMs?: number
  dueDateMs?: number
  priority?: number
}

/** 手动布局提示，覆盖自动布局结果。 */
export interface TopicLayoutHints {
  direction?: 'left' | 'right' | 'up' | 'down'
  offsetX?: number
  offsetY?: number
}

/**
 * 主题节点形状。对齐 XMind 节点形状选项：
 * - rounded：圆角矩形（默认，按深度递减圆角）
 * - rect：直角矩形
 * - pill：全圆角胶囊（半径 = 高度/2）
 * - underline：下划线式（无填充、仅底部描边，文字直绘于画布）
 */
export type TopicShape = 'rounded' | 'rect' | 'pill' | 'underline'

/**
 * 主题节点级样式覆盖，优先于文档主题的层级默认值。
 *
 * 颜色字段（fill / textColor / borderColor）覆盖主题层级配色；
 * 形状与排印字段（shape / fontSize / fontWeight / borderWidth）覆盖
 * 深度分级默认值（见 style-constants 的 getTitleFontSize 等）。
 * 所有字段可选，缺省时回退到对应默认，保证 1.1.0 旧文档可直接加载。
 */
export interface TopicStyleOverrides {
  fill?: string
  textColor?: string
  borderColor?: string
  shape?: TopicShape
  /** 标题字号（px），建议范围 8–32。 */
  fontSize?: number
  /** 标题字重（CSS font-weight 数值，如 400/500/600/700）。 */
  fontWeight?: number
  /** 节点边框粗细（px），建议范围 0–6，0 表示无边框。 */
  borderWidth?: number
  /** 节点固定宽度（px）。设置后不再按文字自适应；`适合` 会清掉该字段。 */
  width?: number
  /** 边框线型，缺省 solid；边框粗细为 0 时线型无意义。 */
  borderStyle?: TopicBorderStyle
  /** 标题对齐方式，缺省 left。 */
  textAlign?: TopicTextAlign
  /**
   * 节点级字体族（完整 CSS font-family 值，含自带回退），缺省跟随画布全局字体。
   *
   * 存**字体栈本身**而不是选项 id：字体选项列表属于 UI 常量，会随版本增删，
   * 文档里存 id 会让旧文件在列表变更后静默换字体。存栈则永远渲染同一个字体。
   */
  fontFamily?: string
  /** 标题斜体（对齐 XMind 文本工具条的 I），缺省 false。 */
  italic?: boolean
  /** 标题删除线（对齐 XMind 文本工具条的 S），缺省 false。 */
  strikethrough?: boolean
  /** 标题大小写转换（对齐 XMind 文本工具条的 Tт），缺省 none。 */
  textTransform?: TopicTextTransform
  /**
   * 节点级分支线条颜色（对齐 XMind 样式页「分支 → 线条颜色」）。
   *
   * 语义是**整条分支**：设在一级分支上会让该分支连同其后代的连线同色，
   * 若某个后代自己也设了颜色，则以距该边最近的那个为准。
   * 只作用于连线（含终点装饰），不改节点填充——填充色归 `fill`。
   */
  branchColor?: string
}

/** 节点边框线型（对齐 XMind「边框」下方的线型下拉）。 */
export type TopicBorderStyle = 'solid' | 'dashed' | 'dotted'

/** 标题在节点内的对齐方式。 */
export type TopicTextAlign = 'left' | 'center' | 'right'

/**
 * 标题大小写转换（对齐 XMind 文本工具条的 Tт）。
 * - none：原样（默认）
 * - uppercase / lowercase：整体转大/小写
 * - capitalize：每个单词首字母大写
 *
 * 转换发生在**渲染层**，不改写主题文本本身（导出与屏幕必须用同一个转换函数）。
 */
export type TopicTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

/** 节点级分支方向（对齐 XMind 样式页「结构 → 方向」）。 */
export type TopicDirection = 'left' | 'right' | 'up' | 'down' | 'balanced'

/**
 * 合法的结构方向取值（单一来源）。
 *
 * 浏览器后备会话与 Rust 会话各有一条校验分支；两边的白名单必须同源，
 * 否则 Web 端（开发/预览）会拒掉 Rust 端已经接受的取值——
 * 这正是一次端到端冒烟抓出来的真实不一致（`up` 只在 Rust 侧可用）。
 */
export const TOPIC_DIRECTIONS: readonly TopicDirection[] = [
  'left',
  'right',
  'up',
  'down',
  'balanced',
]

/**
 * 可以作为**单个分支**骨架的图表类型。
 *
 * 排除两种「整体版式」：
 * - `bubble`：后代按同心圆环绕子根排布，会同时向四周伸展，挂在任一分支上都会压到中心主题；
 * - `fishbone`：主干 + 斜向鱼刺描述的是整幅图的因果版式，作为某个分支的骨架没有可读语义。
 *
 * 其余骨架都能作为分支骨架：挂在左侧分支上时会自动**水平镜像**，朝外（向左）生长。
 */
export const BRANCH_CHART_TYPES: readonly ChartType[] = [
  'mindmap',
  'logic',
  'tree',
  'org',
  'timeline',
  'brace',
  'matrix',
  'treetable',
]

/**
 * 节点级骨架覆盖（对齐 XMind 样式页的「结构 / 方向」）。
 *
 * XMind 允许**单个分支**用不同于整幅图的骨架：整张画布是思维导图，
 * 某个分支可以是组织结构图或逻辑图。这里就是那条覆盖的载体。
 *
 * 两个字段都可缺省，缺省时逐级继承：`chartType` 继承画布骨架，
 * `direction` 继承所在分支的朝向。所有字段可选，保证旧文档可直接加载。
 */
export interface TopicStructure {
  /** 该主题的**子主题**用哪种骨架排布；缺省继承画布骨架。 */
  chartType?: ChartType
  /** 该主题的**子主题**向哪边展开；缺省继承所在分支。 */
  direction?: TopicDirection
}

export interface TopicSnapshot {
  id: string
  text: string
  collapsed: boolean
  children: TopicSnapshot[]
  /** 样式表引用，见 styles.json。 */
  styleRef?: string
  /** 节点级样式覆盖（颜色 / 形状 / 排印 / 边框粗细），优先于文档主题。 */
  styleOverrides?: TopicStyleOverrides
  markers?: TopicMarker[]
  stickers?: TopicSticker[]
  callout?: TopicCallout
  labels?: string[]
  notes?: string
  link?: TopicLink
  image?: TopicImage
  attachment?: TopicAttachment
  task?: TopicTask
  layoutHints?: TopicLayoutHints
  /** 节点级骨架覆盖（结构 / 方向），优先于画布级 `chartType` 与 `layoutConfig.direction`。 */
  structure?: TopicStructure
  /** 应用层扩展命名空间，不覆盖核心字段。 */
  extensions?: Record<string, unknown>
}

/** 关系线端点控制提示。 */
export interface RelationshipControlPoint {
  x: number
  y: number
}

/** 关系线：两个主题之间的非父子连接，不改变树结构。 */
export interface Relationship {
  id: string
  fromTopicId: string
  toTopicId: string
  label?: string
  styleRef?: string
  controlPoints?: RelationshipControlPoint[]
}

/** 概要节点：对一组兄弟主题的归纳。 */
export interface SummaryNode {
  id: string
  topicIds: string[]
  label: string
  styleRef?: string
}

/** 边界：框选一组主题以做视觉分组。 */
export interface Boundary {
  id: string
  topicIds: string[]
  label?: string
  styleRef?: string
}

/** 编号序号格式。 */
export type NumberingFormat =
  | 'decimal'
  | 'lowerAlpha'
  | 'upperAlpha'
  | 'lowerRoman'
  | 'upperRoman'

/**
 * 画布级主题编号配置（XMind 样式页「编号」）。
 *
 * 编号是展示层派生数据，不写入主题文本；关闭后编号消失，主题文本不变。
 */
export interface SheetNumbering {
  /** 是否启用编号。false 等价于无配置。 */
  enabled: boolean
  /** 序号格式，缺省 decimal。 */
  format?: NumberingFormat
  /** 层级分隔符，支持 `.` / `-` / `)`，缺省 `.`。 */
  separator?: string
  /** 是否给根主题也编号，缺省 false。 */
  includeRoot?: boolean
}

/** 布局参数，随图表类型解释。 */
export interface LayoutConfig {
  /**
   * 画布级结构方向。
   *
   * 不同骨架解释不同：脑图/逻辑图看左右，组织结构图/树形图看上下，
   * 时间轴用 `right`（水平）/ `down`（垂直）。无关的方向被忽略。
   */
  direction?: TopicDirection
  horizontalSpacing?: number
  verticalSpacing?: number
}

/**
 * 连线类型，决定父子主题之间的边线绘制方式。
 * - curve：贝塞尔曲线（默认，XMind 经典 S 型）
 * - straight：直线（控制点退化为起止点）
 * - elbow：正交折线（L 型，组织结构图风格）
 */
export type EdgeType = 'curve' | 'straight' | 'elbow'

/** 分支终点装饰，沿父子连线的子主题端绘制。 */
export type EdgeEndpoint = 'none' | 'circle' | 'arrow'

/**
 * 画布级分支样式覆盖，影响整张画布的连线视觉。
 *
 * 与节点级 `TopicStyleOverrides` 互补：前者作用于"边"，后者作用于"节点"。
 * 所有字段可选，缺省时回退到默认（curve + 默认线宽 + 8 色循环色板），
 * 保证 1.0.0 旧文档可直接加载。
 */
export interface SheetBranchStyle {
  /** 连线类型，缺省为 curve。 */
  edgeType?: EdgeType
  /** 连线粗细乘数（1.0 为默认，建议范围 0.5–3.0）。 */
  thickness?: number
  /** 分支色板，覆盖默认 8 色循环。每个根直接子节点取一个色，其后代继承。 */
  colorPalette?: string[]
  /** 子主题端点装饰，缺省为 none。 */
  endpoint?: EdgeEndpoint
}

/**
 * 画布级插画：不依附任何主题、直接摆在画布上的装饰对象。
 *
 * 与贴纸 / 标注的关键差别：那两个挂在 `TopicSnapshot` 上、跟着主题走；
 * 插画没有宿主主题，所以存在画布（Sheet）上。
 *
 * `x` / `y` 是插画**中心**在**布局坐标系**里的位置——渲染时统一加 `layout.offset`，
 * 与节点/连线同一套约定（否则画布一平移，插画就会和内容分离）。
 */
export interface CanvasIllustration {
  id: string
  /** 素材 id（目录见 `features/canvas/illustration-definitions.ts`）。 */
  illustrationId: string
  x: number
  y: number
  /** 绘制边长（世界单位，正方形）。 */
  size: number
}

export interface SheetSnapshot {
  id: string
  title: string
  rootTopic: TopicSnapshot
  /** 图表类型，缺省为 mindmap。 */
  chartType?: ChartType
  layoutConfig?: LayoutConfig
  /** 画布级分支样式（连线类型/粗细/分支色板/终点），缺省回退到默认。 */
  branchStyle?: SheetBranchStyle
  /** 画布级主题编号配置，缺省不显示编号。 */
  numbering?: SheetNumbering
  /**
   * 浮动主题列表：独立于 rootTopic 树结构的自由节点。
   * 每个浮动主题通过 layoutHints.offsetX/offsetY 存储世界坐标绝对位置，
   * 布局引擎跳过其自动布局；拖拽浮动主题到普通主题上可吸附为子主题。
   * 缺省为空数组，保证 1.0.0 旧文档可直接加载。
   */
  floatingTopics?: TopicSnapshot[]
  boundaries?: Boundary[]
  summaries?: SummaryNode[]
  /** 画布级插画（不依附主题的浮动装饰），缺省为空。 */
  illustrations?: CanvasIllustration[]
  extensions?: Record<string, unknown>
}

/** 文档级设置（自由键值，未来按需结构化）。 */
export interface DocumentSettings {
  [key: string]: unknown
}

/** 主题引用，指向 styles.json 中的主题定义。 */
export interface ThemeRef {
  id: string
}

export interface DocumentSnapshot {
  schemaVersion: string
  documentId: string
  revision: number
  activeSheetId: string
  sheets: SheetSnapshot[]
  relationships?: Relationship[]
  settings?: DocumentSettings
  theme?: ThemeRef
  extensions?: Record<string, unknown>
}

export interface DocumentSummary {
  documentId: string
  revision: number
  activeSheetId: string
  sheetCount: number
  topicCount: number
  rootTopicText: string
}

export interface DocumentRepairReport {
  sourcePath: string
  destinationPath: string
  repairedAtMs: number
  changes: string[]
}

export interface DocumentSessionSnapshot {
  document: DocumentSnapshot
  summary: DocumentSummary
  canUndo: boolean
  canRedo: boolean
  nextUndoAction: string | null
  nextRedoAction: string | null
  activeTopicId: string
  filePath: string | null
  lastSavedAtMs: number | null
  lastAutosavedAtMs: number | null
  hasUnsavedChanges: boolean
  recoveredFromAutosave: boolean
  repairReport: DocumentRepairReport | null
}

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'error'
