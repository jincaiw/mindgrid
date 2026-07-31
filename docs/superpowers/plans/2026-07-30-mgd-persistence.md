# MindGrid MGD Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MindGrid 增加 `.mgd` 持久化基础、自动保存恢复链路和可见的保存状态。

**Architecture:** Rust 侧新增最小 `.mgd` 基础设施层，负责把 `DocumentSnapshot` 打包为最小合法 ZIP 容器并写入恢复区；应用层在每次文档命令后触发自动保存，并在启动时优先恢复恢复区快照。前端继续通过统一 `useDocumentSession()` 消费会话快照，同时展示自动保存状态。

**Tech Stack:** Tauri 2、Rust、serde、zip、React、TypeScript、Vitest

---

### Task 1: 定义持久化元数据与前端消费边界

**Files:**
- Modify: `src/lib/document/types.ts`
- Modify: `src/features/document/document-session-store.ts`
- Modify: `src/features/document/use-document-session.ts`
- Test: `src/features/workspace/workspace-screen.test.tsx`

- [ ] **Step 1: 扩展前端会话快照类型**

```ts
export interface DocumentSessionSnapshot {
  document: DocumentSnapshot
  summary: DocumentSummary
  canUndo: boolean
  canRedo: boolean
  activeTopicId: string
  hasUnsavedChanges: boolean
  lastSavedAtMs: number | null
  lastAutosavedAtMs: number | null
  recoveredFromAutosave: boolean
}
```

- [ ] **Step 2: 让状态存储保留新增字段**

```ts
export interface DocumentSessionState {
  // ...
  hasUnsavedChanges: boolean
  lastSavedAtMs: number | null
  lastAutosavedAtMs: number | null
  recoveredFromAutosave: boolean
}
```

- [ ] **Step 3: 在 Hook 中继续统一消费快照**

```ts
applySnapshot(fromSnapshot(snapshot, '已恢复当前文档'))
```

- [ ] **Step 4: 更新工作区测试桩**

```ts
hasUnsavedChanges: false,
lastSavedAtMs: null,
lastAutosavedAtMs: null,
recoveredFromAutosave: false,
```

### Task 2: 在 Rust 中实现最小 `.mgd` 容器与自动恢复区

**Files:**
- Create: `src-tauri/src/app/persistence.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/app/commands.rs`
- Modify: `src-tauri/src/app/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/domain/document.rs`

- [ ] **Step 1: 增加最小 `.mgd` 打包/解包依赖**

```toml
zip = { version = "2.2.0", default-features = false, features = ["deflate"] }
```

- [ ] **Step 2: 为文档快照补齐反序列化能力**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocumentSnapshot { ... }
```

- [ ] **Step 3: 实现最小 `.mgd` 容器**

```rust
pub fn write_document_archive(document: &DocumentSnapshot, path: &Path) -> Result<(), String>
pub fn read_document_archive(path: &Path) -> Result<DocumentSnapshot, String>
```

- [ ] **Step 4: 在应用层追加恢复区状态**

```rust
pub struct PersistenceState {
    pub last_saved_at_ms: Option<u64>,
    pub last_autosaved_at_ms: Option<u64>,
    pub recovered_from_autosave: bool,
}
```

- [ ] **Step 5: 每次命令成功后写入恢复区**

```rust
persist_recovery_snapshot(&app_handle, &guard, &mut persistence_state)?;
```

- [ ] **Step 6: 启动时优先恢复恢复区**

```rust
if let Some(snapshot) = try_restore_recovery_snapshot(&app_handle)? {
    *guard = DocumentSession::from_document(snapshot);
}
```

### Task 3: 暴露自动保存状态并补测试

**Files:**
- Modify: `src/features/workspace/toolbar.tsx`
- Modify: `src/features/status/status-bar.tsx`
- Modify: `src/lib/ipc/browser-session.ts`
- Modify: `src/lib/ipc/browser-session.test.ts`
- Modify: `README.md`

- [ ] **Step 1: 浏览器回退层同步实现恢复区**

```ts
const RECOVERY_STORAGE_KEY = 'mindgrid:recovery'
```

- [ ] **Step 2: Toolbar 展示自动保存/恢复状态**

```tsx
<span>自动保存：{session.lastAutosavedAtMs ? '已保存' : '尚未写入'}</span>
```

- [ ] **Step 3: 状态栏展示恢复来源**

```tsx
<span>恢复：{session.recoveredFromAutosave ? '来自恢复快照' : '当前会话'}</span>
```

- [ ] **Step 4: 为浏览器恢复补回归测试**

```ts
expect(restored.recoveredFromAutosave).toBe(true)
```

- [ ] **Step 5: 同步 README**

```md
- `.mgd` 基础持久化、恢复区自动保存和启动恢复
```
