# MindGrid × XMind 像素级对标评估与第四轮优化方案

> 日期：2026-09-01
> 前置：第一轮视觉对标（批次 1-6）、第二轮交互对标（批次 7-11）、第三轮功能对标（批次 12-20）已完成并提交。
> 本轮目标：**桌面 UI / 布局像素级参考 XMind**——在功能已基本对齐的前提下，对画布几何、连线、布局间距、应用 Chrome 做逐像素对照修正，并补齐剩余高价值功能缺口（图片主题）。

---

## 一、评估方法

- 盘点范围：`style-constants.ts`（画布像素常量）、`built-in-themes.ts`（5 套主题配色）、`canvas-renderer.ts`（连线/节点/装饰绘制）、`mindmap-layout.ts` + `layouts/*.ts`（布局间距）、`tokens.css` / `global.css`（Chrome 尺寸与节点 CSS）、`canvas-host.tsx`（DOM 节点内联样式解析）。
- 参照系：XMind（macOS 版，默认"经典"主题 + 平衡骨架）公开可查的默认参数与可观察行为；MindNode 作为交互质感参照。
- 评级口径：🟢 已像素级对齐 / 🟡 有量化差距需调参 / 🔴 结构性差距需重构。

---

## 二、现状盘点：已对齐项（前三轮成果，本轮不再动）

| 项 | 现状 | 评级 |
|---|---|---|
| 选中/激活态 | 2px `#5b8cff` 描边 + 2px offset，Canvas/DOM/大纲三端一致 | 🟢 |
| 节点阴影 | 轻量统一（blur 8 / offsetY 3），拖拽态加重（16/6），XMind 同款策略 | 🟢 |
| 深度分级圆角 | root 12 → L1 8 → L2+ 6 | 🟢 |
| 深度分级字重 | 600/600/500/400 | 🟢 |
| 连线端点 | `lineCap/lineJoin: round`，贝塞尔/直线/正交三折线型 | 🟢 |
| 分支配色 | 8 色色板按分支自动上色（XMind 彩虹分支） | 🟢 |
| 折叠按钮 | 16px 圆形白底，位于连线起点侧半嵌节点边 | 🟢 |
| 画布背景 | 纯色 `#f5f5f7` 无网格（网格默认隐藏，可开关） | 🟢 |
| 主题链路 | DOM 节点经 `resolveTopicStyle` 内联消费主题色，Canvas/SVG/PNG 三端一致 | 🟢 |
| Sheet 标签栏 | 毛玻璃浮条 + 下划线激活态 + 双击重命名 | 🟢 |
| ZEN / 大纲全屏 / 演示 / 快捷键帮助 / 暗色 UI | 均已落地 | 🟢 |

---

## 三、像素级差距清单（本轮处理对象）

### A. 节点几何与文字

| # | 位置 | 现状 | XMind 参照 | 评级 |
|---|---|---|---|---|
| A1 | `global.css:2386-2398` `.mindmap-node__editor` | 编辑态固定 `15px / 700`，**所有深度相同** | 编辑态与显示态字号字重完全一致，无跳变 | 🔴 进入编辑即跳动，根节点 18→15 最明显 |
| A2 | `style-constants.ts` `getTitleFontSize` | 根 18 / 600 | XMind 默认中心主题 ≈22px / 700，视觉权重明显更高 | 🟡 |
| A3 | `global.css:2160-2185` 节点 padding | 10×20 / 8×14 / 6×12 / 4×10 | XMind ≈ 10×16 / 8×12 / 6×10 / 4×8，整体更紧凑 | 🟡 |
| A4 | `mindmap-layout.ts:42-44` 布局间距 | ROOT_GAP 220 / DEPTH_GAP 178 / VERTICAL_GAP 26 | XMind 父子水平净距 ≈80-100px，同级垂直净距 ≈16-20px；MindGrid 图面稀疏约 40% | 🔴 影响全图观感，是"不像 XMind"的最大单因 |
| A5 | `wrapText` / 测量 | 节点宽度上限未设硬约束 | XMind 主题文本 ≈300px 强制换行 | 🟡 需确认上限常量 |

