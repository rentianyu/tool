/**
 * 编码转换 · 进制面板
 * 逻辑搬自原 /radix 工具，DOM 用 r- 前缀 id 隔离
 */
import { copy, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { binToText, byteLength, convert, hexToText, textToBin, textToHex } from "/codec/core/radix.js";

const html = `
<div class="panel">
  <div class="panel-head">
    <span class="panel-title">数值进制转换（支持大整数）</span>
    <span class="row">
      <button class="btn btn-sm" id="r-swap" type="button">交换进制 ⇄</button>
      <button class="btn btn-sm" id="r-copyNum" type="button">复制结果</button>
    </span>
  </div>
  <div class="grid-2">
    <div>
      <label class="lbl" for="r-numVal">输入数值</label>
      <input type="text" id="r-numVal" placeholder="如 255 或 ff 或 11111111">
      <div class="row" style="margin-top:8px">
        <span class="mut small">源进制</span>
        <select id="r-fromBase" style="width:auto">
          <option value="2">2</option><option value="8">8</option>
          <option value="10" selected>10</option><option value="16">16</option>
          <option value="32">32</option><option value="36">36</option>
        </select>
        <input type="number" id="r-fromBaseCustom" min="2" max="36" placeholder="自定义" style="width:96px">
      </div>
    </div>
    <div>
      <label class="lbl" for="r-numOut">转换结果</label>
      <pre class="out" id="r-numOut" style="min-height:38px"></pre>
      <div class="row" style="margin-top:8px">
        <span class="mut small">目标进制</span>
        <select id="r-toBase" style="width:auto">
          <option value="2">2</option><option value="8">8</option>
          <option value="10">10</option><option value="16" selected>16</option>
          <option value="32">32</option><option value="36">36</option>
        </select>
        <input type="number" id="r-toBaseCustom" min="2" max="36" placeholder="自定义" style="width:96px">
        <label class="row small mut"><input type="checkbox" id="r-upper"> 大写</label>
      </div>
    </div>
  </div>
  <div class="msg" id="r-msg" style="margin-top:8px"></div>
</div>

<div class="panel">
  <div class="panel-head">
    <span class="panel-title">文本 ↔ 十六进制 / 二进制（UTF-8）</span>
    <span class="row">
      <label class="row small mut"><input type="checkbox" id="r-sep" checked> 字节间加空格</label>
      <button class="btn btn-sm" id="r-copyText" type="button">复制结果</button>
    </span>
  </div>
  <div class="grid-2">
    <div>
      <label class="lbl" for="r-text">文本</label>
      <textarea id="r-text" class="mono-sm" spellcheck="false" placeholder="输入文本（或粘贴 hex 后点右侧解码）"></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn btn-primary" id="r-toHex" type="button">→ HEX</button>
        <button class="btn" id="r-toBin" type="button">→ BIN</button>
        <button class="btn" id="r-hexToText" type="button">HEX → 文本</button>
        <button class="btn" id="r-binToText" type="button">BIN → 文本</button>
      </div>
    </div>
    <div>
      <label class="lbl" for="r-textOut">结果</label>
      <pre class="out" id="r-textOut" style="min-height:150px"></pre>
    </div>
  </div>
</div>`;

function init(root) {
  const $ = (id) => root.querySelector(`#${id}`);

  function baseFrom(selectId, customId) {
    const custom = Number($(customId).value);
    if (custom >= 2 && custom <= 36) return custom;
    return Number($(selectId).value);
  }

  function doConvert() {
    const out = $("r-numOut");
    const text = $("r-numVal").value.trim();
    if (!text) {
      out.textContent = "";
      message($("r-msg"), "", "ok");
      return;
    }
    try {
      const from = baseFrom("r-fromBase", "r-fromBaseCustom");
      const to = baseFrom("r-toBase", "r-toBaseCustom");
      const res = convert(text, from, to, { upper: $("r-upper").checked });
      out.textContent = res.text;
      message($("r-msg"), `${from} 进制 → ${to} 进制 · 十进制 ${res.decimal} · ${res.text.length} 位`, "ok");
    } catch (err) {
      out.textContent = "";
      message($("r-msg"), err.message, "err");
    }
  }

  ["r-numVal", "r-fromBase", "r-toBase", "r-fromBaseCustom", "r-toBaseCustom"].forEach((id) => {
    $(id).addEventListener("input", doConvert);
    $(id).addEventListener("change", doConvert);
  });
  $("r-upper").addEventListener("change", doConvert);

  $("r-swap").addEventListener("click", () => {
    const from = $("r-fromBase").value;
    const to = $("r-toBase").value;
    $("r-fromBase").value = to;
    $("r-toBase").value = from;
    if ($("r-numOut").textContent) $("r-numVal").value = $("r-numOut").textContent;
    doConvert();
  });

  $("r-copyNum").addEventListener("click", () => {
    if (!$("r-numOut").textContent) return toast("没有结果");
    copy($("r-numOut").textContent, "结果已复制");
  });

  /* 文本区 */
  function showText(text) {
    $("r-textOut").textContent = text;
    message($("r-msg"), `共 ${byteLength($("r-text").value)} 字节`, "ok");
  }

  $("r-toHex").addEventListener("click", () => {
    if (!$("r-text").value) return toast("输入为空");
    showText(textToHex($("r-text").value, { separator: $("r-sep").checked ? " " : "" }));
  });

  $("r-toBin").addEventListener("click", () => {
    if (!$("r-text").value) return toast("输入为空");
    showText(textToBin($("r-text").value, { separator: $("r-sep").checked ? " " : "" }));
  });

  $("r-hexToText").addEventListener("click", () => {
    try {
      showText(hexToText($("r-text").value));
    } catch (err) {
      message($("r-msg"), err.message, "err");
    }
  });

  $("r-binToText").addEventListener("click", () => {
    try {
      showText(binToText($("r-text").value));
    } catch (err) {
      message($("r-msg"), err.message, "err");
    }
  });

  $("r-copyText").addEventListener("click", () => {
    if (!$("r-textOut").textContent) return toast("没有结果");
    copy($("r-textOut").textContent, "已复制");
  });

  $("r-numVal").value = "255";
  doConvert();
}

export default { key: "radix", label: "进制转换", html, init };
