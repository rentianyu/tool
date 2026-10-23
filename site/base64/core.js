/**
 * Base64 纯逻辑（Node 可测）
 */

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const B64URL_RE = /^[A-Za-z0-9\-_]*={0,2}$/;

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 文本 → Base64（UTF-8 安全） */
export function encodeText(text, { urlSafe = false } = {}) {
  const bytes = new TextEncoder().encode(String(text));
  let b64 = bytesToBase64(bytes);
  if (urlSafe) b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

function normalizeBase64(text) {
  let src = String(text).trim().replace(/\s+/g, "");
  src = src.replace(/-/g, "+").replace(/_/g, "/");
  const pad = src.length % 4;
  if (pad === 1) throw new Error("Base64 长度不合法（余 1 位）");
  if (pad) src += "=".repeat(4 - pad);
  return src;
}

/** Base64 → 文本（自动兼容 URL-safe / 缺 padding）；解码失败抛错 */
export function decodeText(text) {
  const src = String(text).trim();
  if (!src) throw new Error("输入为空");
  const looksBase64 = B64_RE.test(src.replace(/\s+/g, "")) || B64URL_RE.test(src.replace(/\s+/g, ""));
  if (!looksBase64) throw new Error("不是合法的 Base64 字符集");
  const bytes = base64ToBytes(normalizeBase64(src));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("解码后的字节不是合法 UTF-8 文本（可能是二进制文件，用「结果另存」下载）");
  }
}

/** Base64 → 字节（供文件下载） */
export function decodeBytes(text) {
  return base64ToBytes(normalizeBase64(text));
}

export function isProbablyBase64(text) {
  const src = String(text).trim().replace(/\s+/g, "");
  if (src.length < 4 || src.length % 4 === 1) return false;
  return B64_RE.test(src) || B64URL_RE.test(src);
}

/** 猜测 data URL 的 MIME */
export function guessMimeFromBytes(bytes) {
  const b = bytes;
  if (b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 2 && b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length > 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
  if (b.length > 3 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return "application/octet-stream";
}
