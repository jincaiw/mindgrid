import {
  isMenuActionId,
  recentFileMenuActionIndex,
  MENU_ACTION_IDS,
  MENU_CHECK_ITEM_IDS,
  toCanvasCommand,
} from './menu-actions'
// 用 Vite 的 ?raw 直接把 Rust 源码读成字符串，避免依赖 node:fs
// （测试跑在 jsdom 环境，没有 node 类型与 import.meta.url 的 file: 语义）。
import menuRsSource from '../../../src-tauri/src/app/menu.rs?raw'
// 同上：App 包元数据也要静态守卫（「窗口」菜单的系统注入项靠它决定语言）
import infoPlistSource from '../../../src-tauri/Info.plist?raw'

it('has no duplicated action ids', () => {
  expect(new Set(MENU_ACTION_IDS).size).toBe(MENU_ACTION_IDS.length)
})

it('accepts known ids and rejects unknown ones', () => {
  expect(isMenuActionId('file.save')).toBe(true)
  expect(isMenuActionId('view.mode-outline')).toBe(true)
  expect(isMenuActionId('file.delete-everything')).toBe(false)
  expect(isMenuActionId('')).toBe(false)
  expect(isMenuActionId(null)).toBe(false)
  expect(isMenuActionId(42)).toBe(false)
})

/**
 * 契约测试：TS 侧的 id 清单必须与 Rust 侧 menu.rs 里注册的一致。
 *
 * 这是整个菜单栏最容易悄悄坏掉的地方——任一侧改了 id 而另一侧没跟，
 * 菜单项点击后会静默失效（Rust 转发了 id，前端 isMenuActionId 判否后直接丢弃），
 * 且没有任何编译期信号：两侧语言不同，谁也约束不了谁。
 */
it('stays in sync with the ids registered in src-tauri/src/app/menu.rs', () => {
  // 匹配 item(handle, "id", …) 与 check_item(handle, "id", …) 两个辅助函数的调用点。
  // 不直接匹配 MenuItem::with_id —— 那里拿到的是变量名而非字面量。
  // 注意 `item` 前要用 `\b`；`check_item` 的下划线是单词字符，
  // 故 `\bitem\(` 不会误命中 check_item 的尾部。
  // PredefinedMenuItem（窗口/关于）不经过这两个辅助函数，天然被排除。
  const rustIds = [
    ...menuRsSource.matchAll(/\b(?:item|check_item)\(\s*handle\s*,\s*"([^"]+)"/g),
  ].map((match) => match[1])

  expect(rustIds.length).toBeGreaterThan(30)
  expect(new Set(rustIds).size).toBe(rustIds.length)
  expect([...rustIds].sort()).toEqual([...MENU_ACTION_IDS].sort())
})

it('keeps every checkable id registered as a CheckMenuItem in Rust', () => {
  // 反过来验一遍：TS 声明为可勾选的项，Rust 侧必须真的用 check_item 注册。
  // 若 Rust 侧误写成 item，前端回写勾选态时会静默失败（get 到的是普通项）。
  for (const id of MENU_CHECK_ITEM_IDS) {
    expect(menuRsSource).toMatch(
      new RegExp(`check_item\\(\\s*handle\\s*,\\s*"${id.replace(/\./g, '\\.')}"`),
    )
  }
})

it('routes only canvas-internal commands to the canvas host', () => {
  // 剪贴板 / 样式剪贴板 / 相机都住在 CanvasHost 内部，外层拿不到
  expect(toCanvasCommand('edit.copy')).toBe('edit.copy')
  expect(toCanvasCommand('edit.cut')).toBe('edit.cut')
  expect(toCanvasCommand('edit.paste')).toBe('edit.paste')
  expect(toCanvasCommand('edit.duplicate')).toBe('edit.duplicate')
  expect(toCanvasCommand('edit.copy-style')).toBe('edit.copy-style')
  expect(toCanvasCommand('edit.paste-style')).toBe('edit.paste-style')
  expect(toCanvasCommand('edit.go-to-center')).toBe('edit.go-to-center')
  for (const id of ['view.zoom-in', 'view.zoom-out', 'view.zoom-actual', 'view.zoom-fit'] as const) {
    expect(toCanvasCommand(id)).toBe(id)
  }

  // 其余动作外层直接执行，不该转发
  expect(toCanvasCommand('edit.select-all')).toBeNull()
  expect(toCanvasCommand('edit.reset-style')).toBeNull()
  expect(toCanvasCommand('edit.expand-all')).toBeNull()
  expect(toCanvasCommand('insert.child')).toBeNull()
  expect(toCanvasCommand('view.sidebar')).toBeNull()
})

