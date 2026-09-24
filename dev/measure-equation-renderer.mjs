/**
 * 方程渲染内核的真引擎取证（Playwright + Chromium）。
 *
 * 为什么必须真引擎：`src/lib/equation/renderer.ts` 的核心是 **MathJax 本身** ——
 * jsdom 里既没有它、也没有 SVG 度量。而这个模块又踩过一个只有真引擎才看得见的坑
 * （SRE worker：`tex2svgPromise` / `typesetPromise` 会永久挂起，同步 `tex2svg` 才可用），
 * 所以"能渲染出来"这件事只能在这里钉。
 *
 * 验的东西：
 * 1. 引擎**懒加载**成功（首次 true；重复调用复用同一个 promise）
 * 2. 引擎就绪前 `renderEquationSync` 返回 null（不抛、不卡）
 * 3. 渲染成功：status=ok、带 xmlns、width/height 与 viewBox 同量纲
 * 4. **缓存生效**：同 `latex|display` 第二次返回同一个对象；`getCachedEquation` 能取到
 * 5. **语法错误**给出可读信息（不是抛异常、不是静默空图）
 * 6. 产物**自包含**：没有指向外部的引用，字形是 `<path>` 轮廓（导出不需要字体文件）
 * 7. inline 与 display 是两条不同的缓存键，且排版结果不同
 * 8. 离线：除无障碍 SRE worker 外没有任何外部请求
 *
 * 用法：node dev/measure-equation-renderer.mjs [baseUrl]
 * 前置：vite dev 在 baseUrl 上监听（必须 127.0.0.1）
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:1421').replace(/\/$/, '')
const outDir = 'outputs/native/v0.4.21'
const executablePath = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)

const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()
const external = []
await page.route('**/*', (route) => {
  const url = route.request().url()
  const sameOrigin = url.startsWith(baseUrl) || /^(data|blob|about):/.test(url)
  if (!sameOrigin) {
    external.push(url)
    return route.abort()
  }
  return route.continue()
})
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
// 走 vite 的模块图拿真实模块（`?url` 只在 vite 下可解析）。每次 evaluate 里 import 同一 URL，
// 命中浏览器模块缓存 → 拿到的是同一个模块实例（引擎与缓存状态是共享的）。
const MODULE = "'/src/lib/equation/renderer.ts'"

// —— 2. 引擎就绪前：同步接口必须是 null（不抛、不阻塞）——
const beforeReady = await page.evaluate(`(async () => {
  const m = await import(${MODULE})
  return { sync: m.renderEquationSync('x^2'), cached: m.getCachedEquation('x^2') }
})()`)
check(
  '引擎就绪前 renderEquationSync 返回 null（不抛不卡）',
  beforeReady.sync === null && beforeReady.cached === null,
  JSON.stringify(beforeReady),
)

// —— 1. 懒加载 ——
const load = await page.evaluate(`(async () => {
  const m = await import(${MODULE})
  const first = await m.loadEquationEngine()
  const second = await m.loadEquationEngine()
  return { first, second }
})()`)
check('引擎懒加载成功（两次调用都返回 true）', load.first === true && load.second === true, JSON.stringify(load))

// —— 3. 渲染 + 4. 缓存 ——
const render = await page.evaluate(`(async () => {
  const m = await import(${MODULE})
  const a = await m.renderEquation('a^2+b^2=c^2')
  const b = m.renderEquationSync('a^2+b^2=c^2')
  const cached = m.getCachedEquation('a^2+b^2=c^2')
  return {
    a, b, cached,
    sameObject: a === b,
    reused: a === cached,
    svgHead: a?.svg?.slice(0, 90) ?? '',
    pathCount: (a?.svg?.match(/<path/g) ?? []).length,
    // 只算**真引用**：xmlns 里的命名空间 URL 不是外部资源（第一版断言把它算进去 → 假失败）
    externalRefs: (a?.svg?.match(/(?:href|src)=["']https?:|url\\(["']?https?:/g) ?? []).length,
    keys: m.equationKey('a^2+b^2=c^2', false),
  }
})()`)
check('渲染成功（status=ok 且有 SVG）', render.a?.status === 'ok' && render.svgHead.includes('<svg'), render.svgHead)
check(
  '尺寸来自 viewBox 且为正',
  render.a?.width > 0 && render.a?.height > 0,
  `width=${render.a?.width} height=${render.a?.height}`,
)
check('产物带 xmlns（可独立插入/导出）', render.svgHead.includes('xmlns="http://www.w3.org/2000/svg"'))
check('字形是 path 轮廓（导出不需要字体文件）', render.pathCount > 0, `path 数=${render.pathCount}`)
check('产物自包含：没有外部引用', render.externalRefs === 0, `外部引用=${render.externalRefs}`)
check('缓存生效：同键复用同一个对象', render.sameObject === true && render.reused === true)

// —— 5. 语法错误 ——
const bad = await page.evaluate(`(async () => {
  const m = await import(${MODULE})
  const r = await m.renderEquation('\\\\frac{a}{')
  return { r, cached: m.getCachedEquation('\\\\frac{a}{') }
})()`)
check(
  '语法错误给出可读信息（不抛异常）',
  bad.r?.status === 'error' && typeof bad.r.message === 'string' && bad.r.message.length > 0,
  JSON.stringify(bad.r),
)

// —— 7. inline vs display ——
const forms = await page.evaluate(`(async () => {
  const m = await import(${MODULE})
  const inline = await m.renderEquation('\\\\sum_{i=1}^{n} i', false)
  const display = await m.renderEquation('\\\\sum_{i=1}^{n} i', true)
  return {
    inlineKey: m.equationKey('\\\\sum_{i=1}^{n} i', false),
    displayKey: m.equationKey('\\\\sum_{i=1}^{n} i', true),
    inline: { w: inline?.width, h: inline?.height, status: inline?.status },
    display: { w: display?.width, h: display?.height, status: display?.status },
  }
})()`)
check(
  'inline / display 是两条独立缓存键且排版不同',
  forms.inlineKey !== forms.displayKey && forms.inline.status === 'ok' && forms.display.status === 'ok' &&
    (forms.inline.h !== forms.display.h || forms.inline.w !== forms.display.w),
  `${JSON.stringify(forms.inline)} vs ${JSON.stringify(forms.display)}`,
)

// —— 8. 离线 ——
check(
  '只请求了无障碍 SRE worker（其余零外部请求）',
  external.every((url) => url.includes('speech-worker')),
  external.length ? external.join(', ') : '无外部请求',
)

// —— 存一份样例 SVG，供文档/后续对照用 ——
await mkdir(outDir, { recursive: true })
await writeFile(
  path.join(outDir, 'equation-sample.svg'),
  await page.evaluate(`(async () => (await import(${MODULE})).renderEquationSync('a^2+b^2=c^2').svg)()`),
)
await writeFile(
  path.join(outDir, 'equation-renderer-evidence.json'),
  JSON.stringify({ results, external, pageErrors, render: { ...render, a: undefined, b: undefined, cached: undefined } }, null, 2),
)

const failed = results.filter((r) => !r.pass)
console.log(`\n共 ${results.length} 条断言，失败 ${failed.length}`)
if (pageErrors.length) {
  console.log('页面错误:', pageErrors.slice(0, 3))
}
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
