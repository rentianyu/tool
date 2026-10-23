/**
 * 随机生成纯逻辑（crypto.getRandomValues，无模偏差）
 */

export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digit: "0123456789",
  alnum: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  hex: "0123456789abcdef",
  base58: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  symbol: "!@#$%^&*()-_=+[]{};:,.?/",
};

const AMBIGUOUS = new Set("0O1lI|`'\";:,.{}[]()/\\".split(""));

function randomInt(maxExclusive) {
  if (maxExclusive <= 0) throw new Error("取值范围必须大于 0");
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

/** UUID v4（优先原生实现） */
export function uuidV4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomString(length, charset) {
  const pool = String(charset || "");
  if (!pool.length) throw new Error("字符集为空");
  let out = "";
  for (let i = 0; i < length; i += 1) out += pool[randomInt(pool.length)];
  return out;
}

export function password({ length = 16, upper = true, lower = true, digit = true, symbol = true, noAmbiguous = true }) {
  const clean = (pool) => (noAmbiguous ? Array.from(pool).filter((ch) => !AMBIGUOUS.has(ch)).join("") : pool);
  const pools = [];
  if (lower) pools.push(clean(CHARSETS.lower));
  if (upper) pools.push(clean(CHARSETS.upper));
  if (digit) pools.push(clean(CHARSETS.digit));
  if (symbol) pools.push(clean(CHARSETS.symbol));
  const active = pools.filter((p) => p.length);
  if (!active.length) throw new Error("至少选择一种字符类型");
  if (length < 4) throw new Error("长度至少 4");

  const all = active.join("");
  const chars = [];
  // 每类先取一个，保证类型覆盖；再补足到目标长度
  active.forEach((pool) => {
    if (chars.length < length) chars.push(pool[randomInt(pool.length)]);
  });
  while (chars.length < length) chars.push(all[randomInt(all.length)]);

  // 洗牌（Fisher-Yates）
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, length).join("");
}

/** 闭区间 [min, max] 随机整数 */
export function randomIntBetween(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error("范围不合法");
  return lo + randomInt(hi - lo + 1);
}

export function passwordStrength(length, kinds) {
  const poolSize = [26, 26, 10, 32].slice(0, kinds).reduce((a, b) => a + b, 0) || 1;
  const bits = Math.log2(poolSize) * length;
  if (bits < 40) return { level: "弱", bits };
  if (bits < 64) return { level: "中", bits };
  if (bits < 100) return { level: "强", bits };
  return { level: "很强", bits };
}
