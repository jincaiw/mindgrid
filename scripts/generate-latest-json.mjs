#!/usr/bin/env node
/**
 * 生成 Tauri Updater 用的 latest.json 更新清单（P6.3）。
 *
 * 用法：node scripts/generate-latest-json.mjs --tag v0.1.0 --repo owner/repo
 *
 * 从 GitHub Release 的 Assets 中提取各平台的更新包 + 签名，生成 latest.json。
 * 需要环境变量 GITHUB_TOKEN（或 GH_TOKEN）有 repo 权限。
 */

import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    tag: { type: 'string' },
    repo: { type: 'string' },
    output: { type: 'string', default: 'latest.json' },
  },
})

const tag = values.tag
const repo = values.repo || process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

if (!tag || !repo || !token) {
  console.error('用法: node generate-latest-json.mjs --tag v0.1.0 --repo owner/repo')
  console.error('需要环境变量 GITHUB_TOKEN 或 GH_TOKEN')
  process.exit(1)
}

const version = tag.replace(/^v/, '')
const apiBase = 'https://api.github.com/repos'

async function githubFetch(path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: ${res.status}`)
  }
  return res.text()
}

function findAsset(assets, pattern) {
  return assets.find((a) => pattern.test(a.name))
}

async function buildPlatformEntry(assets, assetPattern, sigPattern) {
  const asset = findAsset(assets, assetPattern)
  if (!asset) {
    console.warn(`  ⚠ 未找到匹配 ${assetPattern} 的资源`)
    return null
  }

  const sigAsset = findAsset(assets, sigPattern) || findAsset(assets, new RegExp(`${asset.name}\\.sig$`))
  let signature = ''
  if (sigAsset) {
    try {
      signature = await fetchText(sigAsset.browser_download_url)
    } catch (err) {
      console.warn(`  ⚠ 无法获取签名 ${sigAsset.name}: ${err.message}`)
    }
  } else {
    console.warn(`  ⚠ 未找到 ${asset.name} 的 .sig 签名文件`)
  }

  return {
    signature: signature.trim(),
    url: asset.browser_download_url,
  }
}

async function main() {
  console.log(`生成 latest.json for ${tag} (${repo})`)

  const release = await githubFetch(`/repos/${repo}/releases/tags/${tag}`)
  const assets = release.assets || []

  console.log(`Release assets (${assets.length}):`)
  for (const a of assets) {
    console.log(`  - ${a.name} (${a.size} bytes)`)
  }

  const platforms = {}

  // macOS aarch64 (Apple Silicon)
  const macArm = await buildPlatformEntry(
    assets,
    /aarch64.*\.app\.tar\.gz$/,
    /aarch64.*\.app\.tar\.gz\.sig$/,
  )
  if (macArm) platforms['darwin-aarch64'] = macArm

  // macOS x86_64 (Intel)
  const macIntel = await buildPlatformEntry(
    assets,
    /x64.*\.app\.tar\.gz$|x86_64.*\.app\.tar\.gz$/,
    /x64.*\.app\.tar\.gz\.sig$|x86_64.*\.app\.tar\.gz\.sig$/,
  )
  if (macIntel) platforms['darwin-x86_64'] = macIntel

  // Linux x86_64
  const linux = await buildPlatformEntry(
    assets,
    /\.AppImage\.tar\.gz$/,
    /\.AppImage\.tar\.gz\.sig$/,
  )
  if (linux) platforms['linux-x86_64'] = linux

  // Windows x86_64
  const windows = await buildPlatformEntry(
    assets,
    /-setup\.exe\.zip$/,
    /-setup\.exe\.zip\.sig$/,
  )
  if (windows) platforms['windows-x86_64'] = windows

  const latest = {
    version,
    notes: release.body || `MindGrid ${version}`,
    pub_date: new Date(release.created_at || Date.now()).toISOString(),
    platforms,
  }

  const json = JSON.stringify(latest, null, 2)
  writeFileSync(values.output, json)
  console.log(`\n✓ 已生成 ${values.output}:`)
  console.log(json)
}

main().catch((err) => {
  console.error(`✗ 生成失败: ${err.message}`)
  process.exit(1)
})