### B. 连线与配色

| # | 位置 | 现状 | XMind 参照 | 评级 |
|---|---|---|---|---|
| B1 | scene-builder 贝塞尔控制点 | 需核对 control1/control2 是否沿水平切线外推 | XMind S 曲线两端切线恒水平，弯曲度随距离自适应 | 🟡 核对后微调 |
| B2 | `BRANCH_COLORS` 8 色 | 自研色板（#5B8DEF 等） | XMind 默认 6 色，饱和度更低更"灰"（#4C92D9 系） | 🟡 提供 XMind 官方色板预设，保留现有色板 |
| B3 | 线宽梯度 | 2.5 / 2 / 1.5 / 1 | XMind ≈ 3 / 2 / 1.5 / 1 | 🟢 微调 root 档即可 |

### C. 应用 Chrome（桌面 UI 结构）

| # | 位置 | 现状 | XMind 参照 | 评级 |
|---|---|---|---|---|
| C1 | `global.css:34-47` `.workspace-shell` | **浮动圆角面板**：外 padding 8 + gap 8 + radius 12 + 毛玻璃边框 | XMind **贴边布局**：工具栏贴顶、无圆角外框、1px 细分割线、无 blur | 🔴 整体观感差异最大项，决定"第一眼像不像" |
| C2 | `.toolbar` | 高 52px，图标按钮 32×32 | XMind 主工具栏 ≈40-44px，图标 ≈24-28px | 🟡 |
| C3 | `.sheet-tab-bar` | 画布**底部**浮条，高 36px，无关闭 ×（菜单内关闭） | XMind 标签栏在画布**顶部**，高 ≈28-30px，标签 hover 出 × | 🟡 位置与交互都对齐 |
| C4 | `.workspace-shell__body` 侧栏 | 左侧栏 280px **固定常开** | XMind 左侧无常驻栏；格式面板由右上按钮开关（≈260px） | 🟡 增加折叠开关 + 记忆状态 |
| C5 | Inspector | 320px | XMind 格式面板 ≈260-280px | 🟡 微调 280px |
| C6 | `.mindmap-node:hover` | `filter: brightness(0.97)` 整体变暗 | XMind hover 无滤镜变化，仅浮现 toggle/快捷按钮 | 🟡 移除滤镜 |
| C7 | 缩放控件 | 右下浮条 | XMind 右下浮条 + 百分比点击重置 100% | 🟡 核对重置入口 |

### D. 功能缺口（对标 XMind/MindNode，本轮仅启动最高价值项）

| # | 项 | 现状 | 评级 |
|---|---|---|---|
| D1 | **主题图片** | Rust 端 SHA-256 去重/GC 资产管线完整但**零接线**：无 `set_topic_image` 命令，`TopicImage` 恒 `None`，无 UI | 🔴 最大功能缺口，工程量跨 Rust/TS/渲染三端，本轮完成接线 |
| D2 | 剪切 Cut / Cmd+D 复制主题 | 仅复制/粘贴 | 🟡 低工程量，顺入 |
| D3 | 搜索替换 | 仅查找 | 🟡 顺入 |

---

## 四、批次计划（21-28）

> 原则：先修跳动（21），再动观感最大的间距与 Chrome（22-25），然后交互细节（26-27），最后功能接线（28）。
> 每批次完成后跑 `pnpm vitest run` + `pnpm tsc --noEmit`（涉及 Rust 时加 `cargo test`），全部通过再进下一批。
> 像素类改动以"参数表 + 前后截图对比"验收，截图存入 `docs/superpowers/plans/assets/round4/`。

### 批次 21：编辑态排印失配修复（A1）🔴 ✅ 已完成

