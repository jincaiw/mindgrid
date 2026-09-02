# 12 - XMind / MindNode 对标评估与 UI 优化方案

> 评估对象：MindGrid（Tauri 2 + React 19 桌面思维导图应用）
> 对标基准：XMind（2024/25 桌面版）、MindNode（macOS/iOS）
> 结论先行：**功能层 MindGrid 已覆盖 XMind 约 80% 核心能力，主要差距在 UI 观感层**——当前为“浮动圆角面板”风格，而 XMind 桌面端为“贴合式扁平布局”。本轮优先完成 P0 像素级 UI 对齐。

---

## 1. 功能对标矩阵

图例：✅ 已具备 · 🟡 部分具备 · ❌ 缺失

| 能力域 | XMind | MindNode | MindGrid 现状 | 差距与优先级 |
|---|---|---|---|---|
| 结构类型 | 9 种（导图/逻辑/树/组织/鱼骨/时间线/括号/矩阵/气泡） | 导图/逻辑/树 | ✅ 6 种 | 括号图/矩阵/气泡缺失 → **P2** |
| 富内容（备注/标签/超链接/标记/任务/图片） | ✅ | ✅ | ✅ 全部具备 | 对齐 |
| 关系线 / 边界 / 概要 | ✅ | ✅（概要为手建节点） | ✅ | 对齐 |
| 多画布 Sheet | ✅ 顶部标签 | ❌ | ✅ 但标签在**底部** | 位置需移到顶部 → **P0** |
| 大纲模式 | ✅ | ✅ | ✅（Outliner 全屏视图） | 对齐 |
| 演示模式 | ✅（逐分支揭示） | ❌ | ✅（DFS 渐进揭示 + 相机跟随） | 对齐 |
| 专注模式 Zen | ✅ | ✅ | ✅ | 对齐 |
| 搜索 / 快捷键帮助 | ✅ | ✅ | ✅ | 对齐 |
| 模板系统 | ✅ 丰富 | ✅ | ✅ 内置模板 | 数量与质量可扩充 → P2 |
| 主题色板 / 样式面板 | ✅ 强 | ✅ | ✅ 5 套 + 节点覆盖 | 面板信息架构需对齐 XMind → **P1** |
| 导入导出 | MD/OPML/Word/PNG/SVG/PDF | MD/OPML/PNG/SVG/PDF | ✅ MD/OPML/PNG/SVG/PDF | Word 导入缺失 → P2 |
| 甘特图 / Zettel | ✅ | ✅ 甘特图（批次 23） | ❌ Zettel | 甘特图已对齐；Zettel 按产品取舍 |
| 文件格式健壮性 | .xmind | - | ✅ .mgd（ZIP+JSON、原子保存、CLI 工具） | **超出对标项** |
| 性能 | - | - | ✅ 10k 节点 <3s | **超出对标项** |

## 2. UI 像素级差距清单（XMind 桌面端为基准）

| # | 维度 | XMind 基准 | MindGrid 现状 | 优先级 |
|---|---|---|---|---|
| U1 | 整体布局 | 贴合式：工具栏/侧栏/画布/状态栏通栏相接，仅以 1px 发丝线分隔，无间隙、无圆角、无投影 | 浮动圆角面板 + 8px 间隙 + 毛玻璃投影 | **P0** |
| U2 | Sheet 标签栏 | 工具栏正下方一行，胶囊标签，active 高亮 | 位于画布底部 | **P0** |
| U3 | 主色 | 品牌蓝 #2D7FF9，纯色按钮（无渐变） | #5B8CFF + 渐变主按钮 | **P0** |
| U4 | 工具栏 | 高度 ~44px，图标按钮 28px，6px 圆角，分组以细竖线分隔 | 52px 高、32px 按钮、8px 圆角 | **P0** |
| U5 | 状态栏 | 底部通栏细条（~28px），发丝线上边框 | 浮动圆角条带边距 | **P0** |
| U6 | 画布 | 浅灰纯色 #F7F7F8，无描边 | 与背景同色但带描边+投影 | **P0** |
| U7 | 格式/检查器面板 | 白底贴合右栏，分区折叠，段落式排版 | 半透明玻璃面板 | **P1** |
| U8 | 右键菜单/下拉 | 纯白、hairline 边、轻投影 | 已接近（微调） | P1 |
| U9 | 暗色主题 | 深灰 #1E1F22 系 | 已具备，随 P0 令牌同步调整 | P1 |
| U10 | 图标语言 | 线性、1.5px stroke、24px 栅格 | 已线性图标（保持） | P1 |

