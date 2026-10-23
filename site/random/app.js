import { copy, toast } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { CHARSETS, password, passwordStrength, randomIntBetween, randomString, uuidV4 } from "/random/core.js";

const $ = (id) => document.getElementById(id);

function fill(el, lines) {
  el.textContent = lines.join("\n");
}

function count(id, def = 5, max = 200) {
  const n = Number($(id).value) || def;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

$("uuidBtn").addEventListener("click", () => {
  const n = count("uuidCount");
  fill($("uuidOut"), Array.from({ length: n }, () => uuidV4()));
});
$("uuidCopy").addEventListener("click", () => copy($("uuidOut").textContent, "已复制"));

$("charset").addEventListener("change", () => {
  $("custom").hidden = $("charset").value !== "custom";
});

$("strBtn").addEventListener("click", () => {
  try {
    const mode = $("charset").value;
    const pool = mode === "custom" ? $("custom").value : CHARSETS[mode];
    if (!pool) throw new Error("请填写自定义字符集");
    const len = Math.min(Math.max(1, Number($("len").value) || 16), 512);
    const n = count("strCount");
    fill($("strOut"), Array.from({ length: n }, () => randomString(len, pool)));
  } catch (err) {
    message($("pOut"), err.message, "err");
    toast(err.message);
  }
});
$("strCopy").addEventListener("click", () => copy($("strOut").textContent, "已复制"));

$("pBtn").addEventListener("click", () => {
  try {
    const opts = {
      length: Math.min(Math.max(4, Number($("pLen").value) || 16), 128),
      upper: $("pUpper").checked,
      lower: $("pLower").checked,
      digit: $("pDigit").checked,
      symbol: $("pSymbol").checked,
      noAmbiguous: $("pNoAmb").checked,
    };
    const pwd = password(opts);
    const kinds = [opts.lower, opts.upper, opts.digit, opts.symbol].filter(Boolean).length;
    const strength = passwordStrength(pwd.length, kinds);
    $("pOut").textContent = `${pwd}\n\n强度：${strength.level}（约 ${strength.bits.toFixed(0)} bit 熵）`;
  } catch (err) {
    $("pOut").textContent = "";
    toast(err.message);
  }
});
$("pCopy").addEventListener("click", () => {
  const text = ($("pOut").textContent || "").split("\n")[0];
  copy(text, "密码已复制");
});

$("rBtn").addEventListener("click", () => {
  try {
    const min = Number($("rMin").value);
    const max = Number($("rMax").value);
    const n = count("rCount", 10);
    fill($("rOut"), Array.from({ length: n }, () => randomIntBetween(min, max)));
  } catch (err) {
    toast(err.message);
  }
});
$("rCopy").addEventListener("click", () => copy($("rOut").textContent, "已复制"));

// 首屏各生成一批
$("uuidBtn").click();
$("strBtn").click();
$("pBtn").click();
$("rBtn").click();
