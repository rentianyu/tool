import { escapeHtml } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { decodeJwt, describeClaims, verifyHmac } from "/jwt/core.js";

const input = document.getElementById("input");
const msgBox = document.getElementById("msg");
const headerOut = document.getElementById("header");
const payloadOut = document.getElementById("payload");
const claimsTbl = document.getElementById("claims");
const sigChip = document.getElementById("sigChip");
const secret = document.getElementById("secret");
const algo = document.getElementById("algo");

let current = null;

function reset() {
  current = null;
  headerOut.textContent = "";
  payloadOut.textContent = "";
  claimsTbl.innerHTML = "";
  sigChip.hidden = true;
}

function render() {
  reset();
  const text = input.value.trim();
  if (!text) return;
  const res = decodeJwt(text);
  if (!res.ok) {
    message(msgBox, res.error, "err");
    return;
  }
  current = res;
  headerOut.textContent = JSON.stringify(res.header, null, 2);
  payloadOut.textContent = JSON.stringify(res.payload, null, 2);

  const rows = describeClaims(res.payload);
  rows.unshift(["算法 alg", res.header.alg || "-"], ["类型 typ", res.header.typ || "-"], ["签名（前 24 位）", `${res.signature.slice(0, 24)}…`]);
  claimsTbl.innerHTML = rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("");

  const expired = typeof res.payload.exp === "number" && res.payload.exp * 1000 < Date.now();
  message(msgBox, expired ? "解析成功，但该 JWT 已过期" : "解析成功", expired ? "warn" : "ok");
  localStorage.setItem("tool.jwt.token", text);
}

let timer = null;
input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(render, 250);
});

document.getElementById("verify").addEventListener("click", async () => {
  if (!current) {
    message(msgBox, "先粘贴一个 JWT", "err");
    return;
  }
  const res = await verifyHmac(current, secret.value, algo.value);
  sigChip.hidden = false;
  if (!res.ok) {
    sigChip.className = "chip err";
    sigChip.textContent = res.error;
    return;
  }
  sigChip.className = res.matched ? "chip ok" : "chip err";
  sigChip.textContent = res.matched ? "签名匹配 ✓" : "签名不匹配 ✗";
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  reset();
  message(msgBox, "", "ok");
  localStorage.removeItem("tool.jwt.token");
  input.focus();
});

const saved = localStorage.getItem("tool.jwt.token");
if (saved) {
  input.value = saved;
  render();
} else {
  // 示例 token（HS256，密钥 secret），便于直接看到效果
  const sample =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IuW8oOS4iSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.4m4W9m0m5G4y1e3q0m9w3Hq0Yw7Q2n6pQ0k9lJ1cK3A";
  input.placeholder = `粘贴 JWT 后自动解析。示例：${sample.slice(0, 40)}…`;
}
input.focus();
