#!/usr/bin/env swift
/**
 * 读某个 App 的窗口标题。
 *
 * 为什么需要它：`screencapture` 在**屏幕锁定**时只返回一张只有壁纸的图（不报错），
 * 但 `CGWindowListCopyWindowInfo` 依然能枚举到窗口、并读到 `kCGWindowName`。
 * 本项目的窗口标题是前端通过 `getCurrentWindow().setTitle(...)` 写的
 * （见 `src/features/workspace/use-document-window-title.ts`），
 * 所以它就是一条**锁屏也读得到**的结论通道 —— 真机取证不必依赖截图。
 *
 * 用法：swift dev/read-window-title.swift [ownerName]（默认 MindGrid）
 */
import CoreGraphics
import Foundation

let owner = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "MindGrid"
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
  as? [[String: Any]] ?? []

var found = false
for window in list {
  let ownerName = (window[kCGWindowOwnerName as String] as? String) ?? ""
  guard ownerName == owner else { continue }
  let layer = (window[kCGWindowLayer as String] as? Int) ?? -1
  guard layer == 0 else { continue }
  let title = (window[kCGWindowName as String] as? String) ?? ""
  print(title)
  found = true
}
if !found {
  FileHandle.standardError.write("未找到 \(owner) 的窗口\n".data(using: .utf8)!)
  exit(2)
}
