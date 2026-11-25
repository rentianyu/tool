/**
 * 编码转换 · JSON 面板
 * 逻辑搬自原 /json 工具，DOM 用 j- 前缀 id 隔离
 */
import { copy, downloadText, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { getByPath, parseJson, sortKeysDeep, statsOf, stringify, toJsonLiteral } from "/codec/core/json.js";

const html = `
<div class="panel">
  <div class="panel-head">
    <span class="panel-title">输入 JSON</span>
    <span class="row">
      <select id="j-indent" title="缩进">
        <option value="2">2 空格缩进</option>
        <option value="4">4 空格缩进</option>
        <option value="0">单行（紧凑）</option>
        <option value="tab">Tab 缩进</option>
      </select>
    </span>
  </div>
  <textarea id="j-input" spellcheck="false" placeholder='粘贴 JSON，例如 {"a":1,"b":[2,3]}'></textarea>
  <div class="row" style="margin-top:10px">
    <button class="btn btn-primary" id="j-fmt" type="button">格式化</button>
    <button class="btn" id="j-minify" type="button">压缩</button>
    <button class="btn" id="j-sort" type="button">键名排序</button>
    <button class="btn" id="j-escape" type="button">转义为字符串</button>
    <span class="spacer"></span>
    <button class="btn btn-ghost" id="j-clear" type="button">清空</button>
  </div>
  <div class="msg" id="j-msg" style="margin-top:8px"></div>
</div>

<div class="panel">
  <div class="panel-head">
    <span class="panel-title">结果</span>
    <span class="row">
      <span class="mut small mono" id="j-stats"></span>
      <button class="btn btn-sm" id="j-copy" type="button">复制</button>
      <button class="btn btn-sm" id="j-download" type="button">下载</button>
    </span>
  </div>
  <pre class="out" id="j-output"></pre>
</div>

<div class="panel">
  <div class="panel-head"><span class="panel-title">路径提取</span></div>
  <div class="row">
    <input type="text" id="j-path" placeholder="如 data.items[0].name 或 data[&quot;key-with-dash&quot;]" style="flex:1;min-width:240px">
    <button class="btn" id="j-pick" type="button">取值</button>
    <button class="btn btn-ghost" id="j-copyPick" type="button">复制结果</button>
  </div>
  <div class="out" id="j-pickOut" style="margin-top:8px;min-height:44px;max-height:220px"></div>
</div>`;

const DRAFT_KEY = "tool.json.draft"; // 沿用旧草稿，用户之前存的内容不丢
const INDENT_KEY = "tool.json.indent";

function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);

  const input = $("j-input");
  const output = $("j-output");
  const msgBox = $("j-msg");
  const statsBox = $("j-stats");
  const indentSel = $("j-indent");
  const pathInput = $("j-path");
  const pickOut = $("j-pickOut");

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

  $("j-fmt").addEventListener("click", () => {
    render(indentSel.value === "0" ? 2 : indentSel.value);
  });

  $("j-minify").addEventListener("click", () => render(0));

  $("j-sort").addEventListener("click", () => {
    const value = ensureParsed();
    if (value === null) return;
    const sorted = sortKeysDeep(value);
    setResult(stringify(sorted, indentSel.value === "0" ? 2 : indentSel.value), sorted);
    message(msgBox, "已按 key 排序", "ok");
  });

  $("j-escape").addEventListener("click", () => {
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

  $("j-clear").addEventListener("click", () => {
    input.value = "";
    output.textContent = "";
    statsBox.textContent = "";
    pickOut.textContent = "";
    pathInput.value = "";
    lastValue = null;
    message(msgBox, "", "ok");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 忽略 */
    }
  });

  $("j-copy").addEventListener("click", () => {
    if (!output.textContent) return toast("没有可复制的结果");
    copy(output.textContent, "已复制");
  });

  $("j-download").addEventListener("click", () => {
    if (!output.textContent) return toast("没有可下载的结果");
    downloadText("data.json", output.textContent, "application/json;charset=utf-8");
  });

  $("j-pick").addEventListener("click", () => {
    const value = ensureParsed();
    if (value === null) return;
    const res = getByPath(value, pathInput.value);
    if (!res.ok) {
      pickOut.textContent = "";
      message(msgBox, res.error, "err");
      return;
    }
    pickOut.textContent = typeof res.value === "string" ? res.value : JSON.stringify(res.value, null, 2);
    message(msgBox, "取值成功", "ok");
  });

  $("j-copyPick").addEventListener("click", () => {
    if (!pickOut.textContent) return toast("没有可取的值");
    copy(pickOut.textContent, "取值已复制");
  });

  indentSel.addEventListener("change", () => {
    if (output.textContent && lastValue !== null) {
      setResult(stringify(lastValue, indentSel.value === "0" ? 0 : indentSel.value), lastValue);
    }
    try {
      localStorage.setItem(INDENT_KEY, indentSel.value);
    } catch {
      /* 忽略 */
    }
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
  try {
    const savedIndent = localStorage.getItem(INDENT_KEY);
    if (savedIndent) indentSel.value = savedIndent;
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      input.value = draft;
      render(indentSel.value === "0" ? 2 : indentSel.value);
    }
  } catch {
    /* 隐私模式 */
  }
}

export default { key: "json", label: "JSON 格式化", html, init };
