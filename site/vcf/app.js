/**
 * 表格 → vCard：UI 层（解析、列映射、预览、导出）
 */
import { copy, downloadText, escapeHtml, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { FIELDS, buildContacts, buildVCards, guessFieldMap, parseTable } from "/vcf/core.js";

const SAMPLE = [
  "姓名\t手机\t公司\t部门\t职位\t邮箱\t备注",
  "张三\t138 0013 8000\t示例科技有限公司\t研发部\t项目经理\tzhangsan@example.com\t常用",
  "李四\t+86 139-0013-9000\t示例科技有限公司\t销售部\t销售经理\tlisi@example.com\t",
  "王五\t13700137000\t合作单位\t综合部\t负责人\t\t外部对接人",
].join("\n");

const MAX_COLS = 30;
const PREVIEW_ROWS = 8;

const els = {
  input: document.getElementById("input"),
  file: document.getElementById("file"),
  hasHeader: document.getElementById("hasHeader"),
  dedup: document.getElementById("dedup"),
  nameSplit: document.getElementById("nameSplit"),
  msg: document.getElementById("msg"),
  mapPanel: document.getElementById("map-panel"),
  mapGrid: document.getElementById("map-grid"),
  outPanel: document.getElementById("out-panel"),
  stat: document.getElementById("stat"),
  preview: document.getElementById("preview"),
  hint: document.getElementById("hint"),
};

const state = {
  headers: [],
  samples: [],
  dataRows: [],
  map: [],
  mapTouched: false,
  contacts: [],
  vcf: "",
};

/* ---------------- 解析 ---------------- */

function padRow(row, length) {
  const out = row.slice(0, length);
  while (out.length < length) out.push("");
  return out;
}

function ingest() {
  const text = els.input.value;
  if (!text.trim()) {
    resetOutput();
    message(els.msg, "", "ok");
    return;
  }

  const rows = parseTable(text).filter((row) => row.some((cell) => cell));
  if (!rows.length) {
    resetOutput();
    message(els.msg, "没有解析到内容", "err");
    return;
  }

  const colCount = Math.min(MAX_COLS, Math.max(...rows.map((row) => row.length)));
  const hasHeader = els.hasHeader.checked;
  const headerRow = hasHeader ? padRow(rows[0], colCount) : null;
  const dataRows = (hasHeader ? rows.slice(1) : rows).map((row) => padRow(row, colCount));

  const headers = headerRow
    ? headerRow.map((cell, index) => cell || `第 ${index + 1} 列`)
    : Array.from({ length: colCount }, (_, index) => `第 ${index + 1} 列`);

  const colChanged = headers.length !== state.headers.length;
  state.headers = headers;
  state.dataRows = dataRows;
  state.samples = headers.map((_, index) => (dataRows[0] ? dataRows[0][index] : "") || "");

  if (colChanged || !state.mapTouched) {
    state.map = hasHeader ? guessFieldMap(headers) : defaultMap(colCount);
  } else {
    // 列数没变：保留用户手工映射，超出的截断
    state.map = headers.map((_, index) => state.map[index] || "ignore");
  }

  if (dataRows.length === 0) {
    renderMap();
    resetOutput();
    message(els.msg, "只有表头，没有数据行", "warn");
    return;
  }

  if (colCount === 1) {
    message(els.msg, "只解析到 1 列 —— 确认粘贴的是整块表格（列之间用制表符或逗号分隔）", "warn");
  } else {
    message(els.msg, `解析到 ${dataRows.length} 行 × ${colCount} 列`, "ok");
  }

  renderMap();
  rebuild();
}

/** 无表头时的默认映射：1 姓名、2 手机、3 公司、4 职位、5 邮箱 */
function defaultMap(colCount) {
  const preset = ["name", "mobile", "org", "title", "email", "address", "remark"];
  return Array.from({ length: colCount }, (_, index) => preset[index] || "ignore");
}

/* ---------------- 列映射 ---------------- */

function fieldOptions(selected) {
  return FIELDS.map(
    (field) =>
      `<option value="${field.key}"${field.key === selected ? " selected" : ""}>${escapeHtml(field.label)}</option>`,
  ).join("");
}

function renderMap() {
  if (!state.headers.length) {
    els.mapPanel.hidden = true;
    els.mapGrid.innerHTML = "";
    return;
  }
  els.mapGrid.innerHTML = state.headers
    .map((header, index) => {
      const sample = state.samples[index] || "";
      return `<label class="map-item">
        <span class="map-head"><b>${escapeHtml(header)}</b>${sample ? `<em>${escapeHtml(sample)}</em>` : ""}</span>
        <select data-col="${index}">${fieldOptions(state.map[index] || "ignore")}</select>
      </label>`;
    })
    .join("");
  els.mapPanel.hidden = false;
}

els.mapGrid.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-col]");
  if (!select) return;
  const index = Number(select.dataset.col);
  state.map[index] = select.value;
  state.mapTouched = true;
  // 同一字段被别的列占用时，把旧列改成忽略，避免两个「姓名」
  if (select.value !== "ignore") {
    state.map = state.map.map((key, i) => (i !== index && key === select.value ? "ignore" : key));
    renderMap();
  }
  rebuild();
});

