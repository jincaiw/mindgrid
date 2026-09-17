#!/usr/bin/env python3
"""版本号 bump（四处 + JSON 校验）。

为什么要有这个脚本：手写替换踩过坑——把查找串写成**带逗号**的版本、
替换串却忘了逗号，于是 `tauri.conf.json` 里那一行的逗号被一起吃掉，
CI 的 Rust 测试在 build script 阶段才报
"unable to parse JSON Tauri config file"。

那个错误**本地很容易漏**：如果门禁是在 bump **之前**跑的，
tauri.conf.json 的变化完全没进过任何检查（它会进 build script）。

所以这里做两件事：
  1. 用**只匹配数字**的正则替换，标点天然留在原处，不可能被吃掉；
  2. 替换后立刻校验两个 JSON 文件可解析，坏了一个字符就当场报错退出。

用法：
    python3 dev/bump-version.py 0.4.13     # bump 到指定版本
    python3 dev/bump-version.py --check    # 只检查四处版本是否一致、JSON 是否合法
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def json_version_file(path: Path) -> re.Pattern[str]:
    return re.compile(r'("version"\s*:\s*")([\d.]+)(")')


def toml_version_file(path: Path) -> re.Pattern[str]:
    return re.compile(r'(?m)^(version\s*=\s*")([\d.]+)(")')


LOCK_PATTERN = re.compile(r'(name = "mindgrid"\nversion = ")([\d.]+)(")')

TARGETS = [
    ('package.json', 'json'),
    ('src-tauri/tauri.conf.json', 'json'),
    ('src-tauri/Cargo.toml', 'toml'),
    ('src-tauri/Cargo.lock', 'lock'),
]

VERSION_SHAPE = re.compile(r'^\d+\.\d+\.\d+$')


def pattern_for(kind: str) -> re.Pattern[str]:
    if kind == 'json':
        return json_version_file(ROOT)
    if kind == 'toml':
        return toml_version_file(ROOT)
    return LOCK_PATTERN


def read_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for relative, kind in TARGETS:
        text = (ROOT / relative).read_text(encoding='utf-8')
        match = pattern_for(kind).search(text)
        if not match:
            raise SystemExit(f'✗ {relative}: 找不到版本号')
        versions[relative] = match.group(2)
    return versions


def assert_valid_json() -> None:
    for relative in ('package.json', 'src-tauri/tauri.conf.json'):
        try:
            json.loads((ROOT / relative).read_text(encoding='utf-8'))
        except json.JSONDecodeError as error:
            raise SystemExit(f'✗ {relative} 不是合法 JSON：{error}') from error


def main() -> None:
    args = sys.argv[1:]
    check_only = '--check' in args
    targets = [a for a in args if a != '--check']

    versions = read_versions()
    unique = set(versions.values())
    if len(unique) != 1:
        print('✗ 四处版本号不一致：')
        for relative, value in versions.items():
            print(f'    {relative}: {value}')
        raise SystemExit(1)
    current = next(iter(unique))

    assert_valid_json()

    if check_only or not targets:
        print(f'✓ 四处版本一致：{current}；两个 JSON 文件均可解析')
        return

    new_version = targets[0]
    if not VERSION_SHAPE.match(new_version):
        raise SystemExit(f'✗ 版本号格式应为 x.y.z，收到 {new_version}')
    if new_version == current:
        print(f'✓ 已经是 {current}，无需改动')
        return

    for relative, kind in TARGETS:
        path = ROOT / relative
        text = path.read_text(encoding='utf-8')
        pattern = pattern_for(kind)
        replaced, count = pattern.subn(lambda m: f'{m.group(1)}{new_version}{m.group(3)}', text, count=1)
        if count != 1:
            raise SystemExit(f'✗ {relative}: 期望替换 1 处，实际 {count} 处')
        path.write_text(replaced, encoding='utf-8')
        print(f'  {relative}: {current} → {new_version}')

    # 替换完立刻验一遍：坏一个字符就在这里失败，而不是等 CI
    assert_valid_json()
    assert set(read_versions().values()) == {new_version}
    print(f'✓ 已 bump 到 {new_version}，两个 JSON 文件均可解析')
    print('  下一步：跑门禁（注意 **含 Rust 侧**，tauri.conf.json 会进 build script）')


if __name__ == '__main__':
    main()