## 3. 优化方案与实施计划

### P0（本轮实施 —— 像素级对齐 XMind 扁平布局）
1. **贴合式布局**：去除 `workspace-shell` 内边距与间隙，工具栏 44px / Sheet 栏 36px / 状态栏 28px 通栏；侧栏、检查器、画布以 1px 发丝线相接，去圆角与投影。
2. **Sheet 标签栏移至顶部**（工具栏正下方），改为 XMind 式胶囊标签。
3. **主色对齐**：accent 全量切换为 XMind 蓝 `#2D7FF9`（暗色 `#6F9DFF`），清除所有硬编码旧蓝色值（`#5B8CFF`/`rgba(91,140,255,*)`/`rgba(59,130,246,*)`/渐变），主按钮改纯色。
4. **工具栏/状态栏细节**：图标按钮 28×28、圆角 6px；状态栏改 28px 细条；画布去描边。

### P1（下一轮）
- 检查器面板信息架构对齐 XMind 格式面板（分区折叠、层级样式入口、画布设置区）。—— 分区折叠与画布设置区已完成；层级样式入口沿用现有样式体系（样式覆盖已支持），不再单列。
- ~~右键菜单与下拉纯色化、暗色令牌复核。~~ 已完成。
- ~~图标栅格统一 24px/1.5px stroke 复核。~~ 已复核：icons.tsx 全部图标经共享 IconBase 输出（viewBox 0 0 24 24 / strokeWidth 1.5），已统一，无需修改。

### P2（远期）
- 结构扩展：括号图、矩阵图、气泡图。
- Word (.docx) 导入；模板库扩充。
- ~~甘特图/关系网视图（按产品取舍）。~~ → 甘特图已落地（批次 23）；Zettel 卡片盒视图按产品取舍，暂不实现。

## 4. 风险与回归策略

- 全部 UI 改动集中在 `src/styles/global.css`、`src/styles/tokens.css` 与 `workspace-screen.tsx`（仅移动 SheetTabBar 渲染位置）。
- 现有 299 个前端单测均以 role/label/aria 查询，不受纯样式改动影响；`pnpm test + pnpm build` 三绿为门禁。
- P0 不触碰领域层与画布运行时，性能回归风险为零。

## 5. 实施记录

