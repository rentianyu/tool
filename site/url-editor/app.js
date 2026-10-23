import { copy, escapeHtml, toast } from "/assets/app.js";
import { fmtBytes, message } from "/assets/lib/dom.js";
import { buildUrl, emptyParam, extractUrl, parseUrl, splitPath } from "/url-editor/core.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "tool.urlEditor.state";

let state = { protocol: "https", host: "", port: "", path: "/", hash: "", params: [] };
let currentUrl = "";

/* ---------------- 表单 <-> 状态 ---------------- */
function fillForm() {
  $("protocol").value = state.protocol === "http" ? "http" : "https";
  $("host").value = state.host;
  $("port").value = state.port;
  $("path").value = state.path;
  $("hash").value = state.hash;
}

function readForm() {
  state.protocol = $("protocol").value;
  state.host = $("host").value.trim();
  state.port = $("port").value.trim();
  state.path = $("path").value;
  state.hash = $("hash").value;
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* 忽略 */
    }
  }, 400);
}

/* ---------------- 参数表 ---------------- */
function renderParams() {
  $("paramBody").innerHTML = state.params
    .map(
      (item, index) => `<tr data-idx="${index}" class="${item.enabled === false ? "disabled" : ""}">
        <td><input type="checkbox" class="p-en" ${item.enabled === false ? "" : "checked"}></td>
        <td><input type="text" class="p-key mono" value="${escapeHtml(item.key)}" placeholder="参数名"></td>
        <td><input type="text" class="p-val mono" value="${escapeHtml(item.value)}" placeholder="参数值"></td>
        <td><button class="btn btn-sm btn-ghost p-del" type="button">删除</button></td>
      </tr>`
    )
    .join("");
  $("paramEmpty").hidden = state.params.length > 0;
  const enabled = state.params.filter((item) => item.enabled !== false).length;
  $("paramCount").textContent = state.params.length ? `（${enabled}/${state.params.length} 启用）` : "";
}

$("paramBody").addEventListener("input", (event) => {
  const row = event.target.closest("tr");
  if (!row) return;
  const item = state.params[Number(row.dataset.idx)];
  if (!item) return;
  if (event.target.classList.contains("p-key")) item.key = event.target.value;
  else if (event.target.classList.contains("p-val")) item.value = event.target.value;
  update();
});

$("paramBody").addEventListener("change", (event) => {
  if (!event.target.classList.contains("p-en")) return;
  const row = event.target.closest("tr");
  const item = state.params[Number(row.dataset.idx)];
  if (!item) return;
  item.enabled = event.target.checked;
  row.classList.toggle("disabled", !event.target.checked);
  renderParams();
  update();
});

$("paramBody").addEventListener("click", (event) => {
  const btn = event.target.closest(".p-del");
  if (!btn) return;
  const row = btn.closest("tr");
  state.params.splice(Number(row.dataset.idx), 1);
  renderParams();
  update();
});

$("addParam").addEventListener("click", () => {
  state.params.push(emptyParam());
  renderParams();
  update();
  const rows = $("paramBody").querySelectorAll("tr");
  const last = rows[rows.length - 1];
  const input = last && last.querySelector(".p-key");
  if (input) input.focus();
});

/* ---------------- 生成结果 ---------------- */
function update() {
  readForm();
  const info = splitPath(state.path);
  $("pathInfo").textContent = state.host
    ? `目录 ${info.dir} · 末段 ${info.last || "（无）"} · 层级 ${info.depth}`
    : "";
  try {
    currentUrl = buildUrl(state);
    $("result").textContent = currentUrl;
    $("send").disabled = false;
    message($("msg"), "", "ok");
    persist();
  } catch (err) {
    currentUrl = "";
    $("result").textContent = "";
    $("send").disabled = true;
    message($("msg"), err.message, "err");
  }
}

/* ---------------- 解析 ---------------- */
function doParse() {
  const res = parseUrl(extractUrl($("raw").value));
  if (!res.ok) {
    message($("msg"), res.error, "err");
    return;
  }
  state = res.state;
  $("parseHint").textContent = res.hadProtocol ? "" : "已自动补全 https://";
  fillForm();
  renderParams();
  update();
  message($("msg"), `解析成功 · ${state.params.length} 个参数`, "ok");
}

$("parse").addEventListener("click", doParse);
$("raw").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    doParse();
  }
});

