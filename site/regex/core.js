/**
 * 正则测试纯逻辑
 * 注意：全量匹配时强制带 g，零宽匹配手动前移，避免死循环。
 */

export function buildRegex(pattern, flags) {
  const f = Array.from(new Set(String(flags || "").split(""))).join("");
  return new RegExp(pattern, f.includes("g") || f.includes("y") ? f : `${f}g`);
}

export function findAll(pattern, flags, text) {
  if (!pattern) return { ok: true, matches: [], regex: null };
  let regex;
  try {
    regex = buildRegex(pattern, flags);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const src = String(text == null ? "" : text);
  const matches = [];
  let guard = 0;
  let m;
  while ((m = regex.exec(src)) !== null) {
    guard += 1;
    if (guard > 10000) {
      return { ok: false, error: "匹配次数超过 10000，疑似零宽匹配，请收窄正则" };
    }
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      match: m[0],
      groups: m.slice(1),
      named: m.groups || null,
    });
    if (m[0] === "") regex.lastIndex += 1;
  }
  return { ok: true, matches, regex };
}

/** 切成 [{text, hit}] 段，供高亮渲染（调用方用 textContent 拼 DOM） */
export function splitByMatches(text, matches) {
  const src = String(text == null ? "" : text);
  const segments = [];
  let cursor = 0;
  matches.forEach((m) => {
    if (m.index > cursor) segments.push({ text: src.slice(cursor, m.index), hit: false });
    segments.push({ text: m.match, hit: true });
    cursor = m.end;
  });
  if (cursor < src.length) segments.push({ text: src.slice(cursor), hit: false });
  return segments;
}

export function replaceAll(pattern, flags, text, replacement) {
  const res = findAll(pattern, flags, text);
  if (!res.ok) return { ok: false, error: res.error, replaced: "", count: 0 };
  try {
    const out = String(text == null ? "" : text).replace(buildRegex(pattern, flags), replacement);
    return { ok: true, replaced: out, count: res.matches.length };
  } catch (err) {
    return { ok: false, error: err.message, replaced: "", count: 0 };
  }
}

/** 常用正则速查 */
export const CHEATSHEET = [
  ["邮箱", "[\\w.+-]+@[\\w-]+\\.[\\w.]+"],
  ["手机号（中国）", "1[3-9]\\d{9}"],
  ["IPv4", "((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)"],
  ["URL", "https?://[\\w.-]+(?::\\d+)?(?:/[\\w./?%&=#-]*)?"],
  ["中文", "[\\u4e00-\\u9fa5]+"],
  ["日期 YYYY-MM-DD", "\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])"],
];
