import { copy, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { CHEATSHEET, findAll, replaceAll, splitByMatches } from "/regex/core.js";

const $ = (id) => document.getElementById(id);
const FLAG_BOXES = ["f-g", "f-i", "f-m", "f-s", "f-u", "f-y"];

const input = $("pattern");
const text = $("text");
const highlight = $("highlight");
const matchesBox = $("matches");
const replaceOut = $("replaceOut");

let lastReplaced = "";

function currentFlags() {
  return FLAG_BOXES.filter((id) => $(id).checked)
    .map((id) => id.slice(2))
    .join("");
}

function syncFlagsInput() {
  $("flags").value = currentFlags();
}

FLAG_BOXES.forEach((id) => $(id).addEventListener("change", () => {
  syncFlagsInput();
  run();
}));
$("flags").addEventListener("input", () => {
  const value = $("flags").value;
  FLAG_BOXES.forEach((id) => {
    $(id).checked = value.includes(id.slice(2));
  });
  run();
});

function renderHighlight(segments) {
  highlight.textContent = "";
  segments.forEach((seg) => {
    if (seg.hit) {
      const mark = document.createElement("mark");
      mark.textContent = seg.text;
      mark.style.cssText = "background:var(--accent-soft);color:var(--accent);border-radius:3px;padding:0 1px";
      highlight.appendChild(mark);
    } else {
      highlight.appendChild(document.createTextNode(seg.text));
    }
  });
}

function renderMatches(matches) {
  if (!matches.length) {
    matchesBox.className = "dim small";
    matchesBox.textContent = "没有匹配。";
    return;
  }
  matchesBox.className = "";
  const rows = matches.slice(0, 200).map((m, i) => {
    const groups = m.groups.length
      ? `<div class="mut small mono">分组：${m.groups
          .map((g, gi) => `$${gi + 1}=${g === undefined ? "(未匹配)" : g}`)
          .join("　")}</div>`
      : "";
    const named = m.named
      ? `<div class="mut small mono">命名组：${Object.entries(m.named)
          .map(([k, v]) => `${k}=${v}`)
          .join("　")}</div>`
      : "";
    return `<div style="padding:5px 0;border-bottom:1px solid var(--line-soft)">
      <span class="chip">#${i + 1}</span>
      <span class="mut small mono">位置 ${m.index}–${m.end}</span>
      <div class="mono" style="margin-top:3px;word-break:break-all">${escapeText(m.match) || "(空匹配)"}</div>
      ${groups}${named}
    </div>`;
  });
  matchesBox.innerHTML = rows.join("");
  if (matches.length > 200) {
    matchesBox.insertAdjacentHTML("beforeend", `<div class="mut small" style="margin-top:6px">仅显示前 200 条</div>`);
  }
}

function escapeText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let timer = null;
function run() {
  clearTimeout(timer);
  timer = setTimeout(doRun, 180);
}

function doRun() {
  const res = findAll(input.value, currentFlags(), text.value);
  if (!res.ok) {
    message($("msg"), res.error, "err");
    $("status").textContent = "";
    highlight.textContent = "";
    matchesBox.textContent = "正则有误。";
    replaceOut.textContent = "";
    return;
  }
  $("status").textContent = res.matches.length ? `${res.matches.length} 处匹配` : "";
  message($("msg"), res.matches.length ? "" : input.value ? "没有匹配" : "", "ok");
  renderHighlight(splitByMatches(text.value, res.matches));
  renderMatches(res.matches);

  const rep = replaceAll(input.value, currentFlags(), text.value, $("replacement").value);
  if (rep.ok) {
    lastReplaced = rep.replaced;
    replaceOut.textContent = rep.replaced;
  } else {
    lastReplaced = "";
    replaceOut.textContent = "";
  }
}

input.addEventListener("input", run);
text.addEventListener("input", run);
$("replacement").addEventListener("input", run);

$("copyReplace").addEventListener("click", () => {
  if (!lastReplaced) return toast("没有替换结果");
  copy(lastReplaced, "替换结果已复制");
});

// 速查
const cheat = document.createElement("div");
cheat.className = "row";
cheat.style.marginTop = "10px";
CHEATSHEET.forEach(([name, pattern]) => {
  const btn = document.createElement("button");
  btn.className = "btn btn-sm";
  btn.type = "button";
  btn.textContent = name;
  btn.addEventListener("click", () => {
    input.value = pattern;
    run();
  });
  cheat.appendChild(btn);
});
document.querySelector(".panel").appendChild(cheat);

syncFlagsInput();
text.value = "示例：hello@example.com，联系 13800138000，访问 https://xbta.cc/json";
input.value = "([\\w.+-]+)@([\\w-]+\\.[\\w.]+)";
doRun();
input.focus();
input.select();
