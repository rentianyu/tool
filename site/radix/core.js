/**
 * 进制转换纯逻辑（BigInt，支持任意长度整数）
 */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 任意进制字符串 → BigInt */
export function parseBigInt(text, base) {
  const src = String(text).trim().toLowerCase().replace(/^[+-]?0[xbo]/, (m) => (m.length > 1 ? m[0] : ""));
  if (!src) throw new Error("输入为空");
  const negative = src.startsWith("-");
  const body = (negative ? src.slice(1) : src).replace(/[\s_,]/g, "");
  if (!body) throw new Error("输入为空");
  let value = 0n;
  const b = BigInt(base);
  if (b < 2n || b > 36n) throw new Error("进制必须在 2–36 之间");
  for (const ch of body) {
    const digit = DIGITS.indexOf(ch);
    if (digit < 0 || digit >= base) throw new Error(`字符「${ch}」不属于 ${base} 进制`);
    value = value * b + BigInt(digit);
  }
  return negative ? -value : value;
}

/** BigInt → 任意进制字符串 */
export function toBase(value, base, { upper = false } = {}) {
  if (base < 2 || base > 36) throw new Error("进制必须在 2–36 之间");
  const negative = value < 0n;
  let v = negative ? -value : value;
  const b = BigInt(base);
  if (v === 0n) return "0";
  let out = "";
  while (v > 0n) {
    out = DIGITS[Number(v % b)] + out;
    v /= b;
  }
  const result = negative ? `-${out}` : out;
  return upper ? result.toUpperCase() : result;
}

export function convert(text, fromBase, toBaseNum, options = {}) {
  const value = parseBigInt(text, fromBase);
  return {
    value,
    text: toBase(value, toBaseNum, options),
    decimal: value.toString(10),
  };
}

/* ---------------- 文本 ↔ 字节 ---------------- */
export function textToHex(text, { separator = " ", upper = false } = {}) {
  const bytes = new TextEncoder().encode(String(text));
  const parts = Array.from(bytes, (b) => {
    const hex = b.toString(16).padStart(2, "0");
    return upper ? hex.toUpperCase() : hex;
  });
  return parts.join(separator);
}

export function hexToText(hex) {
  const clean = String(hex).replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean.length) throw new Error("没有可解析的十六进制内容");
  if (clean.length % 2) throw new Error("十六进制长度需为偶数");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function textToBin(text, { separator = " " } = {}) {
  const bytes = new TextEncoder().encode(String(text));
  return Array.from(bytes, (b) => b.toString(2).padStart(8, "0")).join(separator);
}

export function binToText(bin) {
  const clean = String(bin).replace(/[^01]/g, "");
  if (!clean.length) throw new Error("没有可解析的二进制内容");
  if (clean.length % 8) throw new Error("二进制位数需为 8 的倍数");
  const bytes = new Uint8Array(clean.length / 8);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 8, i * 8 + 8), 2);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function byteLength(text) {
  return new TextEncoder().encode(String(text)).length;
}