/**
 * 顶层菜单顺序契约：文件 / 编辑 / 插入 / 工具 / 查看 / 窗口 / 帮助。
 *
 * 「查看」必须排在「工具」之后（XMind 顺序）。曾有把顶层菜单按字母或
 * 直觉重排的改动，重排后菜单结构看着仍然"正常"，只有逐项对照才发现顺序变了，
 * 所以这里用源码顺序做断言。
 */
it('keeps the XMind top-level menu order in menu.rs', () => {
  const titles = ['文件', '编辑', '插入', '工具', '查看', '窗口', '帮助']
  const positions = titles.map((title) => {
    // 窗口 / 帮助 用 with_id(handle, <特殊 id>, "标题") 建（要拿 macOS 的菜单角色），
    // 其余用 new(handle, "标题")，两种写法都要认。
    const index = menuRsSource.search(
      new RegExp(`SubmenuBuilder::(?:new\\(handle,\\s*|with_id\\(handle,\\s*[A-Z_]+,\\s*)"${title}"`),
    )
    expect(index, `未找到顶层菜单「${title}」`).toBeGreaterThan(-1)
    return index
  })

  for (let i = 1; i < positions.length; i++) {
    expect(
      positions[i],
      `顶层菜单「${titles[i]}」应排在「${titles[i - 1]}」之后`,
    ).toBeGreaterThan(positions[i - 1])
  }
})

/**
 * macOS 菜单角色守卫。
 *
 * Tauri 启动时只对带 `WINDOW_SUBMENU_ID` / `HELP_SUBMENU_ID` 的子菜单调用
 * `set_as_windows_menu_for_nsapp()` / `set_as_help_menu_for_nsapp()`
 * （见 tauri 的 `app.rs::init_app_menu`）。少了这两个 id：
 *   - 窗口菜单不会自动列出打开的窗口（XMind 的窗口菜单末尾就有这一项）
 *   - 帮助菜单不会挂上系统帮助搜索角色
 * 两者都是**静默失效**——菜单看着仍然正常，只有逐项对照才发现少东西。
 */
it('uses the macOS window / help submenu roles', () => {
  expect(menuRsSource).toContain('WINDOW_SUBMENU_ID')
  expect(menuRsSource).toContain('HELP_SUBMENU_ID')
  expect(menuRsSource).toMatch(/SubmenuBuilder::with_id\(handle,\s*WINDOW_SUBMENU_ID,\s*"窗口"\)/)
  expect(menuRsSource).toMatch(/SubmenuBuilder::with_id\(handle,\s*HELP_SUBMENU_ID,\s*"帮助"\)/)
})

/**
 * 「窗口菜单的系统注入项要说中文」守卫。
 *
 * macOS 15 起，系统会往任何带 `NSApp.windowsMenu` 角色的菜单里**注入**一整组窗口平铺项：
 * 填充 / 居中 / 进入全屏幕 / 移动与调整大小 / 全屏幕平铺 / 从组中移除窗口 /
 * 前置全部窗口 / 合并所有窗口 / 窗口列表。我们靠 `WINDOW_SUBMENU_ID` 已拿到该角色
 * （见上一条），**不需要也不应该自己实现这些项**——自己实现只会得到重复项与重复快捷键。
 *
 * 但它们的**字符串由系统提供，按 App 包声明的本地化解析**：主包只声明 English 时，
 * 中文界面里就会冒出一排英文菜单项。修法是 `src-tauri/Info.plist` 声明中文
 * （Tauri 会自动把它与生成的 Info.plist 合并，已在产物上实测）。
 *
 * 为什么必须静态守卫：删掉这个键**不会有任何编译期 / 运行时报错**，
 * 界面其余部分照旧，只在用户展开「窗口」菜单时才看得出来。
 */
