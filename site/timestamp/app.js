import { copy, escapeHtml } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { describe, fmtLocal, parseInput, relativeTime } from "/timestamp/core.js";

const nowSec = document.getElementById("nowSec");
const nowMs = document.getElementById("nowMs");
const nowLocal = document.getElementById("nowLocal");
const input = document.getElementById("input");
const msgBox = document.getElementById("msg");
const tbl = document.getElementById("tbl");
const tzname = document.getElementById("tzname");

tzname.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;

let current = null;

function tick() {
  const now = new Date();
  nowSec.textContent = Math.floor(now.getTime() / 1000);
  nowMs.textContent = now.getTime();
  nowLocal.textContent = fmtLocal(now);
}
tick();
setInterval(tick, 1000);

function render(date) {
  current = date;
  const d = describe(date);
  const rows = [
    ["秒级时间戳", d.seconds],
    ["毫秒时间戳", d.millis],
    ["本地时间", `${d.local}（${d.weekday}，UTC${d.offset >= 0 ? "+" : ""}${d.offset}）`],
    ["UTC", d.utc],
    ["ISO 8601", d.iso],
    ["相对现在", d.relative],
    ["时区", d.timezone],
  ];
  tbl.innerHTML = rows
    .map(
      ([k, v]) => `<tr${k === "相对现在" ? ' data-rel="1"' : ""}><th>${k}</th><td>${escapeHtml(v)}</td></tr>`
    )
    .join("");
  localStorage.setItem("tool.timestamp.input", input.value);
}

function convert() {
  const res = parseInput(input.value);
  if (!res.ok) {
    message(msgBox, res.error, "err");
    return;
  }
  message(msgBox, res.kind === "timestamp" ? "按时间戳解析" : "按日期解析", "ok");
  render(res.date);
}

let timer = null;
input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(convert, 220);
});

document.getElementById("setNow").addEventListener("click", () => {
  input.value = String(Math.floor(Date.now() / 1000));
  convert();
});
document.getElementById("setToday").addEventListener("click", () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  input.value = String(Math.floor(d.getTime() / 1000));
  convert();
});
document.getElementById("setPlus").addEventListener("click", () => {
  const base = current && !Number.isNaN(current.getTime()) ? current.getTime() : Date.now();
  input.value = String(Math.floor((base + 3600 * 1000) / 1000));
  convert();
});

document.getElementById("copyNow").addEventListener("click", () => copy(nowSec.textContent, "秒级时间戳已复制"));
document.getElementById("copyAll").addEventListener("click", () => {
  const lines = Array.from(tbl.querySelectorAll("tr")).map((tr) => {
    const th = tr.querySelector("th").textContent;
    const td = tr.querySelector("td").textContent;
    return `${th}: ${td}`;
  });
  if (!lines.length) return;
  copy(lines.join("\n"), "结果已复制");
});

const saved = localStorage.getItem("tool.timestamp.input");
input.value = saved || String(Math.floor(Date.now() / 1000));
convert();
setInterval(() => {
  if (current) {
    const rel = tbl.querySelector('tr[data-rel] td');
    if (rel) rel.textContent = relativeTime(current);
  }
}, 1000);
