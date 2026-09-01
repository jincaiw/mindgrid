# MindGrid × XMind/MindNode 对标评估与第三轮优化重构方案

> 日期：2026-07-31
> 前置：第一轮视觉对标（批次 1-6）、第二轮交互对标（批次 7-11）已完成，见同目录前两份计划。
> 本轮目标：清理调试残留、修复破损样式、富内容上画布、交互与快捷键全面对齐 XMind，达到 XMind 级用户体验。

---

## 一、对标评估总览

### 1.1 功能矩阵（MindGrid vs XMind vs MindNode）

| 能力域 | XMind | MindNode | MindGrid 现状 | 差距评级 |
|--------|-------|----------|--------------|---------|
| 导图结构 | 9 种（含括号图/矩阵/树表格，且**分支级混用**） | 4 种布局方向 | 6 种（mindmap/logic/tree/org/fishbone/timeline），仅整图切换 | 🟡 够用，缺分支级混用 |
| 多 Sheet | ✅ 底部标签栏 | ✅ | ✅ 完整（左侧栏管理） | 🟢 对齐，入口位置待优化 |
| 主题/模板 | 54 骨架 + 配色系统 | Dynamic Themes | 5 主题 + 6 模板 | 🟡 数量少，机制已通 |
| 节点样式 | 31 种形状/富文本/边框/线型 | 10 种形状 | 仅 填充/文字/边框三色 | 🔴 薄 |
| 标记 Marker | 图标库（优先级/进度/任务…） | 250+ 贴纸 | 数据层有，**画布零渲染、手填文本** | 🔴 能存不能看 |
| 标签 Label | ✅ 画布渲染 | ✅ Visual Tags | 数据层有，**画布零渲染** | 🔴 |
| 备注 Note | ✅ 图标+悬浮预览 | ✅ | Inspector 可编辑，画布无指示 | 🔴 |
| 超链接 | ✅ 图标+点击打开+主题链接 | ✅ | 可保存，画布无图标不可点 | 🔴 |
| 任务 Task | ✅ 进度图标 | ✅ 勾选+提醒事项同步 | 数据层有，画布零渲染 | 🔴 |
| 图片/附件 | ✅ | ✅ | 仅类型定义，无 UI 无命令 | 🔴 缺失 |
| 浮动主题 | ✅ 双击空白创建 | ✅ | ❌ 无概念 | 🔴 缺失 |
| 标注 Callout | ✅ | — | ❌ 缺失 | 🟡 |
| 关系线 | ✅ 拖拽创建+4 线型+11 端点 | ✅ Connections | ✅ 渲染完整，仅 Inspector 表单创建 | 🟡 创建方式简陋 |
| 边界/概要 | ✅ 多形状 | — | ✅ 完整 | 🟢 |
| 大纲 Outliner | ✅ 独立视图可导出 | ✅ 双向编辑 | ✅ 侧栏大纲（含 DnD，精致） | 🟢 可再升级为全屏视图 |
| 演示模式 | Pitch（3 种节奏） | — | ✅ 完整（渐进揭示+聚焦） | 🟢 |
| ZEN 模式 | ✅ 四档外观 | ✅ Focus Mode | ✅ 有 | 🟢 |
| 撤销/重做 | ✅ | ✅ | ✅ 带动作标签 | 🟢 |
| 剪切 Cut | ✅ | ✅ | ❌ 仅复制/粘贴 | 🟡 |
| Cmd+D 复制主题 | ✅ | ✅ | ❌ | 🟡 |
| 搜索替换 | ✅ 查找+替换 | ✅ | ✅ 仅查找 | 🟡 替换缺失 |
| 导入 | .xmind/MindManager/FreeMind/MindNode/MD/OPML… | OPML/MD/文本 | MD/OPML | 🟡 |
| 导出 | PNG/JPEG/SVG/PDF/Excel/Word/PPT/OPML/MD | PDF/SVG/PNG/MD/OPML… | MD/OPML/PNG/SVG | 🟡 缺 PDF |
| 暗色 UI 主题 | ✅ | ✅ 跟随系统 | ❌ 仅画布主题有暗色 | 🟡 |
| 快捷键自定义 | ✅ | 部分 | ❌ 分散硬编码 | 🟢 可后置 |

