# MindGrid 对标 XMind/MindNode 优化 — 任务总览（2026-09-02）

## 完成内容
1. **对标评估报告**（`12-对标评估-XMind-MindNode与UI优化方案.md`）
   - 功能矩阵：MindGrid 已覆盖 XMind 约 80% 核心能力；缺失项为括号图/矩阵图/气泡图、Word 导入（原列 P2，本轮全部补齐）。
   - UI 像素级差距清单 U1-U10：核心问题是"浮动圆角面板"风格 vs XMind"贴合式扁平布局"。
2. **P0 UI 优化已实施**
   - 贴合式扁平布局：44px 工具栏、36px 顶部 Sheet 标签栏、28px 状态栏，通栏相接、发丝线分隔、去圆角/投影/间隙。
   - Sheet 标签栏从画布底部移至工具栏正下方，标签改为 XMind 式胶囊，右键菜单改向下弹出。
   - 主色全量切换为 XMind 蓝 #2D7FF9（暗色 #6F9DFF），清除全部硬编码旧蓝色与渐变按钮。
   - 侧栏/检查器改白底贴合 + 发丝线；画布去描边；大纲视图扁平化。
3. **P1 UI 优化已实施**
   - 下拉菜单 / 右键菜单 / Sheet 标签菜单纯色化：纯白表面 + 发丝线 + 轻投影，去除毛玻璃。
   - 检查器面板 tabs 与卡片贴白底，卡片圆角统一 8px；暗色主题经 token 引用自动适配。
4. **检查器信息架构重排已实施（XMind 格式面板式）**
   - 8 个分区改造为 `PanelSection` 可折叠分区（aria-expanded 折叠头，默认展开）。
5. **三种新结构布局已实施（结构选项从 6 种扩至 9 种）**
   - 括号图 Brace：肘形大括号连线、右侧纵向分列。
   - 矩阵图 Matrix：根=行表头、一级子主题=等宽列表头、后代纵向平铺、直角连线。
   - 气泡图 Bubble：根居中、BFS 分层同心环、按叶子数分配弧度、直连线。
   - `ChartType` 全链路同步（TS 联合类型 / 浏览器校验 / Rust serde 枚举 / parse_chart_type）。
6. **Word (.docx) 导入已实施**
   - Rust 端解压解析 `word/document.xml`：Heading1→画布标题、Heading2-6→主题层级、正文挂最近标题下；兼容英文（Heading1）与中文 Word（"1"）样式 ID。
   - 全链路接入：`import_docx_file` 命令 + `importDocxOutline` 会话 + 工具栏「从 Word 导入」；浏览器开发态给出桌面版提示。
7. **模板库扩充已实施**：新增头脑风暴/周报/OKR 规划/学习计划/旅行计划 5 个模板（共 11 个）。
8. **画布设置区已实施（XMind 格式面板）**
   - 检查器画布 tab 新增「画布设置」分区：「显示网格」开关（XMind 默认无网格）。
   - 全链路持久化：Rust `set_document_setting`（写入 `settings` 键值、视图偏好不入撤销栈）→ TS 会话 `setDocumentSetting` → CanvasHost `showGrid` 属性 → 网格纹理。
   - 图标栅格复核：全部图标经共享 IconBase（24px viewBox / 1.5px stroke）已统一。
9. **甘特图视图已实施（批次 23，功能矩阵最后一项）**
   - `TopicTask` 新增 `startDateMs`（TS + Rust serde 可选，向后兼容）；检查器任务区新增「开始日期」输入（onBlur 提交）。
   - 新增 `src/features/gantt/`：`collect-gantt-tasks.ts`（跨画布任务收集、路径生成、start>end 交换、UTC 日界归一化、时间轴范围计算）+ `gantt-view.tsx` 全屏视图（按画布分组、日列网格、start→due 状态配色条形、今日标记、行点击选中主题、Esc 返回）。
   - 接线：workspace-screen `isGanttMode` 状态 + Esc 兜底、工具栏甘特图切换按钮（CalendarIcon）、`workspace-shell--gantt` 样式。
10. **甘特图增强已实施（批次 24）**
    - 日/周/月粒度切换（dayWidth 32/12/5，月粒度仅每月 1 日打标签）。
    - 条形拖拽整体平移任务日期：pointer capture + 4px 阈值区分点击，pointerUp 提交 `setTopicTask`（走撤销栈），纯函数 `applyGanttDragDelta` 换算，抑制合成 click 双触发。
    - 逾期标记：未完成且截止早于今天 → 红色描边，aria/title 标注「已逾期」；条形 title 增加日期区间。
11. **甘特图深度交互已实施（批次 25）**
    - 条形两端缩放手柄：拖左缘改开始日期、拖右缘改截止日期，`applyGanttResize` clamp 不越过对端日期，提交走 `setTopicTask`（可撤销）。
    - 依赖箭头：复用文档关系线（`relationships`）绘制前置→后继肘形折线（SVG overlay，pointer-events none），悬停手柄显形、ew-resize 光标。
12. **甘特图 SVG 导出已实施（批次 26）**
    - 新增 `export-gantt-svg.ts`：把甘特图布局确定性序列化为独立 SVG（日列网格、状态配色条形、逾期描边、今日标记、依赖箭头、XML 转义），复用视图同款纯函数。
    - 会话新增 `exportGanttImage`：save 对话框 → `exportSvgFile` IPC，默认名 `<文档名>-甘特图.svg`；浏览器开发态提示需桌面版。
    - 甘特图头部新增「导出 SVG」按钮。
13. **甘特图 PNG 导出与粒度快照已实施（批次 27，甘特图工作收尾）**
    - `buildGanttSvg` 支持日/周/月粒度（dayWidth 取 `GANTT_ZOOM_CONFIG`，标签频率与视图一致）。
    - 新增 `renderGanttSvgToPngBytes`：SVG → Blob URL → Image → canvas 2 倍采样白底 → PNG 字节。
    - 会话新增 `exportGanttPng`（save 对话框 → `exportPngFile`）；两个导出方法均携带当前视图粒度；头部新增「导出 PNG」按钮。

## 剩余项说明（均按产品取舍，不实现）
- Zettel 卡片盒视图：与思维导图产品定位差异大，保持取舍。
- .doc 旧格式导入：二进制格式需外部转换器，维持不支持（.docx 已支持）。

## 关键决策
- 新布局引擎复用 `layout-utils` 共享工具（estimateNodeSize/computeLayoutBounds/edge geometry），并统一遵守「根节点折叠仅呈现根主题」的边界约定（matrix 因此修复）。
- docx 导入复用 markdown 画布/主题树构建器（build_sheet_from_markdown），零新增领域概念；不支持 .doc 旧格式（zip+XML 仅适用 .docx）。
- 甘特图日期按 UTC 日界归一化（`floor(ms/86400000)`），与检查器 date input 的 `new Date('YYYY-MM-DD')` 解析语义一致，避免时区换算偏移；仅有截止日的任务渲染为单日条，start>end 自动交换。

## 验证（三绿门禁）
- `pnpm test`：461/461 通过（39 文件，甘特图共 31 个测试）。
- `pnpm build`：成功；`pnpm lint`：0 错误（16 条既有警告）。
- `cargo test`：95/95 通过（批次 24-27 未改 Rust，此前已验）。

## 结论
对标优化主线与全部可实施遗留项已收尾：P0/P1 UI、检查器 IA、三种新结构、Word 导入、模板扩充、画布设置、甘特图五批次（视图/增强/深度交互/SVG 导出/PNG 导出与粒度）。后续无待办。
