# MindGrid × XMind UX 对标优化方案（第二轮：交互体验）

> 日期：2026-07-31
> 前置：第一轮视觉对标（批次 1-6）已完成，见 `2026-07-31-xmind-ui-optimization.md`
> 目标：从"视觉像 XMind"升级到"用起来像 XMind"——交互手感、快捷键、反馈、动画全方位对齐。

---

## 一、现状评估（UX 交互层）

### 1.1 已具备的 UX 能力

| 能力 | 实现位置 | 评价 |
|------|---------|------|
| 双击编辑节点文本 | `canvas-host.tsx` onDoubleClick | ✅ 到位 |
| Tab 加子级 / Enter 加同级 | `canvas-host.tsx:1516-1540` | ✅ 到位 |
| Shift+Tab 选父节点 | `canvas-host.tsx:1517` | ✅ 到位 |
| Space 折叠/展开 | `canvas-host.tsx:1542` | ⚠️ XMind 里 Space 是平移，折叠用别的键 |
| Cmd/Ctrl+Z/Y 撤销重做 | `canvas-host.tsx:1571` | ✅ 到位 |
| Cmd/Ctrl+C/V 复制粘贴 | `canvas-host.tsx:1478-1488` | ✅ 到位 |
| Cmd/Ctrl+F 搜索 | `canvas-host.tsx:1472` | ✅ 到位 |
| 拖拽重排主题 | `canvas-host.tsx` drag handlers | ✅ 到位 |
| 框选（marquee） | `canvas-host.tsx:219` selectionBox | ✅ 到位 |
| 滚轮缩放 | `canvas-host.tsx:751` | ✅ 到位 |
| 工具栏 tooltip | `toolbar.tsx` title 属性 | ✅ 到位（无快捷键提示） |
| Toast 通知框架 | `app-shell.tsx` ToastRegion | ✅ 到位 |
| 节点 hover 微动效 | `global.css:1417` translateY(-1px) | ⚠️ 仅 1px 抬升，反馈偏弱 |
| ZEN 专注模式 | `workspace-screen.tsx:43` | ✅ 到位 |

### 1.2 关键 UX 缺口（vs XMind）

| # | 缺口 | XMind 表现 | MindGrid 现状 | 影响 |
|---|------|-----------|--------------|------|
| 1 | **相机无缓动** | fitToView/zoom/pan 全部带 300ms ease-out 动画 | `setCamera()` 直接跳变 | 🔴 致命：手感廉价 |
| 2 | **无右键菜单** | 节点/画布右键弹出上下文菜单（编辑/增删/复制/粘贴/样式） | 完全缺失 | 🔴 致命：核心交互缺失 |
| 3 | **无缩放快捷键** | Cmd+/- 缩放、Cmd+0 适配、Cmd+1 100% | 只有滚轮和按钮 | 🟡 重要 |
| 4 | **无 F2 重命名** | F2 进入编辑 | 只有双击 | 🟡 重要 |
| 5 | **无方向键导航** | ↑↓←→ 在节点间移动焦点 | 缺失 | 🟡 重要 |
| 6 | **无 Cmd+A 全选** | Cmd+A 选中画布全部主题 | 缺失 | 🟡 重要 |
| 7 | **节点无出现/消失动画** | 新增节点 fade+scale-in，删除 fade-out，折叠收缩 | 直接增删 DOM | 🟡 重要：感觉生硬 |
| 8 | **无小地图** | 右下角 minimap 显示全图+视口框 | 缺失 | 🟡 大图必备 |
| 9 | **Space 键语义冲突** | Space+拖拽=平移画布 | Space=折叠/展开 | 🟡 习惯冲突 |
| 10 | **Tab 切换无过渡** | Inspector tab 切换有 slide 动画 | 直接切换 | 🟢 锦上添花 |
| 11 | **tooltip 无快捷键** | tooltip 显示 "新建子主题 (Tab)" | 只显示文字 | 🟢 锦上添花 |
| 12 | **无操作反馈 toast** | 保存/导出/复制等动作有 toast 确认 | 框架在但未广泛使用 | 🟢 锦上添花 |

---

## 二、优化方案（批次 7-11）

### 批次 7：相机缓动动画 🔴 最高优先级

**目标**：所有相机移动（适配视图、缩放、聚焦主题）都带 300ms ease-out 动画，消除"跳变"廉价感。

**改动文件**：
- `src/features/canvas/camera.ts` — 新增 `animateCamera()` 工具函数（RAF + easeOutCubic）
- `src/features/canvas/canvas-host.tsx` — `fitToView`/`focusTopicInViewport`/`setZoomFromViewportCenter` 改用动画；新增 `animateCameraRef` 避免重复触发

**实现要点**：
```typescript
// camera.ts 新增
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function animateCamera(
  from: CameraState,
  to: CameraState,
  durationMs: number,
  onUpdate: (camera: CameraState) => void,
  signal?: AbortSignal,
): void {
  const start = performance.now()
  function frame(now: number) {
    if (signal?.aborted) return
    const t = Math.min(1, (now - start) / durationMs)
    const e = easeOutCubic(t)
    onUpdate({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
      zoom: from.zoom + (to.zoom - from.zoom) * e,
    })
    if (t < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
```

**验证**：fitToView 按钮点击后相机平滑滑动而非瞬移；focusTopic 搜索跳转有滑动感。

---

### 批次 8：右键上下文菜单 🔴 高优先级