### 1.2 本轮发现的 P0 级破损（线上 UI 正在发生）

1. **一批 CSS 类有 JSX 使用但零样式定义**：`.toolbar__button`（画布上方 5 个操作按钮 + Inline Editor 按钮 + 空态按钮，共 19 处）、`.panel__actions`、`.panel__eyebrow`、`.panel__title`（sidebar/inspector/template-picker 共 30+ 处）——全部渲染为浏览器默认样式，属第一轮工具栏重构的回归。
2. **暗色残留对比度 bug**（浅色主题下近乎不可读）：`.status-bar__record-item`（白字压 12% 蓝底）、`.outline-card__badge`、`.panel__chip`、`.panel__action` hover/primary、`.toast-region`（暗色玫瑰色系）。
3. **演示快捷键未接线**：工具栏 tooltip 宣称 Shift+Cmd+P，全库无对应 handler。
4. **调试脚手架常驻线上界面**：画布顶部"剪贴板状态横条 + 5 个无样式按钮"（`canvas-host.tsx:1928-1984`）、右侧 `editor-rail`（重复大纲 + Inline Editor + 文档 ID/修订号 stats，`canvas-host.tsx:2035-2116`）、左侧栏底部 Session 调试块（`sidebar.tsx:1280`）、状态栏 9 组调试字段。XMind 画布即主体，无任何包裹说明。

### 1.3 P1 级结构性差距（vs XMind "画布优先"）

- **画布被 chrome 包围**：32px 大圆角外框 + 三层背景（host 渐变 + texture 线网格 + scene 渐变 + 48px 线网格）。XMind 为纯色浅灰（≈`#F5F5F7`）无网格。
- **工具栏缺核心动作**：无"新建子主题/同级/删除/结构切换/主题/搜索/面板开关"，XMind 工具栏以节点操作为主。
- **富内容零渲染**：marker/label/note/link/task 编辑后在图上无反馈（最大体验落差）。
- **节点交互态过重**：hover 抬升+加重阴影（规范要求仅轻微背景变化）；选中态大阴影"发光"（XMind 为 2px 蓝色描边）。
- **框选手势反习惯**：需 Shift+拖拽；XMind 空白处左键拖即框选。
- **尺寸偏差**：Toolbar 48（规范 52）/ Sidebar 240（规范 280 不可调）/ Inspector 300（规范 320 不可隐）。
- Minimap 常开无开关；无网格开关；无暗色 UI。

### 1.4 交互/快捷键差距（vs XMind 快捷键体系）

| 快捷键 | XMind | MindGrid |
|--------|-------|---------|
| 前插同级 | Shift+Enter | ❌ |
| 父主题 | Cmd+Enter | ❌（Cmd+Enter 现为提交编辑，编辑态应改为 Enter 提交 / Shift+Enter 换行） |
| 同级排序 | Alt+↑↓ | ❌ |
| 折叠/展开 | Cmd+/（Space 为平移） | Space（与 XMind 平移手势冲突） |
| 复制样式/粘贴样式 | Alt+Cmd+C / V | ❌ |
| 显示/隐藏格式面板 | Cmd+I | ❌ |
| 回到中心主题 | Cmd+R | ❌ |
| 演示模式 | Shift+Cmd+P（tooltip 宣称） | ❌ 未接线 |
| 双击空白建浮动主题 | ✅ | ❌ |
| 三击选中文本 | ✅ | ❌ |

---

## 二、优化方案（批次 12-20）

> 原则：先修破损（12），再画布优先重构（13-15），然后富内容上画布（16），交互补齐（17），样式系统深化（18），组织与外观（19-20）。每批次交付后跑 `pnpm build && pnpm test && pnpm lint`。

### 批次 12：P0 破损修复 🔴

**目标**：消除所有"浏览器默认样式"与对比度 bug。

