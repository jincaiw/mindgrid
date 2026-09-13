#!/usr/bin/env python3
"""校验 Tauri 更新产物的签名是否真的对得上应用内嵌的公钥。

## 为什么需要它

发布工作流的 "Verify updater manifest" 只检查 `latest.json` 里**有没有** signature 字段，
不检查签名**是否有效**。而签名无效的后果是：所有用户的自动更新**全部失败**，
且在 CI 上看不出任何异常。

## 用法

    /Volumes/My-Data/jason.wa/.workbuddy/binaries/python/envs/default/bin/python \
      dev/verify-updater-signature.py <产物文件> [<产物文件> ...]

需要 `PyNaCl`（上面那个隔离 venv 里已有）。产物与同名 `.sig` 放在一起：
`gh release download vX.Y.Z --pattern '*.app.tar.gz*' --dir /tmp/x`

## minisign 的编码层次（容易踩）

`.pub`（即 tauri.conf.json 的 pubkey 字段）与 `.sig` **都是"整个文件的 base64"**——
要先解一层拿到文本，再取其中的 base64 行。`.sig` 解出来是四行：

    untrusted comment: signature from tauri secret key
    <签名 blob：算法2字节 + keyid8字节 + Ed25519签名64字节>
    trusted comment: timestamp:… file:…
    <对"签名+trusted comment"的全局签名>

算法标记：`ED` = 对文件的 BLAKE2b-512 预哈希签名；`Ed` = 直接对整文件签名。
"""

from __future__ import annotations

import base64
import hashlib
import json
import pathlib
import sys

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


def unwrap_minisign(text: str) -> list[bytes]:
    """解掉"整文件 base64"这一层，返回所有非注释行的 base64 内容。"""
    decoded = base64.b64decode(text).decode()
    payload = [
        line
        for line in decoded.strip().splitlines()
        if line and not line.startswith("untrusted comment") and not line.startswith("trusted comment")
    ]
    return [base64.b64decode(line) for line in payload]


def load_embedded_public_key() -> tuple[bytes, bytes]:
    conf = json.loads((REPO_ROOT / "src-tauri" / "tauri.conf.json").read_text())
    pub_raw = unwrap_minisign(conf["plugins"]["updater"]["pubkey"])[0]
    return pub_raw[2:10], pub_raw[10:42]


def verify_file(path: pathlib.Path, expected_key_id: bytes, public_key: bytes) -> bool:
    sig_path = path.with_name(path.name + ".sig")
    if not sig_path.is_file():
        print(f"❌ {path.name}: 缺少同名 .sig")
        return False

    sig_raw = unwrap_minisign(sig_path.read_text())[0]
    key_id, signature = sig_raw[2:10], sig_raw[10:74]
    algorithm = sig_raw[:2].decode()

    if key_id != expected_key_id:
        print(f"❌ {path.name}: keyid 不匹配（{key_id.hex()} vs {expected_key_id.hex()}）"
              " —— 签名不是这把私钥签的")
        return False

    data = path.read_bytes()
    message = hashlib.blake2b(data, digest_size=64).digest() if algorithm == "ED" else data

    try:
        VerifyKey(public_key).verify(message, signature)
    except BadSignatureError:
        print(f"❌ {path.name}: 签名无效 —— 该产物的自动更新会在用户端失败")
        return False

    print(f"✅ {path.name}: 签名有效（{algorithm}，{len(data) / 1024 / 1024:.1f} MB）")
    return True


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2

    key_id, public_key = load_embedded_public_key()
    print(f"内嵌公钥 keyid={key_id.hex().upper()}\n")

    results = [
        verify_file(pathlib.Path(arg), key_id, public_key)
        for arg in argv[1:]
        if not arg.endswith(".sig")
    ]
    return 0 if results and all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
