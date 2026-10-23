/**
 * 公共外壳 + 通用工具函数
 * - 导航页：工具搜索、分类跳转、最近使用
 * - 工具页：注入顶栏 / 面包屑 / 标题（工具页 HTML 只写工具本体）
 * - 其他模块可 import { toast, copy, downloadText, escapeHtml } from "/assets/app.js"
 */

const THEME_KEY = "tool.theme";
const RECENT_KEY = "tool.recent";

/* ---------------- 主题 ---------------- */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}
export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");

function bindThemeButtons(root = document) {
  root.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = currentTheme() === "light" ? "dark" : "light";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  });
}
bindThemeButtons();

/* ---------------- 通用工具 ---------------- */
export function $(sel, root = document) {
  return root.querySelector(sel);
}
export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let toastTimer = null;
export function toast(message, ms = 1600) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

export async function copy(text, okMessage = "已复制") {
  const value = String(text == null ? "" : text);
  if (!value) {
    toast("没有可复制的内容");
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      document.body.removeChild(ta);
      toast("复制失败，请手动选择");
      return false;
    }
    document.body.removeChild(ta);
  }
  toast(okMessage);
  return true;
}

export function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------- 最近使用 ---------------- */
function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function recordRecent(slug, meta) {
  const list = loadRecent().filter((item) => item.slug !== slug);
  list.unshift({
    slug,
    name: meta.name || slug,
    summary: meta.summary || "",
    icon: meta.icon || "•",
    category: meta.category || "",
  });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* 隐私模式下忽略 */
  }
}

function toolItemHtml(tool) {
  const key = `${tool.name} ${tool.summary || ""} ${tool.slug}`.toLowerCase();
  return `<li class="tool-item" data-key="${escapeHtml(key)}">
    <a href="/${escapeHtml(tool.slug)}" data-slug="${escapeHtml(tool.slug)}">
      <span class="ico">${escapeHtml(tool.icon || "•")}</span>
      <span class="t-body"><b>${escapeHtml(tool.name)}</b><span class="desc">${escapeHtml(tool.summary || "")}</span></span>
      <span class="arrow">→</span>
    </a></li>`;
}

function renderRecent() {
  const group = document.getElementById("recent-group");
  const list = document.getElementById("recent-list");
  const count = document.getElementById("recent-count");
  if (!group || !list) return;
  const recent = loadRecent();
  if (!recent.length) return;
  list.innerHTML = recent.map(toolItemHtml).join("");
  if (count) count.textContent = recent.length;
  group.hidden = false;
}

/* ---------------- 导航页搜索 ---------------- */
function bindSearch() {
  const input = document.getElementById("q");
  if (!input) return;
  const empty = document.getElementById("empty");
  const recentGroup = document.getElementById("recent-group");
  const groups = $$(".group").filter((g) => g.id !== "recent-group");

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    groups.forEach((group) => {
      let hit = 0;
      $$(".tool-item", group).forEach((item) => {
        const match = !q || (item.dataset.key || "").includes(q);
        item.hidden = !match;
        if (match) hit += 1;
      });
      group.hidden = hit === 0;
      visible += hit;
    });
    if (recentGroup) recentGroup.hidden = !!q || !loadRecent().length;
    if (empty) empty.hidden = visible !== 0;
  };

  input.addEventListener("input", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      apply();
      input.blur();
    } else if (event.key === "Enter") {
      const first = $$(".tool-item").find((item) => !item.hidden && item.offsetParent !== null);
      if (first) {
        const link = first.querySelector("a");
        if (link) location.href = link.href;
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const tag = (event.target && event.target.tagName) || "";
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (event.target && event.target.isContentEditable);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

/* ---------------- 工具页外壳 ---------------- */
function buildTopbar() {
  const el = document.createElement("header");
  el.className = "topbar";
  el.innerHTML = `<div class="topbar-inner">
    <a class="logo" href="/"><span class="logo-mark">⌘</span>工具箱</a>
    <div class="spacer"></div>
    <a class="btn btn-sm btn-ghost" href="/">全部工具</a>
    <button class="icon-btn" data-theme-toggle type="button" title="切换主题" aria-label="切换主题">◐</button>
  </div>`;
  bindThemeButtons(el);
  return el;
}

async function mountToolShell() {
  const slug = document.body.dataset.tool;
  if (!slug) return;

  let meta = {};
  try {
    const res = await fetch(`/${slug}/meta.json`, { cache: "no-cache" });
    if (res.ok) meta = await res.json();
  } catch {
    /* meta 缺失不阻断工具本身 */
  }

  document.title = `${meta.name || slug} · 工具箱`;
  document.body.prepend(buildTopbar());

  const main = document.querySelector("main");
  if (main) {
    const head = document.createElement("div");
    head.className = "tool-head";
    const category = meta.category || "";
    head.innerHTML = `<div class="crumb">
        <a href="/">工具箱</a>
        ${category ? `<span class="sep">/</span><a href="/#cat-${escapeHtml(category)}">${escapeHtml(category)}</a>` : ""}
        <span class="sep">/</span><span>${escapeHtml(meta.name || slug)}</span>
      </div>
      <h1>${escapeHtml(meta.name || slug)}</h1>
      ${meta.summary ? `<p>${escapeHtml(meta.summary)}</p>` : ""}`;
    main.prepend(head);
  }

  recordRecent(slug, meta);
}

/* ---------------- 启动 ---------------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

function boot() {
  if (document.body.classList.contains("page-nav")) {
    renderRecent();
    bindSearch();
  }
  mountToolShell();
}