- `src/styles/global.css`
  - 补 `.toolbar__button` / `.toolbar__button--primary`（或批量改为既有 `.scene-toolbar__button`，二选一，优先复用）；补 `.panel__actions`（flex 行容器）、`.panel__eyebrow`（11px/大写/secondary 色/字距）、`.panel__title`（13px/600）。
  - 修对比度：`.status-bar__record-item`、`.outline-card__badge`、`.panel__chip`、`.panel__action:hover`、`.panel__action--primary`、`.toast-region` 全部改用 token（`--color-text-primary` / `--color-accent` / `--color-surface-panel-strong`）。
- 接线演示快捷键 Shift+Cmd+P（`workspace-screen.tsx` keydown），或若与设计冲突则修正 toolbar tooltip。

**验收**：页面无默认样式按钮；所有文字对比度 ≥ 4.5:1；Shift+Cmd+P 进入演示。

### 批次 13：画布优先 UI 重构 🔴（像素级对标 XMind 核心）

**目标**：画布即主体，移除一切调试 chrome，画布视觉扁平纯净。

- `canvas-host.tsx`：删除 `canvas-stage__hero`（剪贴板横条 + 5 按钮，功能已由右键菜单/快捷键/批次 14 工具栏覆盖）与整个 `editor-rail`（重复大纲/Inline Editor/stats）；剪贴板异常提示改走既有 Toast。
- `sidebar.tsx`：删除底部 Session 调试块。
- `status-bar.tsx`：精简为 状态/文档名/画布名/选中数 + 最近动作；移除 topicId/撤销栈/修复/恢复快照等调试字段（调试信息折叠进悬停 title 或彻底移除）。
- `global.css`：
  - `.canvas-host` 去 `border-radius:32px`、去渐变；`.canvas-host__texture` 与 `.mindmap-scene::before` 线网格默认隐藏（保留类，加 `canvas-host--grid-on` 开关，默认关）。
  - `style-constants.ts` Canvas 背景改纯色 token 色。
  - 清理死 CSS（`.mindmap-edge`、`.mindmap-scene__links`、`.scene-meta*`、`.canvas-stage__description` 等）。
- 布局尺寸对齐规范：`workspace-shell` 52px 行高；sidebar 280px；inspector 320px。

**验收**：默认界面 = 工具栏 + 侧栏 + 纯净画布 + 检查器 + 精简状态栏；无任何 ID/修订号/剪贴板调试文字。

### 批次 14：工具栏 XMind 化 🔴

**目标**：工具栏覆盖 XMind 核心动作流（主题操作 + 插入 + 结构/主题 + 视图）。

- `toolbar.tsx` 重排：
  - 左区：文件菜单（新建/打开/保存/另存/导入/导出，收敛为图标+下拉）。
  - 中区（新增）：子主题(Tab)、同级(Enter)、删除(Delete)｜插入下拉：关系线/边界/概要/备注/标签/链接/标记｜结构切换下拉（6 布局）｜主题下拉（5 主题）。
  - 右区：搜索(Cmd+F)、大纲显隐、检查器显隐(Cmd+I)、ZEN(Cmd+.)、演示(Shift+Cmd+P)。
- 全部图标按钮带 "名称 (快捷键)" tooltip；禁用态逻辑与右键菜单一致。
- 插入类动作先复用 Inspector 现有 IPC 命令（不新增后端能力）。

**验收**：不打开侧栏/检查器即可完成 建节点/删除/换结构/换主题/加备注标签链接 全流程。

### 批次 15：节点视觉与交互态精修 🔴

- `global.css` `.mindmap-node`：hover 去 `translateY(-1px)` 与加重阴影 → 仅 `filter: brightness(0.98)` 或浅底色变化；选中态改 2px `outline`（`--color-accent`）+ 去掉大发光阴影；active 合并为同一描边语言。
- 折叠 toggle：由节点右上角移至节点下缘/连线起点侧（XMind 式，depth0 右缘/下缘按布局方向），缩小至 16px，白底灰边。
- 节点出现动画保留 120–180ms，禁弹跳（对齐 02 原则）。

### 批次 16：富内容上画布 🔴（最大体验缺口）

数据层与 IPC 已齐备，本批次只做"渲染 + 选择器 + 打开"：

