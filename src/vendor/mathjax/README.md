# 第三方文件：MathJax（`tex-svg.js`）

**这个目录里的文件不是本项目的代码，是原样搬运的第三方产物。不要改。**

| 项 | 值 |
|---|---|
| 包 | `mathjax` |
| 版本 | **4.1.0**（钉死，不用 `^`） |
| 文件 | `tex-svg.js`（TeX 输入 + SVG 输出，**字体数据已内联**） |
| 大小 / sha256 | 1,845,599 字节 · `438b7c266ac8c59e7cd9718f8d3dbf56a2fe0dcb32df1cfb9803cdda0d09bdfd` |
| 许可 | **Apache-2.0**（全文见同目录 `LICENSE`） |
| 来源 | `https://cdn.jsdelivr.net/npm/mathjax@4.1.0/tex-svg.js`（与 `unpkg.com` 同文件、字节一致） |
| 取法 | 直接下载搬运。本沙箱的包管理器通道被拦（`ERR_PNPM_CODEBUDDY_BROKER_DENY`），**但 CDN / npm registry 可达**，所以走 vendor |

## 为什么是这一个文件

- 试过 `tex-svg-nofont.js`（869,875 B）：**它不自包含** —— 启动时会去取
  `@mathjax/mathjax-newcm-font/svg.js`（976,702 B），离线场景直接卡在 startup。
- `tex-svg.js` 断网实测**能渲染**，字形是 `<path>` 轮廓（**导出不需要字体文件**，
  这是三端渲染/PNG 导出能一致的前提）。
- 输出形态：`<mjx-container jax="SVG">` 内含 `<svg xmlns=… viewBox="…">`。

## 升级方式

换文件 + 更新上表的版本/大小/sha256；同时跑一遍 `dev/measure-equation-parity.mjs`
（真引擎取证）确认三端几何仍然一致。

## ⚠️ 两个已知坑（改代码前必读）

1. **只能用同步的 `MathJax.tex2svg()`**。包里含无障碍 SRE 扩展，会去请求
   `<base>/sre/speech-worker.js`；我们不提供它，于是 `tex2svgPromise` / `typesetPromise`
   **会永久挂起**（而 DOM 其实已经渲染出来了）。试过三种配置关 a11y
   （`loader.load` 只列 input/output、`options.enableEnrichment/enableAssistiveMml:false`、
   `a11y.autoload:false`）**都拦不住那次 worker 请求**。
   `MathJax.startup.promise` 本身是正常 resolve 的。
2. 包里有一处 `eval("require")`，位于 Node 环境探测分支（`nodeRequire`），WebView 走不到。
   将来若给应用加 CSP，要连同上面那个 worker 一起过一遍。
