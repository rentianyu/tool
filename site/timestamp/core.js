/**
 * 时间戳转换纯逻辑
 */

const pad = (n, len = 2) => String(n).padStart(len, "0");

export function fmtLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

export function fmtUtc(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 解析输入：纯数字视为时间戳，其余按日期字符串解析 */
export function parseInput(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return { ok: false, error: "输入为空" };

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const num = Number(text);
    // 13 位及以上视为毫秒；10 位视为秒；更短的按「1970 起秒」处理
    const millis = text.replace("-", "").length >= 12 || (num > 1e11 && num < 1e14) ? num : num * 1000;
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) return { ok: false, error: "时间戳超出可表示范围" };
    return { ok: true, date, kind: "timestamp", seconds: Math.floor(millis / 1000) };
  }

  // 兼容 "2026-10-23 13:30:00"（Safari 需要把空格换成 T）
  let date = new Date(text);
  if (Number.isNaN(date.getTime())) date = new Date(text.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return { ok: false, error: "无法识别的日期格式" };
  return { ok: true, date, kind: "date", seconds: Math.floor(date.getTime() / 1000) };
}

export function describe(date) {
  const ms = date.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    millis: ms,
    local: fmtLocal(date),
    utc: fmtUtc(date),
    iso: date.toISOString(),
    weekday: WEEKDAYS[date.getDay()],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: -date.getTimezoneOffset() / 60,
    relative: relativeTime(date),
  };
}

export function relativeTime(date, now = Date.now()) {
  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  const units = [
    [1000, "秒"],
    [60 * 1000, "分钟"],
    [3600 * 1000, "小时"],
    [86400 * 1000, "天"],
    [30 * 86400 * 1000, "个月"],
    [365 * 86400 * 1000, "年"],
  ];
  let idx = 0;
  for (let i = 0; i < units.length; i += 1) {
    if (abs >= units[i][0]) idx = i;
  }
  const [unitMs, label] = units[idx];
  const value = Math.floor(abs / unitMs);
  if (value === 0) return "刚刚";
  return diff > 0 ? `${value} ${label}后` : `${value} ${label}前`;
}
