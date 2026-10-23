import { copy, downloadText, toast } from "/assets/app.js";
import { message, out } from "/assets/lib/dom.js";
import { getByPath, parseJson, sortKeysDeep, statsOf, stringify, toJsonLiteral } from "/json/core.js";

const DRAFT_KEY = "tool.json.draft";

const input = document.getElementById("input");
const output = document.getElementById("output");
const msgBox = document.getElementById("msg");
const statsBox = document.getElementById("stats");
const indentSel = document.getElementById("indent");
const pathInput = document.getElementById("path");
const pickOut = document.getElementById("pickOut");

let lastValue = null;

function setResult(text, value) {
  output.textContent = text;
  lastValue = value;
  const stats = statsOf(value, text);
  statsBox.textContent = `${stats.chars} 字符 · ${stats.lines} 行 · 深度 ${stats.depth}`;
}

function fail(error) {
  output.textContent = "";
  statsBox.textContent = "";
  lastValue = null;
  if (error.snippet) {
    message(msgBox, `第 ${error.line} 行 第 ${error.column} 列：${error.message}`, "err");
    output.textContent = `${error.snippet}\n${error.caret}`;
  } else {
    message(msgBox, error.message, "err");
  }
}

function ensureParsed() {
  const res = parseJson(input.value);
  if (!res.ok) {
    fail(res.error);
    return null;
  }
  message(msgBox, "JSON 有效", "ok");
  return res.value;
}

function render(indent) {
  const value = ensureParsed();
  if (value === null) return;
  try {
    setResult(stringify(value, indent), value);
  } catch (err) {
    message(msgBox, `序列化失败：${err.message}`, "err");
  }
}

document.getElementById("fmt").addEventListener("click", () => {
  render(indentSel.value === "0" ? 2 : indentSel.value);
});

document.getElementById("minify").addEventListener("click", () => render(0));

document.getElementById("sort").addEventListener("click", () => {
  const value = ensureParsed();
  if (value === null) return;
  const sorted = sortKeysDeep(value);
  setResult(stringify(sorted, indentSel.value === "0" ? 2 : indentSel.value), sorted);
  message(msgBox, "已按 key 排序", "ok");
});

document.getElementById("escape").addEventListener("click", () => {
  if (!input.value.trim()) {
    message(msgBox, "输入为空", "err");
    return;
  }
  const literal = toJsonLiteral(input.value);
  output.textContent = literal;
  lastValue = literal;
  statsBox.textContent = `${literal.length} 字符`;
  message(msgBox, "已转义为 JSON 字符串字面量", "ok");
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  output.textContent = "";
  statsBox.textContent = "";
  lastValue = null;
  message(msgBox, "", "ok");
  localStorage.removeItem(DRAFT_KEY);
  input.focus();
});

document.getElementById("copy").addEventListener("click", () => {
  if (!output.textContent) return toast("没有可复制的结果");
  copy(output.textContent, "结果已复制");
});

document.getElementById("download").addEventListener("click", () => {
  if (!output.textContent) return toast("没有可下载的结果");
  downloadText("data.json", output.textContent, "application/json;charset=utf-8");
});

document.getElementById("pick").addEventListener("click", () => {
  const value = ensureParsed();
  if (value === null) return;
  const res = getByPath(value, pathInput.value);
  if (!res.ok) {
    pickOut.textContent = "";
    message(msgBox, res.error, "err");
    return;
  }
  const text = typeof res.value === "string" ? res.value : JSON.stringify(res.value, null, 2);
  pickOut.textContent = text;
  message(msgBox, "取值成功", "ok");
});

document.getElementById("copyPick").addEventListener("click", () => {
  if (!pickOut.textContent) return toast("没有可取的值");
  copy(pickOut.textContent, "取值已复制");
});

indentSel.addEventListener("change", () => {
  if (output.textContent && lastValue !== null) {
    setResult(stringify(lastValue, indentSel.value === "0" ? 0 : indentSel.value), lastValue);
  }
  localStorage.setItem("tool.json.indent", indentSel.value);
});

input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    render(indentSel.value === "0" ? 2 : indentSel.value);
  }
});

// 草稿自动保存
let draftTimer = null;
input.addEventListener("input", () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, input.value);
    } catch {
      /* 超限忽略 */
    }
  }, 400);
});

// 初始化
const savedIndent = localStorage.getItem("tool.json.indent");
if (savedIndent) indentSel.value = savedIndent;
const draft = localStorage.getItem(DRAFT_KEY);
if (draft) {
  input.value = draft;
  render(indentSel.value === "0" ? 2 : indentSel.value);
}
input.focus();
