/**
 * 编码转换（合并页）：JSON / Base64 / URL / 进制
 * 一个下拉切换四个面板，面板首次激活时才渲染 DOM 与绑定事件
 */
import base64 from "/codec/panels/base64.js";
import json from "/codec/panels/json.js";
import radix from "/codec/panels/radix.js";
import url from "/codec/panels/url.js";

const PANELS = [json, base64, url, radix];
const MODE_KEY = "tool.codec.mode";

const host = document.getElementById("panels");
const sel = document.getElementById("mode");

const inited = new Set();

/** 一次性把四个面板挂进 DOM，用 hidden 切换，输入内容切走再切回不丢 */
PANELS.forEach((panel) => {
  const wrap = document.createElement("div");
  wrap.className = "codec-panel";
  wrap.dataset.panel = panel.key;
  wrap.hidden = true;
  wrap.innerHTML = panel.html;
  host.appendChild(wrap);
});

function activate(key) {
  const panel = PANELS.find((item) => item.key === key) || PANELS[0];
  Array.from(host.children).forEach((el) => {
    el.hidden = el.dataset.panel !== panel.key;
  });
  sel.value = panel.key;
  if (!inited.has(panel.key)) {
    panel.init(host.querySelector(`[data-panel="${panel.key}"]`));
    inited.add(panel.key);
  }
  // 记住选择 + 同步到地址栏 hash：刷新/分享后回到同一功能（旧地址 /json 等已下线，统一走 /codec）
  try {
    localStorage.setItem(MODE_KEY, panel.key);
  } catch {
    /* 隐私模式忽略 */
  }
  if (location.hash !== `#${panel.key}`) {
    history.replaceState(null, "", `#${panel.key}`);
  }
}

sel.addEventListener("change", () => activate(sel.value));

function boot() {
  let saved = null;
  try {
    saved = localStorage.getItem(MODE_KEY);
  } catch {
    /* 忽略 */
  }
  const fromHash = (location.hash || "").replace(/^#/, "");
  const start = PANELS.some((p) => p.key === fromHash) ? fromHash : PANELS.some((p) => p.key === saved) ? saved : PANELS[0].key;
  activate(start);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
