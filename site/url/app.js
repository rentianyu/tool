import { copy, escapeHtml, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { analyze, decodeComponent, decodeUri, encodeComponent, encodeUri, looksEncoded } from "/url/core.js";

const input = document.getElementById("input");
const output = document.getElementById("output");
const msgBox = document.getElementById("msg");
const parsed = document.getElementById("parsed");

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

document.getElementById("auto").addEventListener("click", () => {
  if (!input.value) return message(msgBox, "输入为空", "err");
  if (looksEncoded(input.value)) {
    run(decodeComponent, "检测到百分号编码，已解码");
  } else {
    run(encodeComponent, "未检测到编码，已编码");
  }
});

document.getElementById("encComp").addEventListener("click", () => run(encodeComponent, "encodeURIComponent 完成"));
document.getElementById("decComp").addEventListener("click", () => run(decodeComponent, "decodeURIComponent 完成"));
document.getElementById("encUri").addEventListener("click", () => run(encodeUri, "encodeURI 完成"));
document.getElementById("decUri").addEventListener("click", () => run(decodeUri, "decodeURI 完成"));

document.getElementById("copy").addEventListener("click", () => {
  if (!output.textContent) return toast("没有可复制的结果");
  copy(output.textContent, "已复制");
});

document.getElementById("swap").addEventListener("click", () => {
  if (!output.textContent) return toast("没有结果");
  input.value = output.textContent;
  output.textContent = "";
  message(msgBox, "已把结果放到输入框", "ok");
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  output.textContent = "";
  parsed.textContent = "粘贴一个完整 URL 后点「解析」。";
  parsed.className = "dim small";
  message(msgBox, "", "ok");
});

document.getElementById("parse").addEventListener("click", () => {
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
  let html = `<table class="kv">${rows
    .map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("")}</table>`;
  if (res.params.length) {
    html += `<div class="panel-title" style="margin:14px 0 6px">查询参数（${res.params.length}）</div>
      <table class="kv"><tr><th>参数</th><th>值</th></tr>${res.params
        .map((p) => `<tr><td>${escapeHtml(p.key)}</td><td>${escapeHtml(p.value)}</td></tr>`)
        .join("")}</table>`;
  }
  parsed.className = "";
  parsed.innerHTML = html;
});

input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    document.getElementById("auto").click();
  }
});
input.focus();
