# MindGrid Foundation Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个可运行的 MindGrid 桌面应用基础版本，完成 Tauri + React + TypeScript + Rust 双端工程、最小文档模型、基础工作区 UI、文档创建与状态展示链路。

**Architecture:** 采用 Tauri 2 宿主桌面壳，Rust 负责最小领域模型与文档生命周期命令，React 负责应用外壳、左右面板和画布宿主。第一阶段不实现完整布局算法与真正的 Canvas 渲染引擎，而是先打通“命令 -> Rust -> Projection -> UI 展示”的主链路，为后续 Canvas、布局、文件格式和撤销重做建立稳定工程边界。

**Tech Stack:** Tauri 2、Rust、React、TypeScript、Vite、Vitest、Testing Library

---

## Scope Split

当前产品规范覆盖多个相对独立子系统，不适合一次写成单一执行计划。建议按以下顺序拆分：

1. Foundation Shell：工程骨架、应用壳、最小文档模型、基础命令链路
2. Document Core：完整 Tree Only 数据模型、命令系统、撤销重做、事务
3. Canvas Runtime：Camera、坐标系、Scene、Hit Test、交互状态机
4. File System：`.mgd` 读写、自动保存、恢复、校验、迁移
5. Editing Features：节点编辑、多选、拖拽、搜索、样式、Inspector

本计划只覆盖 `Foundation Shell`。

### Task 1: 创建前端与桌面工程骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/app-shell.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 初始化 Vite React TypeScript 工程**

Run: `pnpm create vite@latest . --template react-ts`
Expected: 生成前端基础工程文件

- [ ] **Step 2: 安装桌面、测试与类型依赖**

Run: `pnpm add @tauri-apps/api zod clsx`
Run: `pnpm add -D @tauri-apps/cli vitest @testing-library/react @testing-library/jest-dom jsdom`
Expected: `package.json` 中出现运行期与测试依赖

- [ ] **Step 3: 初始化 Tauri 2 工程**

Run: `pnpm tauri init`
Expected: 生成 `src-tauri/` 与 `src-tauri/tauri.conf.json`

- [ ] **Step 4: 写入基础设计 Token 与全局布局样式**

Code target: `src/styles/tokens.css`, `src/styles/global.css`
Expected: 建立语义色板、8pt spacing、三栏布局基础样式

- [ ] **Step 5: 验证前端与桌面端都能启动**

Run: `pnpm build`
Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 两端构建成功

### Task 2: 建立最小领域模型与 IPC 命令

**Files:**
- Create: `src/lib/document/types.ts`
- Create: `src/lib/document/default-document.ts`
- Create: `src/lib/ipc/commands.ts`
- Create: `src/lib/ipc/transport.ts`
- Create: `src-tauri/src/domain/document.rs`
- Create: `src-tauri/src/domain/mod.rs`
- Create: `src-tauri/src/app/commands.rs`
- Create: `src-tauri/src/app/mod.rs`

- [ ] **Step 1: 先写前端文档模型测试**

Test target: `src/lib/document/default-document.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "./default-document";

describe("createDefaultDocument", () => {
  it("creates a document with a root topic and one sheet", () => {
    const document = createDefaultDocument();
    expect(document.sheets).toHaveLength(1);
    expect(document.sheets[0].rootTopic.text).toBe("中心主题");
  });
});
```

- [ ] **Step 2: 实现前端最小文档类型与默认工厂**

Code target: `src/lib/document/types.ts`, `src/lib/document/default-document.ts`
Expected: 定义 `DocumentSnapshot`, `SheetSnapshot`, `TopicSnapshot`

- [ ] **Step 3: 定义 Rust 侧文档结构与创建命令**

Code target: `src-tauri/src/domain/document.rs`, `src-tauri/src/app/commands.rs`
Expected: 提供 `create_document`、`get_document_summary` 两个 IPC 命令

- [ ] **Step 4: 建立前端 IPC 传输适配层**

Code target: `src/lib/ipc/transport.ts`, `src/lib/ipc/commands.ts`
Expected: 前端统一通过封装后的 `invoke` 调用 Rust 命令

- [ ] **Step 5: 运行单测和 Rust 检查**

Run: `pnpm vitest run src/lib/document/default-document.test.ts`
Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 测试与编译均通过

### Task 3: 实现应用壳与工作区布局

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/features/workspace/workspace-screen.tsx`
- Create: `src/features/workspace/sidebar.tsx`
- Create: `src/features/workspace/toolbar.tsx`
- Create: `src/features/workspace/inspector.tsx`
- Create: `src/features/canvas/canvas-host.tsx`
- Create: `src/features/status/status-bar.tsx`

- [ ] **Step 1: 先写工作区渲染测试**

Test target: `src/features/workspace/workspace-screen.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { WorkspaceScreen } from "./workspace-screen";

it("renders toolbar and canvas host", () => {
  render(<WorkspaceScreen />);
  expect(screen.getByLabelText("主工具栏")).toBeInTheDocument();
  expect(screen.getByLabelText("画布区域")).toBeInTheDocument();
});
```

- [ ] **Step 2: 实现 Toolbar / Sidebar / Inspector / Canvas Host 组件**

Expected: 满足 `52px / 280px / flexible / 320px` 的三栏布局

- [ ] **Step 3: 在 Canvas Host 中展示最小 Projection**

Expected: 显示当前文档标题、节点数量、活动 Sheet，并提供“新建文档”按钮

- [ ] **Step 4: 接入加载与空状态**

Expected: 启动时展示 skeleton，命令失败时展示 toast 区域占位

- [ ] **Step 5: 运行前端测试和构建**

Run: `pnpm vitest run src/features/workspace/workspace-screen.test.tsx`
Run: `pnpm build`
Expected: 测试通过且前端可构建

### Task 4: 打通首个用户流程

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/features/canvas/canvas-host.tsx`
- Create: `src/features/document/use-document-session.ts`
- Create: `src/features/document/document-session-store.ts`
- Create: `src/features/feedback/toast-region.tsx`

- [ ] **Step 1: 实现文档会话状态管理**

Expected: 管理 `idle / loading / ready / error` 四态

- [ ] **Step 2: 启动时自动创建默认文档**

Expected: 打开应用即进入一个可见的默认思维导图工作区

- [ ] **Step 3: 为“新建文档”按钮接入真实 IPC**

Expected: 点击后从 Rust 返回新文档摘要并刷新 UI

- [ ] **Step 4: 显示基础状态信息**

Expected: 显示文档 ID、修订号、节点数量和最近动作

- [ ] **Step 5: 做一次桌面端端到端验证**

Run: `pnpm tauri dev`
Expected: 桌面窗口可启动，点击“新建文档”后界面状态更新

### Task 5: 收口工程质量与开发体验

**Files:**
- Create: `vitest.setup.ts`
- Create: `src/test/render.tsx`
- Modify: `README.md`
- Create: `.gitignore`
- Create: `.editorconfig`

- [ ] **Step 1: 补齐测试初始化与共享 render 工具**

Expected: 测试中自动加载 `@testing-library/jest-dom`

- [ ] **Step 2: 更新 README 为开发指南**

Expected: 包含安装、运行、构建、测试命令和当前实现范围

- [ ] **Step 3: 补齐工程忽略规则与编辑器规范**

Expected: 忽略 `node_modules`, `dist`, `target`, `.vite`

- [ ] **Step 4: 完整运行一次质量检查**

Run: `pnpm vitest run`
Run: `pnpm build`
Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过

- [ ] **Step 5: 记录下一阶段接口缺口**

Expected: 在 README 中列出下一阶段将补齐的 Canvas、布局、文件系统与命令系统
