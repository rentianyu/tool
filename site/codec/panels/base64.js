/**
 * 编码转换 · Base64 面板
 * 逻辑搬自原 /base64 工具，DOM 用 b- 前缀 id 隔离
 */
import { copy, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { decodeBytes, decodeText, encodeText, guessMimeFromBytes, isProbablyBase64 } from "/codec/core/base64.js";

const html = `
<div class="panel">
  <div class="panel-head">
    <span class="panel-title">输入</span>
    <span class="row">
      <label class="row small mut"><input type="checkbox" id="b-urlsafe"> URL-safe（-_ 替代 +/，去 padding）</label>
    </span>
  </div>
  <textarea id="b-input" spellcheck="false" placeholder="输入文本，或选择文件自动转 Base64"></textarea>
  <div class="row" style="margin-top:10px">
    <button class="btn btn-primary" id="b-encode" type="button">编码 →</button>
    <button class="btn" id="b-decode" type="button">← 解码</button>
    <label class="btn" for="b-file">选择文件</label>
    <input type="file" id="b-file" hidden>
    <span class="spacer"></span>
    <button class="btn btn-ghost" id="b-clear" type="button">清空</button>
  </div>
  <div class="msg" id="b-msg" style="margin-top:8px"></div>
</div>

<div class="panel">
  <div class="panel-head">
    <span class="panel-title">结果</span>
    <span class="row">
      <span class="mut small mono" id="b-stats"></span>
      <button class="btn btn-sm" id="b-copy" type="button">复制</button>
      <button class="btn btn-sm" id="b-swap" type="button">结果作输入 ↑</button>
    </span>
  </div>
  <pre class="out" id="b-output"></pre>
</div>`;

function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);

  const input = $("b-input");
  const output = $("b-output");
  const msgBox = $("b-msg");
  const stats = $("b-stats");
  const urlsafe = $("b-urlsafe");

  let lastBytes = null;

  function show(text, note) {
    output.textContent = text;
    stats.textContent = `${text.length} 字符`;
    if (note) message(msgBox, note, "ok");
  }

  $("b-encode").addEventListener("click", () => {
    lastBytes = null;
    if (!input.value) return message(msgBox, "输入为空", "err");
    show(encodeText(input.value, { urlSafe: urlsafe.checked }), "编码完成");
  });

  $("b-decode").addEventListener("click", () => {
    if (!input.value.trim()) return message(msgBox, "输入为空", "err");
    try {
      lastBytes = decodeBytes(input.value);
      show(decodeText(input.value), `解码完成（${lastBytes.length} 字节）`);
    } catch (err) {
      lastBytes = null;
      message(msgBox, err.message, "err");
    }
  });

  $("b-file").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    lastBytes = buf;
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
    const value = urlsafe.checked ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b64;
    show(value, `${file.name} · ${buf.length} 字节 → Base64`);
    event.target.value = "";
  });

  $("b-copy").addEventListener("click", () => {
    if (!output.textContent) return toast("没有可复制的结果");
    copy(output.textContent, "已复制");
  });

  $("b-swap").addEventListener("click", () => {
    if (!output.textContent) return toast("没有结果");
    input.value = output.textContent;
    output.textContent = "";
    stats.textContent = "";
    message(msgBox, "已把结果放到输入框", "ok");
  });

  $("b-clear").addEventListener("click", () => {
    input.value = "";
    output.textContent = "";
    stats.textContent = "";
    lastBytes = null;
    message(msgBox, "", "ok");
  });

  // Ctrl/Cmd + Enter 编码
  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      $("b-encode").click();
    }
  });

  // 输入疑似 Base64 时提示
  input.addEventListener("input", () => {
    if (!input.value.trim()) return message(msgBox, "", "ok");
    if (isProbablyBase64(input.value) && input.value.length > 8) {
      message(msgBox, "看起来是 Base64，可点「← 解码」", "warn");
    } else {
      message(msgBox, "", "ok");
    }
  });

  // 双击结果区下载解码出的二进制
  output.addEventListener("dblclick", () => {
    if (!lastBytes) return;
    const mime = guessMimeFromBytes(lastBytes);
    const blob = new Blob([lastBytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decoded.${(mime.split("/")[1] || "bin").replace("octet-stream", "bin")}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已下载解码后的文件");
  });
}

export default { key: "base64", label: "Base64 编解码", html, init };