- 改动：`canvas-host.tsx` 编辑分支 textarea 增加 `style={titleStyle}`（复用 `resolvedStyle`，与显示态同源）；`global.css` 删除 `.mindmap-node__editor` 硬编码 `font-size:15px;font-weight:700`（保留 `line-height: 1.35`）。
- 连带修复：README 测试数更新为 **414 前端 / 87 Rust**（实测值，非计划中的 373/86）。
- 验收：逐深度进入编辑无文字跳动；vitest 414/414（36 文件）、tsc 0 错误。

### 批次 22：布局间距紧凑化（A4）🔴 ✅ 已完成

- 改动：`mindmap-layout.ts` → `ROOT_HORIZONTAL_GAP 220→160`、`DEPTH_HORIZONTAL_GAP 178→120`、`VERTICAL_GAP 26→18`、`LEAF_BLOCK 92→80`；`logic-layout.ts` → `COL_GAP 220→150`、`LEAF_BLOCK 92→80`、`ROW_GAP 26→18`；`tree-layout.ts` → `ROW_HEIGHT 140→104`、`SIBLING_GAP 40→28`；`org-layout.ts` → `ROW_HEIGHT 130→100`、`SIBLING_GAP 28→20`；`timeline-layout` 保持不动。
- 验收：全量 414 单测通过，无断言需放宽（间距改动未影响布局单测的硬断言）。

### 批次 23：节点几何微调（A2/A3/A5 + B3）✅ 已完成

- 改动：`style-constants.ts` → `getTitleFontSize` 根 18→20、`getTitleFontWeight` 根 600→700 且 L1 600 / L2 500 / L3+ 400；`getEdgeLineWidth` `childDepth <= 1` 档 2.5→3；`canvas-renderer.ts` `drawNodeText` padding 20/14/12 → 16/12/10（与 CSS 对齐）；`global.css` 节点 padding 分级 → 10×16 / 8×12 / 6×10 / 4×8，根节点标题 18px/600 → 20px/700。
- 验收：Canvas / DOM 两侧 padding 常量已同步；414 单测通过。

### 批次 24：连线与色板（B1/B2）✅ 已完成

- 核对结论：`mindmap-layout.ts:93-111` `createCurveGeometry` **已经是**水平切线贝塞尔（`controlOffset = Math.max(48, |endX-startX| * 0.42)`），符合 XMind 策略，**无需改动**。
- 改动：`inspector.tsx` `BRANCH_PALETTE_PRESETS` 新增 `xmind-classic`（XMind 经典 6 色 `#4C92D9 / #6FBF73 / #F6C344 / #E8764F / #C65D5D / #8E7CC3`），作为可选项插在 `cool` 之前，**不替换**现有 8 色板。
- 验收：Inspector 画布 Tab 可选新色板；单测通过。

### 批次 25：Chrome 贴边化重构（C1/C2）🔴 ✅ 已完成

- 改动（`global.css`）：`.workspace-shell` 去外 padding/gap/圆角/边框/blur → `grid-template-rows: 44px minmax(0,1fr)`；新增 `.workspace-shell__body` 三栏 `280px | minmax(0,1fr) | 280px` 无 gap；`.toolbar` 52→44px、图标按钮 32×32→28×28、去圆角、加 `border-bottom: 1px solid var(--color-border-default)`；`.panel` 去圆角，`.panel--sidebar` 加 `border-right`、`.panel--inspector` 加 `border-left`，`.panel__tabs` 去顶部圆角；`.mindmap-scene` 去 radius 22 + border + 多层背景，`min-height: 660px → 0`；新增 `.canvas-column`（flex column）包裹标签栏与画布。
- 核对结论：`.status-bar` **已经是**贴边样式（`padding: 6px` + `border-top`），无需改动。
- 验收：三栏贴边、无圆角外框；414 单测通过，workspace-screen 测试无需改断言。

### 批次 26：标签栏与面板（C3/C4/C5）✅ 已完成

