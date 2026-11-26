/**
 * 公共外壳 + 通用工具函数
 * - 导航页：工具搜索、分类跳转、我的收藏
 * - 工具页：注入顶栏 / 面包屑 / 标题（工具页 HTML 只写工具本体）
 * - 其他模块可 import { toast, copy, downloadText, escapeHtml } from "/assets/app.js"
 */

const THEME_KEY = "tool.theme";

/** 联网情况说明：首页写在 templates/nav.html（静态首屏），工具页由外壳注入，两处文案需保持一致 */
const NET_NOTE =
  "页面首次打开需联网加载（其中只有 Cloudflare 的访问统计脚本会连外网，不涉及你输入的内容）；打开后可断网继续使用，所有转换都在浏览器本地完成，数据不上传、也无后端。";

/* ---------------- 主题（默认白天） ---------------- */
export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function paintThemeButtons() {
  const dark = currentTheme() === "dark";
  document.querySelectorAll("[data-theme-toggle], #theme").forEach((btn) => {
    btn.textContent = dark ? "☀" : "☾";
    btn.title = dark ? "切换到白天模式" : "切换到夜间模式";
    btn.setAttribute("aria-label", btn.title);
  });
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  paintThemeButtons();
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");

function bindThemeButtons(root = document) {
  root.querySelectorAll("[data-theme-toggle], #theme").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  });
  paintThemeButtons();
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

/* ---------------- 我的收藏（localStorage，按 slug 存，最近收藏在前） ---------------- */
const FAV_KEY = "tool.favs";

export function loadFavs() {
  try {
    const list = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(list) ? list.filter((slug) => typeof slug === "string" && slug) : [];
  } catch {
    return [];
  }
}

function saveFavs(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式 / 容量超限：静默忽略 */
  }
}

export function isFav(slug) {
  return loadFavs().includes(slug);
}

/** 切换收藏，返回切换后的状态（true = 已收藏） */
export function toggleFav(slug) {
  if (!slug) return false;
  const list = loadFavs();
  const on = !list.includes(slug);
  saveFavs(on ? [slug, ...list.filter((item) => item !== slug)] : list.filter((item) => item !== slug));
  paintFavButtons();
  renderFavs();
  return on;
}

function paintFavButtons() {
  const favs = loadFavs();
  $$("[data-fav]").forEach((btn) => {
    const on = favs.includes(btn.dataset.fav);
    btn.classList.toggle("on", on);
    btn.textContent = btn.dataset.label ? (on ? "★ 已收藏" : "☆ 收藏") : on ? "★" : "☆";
    btn.title = on ? "取消收藏" : "收藏到「我的收藏」";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function bindFavButtons(root = document) {
  root.querySelectorAll("[data-fav]").forEach((btn) => {
    if (btn._favBound) return;
    btn._favBound = true;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const on = toggleFav(btn.dataset.fav);
      toast(on ? "已收藏" : "已取消收藏");
    });
  });
}

/** 给导航页每个工具条目挂星标按钮（不动 build 产物结构） */
function decorateFavButtons() {
  $$("#tool-groups .tool-item").forEach((item) => {
    if (item.querySelector("[data-fav]")) return;
    const link = item.querySelector("a[data-slug]");
    if (!link) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fav-btn";
    btn.dataset.fav = link.dataset.slug;
    btn.textContent = "☆";
    item.appendChild(btn);
  });
  bindFavButtons();
  paintFavButtons();
}

function renderFavs() {
  const list = document.getElementById("fav-list");
  const count = document.getElementById("fav-count");
  const emptyEl = document.getElementById("fav-empty");
  if (!list) return;

  const favs = loadFavs();
  if (count) count.textContent = favs.length ? String(favs.length) : "";

  if (!favs.length) {
    list.textContent = "";
    list.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  const bySlug = new Map();
  $$("#tool-groups .tool-item").forEach((item) => {
    const link = item.querySelector("a[data-slug]");
    if (link) bySlug.set(link.dataset.slug, item);
  });

  const nodes = [];
  favs.forEach((slug) => {
    const src = bySlug.get(slug);
    if (!src) return; // 工具已下线：静默跳过，不动用户数据
    const node = src.cloneNode(true);
    node.hidden = false;
    nodes.push(node);
  });

  list.textContent = "";
  nodes.forEach((node) => list.appendChild(node));
  list.hidden = nodes.length === 0;
  if (emptyEl) emptyEl.hidden = nodes.length !== 0;
  bindFavButtons(list);
  paintFavButtons();
}

/* ---------------- 导航页搜索 ---------------- */
function bindSearch() {
  const input = document.getElementById("q");
  if (!input) return;
  const empty = document.getElementById("empty");
  const favGroup = document.getElementById("fav-group");
  const groups = $$(".group").filter((g) => g.id !== "fav-group");

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
    if (favGroup) favGroup.hidden = !!q;
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
    head.innerHTML = `<div class="tool-head-top">
        <div class="crumb">
          <a href="/">工具箱</a>
          ${category ? `<span class="sep">/</span><a href="/#cat-${escapeHtml(category)}">${escapeHtml(category)}</a>` : ""}
          <span class="sep">/</span><span>${escapeHtml(meta.name || slug)}</span>
        </div>
        <button class="fav-btn fav-btn-inline" type="button" data-fav="${escapeHtml(slug)}" data-label="1" title="收藏到「我的收藏」">☆ 收藏</button>
      </div>
      <h1>${escapeHtml(meta.name || slug)}</h1>
      ${meta.summary ? `<p>${escapeHtml(meta.summary)}</p>` : ""}
      <p class="net-note"><b>联网说明</b>　${NET_NOTE}</p>`;
    main.prepend(head);
    bindFavButtons(head);
    paintFavButtons();
  }
}

/* ---------------- 启动 ---------------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

function boot() {
  if (document.body.classList.contains("page-nav")) {
    decorateFavButtons();
    renderFavs();
    bindSearch();
  }
  mountToolShell();
}
