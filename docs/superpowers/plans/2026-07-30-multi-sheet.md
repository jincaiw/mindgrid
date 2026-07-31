# MindGrid Multi-Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MindGrid 增加真实多 Sheet 文档能力，让用户可以创建、切换、重命名和删除画布，并让当前编辑区围绕活动 Sheet 工作。

**Architecture:** 先把前后端所有 `sheets[0]` 的单画布假设收敛为“活动 Sheet”访问路径，再通过 Rust 文档会话和浏览器回退层暴露 `select/create/rename/delete sheet` 命令，最后在工作区侧边栏接入画布管理入口并补回归测试。

**Tech Stack:** Tauri 2、Rust、React、TypeScript、Vitest

---

### Task 1: 收敛活动 Sheet 访问边界

**Files:**
- Modify: `src-tauri/src/domain/document.rs`
- Modify: `src/lib/ipc/browser-session.ts`
- Modify: `src/features/canvas/canvas-host.tsx`
- Modify: `src/features/workspace/sidebar.tsx`
- Modify: `src/features/workspace/inspector.tsx`

- [ ] 把文档访问从固定 `sheets[0]` 改为围绕 `activeSheetId` 查找活动 Sheet
- [ ] 让 `summary.rootTopicText`、画布渲染、检查器选中和浏览器回退快照都使用活动 Sheet 根节点
- [ ] 保证活动主题在切换 Sheet 或撤销/重做后仍然有效，否则回退到活动 Sheet 根主题

### Task 2: 增加 Sheet 级命令

**Files:**
- Modify: `src-tauri/src/domain/document.rs`
- Modify: `src-tauri/src/app/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/ipc/commands.ts`
- Modify: `src/lib/ipc/browser-session.ts`
- Modify: `src/features/document/use-document-session.ts`

- [ ] 新增 `select_sheet`、`create_sheet`、`rename_sheet`、`delete_sheet` IPC 命令
- [ ] 在 Rust 会话中实现对应操作，并把创建/重命名/删除纳入历史与自动保存链路
- [ ] 在前端 `DocumentSession` 接口中暴露对应方法

### Task 3: 接入工作区多 Sheet 管理入口

**Files:**
- Modify: `src/features/workspace/sidebar.tsx`
- Modify: `src/features/status/status-bar.tsx`
- Modify: `src/features/workspace/workspace-screen.test.tsx`

- [ ] 在侧边栏展示画布列表、当前活动画布和主题统计
- [ ] 提供创建、切换、重命名和删除当前画布的最小入口
- [ ] 在状态栏补充更明确的当前活动 Sheet 信息

### Task 4: 回归测试与说明同步

**Files:**
- Modify: `src/lib/ipc/browser-session.test.ts`
- Modify: `src/features/canvas/canvas-host.test.tsx`
- Modify: `src/features/workspace/workspace-screen.test.tsx`
- Modify: `src-tauri/src/domain/document.rs`
- Modify: `README.md`

- [ ] 为浏览器回退层补 `create/select/rename/delete sheet` 回归测试
- [ ] 为 Rust 文档会话补多 Sheet 领域测试
- [ ] 为工作区入口补多 Sheet UI 测试
- [ ] 在 README 中同步当前多 Sheet 交付边界
