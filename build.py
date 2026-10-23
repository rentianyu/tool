#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tool.xbta.cc 构建脚本（零依赖，仅标准库）

做四件事：
  1. 扫描 site/<slug>/meta.json（支持两级 site/<group>/<slug>/）
  2. 校验元数据与文件（必填字段 / slug 合法性 / 保留名 / 相对路径引用 / 后端模块注册）
  3. 生成 site/catalog.json（导航页与前端消费）
  4. 用 templates/nav.html 渲染 site/index.html（静态首屏，无需 JS 也能看到工具清单）
  5. 生成 src/version.js（供 /api/health 报告线上版本）

用法：
  python3 build.py          构建
  python3 build.py --check  只校验不写文件
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
TEMPLATES = ROOT / "templates"
CN = timezone(timedelta(hours=8))

RESERVED = {"assets", "api", "index", "404", "catalog", "_headers", "_redirects"}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")

# 分类展示顺序；未在列表中的分类排在后面（按出现顺序）
CATEGORY_ORDER = [
    "编码转换",
    "文本处理",
    "时间日期",
    "加密哈希",
    "生成器",
    "网络",
    "图片",
    "开发辅助",
    "其他",
]

REQUIRED = ("name", "summary", "category")

errors = []
warnings = []


def collect_tools():
    """返回 [{slug, dir, meta}]，slug 形如 json 或 image/compress"""
    tools = []
    for meta_path in sorted(SITE.rglob("meta.json")):
        folder = meta_path.parent
        rel = folder.relative_to(SITE)
        if rel.parts and rel.parts[0] in ("assets", "api"):
            continue
        slug = "/".join(rel.parts)
        if slug.split("/")[0] in RESERVED:
            errors.append(f"{slug}: 目录名是保留名（{', '.join(sorted(RESERVED))}）")
            continue
        for part in rel.parts:
            if not SLUG_RE.match(part):
                errors.append(f"{slug}: slug 片段不合法（要求小写字母/数字/连字符，≤32 字符）：{part}")
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"{slug}: meta.json 解析失败：{exc}")
            continue
        for key in REQUIRED:
            if not str(meta.get(key, "")).strip():
                errors.append(f"{slug}: meta.json 缺少必填字段 {key}")
        tools.append({"slug": slug, "dir": folder, "meta": meta})
    return tools


def check_tool(tool):
    slug, folder, meta = tool["slug"], tool["dir"], tool["meta"]

    index = folder / "index.html"
    if not index.exists():
        errors.append(f"{slug}: 缺少 index.html")

    # 常见坑：/json 无尾斜杠，页面内相对路径会被解析到站点根
    if index.exists():
        html = index.read_text(encoding="utf-8")
        for m in re.finditer(r'(?:src|href)="(\./[^"]*)"', html):
            warnings.append(f"{slug}: index.html 使用了相对路径 {m.group(1)}，建议改为绝对路径")
        if 'data-tool="' not in html:
            warnings.append(f"{slug}: index.html 的 <body> 缺少 data-tool=\"<slug>\"，公共外壳不会渲染")

    if meta.get("backend"):
        api_file = ROOT / "src" / "api" / f"{slug.split('/')[0]}.js"
        if not api_file.exists():
            errors.append(f"{slug}: backend=true 但缺少 src/api/{slug.split('/')[0]}.js")
        router = (ROOT / "src" / "api" / "_router.js").read_text(encoding="utf-8")
        if not re.search(rf'["\']?{re.escape(slug.split("/")[0])}["\']?\s*:', router):
            errors.append(f"{slug}: backend=true 但未在 src/api/_router.js 的 MODULES 中注册")


def sort_key(tool):
    meta = tool["meta"]
    cat = meta.get("category", "其他")
    cat_idx = CATEGORY_ORDER.index(cat) if cat in CATEGORY_ORDER else len(CATEGORY_ORDER)
    return (cat_idx, cat, meta.get("order", 100), meta.get("name", ""))


