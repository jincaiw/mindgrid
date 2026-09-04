pub mod assets;
pub mod commands;
pub mod import_export;
// 菜单栏仅桌面端存在：移动端没有系统菜单栏，Tauri 的移动构建也不提供
// on_menu_event。加 cfg 门，避免为 android 目标编译时符号缺失。
#[cfg(desktop)]
pub mod menu;
pub mod persistence;