- `scene-builder.ts` / `canvas-host.tsx` 节点 meta 区（文本左侧图标行）：
  - **Marker**：内置图标集（优先级 1-9、进度 0-100%、任务/星标/旗帜等，SVG data URI 或内联 symbol），节点上按序渲染；Inspector 逗号文本框 → 网格图标选择器（popover）。
  - **Label**：节点文本下方胶囊渲染（最多展示 3 个 + "+n"）。
  - **Note**：文本右侧便签图标；hover 浮层预览前 200 字。
  - **Hyperlink**：链接图标；点击（非编辑态）调 `open`（`@tauri-apps/plugin-shell` 需新增依赖，或 IPC 走 Rust `open` crate——先确认 src-tauri 是否已有 opener 能力，没有则用最小方式新增）。
  - **Task**：节点左侧复选框/进度图标（todo/doing/done + priority 色）。
- 剪切：`topic-clipboard.ts` 增加 cut（复制 + 删除原节点，撤销标签"剪切主题"）；快捷键 Cmd+X、右键菜单项。
- Cmd+D 复制主题（duplicate：复制为同级紧随，撤销标签"复制主题"）。

**验收**：在 Inspector 设置 marker/label/note/link/task 后画布即时可见；链接可点击打开；Cmd+X/D 可用且可撤销。

### 批次 17：交互与快捷键补齐 🟡

- 空白左键拖拽 = 框选（对齐 XMind）；平移迁移到 中键拖拽 / Space+拖拽 / 双指滚动（现有滚轮平移保留）。Shift+拖拽保留为兼容。
- 内联编辑对齐 XMind：编辑态 Enter 提交、Shift+Enter 换行；非编辑态 Cmd+Enter 建父主题、Shift+Enter 前插同级。
- Alt+↑↓ 同级内移动（复用 sidebar 现有 move up/down 命令）。
- Cmd+/ 折叠切换（保留 Space 为兼容，tooltip 标注两者）。
- Cmd+I 检查器显隐；Cmd+R 回到中心主题（相机动画聚焦根节点）。
- 三击选中编辑框全文。
- 双击空白 = 创建浮动主题（**需要数据模型支持 floating topic**：`TopicSnapshot` 已有 `layoutHints`，根级 floating 节点挂在 sheet 特殊容器下；布局引擎跳过，坐标来自 layoutHints；拖拽可吸附为子主题）。拆为子批次 17b。

### 批次 17b：浮动主题（拆分） 🟡

- 双击空白 = 创建浮动主题：需扩展 `TopicSnapshot.layoutHints`（已有字段）为浮动容器，sheet 持有 floating roots 列表；布局引擎跳过 floating 节点坐标；DOM/Canvas 渲染按 layoutHints 绝对定位；拖拽 floating 节点到普通主题上吸附为子主题。
- 后端：新增 `create_floating_topic` 命令（在活动 sheet 创建 floating root，初始坐标来自双击点世界坐标）。
- 撤销/重做、SVG 导出、minimap 同步支持 floating 节点。

### 批次 18：样式系统深化 🟡

- `TopicStyleOverrides` 扩展：`shape`（rounded/rect/pill/underline/none）、`fontSize`、`fontWeight`、`borderWidth`；`style-resolver`/`svg-renderer`/DOM 节点同步支持；Inspector 样式区重构（形状选择器 + 字号步进 + 加粗按钮）。
- 复制/粘贴样式：Alt+Cmd+C / Alt+Cmd+V（会话内 styleRef 快照）。
- 分支样式：Inspector 画布 Tab 增加 线形（曲线/直线/折线）/粗细/分支色板 设置（写入 theme 或 sheet 级覆盖）。
- 修复 token 违规：global.css 硬编码色值归拢到 tokens.css；补齐 `--color-surface-elevated` 等被引用但未定义的 token；画布字体栈补 CJK。

### 批次 19：组织与面板 🟢

