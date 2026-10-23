import { copy } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { diffLines, toUnified } from "/diff/core.js";

const left = document.getElementById("left");
const right = document.getElementById("right");
const view = document.getElementById("view");
const msgBox = document.getElementById("msg");

function render(rows) {
  view.textContent = "";
  const frag = document.createDocumentFragment();
  rows.forEach((row) => {
    const line = document.createElement("div");
    line.className = `diff-row diff-${row.type}`;
    const noA = document.createElement("span");
    noA.className = "diff-no";
    noA.textContent = row.aLine || "";
    const noB = document.createElement("span");
    noB.className = "diff-no";
    noB.textContent = row.bLine || "";
    const sign = document.createElement("span");
    sign.className = "diff-sign";
    sign.textContent = row.type === "add" ? "+" : row.type === "del" ? "-" : "";
    const text = document.createElement("span");
    text.className = "diff-text";
    text.textContent = row.text === "" ? " " : row.text;
    line.append(noA, noB, sign, text);
    frag.appendChild(line);
  });
  view.appendChild(frag);
}

let lastRows = [];

function run() {
  const res = diffLines(left.value, right.value);
  if (!res.ok) {
    message(msgBox, res.error, "err");
    view.textContent = "";
    return;
  }
  lastRows = res.rows;
  render(res.rows);
  document.getElementById("addChip").textContent = `+${res.stats.add}`;
  document.getElementById("delChip").textContent = `-${res.stats.del}`;
  document.getElementById("sameChip").textContent = `相同 ${res.stats.same}`;
  if (res.stats.add === 0 && res.stats.del === 0) {
    message(msgBox, "两段文本完全一致", "ok");
  } else {
    message(msgBox, `A ${res.stats.aLines} 行 · B ${res.stats.bLines} 行 · 新增 ${res.stats.add} 行 · 删除 ${res.stats.del} 行`, "ok");
  }
}

let timer = null;
[left, right].forEach((el) =>
  el.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  })
);

document.getElementById("sample").addEventListener("click", () => {
  left.value = `function hello() {\n  console.log("hi");\n  return 1;\n}\n`;
  right.value = `function hello(name) {\n  console.log("hi", name);\n  return 2;\n}\n`;
  run();
});

document.getElementById("swap").addEventListener("click", () => {
  const tmp = left.value;
  left.value = right.value;
  right.value = tmp;
  run();
});

document.getElementById("clear").addEventListener("click", () => {
  left.value = "";
  right.value = "";
  view.textContent = "";
  message(msgBox, "", "ok");
  document.getElementById("addChip").textContent = "+0";
  document.getElementById("delChip").textContent = "-0";
  document.getElementById("sameChip").textContent = "相同 0";
});

// 双击结果区复制统一 diff
view.addEventListener("dblclick", () => {
  if (!lastRows.length) return;
  copy(toUnified(lastRows), "统一 diff 已复制");
});

// 从 URL 参数带入（?a=...&b=... 便于分享对比）
const params = new URLSearchParams(location.search);
if (params.has("a") || params.has("b")) {
  left.value = params.get("a") || "";
  right.value = params.get("b") || "";
}
run();
