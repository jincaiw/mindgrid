# MindGrid 签名与自动更新指南

> 本文档描述如何为 MindGrid 生成签名密钥、配置自动更新端点，以及发布新版本。

## 1. 概述

MindGrid 使用 [Tauri 2 Updater Plugin](https://v2.tauri.app/plugin/updater/) 实现应用内自动更新。更新流程：

1. 应用启动后（release 构建）延迟 3 秒自动检查 `latest.json`
2. 用户也可通过工具栏"检查更新"按钮手动触发
3. 发现新版本后弹出通知，用户确认后下载安装并重启

**安全模型**：每次更新包（`.sig` 文件）使用 Ed25519 私钥签名，应用内嵌对应公钥验证。私钥仅保存在 CI/CD Secrets 中，不随应用分发。

## 2. 生成签名密钥对（一次性）

```bash
# 安装 Tauri CLI（如尚未安装）
pnpm add -g @tauri-apps/cli

# 生成密钥对
pnpm tauri signer generate -w ~/.tauri/mindgrid.key

# 输出示例：
# Private key written to ~/.tauri/mindgrid.key
# Public key: dW50cnVzdGVkIGNvbW1l...
```

**安全要求**：
- 私钥文件 `~/.tauri/mindgrid.key` 必须妥善保管，泄露后可签发恶意更新
- 公钥字符串需要配置到 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 字段
- 私钥密码（如设置了）也需要保存到 CI Secrets

## 3. 配置 tauri.conf.json

将生成的公钥替换 `tauri.conf.json` 中的占位符：

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/mindgrid/mindgrid/releases/latest/download/latest.json"
      ],
      "pubkey": "替换为第 2 步生成的公钥字符串",
      "dialog": false
    }
  }
}
```

**端点说明**：
- `endpoints` 是 `latest.json` 的下载地址数组，按顺序尝试
- GitHub Releases 的 `latest` 指向最新发布的 Release，自动下载其 assets 中的 `latest.json`
- 如使用自定义服务器，将 URL 替换为你的 `latest.json` 地址

## 4. CI/CD 配置

### 4.1 GitHub Actions Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions 中添加：

| Secret 名称 | 值 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件内容（`cat ~/.tauri/mindgrid.key`） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码（如未设置密码则忽略） |

### 4.2 createUpdaterArtifacts 配置说明

`tauri.conf.json` 中 `bundle.createUpdaterArtifacts` 默认设为 `false`，以便本地开发构建无需签名密钥即可通过。

Release 工作流（`.github/workflows/release.yml`）在构建时通过 `--config` 参数动态启用：

```yaml
args: --target ${{ matrix.target }} --config '{"bundle":{"createUpdaterArtifacts":true}}'
```

**本地构建**（不生成更新签名）：
```bash
pnpm tauri build
```

**本地构建 + 更新签名**（需要设置 `TAURI_SIGNING_PRIVATE_KEY` 环境变量）：
```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/mindgrid.key)
pnpm tauri build -- --config '{"bundle":{"createUpdaterArtifacts":true}}'
```

### 4.3 触发发布工作流

```bash
# 1. 更新版本号
# 编辑 src-tauri/tauri.conf.json 的 version 字段
# 编辑 package.json 的 version 字段

# 2. 提交并打 tag
git add -A
git commit -m "release: v0.1.0"
git tag v0.1.0
git push origin main --tags

# 3. GitHub Actions 自动构建并创建 Release
# 构建产物：.dmg / .msi / .deb / .AppImage + .sig 签名文件 + latest.json
```

## 5. latest.json 格式

GitHub Actions 工作流会自动生成 `latest.json` 并上传到 Release Assets。格式：

```json
{
  "version": "0.1.0",
  "notes": "MindGrid V1 首个正式版本",
  "pub_date": "2026-07-31T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVkIGNvbW1l...",
      "url": "https://github.com/mindgrid/mindgrid/releases/download/v0.1.0/MindGrid_0.1.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1l...",
      "url": "https://github.com/mindgrid/mindgrid/releases/download/v0.1.0/MindGrid_0.1.0_x64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1l...",
      "url": "https://github.com/mindgrid/mindgrid/releases/download/v0.1.0/mindgrid_0.1.0_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1l...",
      "url": "https://github.com/mindgrid/mindgrid/releases/download/v0.1.0/MindGrid_0.1.0_x64-setup.exe.zip"
    }
  }
}
```

## 6. V1 不签名的注意事项

V1 版本发布**未签名**的安装包（macOS DMG / Windows NSIS / Linux AppImage），用户首次打开需要手动信任：

### macOS
1. 打开 System Settings → Privacy & Security
2. 找到"MindGrid 已被阻止"提示，点击"仍要打开"
3. 或在终端执行：`xattr -cr /Applications/MindGrid.app`

### Windows
1. 运行安装包时 SmartScreen 可能警告"未知发布者"
2. 点击"更多信息" → "仍要运行"
3. 或使用 PowerShell：`Unblock-File .\MindGrid_0.1.0_x64-setup.exe`

### Linux
- AppImage 需要添加执行权限：`chmod +x MindGrid_0.1.0_amd64.AppImage`
- 无签名限制

## 7. 后续升级到签名版本

获取 Apple Developer ID 和 Windows Authenticode 证书后：

1. **macOS 签名 + 公证**：
   - 在 `tauri.conf.json` 设置 `bundle.macOS.signingIdentity` 为 Apple Developer ID
   - 设置环境变量 `APPLE_CERTIFICATE` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`
   - Tauri 自动完成 codesign + notarytool

2. **Windows 签名**：
   - 在 `tauri.conf.json` 设置 `bundle.windows.certificateThumbprint`
   - 或设置环境变量 `TAURI_SIGNING_CERTIFICATE` / `TAURI_SIGNING_CERTIFICATE_PASSWORD`

3. 更新 CI 工作流注入证书 Secrets
