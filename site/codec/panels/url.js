/**
 * 编码转换 · URL 面板
 * 逻辑搬自原 /url 工具，DOM 用 u- 前缀 id 隔离
 */
import { copy, escapeHtml, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { analyze, decodeComponent, decodeUri, encodeComponent, encodeUri, looksEncoded } from "/codec/core/url.js";

const html = `
<div class="panel">
  <div class="panel-head"><span class="panel-title">输入</span></div>
  <textarea id="u-input" class="mono-sm" spellcheck="false" placeholder="文本或 URL，例如 https://example.com/a?x=1&y=中文"></textarea>
  <div class="row" style="margin-top:10px">
    <button class="btn btn-primary" id="u-auto" type="button">自动识别并转换</button>
    <button class="btn" id="u-encComp" type="button">encodeURIComponent</button>
    <button class="btn" id="u-decComp" type="button">decodeURIComponent</button>
    <button class="btn" id="u-encUri" type="button">encodeURI</button>
    <button class="btn" id="u-decUri" type="button">decodeURI</button>
    <span class="spacer"></span>
    <button class="btn btn-ghost" id="u-clear" type="button">清空</button>
  </div>
  <div class="msg" id="u-msg" style="margin-top:8px"></div>
</div>

<div class="panel">
  <div class="panel-head">
    <span class="panel-title">结果</span>
    <span class="row">
      <button class="btn btn-sm" id="u-copy" type="button">复制</button>
      <button class="btn btn-sm" id="u-swap" type="button">作输入 ↑</button>
    </span>
  </div>
  <pre class="out" id="u-output" style="min-height:80px"></pre>
</div>

<div class="panel">
  <div class="panel-head">
    <span class="panel-title">URL 结构解析</span>
    <button class="btn btn-sm" id="u-parse" type="button">解析输入框的 URL</button>
  </div>
  <div id="u-parsed" class="dim small">粘贴一个完整 URL 后点「解析输入框的 URL」。</div>
</div>`;

function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);

  const input = $("u-input");
  const output = $("u-output");
  const msgBox = $("u-msg");
  const parsed = $("u-parsed");

  function show(text, note) {
    output.textContent = text;
    message(msgBox, note || "完成", "ok");
  }

  function run(fn, label) {
    if (!input.value) return message(msgBox, "输入为空", "err");
    try {
      show(fn(input.value), label);
    } catch (err) {
      message(msgBox, err.message, "err");
    }
  }

  $("u-auto").addEventListener("click", () => {
    if (!input.value) return message(msgBox, "输入为空", "err");
    if (looksEncoded(input.value)) {
      run(decodeComponent, "检测到百分号编码，已解码");
    } else {
      run(encodeComponent, "未检测到编码，已编码");
    }
  });

  $("u-encComp").addEventListener("click", () => run(encodeComponent, "encodeURIComponent 完成"));
  $("u-decComp").addEventListener("click", () => run(decodeComponent, "decodeURIComponent 完成"));
  $("u-encUri").addEventListener("click", () => run(encodeUri, "encodeURI 完成"));
  $("u-decUri").addEventListener("click", () => run(decodeUri, "decodeURI 完成"));

  $("u-copy").addEventListener("click", () => {
    if (!output.textContent) return toast("没有可复制的结果");
    copy(output.textContent, "已复制");
  });

  $("u-swap").addEventListener("click", () => {
    if (!output.textContent) return toast("没有结果");
    input.value = output.textContent;
    output.textContent = "";
    message(msgBox, "已把结果放到输入框", "ok");
  });

  $("u-clear").addEventListener("click", () => {
    input.value = "";
    output.textContent = "";
    parsed.textContent = "粘贴一个完整 URL 后点「解析输入框的 URL」。";
    parsed.className = "dim small";
    message(msgBox, "", "ok");
  });

  $("u-parse").addEventListener("click", () => {
    const res = analyze(input.value);
    if (!res.ok) {
      parsed.className = "msg msg-err";
      parsed.textContent = res.error;
      return;
    }
    const rows = [
      ["协议", res.parts.protocol],
      ["域名", res.parts.host],
      ["端口", res.parts.port],
      ["路径", res.parts.path],
      ["查询串", res.parts.query || "(无)"],
      ["锚点", res.parts.hash || "(无)"],
      ["Origin", res.parts.origin],
    ];
    let htmlOut = `<table class="kv">${rows
      .map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`;
    if (res.params.length) {
      htmlOut += `<div class="panel-title" style="margin:14px 0 6px">查询参数（${res.params.length}）</div>
        <table class="kv"><tr><th>参数</th><th>值</th></tr>${res.params
          .map((p) => `<tr><td>${escapeHtml(p.key)}</td><td>${escapeHtml(p.value)}</td></tr>`)
          .join("")}</table>`;
    }
    parsed.className = "";
    parsed.innerHTML = htmlOut;
  });

  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      $("u-auto").click();
    }
  });
}

export default { key: "url", label: "URL 编解码", html, init };
