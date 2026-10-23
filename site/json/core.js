/**
 * JSON 工具纯逻辑（可直接在 Node 中单测）
 */

/** 解析 JSON，失败时尽量给出位置与上下文 */
export function parseJson(text) {
  const src = String(text == null ? "" : text);
  const trimmed = src.trim();
  if (!trimmed) return { ok: false, error: { message: "输入为空" } };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    return { ok: false, error: locate(trimmed, err && err.message ? err.message : "解析失败") };
  }
}

/**
 * 结构扫描兜底定位：V8 新版错误消息可能不含 position/line，
 * 这里自己扫括号配对、字符串闭合与尾随逗号，给出大致位置。
 */
function scanPosition(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      } else if (ch === "\n") {
        return { position: i, hint: "字符串里有未转义的换行" };
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push({ ch, i });
    } else if (ch === "}" || ch === "]") {
      const top = stack.pop();
      if (!top) return { position: i, hint: `多余的 ${ch}` };
      if ((top.ch === "{" && ch !== "}") || (top.ch === "[" && ch !== "]")) {
        return { position: i, hint: `括号不匹配，${top.ch} 需要配 ${top.ch === "{" ? "}" : "]"}` };
      }
    }
  }
  if (inString) return { position: text.length - 1, hint: "字符串没有闭合" };
  if (stack.length) {
    const top = stack[stack.length - 1];
    return { position: top.i, hint: `${top.ch} 没有闭合` };
  }
  const trailing = /,\s*[}\]]/.exec(text);
  if (trailing) return { position: trailing.index, hint: "多余的逗号（尾随逗号）" };
  return null;
}

function locate(text, message) {
  let line = null;
  let column = null;
  let position = null;

  const lc = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
  if (lc) {
    line = Number(lc[1]);
    column = Number(lc[2]);
  }
  const pos = /position\s+(\d+)/i.exec(message);
  if (pos) position = Number(pos[1]);

  let hint = "";
  if (line == null && position == null) {
    const scanned = scanPosition(text);
    if (scanned) {
      position = scanned.position;
      hint = scanned.hint;
    }
  }

  if (line == null && position != null) {
    const before = text.slice(0, position);
    const lines = before.split("\n");
    line = lines.length;
    column = lines[lines.length - 1].length + 1;
  }

  let snippet = "";
  let caret = "";
  if (line != null) {
    const lines = text.split("\n");
    const target = lines[line - 1] || "";
    const shown = target.length > 120 ? target.slice(0, 120) : target;
    snippet = shown;
    caret = " ".repeat(Math.max(0, Math.min((column || 1) - 1, shown.length))) + "^";
  }

  const clean = message.replace(/\s*\(line \d+ column \d+\)/i, "").replace(/\s*in JSON at.*$/i, "");
  return { message: hint ? `${clean}（${hint}）` : clean, line, column, snippet, caret };
}

const INDENTS = { 0: 0, 2: 2, 4: 4, tab: "\t" };

export function stringify(value, indent = 2) {
  const space = INDENTS[indent] === undefined ? 2 : INDENTS[indent];
  return JSON.stringify(value, null, space);
}

/** 递归按 key 排序（数组保持原序） */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .forEach((key) => {
        out[key] = sortKeysDeep(value[key]);
      });
    return out;
  }
  return value;
}

/** 把文本转成 JSON 字符串字面量（含引号） */
export function toJsonLiteral(text) {
  return JSON.stringify(String(text));
}

/**
 * 按路径取值：data.items[0].name / data["key-with-dash"] / [0]
 * 返回 { ok, value } 或 { ok:false, error }
 */
export function getByPath(root, path) {
  const src = String(path == null ? "" : path).trim();
  if (!src) return { ok: false, error: "路径为空" };

  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ".") {
      i += 1;
      continue;
    }
    if (ch === "[") {
      i += 1;
      let quote = null;
      let buf = "";
      while (i < src.length) {
        const c = src[i];
        if (quote) {
          if (c === "\\") {
            buf += src[i + 1] || "";
            i += 2;
            continue;
          }
          if (c === quote) {
            quote = null;
            i += 1;
            continue;
          }
          buf += c;
          i += 1;
          continue;
        }
        if (c === "'" || c === '"') {
          quote = c;
          i += 1;
          continue;
        }
        if (c === "]") {
          i += 1;
          break;
        }
        buf += c;
        i += 1;
      }
      const raw = buf.trim();
      tokens.push(/^-?\d+$/.test(raw) ? Number(raw) : raw);
      continue;
    }
    let buf = "";
    while (i < src.length && src[i] !== "." && src[i] !== "[") {
      buf += src[i];
      i += 1;
    }
    if (buf.trim()) tokens.push(buf.trim());
  }

  let cur = root;
  for (let t = 0; t < tokens.length; t += 1) {
    const key = tokens[t];
    if (cur == null || typeof cur !== "object") {
      return { ok: false, error: `路径在第 ${t + 1} 段「${key}」处中断：上一层不是对象/数组` };
    }
    if (!(key in cur)) {
      return { ok: false, error: `路径不存在：第 ${t + 1} 段「${key}」` };
    }
    cur = cur[key];
  }
  return { ok: true, value: cur };
}

/** 统计字符数、行数、最大嵌套深度 */
export function statsOf(value, text) {
  const chars = String(text || "").length;
  const lines = String(text || "").split("\n").length;
  let depth = 0;
  const walk = (node, level) => {
    if (level > depth) depth = level;
    if (Array.isArray(node)) node.forEach((item) => walk(item, level + 1));
    else if (node && typeof node === "object") {
      Object.values(node).forEach((item) => walk(item, level + 1));
    }
  };
  walk(value, 1);
  return { chars, lines, depth };
}