- 改动：`workspace-screen.tsx` 把 `SheetTabBar` 从画布下方移入 `.canvas-column`（画布顶部）；`sheet-tab-bar.tsx` 增加 hover 才显示的关闭 ×（`.sheet-tab-bar__close`，18×18，`opacity: 0`，`sheets.length > 1` 且非重命名态才渲染）；`global.css` 标签栏 `min-height: 36px → 30px`、边框/圆角/阴影 → 仅 `border-bottom`，`.sheet-tab-bar__menu` 由 `bottom: calc(100% + 4px)` 翻转为 `top: calc(100% + 4px)`；侧栏折叠：`workspace-screen.tsx` 增加 `sidebarVisible` 状态并持久化到 `sessionStorage('mindgrid.sidebar-visible')`，body 追加 `--sidebar-hidden` 类 + 对应 grid 变体（`--inspector-hidden` 组合时塌成单列），`toolbar.tsx` 新增切换按钮（`PanelLeftIcon`，`aria-pressed`）；Inspector 320→280px。
- 验收：标签关闭/新建/重命名/切换全通；侧栏折叠后画布占满；414 单测通过。

### 批次 27：交互细节（C6/C7 + D2/D3）✅ 已完成

- 改动：
  - C6：`global.css` 移除 `.mindmap-node:hover { filter: brightness(0.97) }`，改为 XMind 式 hover 无滤镜变化。
  - C7：核对结论——`canvas-host.tsx:1225` **已有**「点击百分比重置 100%」按钮，无需新增。
  - D2：核对结论——`handleCutTopics`（Cmd+X）与 `handleDuplicateTopic`（Cmd+D）**已实现**（canvas-host.tsx ~2144 / ~2157）且**已接线**（~2265 / ~2272），无需新增代码。
  - D3：`canvas-host.tsx` 新增 `replaceQuery` 状态 + `handleReplaceCurrent` / `handleReplaceAll`（用字面量 `split/join` 避免正则转义问题，全部走 `renameTopic` 管道因此可撤销）；搜索浮层增加第二行「替换为」输入框 + 「替换当前」/「全部替换」按钮（无匹配时禁用）；新增 props `onRenameTopicText` 并在调用处接线 `renameTopic`。
- 验收：替换操作可 undo/redo；414 单测 + tsc 0 错误。

### 批次 28：主题图片接线（D1）🔴 大工程 ✅ 已完成

**Rust（已落地，cargo test 110 passed / 0 failed）**

- `editor.rs`：`TopicFieldChange::Image { old, new }` + `invert_operation` / `do_set_topic_field` 分支 + `set_topic_image`，5 条测试覆盖插入-撤销、替换保留旧值、同值 no-op、`None` 移除、主题缺失报错。
- `commands.rs`：`set_topic_image` / `remove_topic_image` / `read_asset_data_url`；资产经 `assets.rs` SHA-256 去重随 `.mgd` 落盘。**格式白名单固定在浏览器可渲染的 7 种**（png/jpeg/gif/webp/bmp/avif/svg+xml），刻意排除 tiff/heic/ico——DOM 的 `<img>` 渲染不出会静默破图，比直接拒绝更难排查。
- 锁顺序：`asset_store` 锁在 `document_session` 锁之前获取并提前释放，避免 SHA-256 计算期间同时持有两把锁。
- 手写 base64 编码器（RFC 4648 §10 向量验证），**未引入任何新依赖**，`Cargo.toml` / `Cargo.lock` 均未改动。

**TS（已落地）**

- 数据链路：`commands.ts` 三包装 → `browser-session.ts` 浏览器回退（内存 `Map`，仅吃 `data:` / http(s) 源）→ `use-document-session.ts` 的 `setTopicImage` / `removeTopicImage`（走 `runCommand`，可撤销）。
- DOM：`canvas-host.tsx` 在标题上方渲染 `<img class="mindmap-node__image">`；`topic-image-store.ts` 提供 `pickTopicImageUrl` / `collectTopicImageAssetIds` / `useTopicImageUrls`。
- 导出端（`render-tree.ts` 的 `TopicRichContent` 原缺 `image` 字段，图片进不了 Scene）：
  - 新增 `runtime/topic-image-constants.ts` 作为**几何常量单一来源**，布局 / CSS / SVG / Canvas 四端共用。
  - `scene-builder.ts` 新增 `topicImageUrls` 入参并投影到 `rich.image`；`use-document-session.ts` 的 `buildExportScene` 改为 async，导出前解析 assetId → data URL（单张失败静默跳过，不阻断导出）。
  - `svg-renderer.ts` 输出 `<image>`（同时写 `href` 与 `xlink:href`，补 `xmlns:xlink`）；`canvas-renderer.ts` 新增 `drawNodeImage`，PNG 端由 `png-exporter.ts` 的 `preloadTopicImages` 预解码后传入。
  - **有图时标题下移** `TOPIC_IMAGE_TITLE_OFFSET`，两端共用同一 `computeTopicImageRect`。