**目标**：节点右键弹出操作菜单，画布右键弹出画布操作菜单。

**改动文件**：
- `src/features/workspace/context-menu.tsx`（新建）— 通用 ContextMenu 组件（portal + 定位 + 键盘导航）
- `src/features/canvas/canvas-host.tsx` — 节点 onContextMenu + 画布 onContextMenu
- `src/styles/global.css` — `.context-menu` 样式

**菜单项**：
- **节点右键**：编辑文本 / 新建子主题 / 新建同级 / 复制 / 粘贴为子主题 / 删除 / 折叠展开
- **画布右键**：粘贴 / 适配视图 / 100% / ZEN 模式 / 检查更新

**实现要点**：
- `onContextMenu` 阻止默认菜单，`preventDefault`
- 菜单用 React Portal 渲染到 body，避免被 canvas overflow 裁剪
- 点击菜单项或画布空白处关闭
- 支持 Esc 关闭、方向键导航（可选）

---

### 批次 9：键盘快捷键补齐 🟡 高优先级

**目标**：补齐 XMind 标配快捷键。

**改动文件**：
- `src/features/canvas/canvas-host.tsx` — `handleKeyDown` 新增分支

**新增快捷键**：
| 快捷键 | 动作 | XMind 对应 |
|--------|------|-----------|
| `Cmd/Ctrl + =` 或 `+` | 放大 | ✅ |
| `Cmd/Ctrl + -` | 缩小 | ✅ |
| `Cmd/Ctrl + 0` | 适配视图 | ✅ |
| `Cmd/Ctrl + 1` | 100% 实际大小 | ✅ |
| `F2` | 进入编辑文本 | ✅ |
| `Cmd/Ctrl + A` | 全选当前画布主题 | ✅ |
| `↑↓←→` | 在相邻节点间移动焦点 | ✅ |
| `Cmd/Ctrl + Enter` | 插入同级（已有，保留） | ✅ |

**Space 键语义调整**：
- `Space`（按住）+ 拖拽 → 平移画布（XMind/MindNode 通用）
- 折叠/展开改为 `Cmd/Ctrl + /` 或保留 Space 单击（不按住）折叠

---

### 批次 10：节点动画 🟡 中优先级

**目标**：新增/删除/折叠节点时有平滑动画。

**改动文件**：
- `src/styles/global.css` — `.mindmap-node` 出现/消失 keyframes
- `src/features/canvas/canvas-host.tsx` — 节点卸载时延迟移除（fade-out 后再 unmount）

**实现要点**：
- 出现：`@keyframes node-appear { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: scale(1) } }` 200ms
- 折叠：子节点 fade+scale-out 150ms 后 collapse
- 用 CSS `transition` 实现位置变化（layout 变动时节点平滑滑动到新位置）— 需要给 `.mindmap-node` 加 `transition: transform 200ms ease`

---

### 批次 11：右下角小地图 🟡 中优先级

**目标**：右下角浮动 minimap，显示全图缩略 + 当前视口框，点击跳转。

**改动文件**：
- `src/features/canvas/minimap.tsx`（新建）
- `src/features/canvas/canvas-host.tsx` — 引入 Minimap
- `src/styles/global.css` — `.minimap` 样式

**实现要点**：
- 120×80px 浮动卡片，右下角
- 用 Canvas 2D 绘制简化版场景（只画节点矩形+边线，不画文字）
- 红色视口框表示当前可见区域
- 点击 minimap 平滑跳转（复用批次 7 的 animateCamera）

---

## 三、实施顺序与验证

| 批次 | 优先级 | 预计改动量 | 依赖 | 状态 |
|------|--------|-----------|------|------|
| 7 相机缓动 | P0 | 中（2 文件） | 无 | ✅ 已完成 |
| 8 右键菜单 | P0 | 中（3 文件） | 无 | ✅ 已完成 |
| 9 快捷键补齐 | P0 | 小（1 文件） | 批次 7（缩放用动画） | ✅ 已完成 |
| 10 节点动画 | P1 | 中（2 文件） | 无 | ✅ 已完成 |
| 11 小地图 | P1 | 中（3 文件） | 批次 7（跳转用动画） | ✅ 已完成 |

**每批验证标准（三绿）**：
- `pnpm test` 全绿
- `pnpm build` 成功
- `cargo test --manifest-path src-tauri/Cargo.toml` 全绿
- Playwright 视觉验证零 console error

---

## 四、风险点

1. **相机动画与 React 状态**：RAF 动画不能每帧 setState（性能差），需要用 ref 直接操作或在 RAF 结束时 setState。方案：动画过程中用 `requestAnimationFrame` 直接更新 camera state（React 18 自动批处理可承受 60fps）。
2. **右键菜单与 Tauri**：Tauri webview 默认禁用浏览器右键菜单，需确认 `onContextMenu` preventDefault 后自定义菜单能正常显示。
3. **节点位置动画与虚拟化**：节点虚拟化（只渲染可见节点）可能与位置 transition 冲突——进入视口时不应触发位置动画。方案：用 `data-just-appeared` 属性区分"刚出现"和"位置变化"。
4. **小地图性能**：10k 节点时 minimap 不能每帧重绘。方案：minimap 用 debounce + 简化几何（只画矩形不画文字）。
5. **Space 键语义变更**：现有用户可能习惯 Space 折叠。方案：保留 Space 单击=折叠，Space 按住+拖拽=平移。
