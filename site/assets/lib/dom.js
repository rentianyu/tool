/**
 * 通用 DOM / 交互小工具（可选引入）
 */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return node;
}

/** 读取 textarea / input 的值 */
export function val(selector) {
  const node = typeof selector === "string" ? document.querySelector(selector) : selector;
  return node ? node.value : "";
}

/** 写入输出区（textContent，防 XSS） */
export function out(selector, text) {
  const node = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (node) {
    node.textContent = text == null ? "" : String(text);
    node.hidden = false;
  }
}

/** 消息条：error / ok / warn */
export function message(selector, text, type = "ok") {
  const node = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!node) return;
  node.className = `msg msg-${type}`;
  node.textContent = text || "";
}

/** 字节数格式化 */
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
