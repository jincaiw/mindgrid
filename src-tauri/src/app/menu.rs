//! 应用原生菜单栏（对标 XMind 桌面端「文件 / 编辑 / 插入 / 工具 / 查看 / 窗口 / 帮助」）。
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
//! 3. **勾选态由前端回写。** 可勾选项（查看模式的单选项、各面板显隐）的真实状态
//!    只有前端知道——用户可能用快捷键或工具栏按钮切换，那时菜单项不会因为没被点
//!    击而自动更新。故提供 `set_menu_item_checked` 命令，前端在状态变化时回写。
//!    否则菜单上的勾会「说谎」。
//!
//! 4. macOS 自动成为系统菜单栏，Windows / Linux 显示在窗口内（Tauri 默认行为）。

use tauri::{
    menu::{
        CheckMenuItem, Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder,
        HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
    },
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

/// ⌥⌘X（macOS）/ Ctrl+Alt+X（其余平台）。
fn combo_alt(key: &str) -> String {
    if cfg!(target_os = "macos") {
        format!(" (⌥⌘{})", key)
    } else {
        format!(" (Ctrl+Alt+{})", key)
    }
}

/// 无修饰键的按键提示（Tab / Enter / Delete 等）。
fn plain(key: &str) -> String {
    format!(" ({})", key)
}

/// 带快捷键提示的菜单项。id 是稳定契约，前端按 id 派发。
fn item<R: Runtime, M: tauri::Manager<R>>(
    manager: &M,
    id: &'static str,
    text: &str,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(manager, id, text, true, None::<&str>)
}

/// 可勾选菜单项（查看模式的单选项、面板显隐）。
///
/// 初始 checked 一律为「默认视图」的样子，真实状态由前端在挂载后回写。
fn check_item<R: Runtime, M: tauri::Manager<R>>(
    manager: &M,
    id: &'static str,
    text: &str,
    checked: bool,
) -> tauri::Result<CheckMenuItem<R>> {
    CheckMenuItem::with_id(manager, id, text, true, checked, None::<&str>)
}

pub fn build_menu<R: Runtime>(
    handle: &AppHandle<R>,
    recent_files: &[String],
) -> tauri::Result<Menu<R>> {
    // —— 文件 ——
    // 导入/导出收成二级子菜单（XMind 同样如此），避免一级菜单过长。
    let import = SubmenuBuilder::new(handle, "导入")
        .item(&item(handle, "file.import-markdown", "Markdown…")?)
        .item(&item(handle, "file.import-opml", "OPML…")?)
        .item(&item(handle, "file.import-docx", "Word…")?)
        .build()?;

    let export = SubmenuBuilder::new(handle, "导出")
        .item(&item(handle, "file.export-markdown", "Markdown…")?)
        .item(&item(handle, "file.export-opml", "OPML…")?)
        .item(&item(handle, "file.export-png", "PNG 图片…")?)
        .item(&item(handle, "file.export-svg", "SVG 矢量图…")?)
        .item(&item(handle, "file.export-pdf", "PDF 文档…")?)
        .build()?;

    // 「最近打开」：列表为空时**整个子菜单不出现**（不留一个空壳菜单项）。
    // 下标进 id、路径由 Rust 自己解析（见 recents::resolve）——前端不需要维护第二份列表。
    // 注意这些 id 是**变量拼接**出来的，不是字面量：前端菜单 id 同步契约测试只比对静态字面量，
    // 动态家族由 `recentFileMenuActionIndex` 单独识别。
    let recent = {
        let mut builder = SubmenuBuilder::new(handle, "最近打开");
        for (index, file_path) in recent_files.iter().enumerate() {
            let label = std::path::Path::new(file_path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| file_path.clone());
            builder = builder.text(format!("file.recent.{index}"), label);
        }
        // 用 item() 而不是 text()：静态 id 要经过辅助函数，前端「id 同步契约」才比对得到
        builder
            .separator()
            .item(&item(handle, "file.recent-clear", "清除菜单")?)
            .build()?
    };

    // 「最近打开」为空时整个子菜单不出现——不留空壳，也不放长期置灰的占位项
    let mut file_builder = SubmenuBuilder::new(handle, "文件")
        .item(&item(handle, "file.new", &format!("新建文档{}", combo("N")))?)
        .item(&item(
            handle,
            "file.new-sheet",
            &format!("新建标签页{}", combo("T")),
        )?)
        .item(&item(handle, "file.open", &format!("打开文档…{}", combo("O")))?);
    if !recent_files.is_empty() {
        file_builder = file_builder.item(&recent);
    }
    let file = file_builder
        .separator()
        .item(&item(handle, "file.save", &format!("保存{}", combo("S")))?)
        .item(&item(
            handle,
            "file.save-as",
            &format!("另存为…{}", combo_shift("S")),
        )?)
        .separator()
        .item(&import)
        .item(&export)
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
        .item(&item(handle, "edit.copy", &format!("拷贝{}", combo("C")))?)
        .item(&item(handle, "edit.paste", &format!("粘贴{}", combo("V")))?)
        .item(&item(handle, "edit.duplicate", &format!("复制{}", combo("D")))?)
        .item(&item(
            handle,
            "edit.delete-topic",
            &format!("删除主题{}", plain("Delete")),
        )?)
        // 只摘掉该主题本身、子主题上提。XMind 绑定 ⌥⌫，我们尚未注册该组合键，
        // 所以**不写快捷键提示**——菜单标签不能出现按了没反应的提示。
        .item(&item(handle, "edit.delete-topic-only", "删除单个主题")?)
        .separator()
        .item(&item(handle, "edit.indent", "缩进")?)
        .item(&item(handle, "edit.outdent", "减少缩进")?)
        .separator()
        .item(&item(
            handle,
            "edit.copy-style",
            &format!("拷贝样式{}", combo_alt("C")),
        )?)
        .item(&item(
            handle,
            "edit.paste-style",
            &format!("粘贴样式{}", combo_alt("V")),
        )?)
        .item(&item(
            handle,
            "edit.reset-style",
            &format!("重设样式{}", combo_alt("0")),
        )?)
        .separator()
        .item(&item(
            handle,
            "edit.go-to-center",
            &format!("前往中心主题{}", combo("R")),
        )?)
        .item(&item(
            handle,
            "edit.select-all",
            &format!("全选{}", combo("A")),
        )?)
        .separator()
        .item(&item(handle, "edit.expand-subtopics", "展开子主题")?)
        .item(&item(
            handle,
            "edit.expand-all",
            "展开所有子分支",
        )?)
        .item(&item(
            handle,
            "edit.collapse",
            &format!("折叠 / 展开{}", combo("/")),
        )?)
        .separator()
        .item(&item(
            handle,
            "edit.find",
            &format!("查找与替换{}", combo("F")),
        )?)
        .build()?;

    // —— 插入 ——
    let insert = SubmenuBuilder::new(handle, "插入")
        .item(&item(
            handle,
            "insert.child",
            &format!("子主题{}", plain("Tab")),
        )?)
        .item(&item(
            handle,
            "insert.sibling-after",
            &format!("主题（之后）{}", plain("Enter")),
        )?)
        .item(&item(
            handle,
            "insert.sibling-before",
            &format!("主题（之前）{}", plain("⇧Enter")),
        )?)
        .item(&item(
            handle,
            "insert.parent",
            &format!("父主题{}", combo("Enter")),
        )?)
        .item(&item(handle, "insert.free-topic", "自由主题")?)
        .separator()
        .item(&item(handle, "insert.relationship", "联系")?)
        .item(&item(handle, "insert.summary", "概要")?)
        .item(&item(handle, "insert.boundary", "外框")?)
        .separator()
        .item(&item(handle, "insert.notes", "笔记")?)
        .item(&item(handle, "insert.labels", "标签")?)
        .item(&item(handle, "insert.task", "任务")?)
        .item(&item(handle, "insert.link", "链接")?)
        .item(&item(handle, "insert.marker", "标记")?)
        .item(&item(handle, "insert.image", "本地图片…")?)
        .separator()
        .item(&item(
            handle,
            "insert.new-sheet",
            &format!("新画布{}", combo_alt("N")),
        )?)
        .build()?;

    // —— 工具 ——
    let tools = SubmenuBuilder::new(handle, "工具")
        .item(&item(handle, "tools.check-update", "检查更新…")?)
        .item(&item(handle, "tools.shortcuts", "快捷键…")?)
        .item(&item(handle, "tools.cycle-theme", "切换明暗外观")?)
        .build()?;

    // —— 查看 ——
    // 思维导图 / 大纲是互斥单选项，甘特图与下方各面板显隐是可独立勾选的开关。
    let view = SubmenuBuilder::new(handle, "查看")
        .item(&check_item(handle, "view.mode-mindmap", "思维导图", true)?)
        .item(&check_item(handle, "view.mode-outline", "大纲", false)?)
        .separator()
        .item(&check_item(handle, "view.gantt", "甘特图", false)?)
        .separator()
        .item(&item(handle, "view.zoom-in", &format!("放大{}", combo("+")))?)
        .item(&item(handle, "view.zoom-out", &format!("缩小{}", combo("-")))?)
        // ⌘0 = 实际大小、⌘1 = 适应画布（对齐 XMind，也符合平台通例）
        .item(&item(
            handle,
            "view.zoom-actual",
            &format!("实际大小{}", combo("0")),
        )?)
        .item(&item(handle, "view.zoom-fit", &format!("适应画布{}", combo("1")))?)
        .separator()
        .item(&item(handle, "view.zen", &format!("ZEN 模式{}", combo(".")))?)
        .item(&item(
            handle,
            "view.present",
            &format!("演说模式{}", combo_shift("P")),
        )?)
        .item(&item(handle, "view.pitch", "提案简报")?)
        .separator()
        .item(&check_item(
            handle,
            "view.sidebar",
            &format!("导航面板{}", combo("B")),
            true,
        )?)
        .item(&check_item(
            handle,
            "view.inspector",
            &format!("格式面板{}", combo("I")),
            true,
        )?)
        .item(&check_item(handle, "view.toolbar", "工具栏", true)?)
        // 名称用 XMind 的「画布栏」：这一项控制的是底部的**画布（工作表）栏**。
        // XMind 的「标签页栏」指多文档标签（⌥⌘T），是另一个东西——
        // 本项目单文档、没有多文档标签，故不设那一项，也不能借用它的名字。
        .item(&check_item(
            handle,
            "view.tab-bar",
            &format!("显示画布栏{}", combo_shift("T")),
            true,
        )?)
        .build()?;

    // —— 窗口：系统预置项，无自定义 id ——
    //
    // **必须带 `WINDOW_SUBMENU_ID`**：Tauri 启动时只对带这个 id 的子菜单调用
    // `set_as_windows_menu_for_nsapp()`（见 tauri/src/app.rs 的 `init_app_menu`）。
    // 不带就没有 macOS「窗口菜单」角色——**打开的窗口列表不会自动列在这里**
    // （XMind 的窗口菜单末尾就有「✓ 思维导图」这一项，正是该角色的产物）。
    //
    // 顺序对齐 XMind：最小化 / 缩放 → 关闭窗口 → 全屏切换，随后由系统追加窗口列表。
    let window = SubmenuBuilder::with_id(handle, WINDOW_SUBMENU_ID, "窗口")
        .item(&PredefinedMenuItem::minimize(handle, Some("最小化"))?)
        .item(&PredefinedMenuItem::maximize(handle, Some("缩放"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(handle, Some("关闭窗口"))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(handle, Some("全屏切换"))?)
        .build()?;

    // —— 帮助 ——
    // 同理必须带 `HELP_SUBMENU_ID`，macOS 才会挂上系统「帮助」菜单的搜索框角色。
    let help = SubmenuBuilder::with_id(handle, HELP_SUBMENU_ID, "帮助")
        .item(&PredefinedMenuItem::about(
            handle,
            Some("关于 MindGrid"),
            None,
        )?)
        .build()?;

    // —— 应用菜单（仅 macOS）——
    //
    // 这一段**不能省**：`init_for_nsapp()` 只是把我们的菜单整体设为 NSApp 的 main menu
    // （见 muda 的 platform_impl/macos），**不会自动补一个应用菜单**。
    // 缺了它，用户就没有 ⌘Q 退出、没有隐藏 / 隐藏其他 / 显示全部、也没有「服务」——
    // XMind 的应用菜单（基准图 19）里这些全都有。
    //
    // 「关于」留在「帮助」里（那里已有），应用菜单不重复放一份，避免同一项出现两次。
    #[cfg(target_os = "macos")]
    let app_menu = {
        let pkg = handle.package_info();
        SubmenuBuilder::new(handle, &pkg.name)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?
    };

    let mut builder = MenuBuilder::new(handle);
    // macOS 的第一项必须是应用菜单（进程名 + 服务/隐藏/退出）
    #[cfg(target_os = "macos")]
    {
        builder = builder.item(&app_menu);
    }
    builder
        .item(&file)
        .item(&edit)
        .item(&insert)
        .item(&tools)
        .item(&view)
        .item(&window)
        .item(&help)
        .build()
}

/// 按当前最近文件列表重建菜单。
///
/// **必须重新应用 macOS 的窗口/帮助菜单角色**：`AppHandle::set_menu` 只替换菜单，
/// 不会像启动路径那样调用 `init_app_menu`（见 tauri `app.rs`）。少了这一步，
/// 重建一次就会**悄悄丢掉窗口列表与帮助搜索**——正是本项目刚修好的东西。
pub fn refresh_menu<R: Runtime>(app: &AppHandle<R>) {
    let recents = crate::app::recents::load(app);
    let Ok(menu) = build_menu(app, &recents) else {
        return
    };

    #[cfg(target_os = "macos")]
    {
        if let Some(submenu) = menu
            .get(WINDOW_SUBMENU_ID)
            .and_then(|entry| entry.as_submenu().cloned())
        {
            let _ = submenu.set_as_windows_menu_for_nsapp();
        }
        if let Some(submenu) = menu
            .get(HELP_SUBMENU_ID)
            .and_then(|entry| entry.as_submenu().cloned())
        {
            let _ = submenu.set_as_help_menu_for_nsapp();
        }
    }

    let _ = app.set_menu(menu);
}

/// 回写菜单项的勾选态（供前端在状态变化时调用）。
///
/// 找不到对应 id（例如浏览器开发态没有原生菜单）时静默返回，不视为错误——
/// 勾选态只是显示细节，不该因为菜单缺失而打断业务流程。
pub fn set_menu_item_checked<R: Runtime>(app: &AppHandle<R>, id: &str, checked: bool) {
    // `Manager::menu()` 返回 Option：桌面端一定有菜单，移动端/无菜单窗口则为 None
    let Some(menu) = app.menu() else {
        return
    };
    let Some(entry) = menu.get(id) else {
        return
    };
    if let Some(check_item) = entry.as_check_menuitem() {
        let _ = check_item.set_checked(checked);
    }
}
