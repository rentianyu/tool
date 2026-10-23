#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键新建工具：python3 new_tool.py <slug> "<中文名>" [分类]

复制 templates/tool → site/<slug>，替换占位符，并跑一次 build 校验。
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    if len(sys.argv) < 3:
        print('用法：python3 new_tool.py <slug> "<中文名>" [分类]')
        print('示例：python3 new_tool.py qrcode "二维码生成" 生成器')
        return 1

    slug = sys.argv[1].strip()
    name = sys.argv[2].strip()
    category = sys.argv[3].strip() if len(sys.argv) > 3 else "开发辅助"

    if not slug or "/" in slug:
        print("slug 只能是一级目录名（小写字母/数字/连字符）")
        return 1

    target = ROOT / "site" / slug
    if target.exists():
        print(f"已存在：site/{slug}")
        return 1

    shutil.copytree(ROOT / "templates" / "tool", target)

    for filename in ("index.html", "app.js"):
        path = target / filename
        path.write_text(
            path.read_text(encoding="utf-8").replace("{{SLUG}}", slug).replace("{{NAME}}", name),
            encoding="utf-8",
        )

    meta_path = target / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["name"] = name
    meta["category"] = category
    meta["since"] = subprocess.run(
        ["date", "+%Y-%m-%d"], capture_output=True, text=True, check=False
    ).stdout.strip() or meta.get("since", "")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"✓ 已创建 site/{slug}/（index.html / app.js / core.js / meta.json）")
    print("  下一步：改 meta.json 的 summary 与 keywords，然后写工具逻辑")
    subprocess.run([sys.executable, str(ROOT / "build.py")], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
