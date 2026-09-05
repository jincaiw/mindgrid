//! 应用原生菜单栏（对标 XMind 桌面端「文件 / 编辑 / 视图 / 插入 / 格式 / 工具 / 帮助」）。
//!
//! 设计要点：
//!
//! 1. **只做「入口 + 事件转发」，不做业务逻辑。** 菜单项点击后本模块把它的 id
//!    以 `mindgrid://menu-action` 事件转发给前端，由前端派发到与工具栏、快捷键
//!    **完全相同的**命令路径（见 `src/features/menu/`）。业务规则留在前端，
//!    避免同一动作在 Rust 与 TS 两侧各实现一份。
//!
//! 2. **不注册系统快捷键（accelerator 一律为 None）。** 快捷键早已由前端的
//!    window keydown 处理器实现（见 `src/features/shortcuts/registry.ts` 与
//!    app-shell / workspace-screen / canvas-host 内的监听）。若这里再注册一遍，
//!    一次按键会同时触发原生菜单事件与前端处理器，动作被执行两次。
//!    因此快捷键只作为提示文字拼在菜单项标签里。
//!
//! 3. macOS 自动成为系统菜单栏，Windows / Linux 显示在窗口内（Tauri 默认行为）。

use tauri::{
    menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Runtime,
};

/// 菜单事件名：前端监听此事件拿到被点击菜单项的 id。
pub const MENU_ACTION_EVENT: &str = "mindgrid://menu-action";

/// macOS 上修饰键显示为 ⌘，其余平台显示为 Ctrl。
fn combo(key: &str) -> String {
    if cfg!(target_os = "macos") {
        format!(" (⌘{})", key)
    } else {
        format!(" (Ctrl+{})", key)
    }
}

fn combo_shift(key: &str) -> String {
    if cfg!(target_os = "macos") {
        format!(" (⇧⌘{})", key)
    } else {
        format!(" (Ctrl+Shift+{})", key)
    }
}

/// 带快捷键提示的菜单项。id 是稳定契约，前端按 id 派发。
fn item<R: Runtime, M: tauri::Manager<R>>(
    manager: &M,
    id: &'static str,
    text: &str,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(manager, id, text, true, None::<&str>)
}

pub fn build_menu<R: Runtime>(handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // —— 文件 ——
    let file = SubmenuBuilder::new(handle, "文件")
        .item(&item(handle, "file.new", &format!("新建文档{}", combo("N")))?)
        .item(&item(handle, "file.open", &format!("打开文档…{}", combo("O")))?)
        .separator()
        .item(&item(handle, "file.save", &format!("保存{}", combo("S")))?)
        .item(&item(
            handle,
            "file.save-as",
            &format!("另存为…{}", combo_shift("S")),
        )?)
        .separator()
        .item(&item(
            handle,
            "file.import-markdown",
            "从 Markdown 导入…",
        )?)
        .item(&item(handle, "file.export-markdown", "导出为 Markdown…")?)
        .item(&item(handle, "file.export-png", "导出为 PNG…")?)
        .item(&item(handle, "file.export-svg", "导出为 SVG…")?)
        .item(&item(handle, "file.export-pdf", "导出为 PDF…")?)
        .separator()
        .item(&item(handle, "file.export-recovery", "导出修复副本…")?)
        .build()?;

    // —— 编辑 ——
    let edit = SubmenuBuilder::new(handle, "编辑")
        .item(&item(handle, "edit.undo", &format!("撤销{}", combo("Z")))?)
        .item(&item(
            handle,
            "edit.redo",
            &format!("重做{}", combo_shift("Z")),
        )?)
        .separator()
        .item(&item(handle, "edit.cut", &format!("剪切{}", combo("X")))?)
        .item(&item(handle, "edit.copy", &format!("复制{}", combo("C")))?)
        .item(&item(handle, "edit.paste", &format!("粘贴{}", combo("V")))?)
        .item(&item(
            handle,
            "edit.select-all",
            &format!("全选{}", combo("A")),
        )?)
        .build()?;

    // —— 视图 ——
    let view = SubmenuBuilder::new(handle, "视图")
        .item(&item(handle, "view.zen", &format!("专注模式{}", combo(".")))?)
        .item(&item(
            handle,
            "view.present",
            &format!("演示模式{}", combo_shift("P")),
        )?)
        .item(&item(
            handle,
            "view.pitch",
            "提案简报",
        )?)
        .item(&item(handle, "view.gantt", "甘特图")?)
        .separator()
        .item(&item(
            handle,
            "view.inspector",
            &format!("右侧格式面板{}", combo("I")),
        )?)
        .item(&item(
            handle,
            "view.sidebar",
            &format!("左侧导航面板{}", combo("B")),
        )?)
        .separator()
        .item(&item(handle, "view.search", &format!("搜索{}", combo("F")))?)
        .item(&item(
            handle,
            "view.recenter",
            &format!("回到中心主题{}", combo("R")),
        )?)
        .item(&item(
            handle,
            "view.collapse",
            &format!("折叠 / 展开{}", combo("/")),
        )?)
        .item(&item(handle, "view.reset-zoom", &format!("缩放复位{}", combo("0")))?)
        .build()?;

    // —— 插入 ——
    let insert = SubmenuBuilder::new(handle, "插入")
        .item(&item(handle, "insert.child", &format!("子主题{}", " (Tab)"))?)
        .item(&item(handle, "insert.sibling", "同级主题 (Enter)")?)
        .item(&item(
            handle,
            "insert.parent",
            &format!("父主题{}", combo("Enter")),
        )?)
        .separator()
        .item(&item(handle, "insert.notes", "备注…")?)
        .item(&item(handle, "insert.labels", "标签…")?)
        .item(&item(handle, "insert.link", "链接…")?)
        .item(&item(handle, "insert.marker", "标记…")?)
        .item(&item(handle, "insert.image", "图片…")?)
        .separator()
        .item(&item(handle, "insert.relationship", "关系线…")?)
        .item(&item(handle, "insert.boundary", "边界…")?)
        .item(&item(handle, "insert.summary", "概要…")?)
        .build()?;

    // —— 格式：XMind 的「格式」菜单承载结构（图表类型）与面板开关 ——
    let format = SubmenuBuilder::new(handle, "格式")
        .item(&item(handle, "format.panel", "切换右侧格式面板")?)
        .separator()
        .item(&item(handle, "format.chart.mindmap", "思维导图")?)
        .item(&item(handle, "format.chart.logic", "逻辑图")?)
        .item(&item(handle, "format.chart.tree", "树状图")?)
        .item(&item(handle, "format.chart.org", "组织结构图")?)
        .item(&item(handle, "format.chart.fishbone", "鱼骨图")?)
        .item(&item(handle, "format.chart.timeline", "时间线")?)
        .build()?;

    // —— 工具 ——
    let tools = SubmenuBuilder::new(handle, "工具")
        .item(&item(handle, "tools.check-update", "检查更新…")?)
        .item(&item(handle, "tools.cycle-theme", "切换主题外观")?)
        .build()?;

    // —— 帮助 ——
    let help = SubmenuBuilder::new(handle, "帮助")
        .item(&item(handle, "help.shortcuts", "快捷键…")?)
        .item(&PredefinedMenuItem::about(
            handle,
            Some("关于 MindGrid"),
            None,
        )?)
        .build()?;

    MenuBuilder::new(handle)
        .item(&file)
        .item(&edit)
        .item(&view)
        .item(&insert)
        .item(&format)
        .item(&tools)
        .item(&help)
        .build()
}