it('declares Simplified Chinese so system-injected window items are localized', () => {
  expect(infoPlistSource).toContain('CFBundleLocalizations')
  // 声明的两种写法都实测有效；保留两者以覆盖不同 macOS 版本对旧式名的解析。
  expect(infoPlistSource).toMatch(/<string>zh-Hans<\/string>/)
  expect(infoPlistSource).toMatch(/<string>zh_CN<\/string>/)
  // `CFBundleLocalizations` 是"支持哪些"而非"强制哪一个"：去掉 en 会让英文系统也变成中文。
  expect(infoPlistSource).toMatch(/<string>en<\/string>/)
})

/**
 * 麦克风用途说明守卫。
 *
 * macOS 上 **Info.plist 里没有 `NSMicrophoneUsageDescription` 就拿不到麦克风**：
 * `getUserMedia` 直接以 `NotAllowedError` 拒绝，而且**连授权对话框都不弹**
 * （系统认定这个 App 没打算用麦克风）。表现是"点了开始录音只得到一句未授权提示"，
 * 用户去系统设置里也找不到这个 App —— 因为系统根本没有它的麦克风条目。
 *
 * 删掉这个键同样**没有任何编译期/运行时报错**，只在用户点录音时才暴露，故静态守卫。
 * 文案会原样显示在系统授权对话框里，所以顺带钉住"要说清用途"。
 */
it('declares a microphone usage description for voice notes', () => {
  expect(infoPlistSource).toContain('NSMicrophoneUsageDescription')
  const description = /<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(
    infoPlistSource,
  )
  expect(description).not.toBeNull()
  // 不能是空串或占位符：它要出现在系统对话框里
  expect(description![1].trim().length).toBeGreaterThan(8)
})

/**
 * 应用菜单守卫。
 *
 * `Menu::default()` 里那段 macOS 应用菜单（服务 / 隐藏 / 隐藏其他 / 显示全部 / 退出）
 * 是我们的自定义 MenuBuilder **不会自动获得**的：`init_for_nsapp()` 只做
 * `NSApplication.setMainMenu(我们的菜单)`（见 muda 的 platform_impl/macos）。
 * 少了它用户就没有 ⌘Q 退出、不能隐藏应用。
 */
it('keeps a macOS app menu so quit / hide are reachable', () => {
  expect(menuRsSource).toContain('#[cfg(target_os = "macos")]')
  for (const call of ['.services()', '.hide()', '.hide_others()', '.show_all()', '.quit()']) {
    expect(menuRsSource, `应用菜单缺少 ${call}`).toContain(call)
  }
})

/**
 * 「最近打开」是**动态 id 家族**（`file.recent.N`），无法进静态 id 集合
 * （那个集合要与 Rust 侧的字面量一一对应）。这里单独钉住它的识别规则。
 */
describe('最近打开的菜单 id', () => {
  it('识别动态下标', () => {
    expect(recentFileMenuActionIndex('file.recent.0')).toBe(0)
    expect(recentFileMenuActionIndex('file.recent.12')).toBe(12)
  })

  it('不是这一类一律返回 null', () => {
    expect(recentFileMenuActionIndex('file.recent')).toBeNull()
    expect(recentFileMenuActionIndex('file.recent.')).toBeNull()
    expect(recentFileMenuActionIndex('file.recent.x')).toBeNull()
    expect(recentFileMenuActionIndex('file.recent.-1')).toBeNull()
    expect(recentFileMenuActionIndex('file.recent-clear')).toBeNull()
    expect(recentFileMenuActionIndex('file.save')).toBeNull()
    expect(recentFileMenuActionIndex('')).toBeNull()
    expect(recentFileMenuActionIndex(null)).toBeNull()
    expect(recentFileMenuActionIndex(3)).toBeNull()
  })

  it('静态的「清除菜单」走普通 id 通道（在两份 id 集合里）', () => {
    expect(isMenuActionId('file.recent-clear')).toBe(true)
    // 动态家族**不**在静态集合里，否则 id 同步契约测试会比较不过
    expect(isMenuActionId('file.recent.0')).toBe(false)
  })
})
