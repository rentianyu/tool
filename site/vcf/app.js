/**
 * 表格 → 文件（通讯录 vCard / 浏览器书签）：UI 层
 * 两种输出共用「粘贴表格 → 列对应 → 预览 → 下载」流程，顶部下拉切换输出类型
 */
import { copy, downloadText, escapeHtml, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import {
  BOOKMARK_FIELDS,
  FIELDS,
  buildBookmarks,
  buildBookmarksHtml,
  buildContacts,
  buildVCards,
  guessFieldMap,
  parseTable,
} from "/vcf/core.js";

const SAMPLES = {
  vcard: [
    "姓名\t手机\t公司\t部门\t职位\t邮箱\t备注",
    "张三\t138 0013 8000\t示例科技有限公司\t研发部\t项目经理\tzhangsan@example.com\t常用",
    "李四\t+86 139-0013-9000\t示例科技有限公司\t销售部\t销售经理\tlisi@example.com\t",
    "王五\t13700137000\t合作单位\t综合部\t负责人\t\t外部对接人",
  ].join("\n"),
  bookmark: [
    "名称\t网址\t分类\t标签\t备注",
    "百度\thttps://www.baidu.com\t搜索\t常用,国内\t",
    "GitHub\tgithub.com\t开发\t代码托管\t常用网站",
    "MDN\tdeveloper.mozilla.org\t开发\t文档\t前端参考",
    "示例网站\twww.example.com\t其它\t\t演示用",
  ].join("\n"),
};

const MODES = {
  vcard: {
    fields: FIELDS,
    placeholder: "从 Excel / WPS 直接复制整块表格粘贴到这里（首行是表头），或点「选择文件」导入 .csv / .tsv / .txt",
    file: "contacts.vcf",
    type: "text/vcard;charset=utf-8",
    button: "下载 .vcf",
    toast: "已下载",
  },
  bookmark: {
    fields: BOOKMARK_FIELDS,
    placeholder: "粘贴网址表格：名称 | 网址 | 分类 | 标签 | 备注（首行是表头，缺协议会自动补 https://）",
    file: "bookmarks.html",
    type: "text/html;charset=utf-8",
    button: "下载书签 .html",
    toast: "已下载书签",
  },
};

const MODE_KEY = "tool.vcf.mode";
const MAX_COLS = 30;
const PREVIEW_ROWS = 8;

const els = {
  mode: document.getElementById("mode"),
  input: document.getElementById("input"),
  file: document.getElementById("file"),
  hasHeader: document.getElementById("hasHeader"),
  dedup: document.getElementById("dedup"),
  nameSplit: document.getElementById("nameSplit"),
  nameSplitWrap: document.getElementById("nameSplit-wrap"),
  msg: document.getElementById("msg"),
  mapPanel: document.getElementById("map-panel"),
  mapGrid: document.getElementById("map-grid"),
  outPanel: document.getElementById("out-panel"),
  stat: document.getElementById("stat"),
  preview: document.getElementById("preview"),
  hint: document.getElementById("hint"),
  download: document.getElementById("download"),
};

const state = {
  mode: "vcard",
  headers: [],
  samples: [],
  dataRows: [],
  map: [],
  mapTouched: false,
  count: 0,
  output: "",
};

/* ---------------- 解析 ---------------- */

function padRow(row, length) {
  const out = row.slice(0, length);
  while (out.length < length) out.push("");
  return out;
}

function currentMode() {
  return MODES[state.mode] || MODES.vcard;
}

/** 书签模式兜底：没有网址列时，挑一个样本值像网址的列 */
function guessForMode(headers, samples) {
  const fields = currentMode().fields;
  const map = guessFieldMap(headers, fields);
  if (fields === BOOKMARK_FIELDS && !map.includes("url")) {
    const index = samples.findIndex((sample) => /^(https?:\/\/|www\.)|^[\w-]+(\.[\w-]+)+/i.test(sample || ""));
    if (index >= 0 && map[index] === "ignore") map[index] = "url";
  }
  return map;
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
    state.map = hasHeader ? guessForMode(headers, state.samples) : defaultMap(colCount);
  } else {
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

/** 无表头时的默认映射 */
function defaultMap(colCount) {
  const preset =
    state.mode === "bookmark"
      ? ["title", "url", "folder", "tags", "desc"]
      : ["name", "mobile", "org", "title", "email", "address", "remark"];
  return Array.from({ length: colCount }, (_, index) => preset[index] || "ignore");
}

/* ---------------- 列映射 ---------------- */

function fieldOptions(selected) {
  return currentMode()
    .fields.map(
      (field) =>
        `<option value="${field.key}"${field.key === selected ? " selected" : ""}>${escapeHtml(field.label)}</option>`,
    )
    .join("");
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
  if (select.value !== "ignore") {
    state.map = state.map.map((key, i) => (i !== index && key === select.value ? "ignore" : key));
    renderMap();
  }
  rebuild();
});

/* ---------------- 生成与预览 ---------------- */

function rebuild() {
  const dedup = els.dedup.checked;
  if (state.mode === "bookmark") {
    const { items, skipped, duplicates } = buildBookmarks(state.dataRows, state.map, { dedup });
    state.count = items.length;
    state.output = buildBookmarksHtml(items, {
      now: Math.floor(Date.now() / 1000),
      folderName: "导入的书签",
    });
    renderStat(skipped, duplicates, "无有效网址");
    if (!items.length) {
      renderEmpty();
      return;
    }
    renderBookmarkPreview(items);
    return;
  }

  const { contacts, skipped, duplicates } = buildContacts(state.dataRows, state.map, { dedup });
  state.count = contacts.length;
  state.output = buildVCards(contacts, { nameSplit: els.nameSplit.value === "first" });
  renderStat(skipped, duplicates, "无姓名/号码");
  if (!contacts.length) {
    renderEmpty();
    return;
  }
  renderContactPreview(contacts);
}

function renderStat(skipped, duplicates, skipReason) {
  const extra = [];
  if (skipped) extra.push(`跳过 ${skipped} 行（${skipReason}）`);
  if (duplicates) extra.push(`去重 ${duplicates} 条`);
  els.stat.innerHTML = `将导出 <b>${state.count}</b> ${state.mode === "bookmark" ? "个书签" : "个联系人"}${
    extra.length ? ` · ${extra.join(" · ")}` : ""
  }`;
  els.outPanel.hidden = false;
}

function renderEmpty() {
  els.preview.innerHTML = "";
  els.stat.innerHTML =
    state.mode === "bookmark"
      ? '<span class="warn">没有可导出的书签</span> —— 检查「列对应」里是否指定了网址列'
      : '<span class="warn">没有可导出的联系人</span> —— 检查「列对应」里是否选了姓名或手机列';
  els.hint.textContent = "";
}

function renderContactPreview(contacts) {
  const rows = contacts.slice(0, PREVIEW_ROWS);
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
  els.hint.textContent = `${previewNote()}在手机「文件」里点开 .vcf 即可导入通讯录，微信发到手机后点开也能导入。`;
}

function renderBookmarkPreview(items) {
  const rows = items.slice(0, PREVIEW_ROWS);
  const head = "<tr><th>名称</th><th>网址</th><th>分类</th><th>标签</th></tr>";
  const body = rows
    .map(
      (item) => `<tr>
        <td${item.title.length > 16 ? ' class="cut"' : ""}>${escapeHtml(item.title)}</td>
        <td class="cut">${escapeHtml(item.url)}</td>
        <td>${escapeHtml(item.folder || "导入的书签")}</td>
        <td>${escapeHtml(item.tags || "—")}</td>
      </tr>`,
    )
    .join("");
  els.preview.innerHTML = head + body;
  els.hint.textContent = `${previewNote()}下载后在浏览器「书签管理器 → 导入书签」里选择该文件即可（Chrome / Edge / Firefox / Safari 通用）。`;
}

function previewNote() {
  const more =
    state.count > PREVIEW_ROWS ? `仅预览前 ${PREVIEW_ROWS} 条，下载的文件含全部 ${state.count} 条。` : "";
  return `${more}表格可左右滑动查看；`;
}

function resetOutput() {
  state.headers = [];
  state.samples = [];
  state.dataRows = [];
  state.map = [];
  state.mapTouched = false;
  state.count = 0;
  state.output = "";
  els.mapPanel.hidden = true;
  els.mapGrid.innerHTML = "";
  els.outPanel.hidden = true;
  els.stat.innerHTML = "";
  els.preview.innerHTML = "";
  els.hint.textContent = "";
}

/* ---------------- 输出类型切换 ---------------- */

function applyMode(mode) {
  state.mode = MODES[mode] ? mode : "vcard";
  const config = currentMode();
  els.mode.value = state.mode;
  els.input.placeholder = config.placeholder;
  els.download.textContent = config.button;
  els.nameSplitWrap.hidden = state.mode !== "vcard";
  try {
    localStorage.setItem(MODE_KEY, state.mode);
  } catch {
    /* 隐私模式忽略 */
  }
  // 字段集变了：重猜映射（用户之前手改的映射对新字段集无意义）
  state.mapTouched = false;
  if (state.headers.length) {
    state.samples = state.headers.map((_, index) => (state.dataRows[0] ? state.dataRows[0][index] : "") || "");
    state.map = els.hasHeader.checked ? guessForMode(state.headers, state.samples) : defaultMap(state.headers.length);
    renderMap();
    rebuild();
  } else {
    resetOutput();
  }
}

els.mode.addEventListener("change", () => applyMode(els.mode.value));

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
  els.input.value = SAMPLES[state.mode] || SAMPLES.vcard;
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

els.download.addEventListener("click", () => {
  if (!state.count) return toast("没有可导出的内容");
  const config = currentMode();
  downloadText(config.file, state.output, config.type);
  toast(`${config.toast} · ${state.count} 条`);
});

document.getElementById("copy").addEventListener("click", () => {
  if (!state.output) return toast("没有可复制的内容");
  copy(state.output, state.mode === "bookmark" ? "书签 HTML 已复制" : "vCard 已复制");
});

/* ---------------- 启动 ---------------- */

let saved = "vcard";
try {
  saved = localStorage.getItem(MODE_KEY) || "vcard";
} catch {
  /* 忽略 */
}
applyMode(saved);
els.input.focus();
