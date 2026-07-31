# MindGrid V1 正式版交付路线图

> 目标：按产品规范交付**完整 V1 全量**功能，达到**可发布正式版**标准。
> 范围确认：6 种图表 + 样式 + 模板 + 演示 + 导入导出 + 完整 Canvas Runtime + 10k 节点性能 + 跨平台打包分发。

## 现状基线

- 工程骨架：Tauri 2 + React 19 + TS + Rust，98 单测通过，Rust 编译干净。
- 数据模型：Tree Only 最小模型 `TopicSnapshot { id, text, collapsed, children }`。
- 撤销/重做：**快照级**（每次变更整文档克隆入历史栈），不可扩展到 10k 节点。
- 画布：最小 Camera / Hit Test / 多选 / 拖拽重排，未演进为独立 Render Tree + 交互状态机。
- 文件：最小 `.mgd` ZIP 容器 + 恢复区 + 修复向导，未含 styles/assets/previews/relationships。
- 仅 Mind Map 单布局，无样式、无富内容、无导入导出、无模板、无演示。

## 关键架构决策（来自 SAD / ADR，不可偏离）

- 四层架构：UI → Application → Domain → Infrastructure，依赖只向内。
- Rust Core 权威：Document / Command / ChangeSet / .mgd / Migration / Import-Export / Asset / Search / 大布局 / 原子保存 / Recovery。
- TS Canvas Runtime：Viewport / Camera / Render Tree / Renderer / Hit Test / Selection / 交互状态机 / Animation / DOM Editor。高频操作不得逐帧 IPC。
- Tree Only：父子结构唯一，Relationship 不改树结构。
- Command/ChangeSet：替代快照历史；批量操作事务化、失败整体回滚。
- Canvas 2D + OffscreenCanvas + Worker；按需 Invalidate；虚拟化。
- .mgd：ZIP + JSON，styles.json / assets(SHA-256 去重) / previews / relationships；未知字段保留；原子保存；Level 0–4 完整性校验。
- 性能预算：1k@60FPS、3k 连续编辑、10k 可打开/搜索/导航/编辑；16.67ms 帧预算。

## 阶段划分

### Phase 0 — Domain & Command 基座（所有功能依赖，必须先做）

1. 富 Topic 模型：`styleRef / markers / labels / notes / link / image / task / layoutHints / extensions`（可选字段，向后兼容）。
2. 文档级与 Sheet 级结构：`relationships / boundaries / summaries / settings / theme`。
3. **Command / ChangeSet 系统**替代快照历史：每个命令产出正向 + 逆向 patch，历史栈存 patch；事务化批量操作。
4. 格式版本：1.0.0 → 1.1.0 链式迁移（补默认值，不删未知字段）。
5. Layout 配置：Sheet 携带 `chartType` 与布局参数。

### Phase 1 — Canvas Runtime（依赖 Phase 0 投影）

1. Render Tree + Scene Builder + Canvas 2D Renderer（图层 00–120）。
2. 完整交互状态机（Idle / Hovering / Selecting / BoxSelecting / Panning / DraggingTopic / DraggingRelationship / EditingText / ResizingImage / CreatingRelationship / AnimatingCamera / Presenting）。
3. 空间索引（R-tree/Quadtree）Hit Test；虚拟化 + Overscan。
4. 拖拽 guide / snap、边缘自动平移、连续手势。
5. 增量布局与全量回退；按需 Invalidate 调度。

### Phase 2 — Layout Engines（6 种图表）

1. Mind Map（深化现有）。
2. Logic Chart、Tree Chart、Organization Chart、Fishbone、Timeline。
3. 布局切换（全量布局 + 过渡动画，可中断）。
4. 大型布局放 Worker / Rust。

### Phase 3 — 编辑特性与 Inspector

1. 样式系统 UI（主题 / 层级样式 / 节点样式 / 本地覆盖）。
2. 富内容：图片 / 图标 / 标签 / 备注 / 链接 / 任务属性。
3. Boundary / Relationship / Summary 编辑。
4. Inspector 完整能力。
5. 模板系统（内置 + 用户模板目录）。

### Phase 4 — 导入导出

1. 导入：XMind、FreeMind、Markdown、OPML。
2. 导出：PNG、SVG、PDF、Markdown、OPML、XMind。
3. 导入事务化（失败回滚），导出走 Worker / 后台任务。

### Phase 5 — .mgd 完整格式

1. styles.json、assets/（SHA-256 去重 + 引用计数 + GC）、previews/（缩略图/预览）。
2. 完整性校验 Level 0–4，原子保存流程（temp → validate → fsync → replace → fsync parent）。
3. 文件锁、损坏恢复优先级链。
4. CLI：inspect / validate / extract / repair / migrate / pack。

### Phase 6 — 演示、性能与发布

1. 演示模式（Presenting 状态、逐节点/逐分支遍历、相机动画）。
2. 性能基线实测：1k / 3k / 10k 真机，命中帧预算；空间索引 + 虚拟化 + 增量验证。
3. 跨平台打包（macOS / Windows / Linux）、签名、自动更新、Crash Report、Logger。
4. Bug 扫除、视觉回归、可访问性、P0/P1 清零。

## 执行原则

- 按模块批量推进，每个 Phase 产出可测、可构建、可回归的增量。
- 先写测试（types / domain / layout / canvas 单测），再实现，保持 98+ 测试始终绿色并持续增长。
- 每个阶段结束运行 `pnpm test` + `pnpm build` + `cargo check`，保持三绿。
- 不确定处主动找用户确认（架构取舍、范围裁剪、外部依赖等）。
- 不偏离 SAD/ADR；如需变更，新建 ADR 说明替代关系与迁移成本。