- [x] P0 已实施（2026-09-02）：贴合式布局、Sheet 标签移顶、#2D7FF9 主色全量切换、工具栏/状态栏像素级调整。
- [x] P1 已实施（2026-09-02）：下拉菜单/右键菜单/Sheet 标签菜单纯色化（纯白 + 发丝线 + 轻投影，去毛玻璃）；检查器面板 tabs 与卡片贴白底、卡片圆角统一 8px；残留玻璃面（重命名输入框等）统一为纯色表面；暗色主题经 token 引用自动适配。
- [x] 检查器信息架构重排已实施（2026-09-02）：8 个分区（主题属性/富内容编辑/跨画布移动/画布信息/文档主题/分支样式/关系线/边界与概要）改造为 XMind 格式面板式 `PanelSection` 折叠分区（默认展开，支持 aria-expanded 折叠头）。
- [x] P2 结构扩展已实施（2026-09-02）：新增括号图（Brace，肘形大括号连线）、矩阵图（Matrix，根=行表头+一级子主题=列表头+后代平铺）、气泡图（Bubble，同心环按叶子数分弧）三种布局引擎；`ChartType` 全链路（TS 联合类型/浏览器校验/Rust serde 枚举/parse_chart_type）同步扩展；结构菜单与侧栏选项新增 3 项（共 9 种）。
- [x] Word (.docx) 导入已实施（2026-09-02）：Rust 端解压解析 `word/document.xml`（Heading1→画布标题、Heading2-6→主题层级、正文段落挂于最近标题之下，兼容英文/中文 Word 样式 ID）；接入 Tauri 命令 `import_docx_file` + TS 会话 `importDocxOutline` + 工具栏「从 Word 导入」菜单。
- [x] 模板库扩充已实施（2026-09-02）：新增头脑风暴/周报/OKR 规划/学习计划/旅行计划 5 个内置模板（共 11 个）。
- [x] 全量验证（2026-09-02）：`pnpm test` 426/426 通过（36 文件）；`pnpm build` 成功；`pnpm lint` 0 错误（16 条既有警告）；`cargo test` 94/94 通过（含 7 个新增 docx 导入测试）。
- [x] 画布设置区已实施（2026-09-02）：检查器画布 tab 新增「画布设置」分区，提供「显示网格」开关（XMind 默认无网格）。全链路持久化：Rust `DocumentSession::set_document_setting`（写入 `settings` 自由键值、不入撤销栈）+ `set_document_setting` 命令 + TS `setDocumentSetting` 会话 + CanvasHost `showGrid` 属性 → `canvas-host--grid-on` 网格纹理。图标栅格复核确认已统一（24px/1.5px 共享 IconBase）。
- [x] 追加验证（2026-09-02）：`pnpm test` 36 文件全过；`pnpm build` 成功；`pnpm lint` 0 错误；`cargo test` 95/95（新增 set_document_setting 测试）。
- [x] 甘特图视图已实施（2026-09-02，批次 23）：`TopicTask` 新增 `startDateMs`（TS + Rust serde 可选字段，向后兼容）；检查器任务区新增「开始日期」输入（与截止日期相同的 onBlur 提交模式）；新增 `src/features/gantt/`（`collect-gantt-tasks.ts` 跨画布任务收集/时间轴范围计算 + `gantt-view.tsx` 全屏视图：按画布分组、日列网格、start→due 状态配色条形、今日标记、行点击选中主题、Esc 返回）；工具栏新增甘特图切换按钮（CalendarIcon）。日期按 UTC 日界归一化，与 date input 解析语义一致。
- [x] 终验（2026-09-02）：`pnpm test` 436/436 通过（38 文件，含甘特图 6 个新测试）；`pnpm build` 成功；`pnpm lint` 0 错误（16 条既有警告）；`cargo test` 95/95。功能矩阵仅剩 Zettel 视图按产品取舍。
- [x] 甘特图增强已实施（2026-09-02，批次 24）：① 日/周/月粒度切换（`GANTT_ZOOM_CONFIG` 三档 dayWidth 32/12/5，月粒度仅每月 1 日打标签）；② 条形拖拽整体平移（pointer capture + 4px 阈值区分点击，`applyGanttDragDelta` 纯函数换算，pointerUp 提交 `setTopicTask` 走撤销栈，抑制合成 click 双触发）；③ 逾期标记（未完成且截止早于今天 → 红色描边 + aria/ title 标注）。条形 title 增加日期区间。
- [x] 甘特图深度交互已实施（2026-09-02，批次 25）：① 条形两端缩放手柄（拖左缘改开始、拖右缘改截止，`applyGanttResize` clamp 至不越过对端日期，提交同样走撤销栈）；② 依赖箭头（复用文档关系线 `relationships`，前置右缘 → 水平伸出 → 垂直 → 后继左缘的肘形折线 + 箭头，SVG overlay 不拦截交互，后继早于前置时目标点不回退）。
- [x] 甘特图 SVG 导出已实施（2026-09-02，批次 26）：新增 `export-gantt-svg.ts`（甘特图布局确定性序列化为独立 SVG：日列网格/状态配色条形/逾期描边/今日标记/依赖箭头/XML 转义）；会话新增 `exportGanttImage`（save 对话框 → `exportSvgFile`，默认名 `<文档名>-甘特图.svg`，浏览器开发态提示需桌面版）；甘特图头部新增「导出 SVG」按钮。
- [x] 甘特图 PNG 导出与粒度快照已实施（2026-09-02，批次 27，甘特图工作收尾）：`buildGanttSvg` 支持 GanttZoom（dayWidth 取 `GANTT_ZOOM_CONFIG`，标签频率对齐视图：day 每日/week 每 7 天/month 仅每月 1 日）；新增 `renderGanttSvgToPngBytes`（Blob URL → Image → canvas 2 倍采样白底 → PNG bytes）；会话新增 `exportGanttPng`（save 对话框 → `exportPngFile`）；`exportGanttImage`/`exportGanttPng` 均携带当前视图粒度；头部新增「导出 PNG」按钮。
