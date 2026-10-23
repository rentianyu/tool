import { copy } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { hashAll, md5Hex } from "/hash/core.js";

const input = document.getElementById("input");
const tbl = document.getElementById("tbl");
const msgBox = document.getElementById("msg");
const srcLabel = document.getElementById("src");
const upper = document.getElementById("upper");
const b64 = document.getElementById("b64");

let fileBytes = null;
let results = [];

function render() {
  if (!results.length) return;
  const pick = (item) => (b64.checked ? item.base64 : upper.checked ? item.hex.toUpperCase() : item.hex);
  tbl.innerHTML = results
    .map(
      (item) => `<tr><th>${item.algo}</th><td>
        <span class="mono">${pick(item)}</span>
        <button class="btn btn-sm btn-ghost" data-copy="${pick(item)}" type="button">复制</button>
      </td></tr>`
    )
    .join("");
}

async function compute() {
  const bytes = fileBytes || new TextEncoder().encode(input.value);
  if (!bytes.length) {
    message(msgBox, "输入为空", "err");
    return;
  }
  message(msgBox, "计算中…", "ok");
  const started = performance.now();
  results = await hashAll(bytes);
  message(msgBox, `完成 · ${bytes.length} 字节 · ${(performance.now() - started).toFixed(1)} ms`, "ok");
  render();
}

document.getElementById("run").addEventListener("click", compute);

document.getElementById("file").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  fileBytes = new Uint8Array(await file.arrayBuffer());
  srcLabel.textContent = `${file.name} · ${fileBytes.length} 字节`;
  message(msgBox, "已读取文件，开始计算", "ok");
  compute();
  event.target.value = "";
});

input.addEventListener("input", () => {
  fileBytes = null;
  srcLabel.textContent = "文本模式";
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  fileBytes = null;
  results = [];
  tbl.innerHTML = "";
  srcLabel.textContent = "";
  message(msgBox, "", "ok");
});

upper.addEventListener("change", render);
b64.addEventListener("change", render);

tbl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-copy]");
  if (btn) copy(btn.dataset.copy, "哈希已复制");
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    compute();
  }
});

// MD5 自检（防止实现被改坏）
if (md5Hex("abc") !== "900150983cd24fb0d6963f7d28e17f72") {
  message(msgBox, "MD5 自检未通过，请刷新页面", "err");
}