- Inspector：Cmd+I 显隐（与批次 17 同一 handler）；tab 结构向 XMind 靠拢：样式 / 图标（marker）/ 任务备注链接 / 画布。
- Sheet 管理入口下移为画布底部标签栏（XMind 式，保留侧栏管理面板）。
- Minimap 开关（状态栏或视图菜单，默认开、可关且记忆）。
- 大纲全屏视图（Outliner 模式：隐藏画布，全宽 topic-tree 编辑）。

### 批次 20：外观与其他 🟢（可后置）

- 暗色 UI 主题 + `prefers-color-scheme` 跟随（tokens.css 双套变量）。
- 导出 PDF（前端离屏 SVG → 打印/写盘，评估 Tauri 能力后选型）。
- 窗口 `titleBarStyle: overlay`（macOS 红绿灯融合，可选）。
- 快捷键集中注册表（`src/features/shortcuts/`），为将来自定义做准备。

---

## 三、执行与验收

- 每批次由独立改动集交付，交付物：代码 + 本文件对应批次勾选 + `pnpm build && pnpm test && pnpm lint` 全绿。
- 不破坏既有 51 个 IPC 命令与 .mgd 格式兼容（新增字段均为可选）。
- 优先级：12 → 13 → 14 → 15 → 16 → 17 为达成"XMind 级体验"的必做主线；18-20 按余量推进。

## 四、进度

- [x] 评估与方案输出（本轮）
- [x] 批次 12：P0 破损修复
- [x] 批次 13：画布优先 UI 重构
- [x] 批次 14：工具栏 XMind 化
- [x] 批次 15：节点视觉与交互态精修
- [x] 批次 16：富内容上画布（marker/label/note/link/task DOM 渲染 + MarkerSelector popover + 链接打开 + Cmd+X 剪切 + Cmd+D 复制 + SVG 导出对齐）
- [x] 批次 17：交互与快捷键补齐（空白左键拖拽框选 + 中键/Space 平移 + Cmd+Enter 建父主题 + Shift+Enter 前插同级 + Alt+↑↓ 排序 + Cmd+/ 折叠 + Cmd+R 回中心 + 三击选中 + 编辑态 Enter 提交/Shift+Enter 换行）
- [x] 批次 17b：浮动主题（双击空白创建 + 数据模型扩展 + 布局合并 + 命令注册 + IPC 接线 + 删除/重命名/富字段编辑 + 撤销重做 + 测试）
- [x] 批次 18：样式系统深化（TopicStyleOverrides 扩展 shape/fontSize/fontWeight/borderWidth + DOM/Canvas/SVG 三端同步 + Inspector 样式区重构 + Alt+Cmd+C/V 复制粘贴样式 + SheetBranchStyle 分支样式数据模型与渲染 + 画布 Tab 线形/粗细/色板控件 + token 归拢与 CJK 字体栈）
- [x] 批次 19：组织与面板（Cmd+I 检查器显隐 + 画布底部 Sheet 标签栏：单击切换/双击重命名/右键删除与左右移动/+新建 + 大纲全屏视图：隐藏画布全宽编辑主题树、操作栏增删排序、键盘 ArrowUp/Down 导航、Tab/Enter/Delete、Esc 返回 + Minimap 开关 localStorage 持久化）
  - 后续可选：Inspector tab 进一步细分（样式 / 图标 / 任务备注链接 / 画布），当前 4-tab（主题/画布/关系线/分组）已与 XMind 方向对齐，富内容编辑集中在「主题」tab，进一步拆分为低优先级细化项。
- [x] 批次 20：外观与其他
  - 暗色 UI 主题：tokens.css 双套变量 + `prefers-color-scheme` 跟随 + 工具栏三态切换（system/light/dark）+ localStorage 持久化 + 硬编码 rgba 归拢
  - 导出 PDF：jsPDF + svg2pdf.js 将 Scene→SVG→矢量 PDF，工具栏导出菜单接入，IPC `export_pdf_file` 写盘
  - 快捷键集中注册表：`src/features/shortcuts/`（registry/match/help），20+ 快捷键声明式注册，工具栏浮层帮助面板
  - 后续可选：窗口 `titleBarStyle: overlay`（macOS 红绿灯融合，非必做，未实现）