**验收（实测，非计划值）**

- `pnpm vitest run` **41 文件 / 448 测试**（基线 36/414）· `pnpm tsc --noEmit` **退出 0** · `pnpm lint` **0 error / 16 warning**（warning 全为既有 exhaustive-deps，无新增）· `cargo test` **110 passed / 0 failed**。
- 新增测试：`topic-image-constants.test.ts`（几何常量与矩形计算）、`topic-image-export.test.ts`（Scene 投影 / SVG 输出 / 预加载容错）、`browser-topic-image.test.ts`、`topic-image-render.test.tsx`。

**过程中发现并一并修掉的既有问题**

1. `svg-renderer.ts` 的 padding 仍是旧的 **20/14/12**，而 DOM（`global.css`）与 `canvas-renderer.ts` 早在批次 23 就改成了 **16/12/10**——SVG/PDF 导出与屏幕错位。已抽出 `getNodePadding(depth)` 到 `style-constants.ts` 供两端共用。
2. CSS `max-height: 120px` 与布局预留的 88px 不一致（会溢出节点），且 `max-width: 200px` 会撑破 `min-width:120` 的小节点（内宽仅约 96）。已统一为 `max-height: 88px` / `max-width: min(200px, 100%)`。

**已知取舍（未做，待定）**

- Canvas/PNG 端已做圆角裁剪（`TOPIC_IMAGE_RADIUS`）；**SVG/PDF 端未做**——需要 `clipPath`，而 svg2pdf.js 对 `clipPath` 的支持未经实测，一旦不支持可能导致 PDF 里图片整体丢失，为 6px 圆角冒这个险不划算。现状是 SVG/PDF 导出的图片为直角。
- `canvas-renderer.ts` 的 `drawTopic` **完全不绘制 rich 内容**（markers / labels / notes / link / task 都没有，只有图片是本次新增的）。因此 **PNG 导出仍看不到标记、标签、备注与任务图标**（SVG 端是画的）。这是批次 28 之前就存在的缺口，超出本批次范围，建议单独立项。
- 浏览器开发态（`pnpm dev`）的图片资源存内存 `Map`，刷新即失；本地绝对路径无法读取。这是环境限制，非后端妥协。

---

## 五、整体验收标准

1. `pnpm vitest run`、`pnpm tsc --noEmit`、`cargo test`（涉及批次）三绿。
2. 像素对比：6 种骨架 × 经典蓝/暗夜两主题的调整前后截图存档，密度、字号、间距目测对齐 XMind 默认图。
3. Chrome：贴边、44px 工具栏、30px 顶部标签栏、可折叠侧栏、280px Inspector。
4. 功能：图片主题全链路可用；剪切/Cmd+D/替换可用且可撤销。

## 六、风险与约束

- **批次 22/25 是观感主战场，也是回归主战场**：间距与 Chrome 改动会波及大量依赖固定尺寸的测试（minimap、hit-test、虚拟化阈值），需预期更新测试断言而非绕过。
- **批次 28 跨三端**，若工期紧张可拆为 28a（Rust+数据链路）/ 28b（UI+渲染），但必须在同一轮内闭环，避免再出现一个"能存不能看"。
- 批次 22 的间距参数为估值，落地时以 XMind 同结构图并排截图微调定稿。
