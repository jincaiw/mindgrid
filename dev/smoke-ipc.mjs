#!/usr/bin/env node
/**
 * 真机 IPC 冒烟驱动：构建 → 启动 → 读窗口标题 → 判定。
 *
 * 为什么用"窗口标题"而不是截图：
 * ① 屏幕锁定时 `screencapture` 只返回壁纸**而且不报错**，截到的图看着像成功；
 * ② 应用某些区域的图层会把浮层盖住（实测同一份探测代码时而全可见、时而被盖）。
 * 窗口标题两条都不怕 —— `CGWindowListCopyWindowInfo` 在锁屏下照常返回窗口名。
 *
 * 用法：
 *   node dev/smoke-ipc.mjs              # 构建 + 跑 + 判定
 *   node dev/smoke-ipc.mjs --skip-build # 复用上次的产物（调试驱动脚本时用）
 *   node dev/smoke-ipc.mjs --keep       # 跑完不退出应用
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SMOKE_DIST = 'dev/ipc-smoke/dist'
const APP = path.join(REPO, 'src-tauri/target/debug/bundle/macos/MindGrid.app')
const TITLE_READER = path.join(REPO, 'dev/read-window-title.swift')
const OWNER = 'MindGrid'
const MARKER = 'IPCSMOKE'
const TIMEOUT_MS = 60_000
const POLL_MS = 1_500

const args = new Set(process.argv.slice(2))
const toolPath = `${process.env.HOME}/.cargo/bin:/opt/homebrew/bin:${process.env.PATH}`

function log(message) {
  process.stdout.write(`${message}\n`)
}

function killApp() {
  try {
    execFileSync('pkill', ['-x', 'mindgrid'], { stdio: 'ignore' })
  } catch {
    // 没在跑就算了
  }
}

async function buildSmokePage() {
  log('① 构建冒烟页面（独立入口，不进正式包）')
  await build({
    root: path.join(REPO, 'dev/ipc-smoke'),
    base: './',
    logLevel: 'warn',
    build: { outDir: 'dist', emptyOutDir: true, target: 'safari15' },
  })
  if (!existsSync(path.join(REPO, SMOKE_DIST, 'index.html'))) {
    throw new Error(`冒烟页面构建失败：${SMOKE_DIST}/index.html 不存在`)
  }
}

function buildApp() {
  log('② 构建调试包（frontendDist 指向冒烟页面）')
  const config = JSON.stringify({
    // `createUpdaterArtifacts: false`：调试包不需要更新签名，否则会在最后一步因为
    // 没有 `TAURI_SIGNING_PRIVATE_KEY` 而报错退出（产物其实已经打好了 —— 但脚本会因此中断）
    build: { frontendDist: `../${SMOKE_DIST}`, beforeBuildCommand: '' },
    bundle: { createUpdaterArtifacts: false },
  })
  try {
    execFileSync(
      path.join(REPO, 'node_modules/.bin/tauri'),
      ['build', '--debug', '--bundles', 'app', '--config', config],
      { cwd: REPO, env: { ...process.env, PATH: toolPath }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    // 兜底：只要 .app 出来了就当成功（例如签名相关的新报错）
    if (!existsSync(APP)) {
      log(String(error?.stderr ?? error?.message ?? error))
      throw error
    }
    log('   ⚠️ tauri build 退出码非 0，但 .app 已生成 —— 继续')
  }
  if (!existsSync(APP)) {
    throw new Error(`调试包不存在：${APP}`)
  }
}

function readTitle() {
  try {
    return execFileSync('swift', [TITLE_READER, OWNER], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function launchApp() {
  log('③ 启动调试包')
  killApp()
  const child = spawn('open', ['-a', APP], { detached: true, stdio: 'ignore' })
  child.unref()
}

async function waitForVerdict() {
  const deadline = Date.now() + TIMEOUT_MS
  let last = ''
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    const title = readTitle()
    if (title && title !== last) {
      last = title
      log(`   标题：${title}`)
    }
    if (title.startsWith(MARKER)) {
      return title
    }
  }
  return ''
}

async function main() {
  if (!args.has('--skip-build')) {
    await buildSmokePage()
    buildApp()
  } else if (!existsSync(APP)) {
    throw new Error(`--skip-build 但找不到产物：${APP}`)
  }

  // 应用起来到写标题之间的窗口里，标题还是 tauri.conf.json 里的默认值，能区分开
  launchApp()
  const title = await waitForVerdict()
  if (!args.has('--keep')) {
    killApp()
  }

  if (!title) {
    log(`\n❌ ${TIMEOUT_MS / 1000} 秒内没等到 ${MARKER} 结论`)
    log('   排查：应用是否启动？冒烟页面是否被 frontendDist 正确指向？')
    process.exit(1)
  }

  const fields = Object.fromEntries(
    [...title.matchAll(/(\w+)=([^\s]+)/g)].map((m) => [m[1], m[2]]),
  )
  const failed = Number(fields.argfail ?? NaN) > 0 || Number(fields.jsfail ?? NaN) > 0
  log(`\n${title}`)
  if (failed) {
    log('❌ 存在参数契约失败（argfail/jsfail 非 0）；标题里 bad= 后面是失败的命令名')
    process.exit(1)
  }
  log('✅ 全部命令的参数契约通过（真机 + 真 IPC + 带参数）')
}

main().catch((error) => {
  log(`\n💥 ${error?.message ?? error}`)
  process.exit(1)
})