$("clear").addEventListener("click", () => {
  $("raw").value = "";
  state = { protocol: "https", host: "", port: "", path: "/", hash: "", params: [] };
  fillForm();
  renderParams();
  $("result").textContent = "";
  $("respPanel").hidden = true;
  $("parseHint").textContent = "";
  message($("msg"), "", "ok");
  localStorage.removeItem(STORE_KEY);
  $("raw").focus();
});

["protocol", "host", "port", "path", "hash"].forEach((id) => {
  $(id).addEventListener("input", update);
  $(id).addEventListener("change", update);
});

/* ---------------- 操作按钮 ---------------- */
$("copyLink").addEventListener("click", () => {
  if (!currentUrl) return toast("还没有生成链接");
  copy(currentUrl, "链接已复制");
});

$("openLink").addEventListener("click", () => {
  if (!currentUrl) return toast("还没有生成链接");
  window.open(currentUrl, "_blank", "noopener,noreferrer");
});

/* ---------------- 请求 ---------------- */
const BINARY_RE = /^(image|audio|video|font)\/|application\/(octet-stream|zip|pdf|gzip|x-tar|x-7z|vnd\.)/;

function renderResponse(data) {
  const panel = $("respPanel");
  panel.hidden = false;

  const status = $("respStatus");
  status.textContent = `${data.status} ${data.statusText || ""}`.trim();
  status.className = `chip ${data.status < 400 ? "ok" : "err"}`;

  $("respTime").textContent = `${data.elapsedMs} ms`;
  $("respSize").textContent = `${fmtBytes(data.bytes)}${data.truncated ? " · 已截断" : ""}`;

  const meta = [`实际地址：${data.finalUrl}`];
  if (data.contentType) meta.push(`类型：${data.contentType}`);
  if (data.redirects && data.redirects.length) {
    meta.push(`重定向 ${data.redirects.length} 次：${data.redirects.map((r) => r.status).join(" → ")}`);
  }
  $("respMeta").textContent = meta.join(" · ");

  const headers = data.headers || {};
  $("hdrCount").textContent = Object.keys(headers).length;
  $("respHeaders").textContent = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const contentType = (data.contentType || "").toLowerCase();
  let body = data.body || "";
  let kind = "";

  if (BINARY_RE.test(contentType)) {
    body = `（二进制内容 ${fmtBytes(data.bytes)}，不在页面展示；可点「新标签打开」直接查看）`;
  } else if (contentType.includes("json") || /^[\s]*[[{]/.test(body)) {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2);
      kind = "JSON";
    } catch {
      /* 不是 JSON，原样展示 */
    }
  }

  if (body.length > 200000) body = `${body.slice(0, 200000)}\n\n…（内容过长，已截断显示）`;

  $("respBody").textContent = body || "（响应体为空）";
  const kindChip = $("respKind");
  kindChip.hidden = !kind;
  kindChip.textContent = kind;
  kindChip.className = "chip json";
}

$("send").addEventListener("click", async () => {
  if (!currentUrl) return toast("还没有生成链接");
  const btn = $("send");
  btn.disabled = true;
  btn.textContent = "请求中…";
  message($("msg"), "正在经服务器代理请求…", "warn");

  try {
    const res = await fetch("/api/url-editor/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });
    const data = await res.json();
    if (!data.ok) {
      $("respPanel").hidden = false;
      const status = $("respStatus");
      status.className = "chip err";
      status.textContent = "请求失败";
      $("respTime").textContent = "—";
      $("respSize").textContent = "—";
      $("respMeta").textContent = "";
      $("respHeaders").textContent = "";
      $("hdrCount").textContent = "0";
      $("respBody").textContent = data.error || "请求失败";
      $("respKind").hidden = true;
      message($("msg"), data.error || "请求失败", "err");
      return;
    }
    renderResponse(data);
    message($("msg"), `请求完成（${data.elapsedMs} ms）`, "ok");
  } catch (err) {
    message($("msg"), `调用接口失败：${err.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "请求";
  }
});

/* ---------------- 初始化 ---------------- */
(function init() {
  const fromQuery = new URLSearchParams(location.search).get("url");
  if (fromQuery) {
    $("raw").value = fromQuery;
    doParse();
    return;
  }
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    saved = null;
  }
  if (saved && saved.host) {
    state = saved;
    $("raw").value = buildUrl(saved);
    fillForm();
    renderParams();
    update();
    return;
  }
  // 首次进入给一个同源示例，点「请求」就能看到效果
  $("raw").value = "https://tool.xbta.cc/api/health?demo=1";
  doParse();
})();