def render(tools, build_time):
    # 分组
    groups = {}
    for t in tools:
        meta = t["meta"]
        groups.setdefault(meta.get("category", "其他"), []).append(t)

    cat_order = sorted(
        groups.keys(),
        key=lambda c: (CATEGORY_ORDER.index(c) if c in CATEGORY_ORDER else len(CATEGORY_ORDER), c),
    )

    cat_nav = "".join(
        f'<a href="#cat-{c}">{c}<span>{len(groups[c])}</span></a>' for c in cat_order
    )

    blocks = []
    for cat in cat_order:
        items = []
        for t in groups[cat]:
            meta = t["meta"]
            key = " ".join(
                [meta.get("name", ""), meta.get("summary", ""), meta.get("slug", t["slug"])]
                + list(meta.get("tags", []))
                + list(meta.get("keywords", []))
            ).lower()
            icon = meta.get("icon") or "•"
            badge = '<i class="badge">API</i>' if meta.get("backend") else ""
            beta = '<i class="badge badge-warn">beta</i>' if meta.get("status") == "beta" else ""
            items.append(
                f'<li class="tool-item" data-key="{escape(key)}">'
                f'<a href="/{t["slug"]}" data-slug="{t["slug"]}">'
                f'<span class="ico">{escape(icon)}</span>'
                f'<span class="t-body"><b>{escape(meta.get("name", t["slug"]))}{badge}{beta}</b>'
                f'<span class="desc">{escape(meta.get("summary", ""))}</span></span>'
                f'<span class="arrow">→</span></a></li>'
            )
        blocks.append(
            f'<section class="group" id="cat-{cat}" data-cat="{cat}">'
            f'<h2>{cat}<span class="count">{len(items)}</span></h2>'
            f'<ul class="tools">{"".join(items)}</ul></section>'
        )

    tpl = (TEMPLATES / "nav.html").read_text(encoding="utf-8")
    html = (
        tpl.replace("{{TOOLS_HTML}}", "\n      ".join(blocks))
        .replace("{{CATEGORY_NAV}}", cat_nav)
        .replace("{{TOOL_COUNT}}", str(len(tools)))
        .replace("{{CATEGORY_COUNT}}", str(len(cat_order)))
        .replace("{{BUILD_TIME}}", build_time)
    )
    return html


def escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def main():
    check_only = "--check" in sys.argv
    tools = collect_tools()
    for t in tools:
        check_tool(t)

    tools.sort(key=sort_key)
    duplicates = {t["slug"] for t in tools if [x["slug"] for x in tools].count(t["slug"]) > 1}
    for slug in duplicates:
        errors.append(f"{slug}: slug 重复")

    if errors:
        print("✗ 校验失败：")
        for e in errors:
            print("  -", e)
        if warnings:
            print("⚠ 警告：")
            for w in warnings:
                print("  -", w)
        return 1

    now = datetime.now(CN)
    build_time = now.strftime("%Y-%m-%d %H:%M:%S +08")
    version_stamp = now.strftime("%Y%m%d.%H%M")

    catalog = {
        "generated": build_time,
        "count": len(tools),
        "tools": [
            {
                "slug": t["slug"],
                "url": f'/{t["slug"]}',
                "name": t["meta"].get("name", t["slug"]),
                "summary": t["meta"].get("summary", ""),
                "category": t["meta"].get("category", "其他"),
                "icon": t["meta"].get("icon") or "•",
                "tags": t["meta"].get("tags", []),
                "keywords": t["meta"].get("keywords", []),
                "backend": bool(t["meta"].get("backend")),
                "status": t["meta"].get("status", "stable"),
                "since": t["meta"].get("since", ""),
            }
            for t in tools
        ],
    }

    if check_only:
        print(f"✓ 校验通过：{len(tools)} 个工具")
        for w in warnings:
            print("  ⚠", w)
        return 0

    (SITE / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (SITE / "index.html").write_text(render(tools, build_time), encoding="utf-8")
    (ROOT / "src" / "version.js").write_text(
        "// 由 build.py 自动生成，请勿手改\n"
        f'export const BUILD_TIME = "{build_time}";\n'
        f'export const BUILD_STAMP = "{version_stamp}";\n'
        f"export const TOOL_COUNT = {len(tools)};\n",
        encoding="utf-8",
    )

    print(f"✓ 构建完成：{len(tools)} 个工具 / {len({t['meta'].get('category','其他') for t in tools})} 个分类")
    print(f"  site/index.html      {len(render(tools, build_time))} 字节")
    print(f"  site/catalog.json    {len(catalog['tools'])} 条")
    for w in warnings:
        print("  ⚠", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
