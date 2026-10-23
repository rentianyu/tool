import { copy, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { binToText, byteLength, convert, hexToText, textToBin, textToHex } from "/radix/core.js";

const $ = (id) => document.getElementById(id);

function baseFrom(selectId, customId) {
  const custom = Number($(customId).value);
  if (custom >= 2 && custom <= 36) return custom;
  return Number($(selectId).value);
}

function doConvert() {
  const out = $("numOut");
  const text = $("numVal").value.trim();
  if (!text) {
    out.textContent = "";
    message($("msg"), "", "ok");
    return;
  }
  try {
    const from = baseFrom("fromBase", "fromBaseCustom");
    const to = baseFrom("toBase", "toBaseCustom");
    const res = convert(text, from, to, { upper: $("upper").checked });
    out.textContent = res.text;
    const len = res.text.length;
    message($("msg"), `${from} 进制 → ${to} 进制 · 十进制 ${res.decimal} · ${len} 位`, "ok");
  } catch (err) {
    out.textContent = "";
    message($("msg"), err.message, "err");
  }
}

["numVal", "fromBase", "toBase", "fromBaseCustom", "toBaseCustom"].forEach((id) => {
  $(id).addEventListener("input", doConvert);
  $(id).addEventListener("change", doConvert);
});
$("upper").addEventListener("change", doConvert);

$("swap").addEventListener("click", () => {
  const from = $("fromBase").value;
  const to = $("toBase").value;
  $("fromBase").value = to;
  $("toBase").value = from;
  if ($("numOut").textContent) $("numVal").value = $("numOut").textContent;
  doConvert();
});

$("copyNum").addEventListener("click", () => {
  if (!$("numOut").textContent) return toast("没有结果");
  copy($("numOut").textContent, "结果已复制");
});

/* 文本区 */
function showText(text) {
  $("textOut").textContent = text;
  message($("msg"), `共 ${byteLength($("text").value)} 字节`, "ok");
}

$("toHex").addEventListener("click", () => {
  if (!$("text").value) return toast("输入为空");
  showText(textToHex($("text").value, { separator: $("sep").checked ? " " : "" }));
});

$("toBin").addEventListener("click", () => {
  if (!$("text").value) return toast("输入为空");
  showText(textToBin($("text").value, { separator: $("sep").checked ? " " : "" }));
});

$("hexToText").addEventListener("click", () => {
  try {
    showText(hexToText($("text").value));
  } catch (err) {
    message($("msg"), err.message, "err");
  }
});

$("binToText").addEventListener("click", () => {
  try {
    showText(binToText($("text").value));
  } catch (err) {
    message($("msg"), err.message, "err");
  }
});

$("copyText").addEventListener("click", () => {
  if (!$("textOut").textContent) return toast("没有结果");
  copy($("textOut").textContent, "结果已复制");
});

$("numVal").value = "255";
doConvert();
$("numVal").focus();
