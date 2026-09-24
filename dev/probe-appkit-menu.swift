// 「窗口」菜单取证探针 —— 在本沙箱**无法合成点击**（osascript -10004）时，
// 唯一能看清 AppKit 到底往菜单里放了什么办法：自己把菜单弹出来，让外部截图。
//
// ## 用途
//
// 1. 看 macOS 15+ 系统注入到 windowsMenu 的那一整组窗口平铺项叫什么、什么语言；
// 2. 判断"某个菜单项到底有没有显示"——静态枚举（NSMenu.items / muda 的模型）**看不到注入项**，
//    必须真正弹出。
//
// ## 用法
//
//   # ① 裸可执行文件（无包本地化 → 系统项为英文）
//   swiftc -O -o /tmp/menuprobe dev/probe-appkit-menu.swift && /tmp/menuprobe "标题" &
//   sleep 6 && screencapture -x /tmp/menu.png && pkill -f menuprobe
//
//   # ② 吃某个 .app 包自己的 Info.plist（只换可执行文件、文件名保持一致，
//   #    这样 plist 一字未改 —— 用来验证"这个产物的菜单会不会是中文"）
//   cp -R src-tauri/target/debug/bundle/macos/MindGrid.app /tmp/Probe.app
//   cp /tmp/menuprobe /tmp/Probe.app/Contents/MacOS/mindgrid && chmod +x ...
//   /tmp/Probe.app/Contents/MacOS/mindgrid "MindGrid产物plist" &
//
// ## 两个必须知道的坑
//
// - **`NSMenu.update()` 看不到注入**：只有真正弹出（popUp / 菜单栏展开）时才发生。
//   所以"我枚举了一下 items，没看到填充/居中" **不能**作为"没有这些项"的证据。
// - **弹出的菜单里，我们自己声明的自定义项可能整条消失**（实测：最小化/缩放保留，
//   带真实 target 的自定义项也不见了）—— 而在**非 windowsMenu** 的普通菜单里同样的项完好无损。
//   也就是说这是 windowsMenu 路径特有的行为。所以**不要**用这个探针的项数去反推
//   "我们的菜单项没生效"，结论只能限于"注入项长什么样、什么语言"。

import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.regular)

// 与 src-tauri/src/app/menu.rs 的「窗口」子菜单保持一致
let windowMenu = NSMenu(title: "窗口")
let minimize = NSMenuItem(
    title: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
minimize.keyEquivalentModifierMask = [.command]
windowMenu.addItem(minimize)
windowMenu.addItem(
    NSMenuItem(title: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
windowMenu.addItem(.separator())
windowMenu.addItem(
    NSMenuItem(title: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
windowMenu.addItem(.separator())
windowMenu.addItem(
    NSMenuItem(title: "全屏切换", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: ""))

// 这一步是"拿到系统注入"的唯一前提（muda 的 set_as_windows_menu_for_nsapp 就是设它）
NSApp.windowsMenu = windowMenu

let w = NSWindow(
    contentRect: NSRect(x: 60, y: 60, width: 560, height: 420),
    styleMask: [.titled, .closable, .resizable],
    backing: .buffered,
    defer: false
)
w.title = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "menu probe"
w.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)

DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
    print("preferredLanguages:", Locale.preferredLanguages)
    print("bundle localizations:", Bundle.main.localizations.sorted())
    windowMenu.popUp(positioning: nil, at: NSPoint(x: 20, y: 350), in: w.contentView)
    print("menu closed")
    NSApp.terminate(nil)
}

app.run()
