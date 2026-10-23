import { copy, downloadText, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { decodeBytes, decodeText, encodeText, guessMimeFromBytes, isProbablyBase64 } from "/base64/core.js";

const input = document.getElementById("input");
const output = document.getElementById("output");
const msgBox = document.getElementById("msg");
const stats = document.getElementById("stats");
const urlsafe = document.getElementById("urlsafe");

let lastBytes = null;

function show(text, note) {
  output.textContent = text;
  stats.textContent = `${text.length} 字符`;
  if (note) message(msgBox, note, "ok");
}

document.getElementById("encode").addEventListener("click", () => {
  lastBytes = null;
  if (!input.value) return message(msgBox, "输入为空", "err");
  show(encodeText(input.value, { urlSafe: urlsafe.checked }), "编码完成");
});

document.getElementById("decode").addEventListener("click", () => {
  if (!input.value.trim()) return message(msgBox, "输入为空", "err");
  try {
    lastBytes = decodeBytes(input.value);
    show(decodeText(input.value), `解码完成（${lastBytes.length} 字节）`);
  } catch (err) {
    lastBytes = null;
    message(msgBox, err.message, "err");
  }
});

document.getElementById("file").addEventListener("change", async (event) => {
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

document.getElementById("copy").addEventListener("click", () => {
  if (!output.textContent) return toast("没有可复制的结果");
  copy(output.textContent, "已复制");
});

document.getElementById("swap").addEventListener("click", () => {
  if (!output.textContent) return toast("没有结果");
  input.value = output.textContent;
  output.textContent = "";
  stats.textContent = "";
  message(msgBox, "已把结果放到输入框", "ok");
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  output.textContent = "";
  stats.textContent = "";
  lastBytes = null;
  message(msgBox, "", "ok");
});

// 二进制结果下载（解码出非 UTF-8 时）
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    document.getElementById("encode").click();
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

// 下载二进制（双击结果区）
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

input.focus();