/* ---------------- 生成与预览 ---------------- */

function rebuild() {
  const { contacts, skipped, duplicates } = buildContacts(state.dataRows, state.map, {
    dedup: els.dedup.checked,
  });
  state.contacts = contacts;
  state.vcf = buildVCards(contacts, { nameSplit: els.nameSplit.value === "first" });

  if (!contacts.length) {
    els.outPanel.hidden = false;
    els.stat.innerHTML = `<span class="warn">没有可导出的联系人</span> —— 检查「列对应」里是否选了姓名或手机列`;
    els.preview.innerHTML = "";
    return;
  }

  const extra = [];
  if (skipped) extra.push(`跳过 ${skipped} 行（无姓名/号码）`);
  if (duplicates) extra.push(`去重 ${duplicates} 条`);

  els.stat.innerHTML = `将导出 <b>${contacts.length}</b> 个联系人${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
  els.outPanel.hidden = false;
  renderPreview();
}

function renderPreview() {
  const rows = state.contacts.slice(0, PREVIEW_ROWS);
  const head = "<tr><th>姓名</th><th>手机</th><th>座机</th><th>公司</th><th>职位</th><th>邮箱</th></tr>";
  const body = rows
    .map(
      (contact) => `<tr>
        <td${contact.name.length > 12 ? ' class="cut"' : ""}>${escapeHtml(contact.name)}</td>
        <td>${escapeHtml(contact.mobile || "—")}</td>
        <td>${escapeHtml(contact.phone || "—")}</td>
        <td${(contact.org || "").length > 12 ? ' class="cut"' : ""}>${escapeHtml(contact.org || "—")}</td>
        <td>${escapeHtml(contact.title || "—")}</td>
        <td${(contact.email || "").length > 18 ? ' class="cut"' : ""}>${escapeHtml(contact.email || "—")}</td>
      </tr>`,
    )
    .join("");
  els.preview.innerHTML = head + body;
  const more = state.contacts.length > PREVIEW_ROWS ? `仅预览前 ${PREVIEW_ROWS} 条，下载的 .vcf 含全部 ${state.contacts.length} 条。` : "";
  els.hint.textContent = `${more}表格可左右滑动查看；在手机「文件」里点开 .vcf 即可导入通讯录，微信发到手机后点开也能导入。`;
}

function resetOutput() {
  state.headers = [];
  state.samples = [];
  state.dataRows = [];
  state.map = [];
  state.mapTouched = false;
  state.contacts = [];
  state.vcf = "";
  els.mapPanel.hidden = true;
  els.mapGrid.innerHTML = "";
  els.outPanel.hidden = true;
  els.stat.innerHTML = "";
  els.preview.innerHTML = "";
}

/* ---------------- 交互 ---------------- */

let timer = null;
els.input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(ingest, 300);
});

els.hasHeader.addEventListener("change", () => {
  state.mapTouched = false;
  ingest();
});

[els.dedup, els.nameSplit].forEach((el) => el.addEventListener("change", () => rebuild()));

els.file.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await readText(file);
    els.input.value = text;
    ingest();
    message(els.msg, `已读入 ${file.name}（${file.size} 字节）`, "ok");
  } catch (err) {
    message(els.msg, `读取文件失败：${err.message}`, "err");
  }
  event.target.value = "";
});

/** CSV 常见 GBK 编码：UTF-8 严格解码失败时回退 gbk */
async function readText(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("gbk").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
}

document.getElementById("sample").addEventListener("click", () => {
  els.hasHeader.checked = true;
  els.input.value = SAMPLE;
  state.mapTouched = false;
  ingest();
  message(els.msg, "已填入示例，可直接下载看效果", "ok");
});

document.getElementById("clear").addEventListener("click", () => {
  els.input.value = "";
  resetOutput();
  message(els.msg, "", "ok");
  els.input.focus();
});

document.getElementById("download").addEventListener("click", () => {
  if (!state.contacts.length) return toast("没有可导出的联系人");
  downloadText("contacts.vcf", state.vcf, "text/vcard;charset=utf-8");
  toast(`已下载 ${state.contacts.length} 个联系人`);
});

document.getElementById("copy").addEventListener("click", () => {
  if (!state.vcf) return toast("没有可复制的内容");
  copy(state.vcf, "vCard 已复制");
});

els.input.focus();
