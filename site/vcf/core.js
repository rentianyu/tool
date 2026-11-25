/**
 * 表格 → vCard 纯逻辑（不依赖 DOM，可在 Node 中直接单测）
 *
 * 流程：文本 → parseTable（TSV/CSV/分号）→ guessFieldMap（表头识别）
 *      → buildContacts（清洗手机号/去重）→ buildVCards（vCard 3.0 + 75 字节折行）
 */

/** 可映射字段（顺序即下拉里的顺序） */
export const FIELDS = [
  {
    key: "name",
    label: "姓名",
    aliases: ["姓名", "名字", "名称", "联系人", "客户姓名", "员工姓名", "name", "fullname", "full name", "contact", "姓名/名称"],
  },
  {
    key: "mobile",
    label: "手机",
    aliases: ["手机", "手机号", "手机号码", "移动电话", "电话", "联系电话", "联系方式", "mobile", "cell", "cellphone", "mobilephone", "phone", "手机1"],
  },
  {
    key: "phone",
    label: "座机/其他电话",
    aliases: ["座机", "固话", "办公电话", "公司电话", "直线", "分机", "tel", "telephone", "phone", "电话", "联系电话", "联系方式", "work phone", "office", "landline"],
  },
  {
    key: "org",
    label: "公司",
    aliases: ["公司", "单位", "公司名称", "企业", "组织", "客户", "org", "company", "organization", "corp"],
  },
  {
    key: "dept",
    label: "部门",
    aliases: ["部门", "科室", "院系", "department", "dept", "division"],
  },
  {
    key: "title",
    label: "职位",
    aliases: ["职位", "职务", "岗位", "头衔", "title", "job", "jobtitle", "job title", "position"],
  },
  {
    key: "email",
    label: "邮箱",
    aliases: ["邮箱", "电子邮箱", "邮件", "电子邮件", "email", "e-mail", "mail"],
  },
  {
    key: "address",
    label: "地址",
    aliases: ["地址", "通讯地址", "住址", "联系地址", "address", "addr", "location"],
  },
  {
    key: "wechat",
    label: "微信",
    aliases: ["微信", "微信号", "wechat", "weixin", "wx"],
  },
  {
    key: "remark",
    label: "备注",
    aliases: ["备注", "说明", "描述", "note", "notes", "remark", "remarks", "memo", "comment"],
  },
  {
    key: "url",
    label: "网址",
    aliases: ["网址", "网站", "主页", "url", "website", "homepage", "web"],
  },
  { key: "ignore", label: "忽略此列", aliases: [] },
];

const FIELD_MAP = new Map(FIELDS.map((f) => [f.key, f]));

export function fieldLabel(key) {
  const f = FIELD_MAP.get(key);
  return f ? f.label : key;
}

/** 去掉单元格首尾空白、BOM、零宽字符 */
export function cleanCell(value) {
  return String(value == null ? "" : value)
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function normHeader(text) {
  return cleanCell(text)
    .toLowerCase()
    .replace(/[\s_\-（）()【】[\]:：*＊/\\]+/g, "");
}

/** 猜分隔符：Excel 粘贴多为制表符，其次是逗号/分号/竖线 */
export function detectDelimiter(text) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, 6);
  if (!lines.length) return "\t";

  let best = "\t";
  let bestScore = 0;
  ["\t", ",", ";", "|"].forEach((delimiter) => {
    const counts = lines.map((line) => line.split(delimiter).length - 1);
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (!total) return;
    const consistent = counts.every((n) => n === counts[0]) ? 0.5 : 0;
    const score = total / lines.length + consistent;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  });
  return best;
}

/**
 * 解析表格文本（支持引号包裹、"" 转义、CRLF）
 * 始终返回二维数组，不做空行过滤（调用方决定）
 */
export function parseTable(text, { delimiter } = {}) {
  const src = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
  const d = delimiter && delimiter.length === 1 ? delimiter : detectDelimiter(src);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      continue;
    }
    if (ch === d) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((cells) => cells.map(cleanCell));
}

/** 根据表头猜每列字段；返回与列数等长的字段 key 数组 */
export function guessFieldMap(headers) {
  const map = headers.map(() => "ignore");
  const used = new Set();

  // 第一轮：表头 == 别名（归一化后精确相等）
  headers.forEach((header, index) => {
    const n = normHeader(header);
    if (!n) return;
    const hit = FIELDS.find(
      (field) => field.key !== "ignore" && !used.has(field.key) && field.aliases.some((alias) => normHeader(alias) === n),
    );
    if (hit) {
      map[index] = hit.key;
      used.add(hit.key);
    }
  });

  // 第二轮：互相包含（长度 ≥2，避免「名」「电」这种单字误配）
  headers.forEach((header, index) => {
    if (map[index] !== "ignore") return;
    const n = normHeader(header);
    if (n.length < 2) return;
    const hit = FIELDS.find((field) => {
      if (field.key === "ignore" || used.has(field.key)) return false;
      return field.aliases.some((alias) => {
        const an = normHeader(alias);
        return an.length >= 2 && (n.includes(an) || an.includes(n));
      });
    });
    if (hit) {
      map[index] = hit.key;
      used.add(hit.key);
    }
  });

  // 兜底：整表没识别出姓名时，把第 0 列当姓名
  if (!map.includes("name") && map.length && map[0] === "ignore") map[0] = "name";
  return map;
}

/** 手机号清洗：全角转半角、去分隔符与分机号、保留国际前缀 + */
export function normalizePhone(raw) {
  let s = String(raw == null ? "" : raw)
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/＋/g, "+")
    .replace(/(?:转|分机|ext\.?)\s*\d+/gi, "");
  const plus = /^\s*\+/.test(s);
  s = s.replace(/[^\d]/g, "");
  if (s.length < 5) return "";
  return (plus ? "+" : "") + s;
}

/**
 * 行数据 → 联系人对象
 * @param {string[][]} dataRows 不含表头的数据行
 * @param {string[]} map 每列字段 key
 */
export function buildContacts(dataRows, map, { dedup = true } = {}) {
  const contacts = [];
  const seen = new Set();
  let skipped = 0;
  let duplicates = 0;

  const pick = (row, key) => {
    const index = map.indexOf(key);
    return index >= 0 ? cleanCell(row[index]) : "";
  };

  dataRows.forEach((row) => {
    if (!row.some((cell) => cell)) return;
    const contact = {
      name: pick(row, "name"),
      mobile: normalizePhone(pick(row, "mobile")),
      phone: normalizePhone(pick(row, "phone")),
      org: pick(row, "org"),
      dept: pick(row, "dept"),
      title: pick(row, "title"),
      email: pick(row, "email"),
      address: pick(row, "address"),
      wechat: pick(row, "wechat"),
      remark: pick(row, "remark"),
      url: pick(row, "url"),
    };
    contact.name = contact.name || contact.mobile || contact.email;
    if (!contact.name) {
      skipped += 1;
      return;
    }
    if (dedup) {
      const key = (contact.mobile || contact.phone || contact.email || contact.name).toLowerCase();
      if (seen.has(key)) {
        duplicates += 1;
        return;
      }
      seen.add(key);
    }
    contacts.push(contact);
  });

  return { contacts, skipped, duplicates };
}

/** vCard 文本转义：\ ; , 与换行 */
export function escapeVCardText(text) {
  return String(text == null ? "" : text)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function byteLength(ch) {
  const code = ch.codePointAt(0);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/** 按 75 字节折行（续行以空格开头），不会切断多字节字符 */
export function foldLine(line, limit = 75) {
  const src = String(line == null ? "" : line);
  if (!src) return "";
  const out = [];
  let current = "";
  let bytes = 0;
  let capacity = limit;
  for (const ch of src) {
    const size = byteLength(ch);
    if (bytes + size > capacity && current) {
      out.push(current);
      current = "";
      bytes = 0;
      capacity = limit - 1; // 续行开头的空格占 1 字节
    }
    current += ch;
    bytes += size;
  }
  if (current) out.push(current);
  return out.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join("\r\n");
}

/** 单个联系人 → vCard 3.0 文本 */
export function buildVCard(contact, { nameSplit = true } = {}) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  const name = cleanCell(contact.name);
  lines.push(`FN:${escapeVCardText(name)}`);

  if (nameSplit && Array.from(name).length >= 2) {
    const chars = Array.from(name);
    lines.push(`N:${escapeVCardText(chars[0])};${escapeVCardText(chars.slice(1).join(""))};;;`);
  } else {
    lines.push(`N:${escapeVCardText(name)};;;;`);
  }

  if (contact.org || contact.dept) {
    lines.push(`ORG:${escapeVCardText(contact.org)};${escapeVCardText(contact.dept)}`);
  }
  if (contact.title) lines.push(`TITLE:${escapeVCardText(contact.title)}`);
  if (contact.mobile) lines.push(`TEL;TYPE=CELL:${contact.mobile}`);
  if (contact.phone) lines.push(`TEL;TYPE=VOICE:${contact.phone}`);
  if (contact.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardText(contact.email)}`);
  if (contact.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCardText(contact.address)};;;;`);
  if (contact.url) lines.push(`URL:${escapeVCardText(contact.url)}`);

  const note = [contact.wechat ? `微信：${contact.wechat}` : "", contact.remark].filter(Boolean).join("；");
  if (note) lines.push(`NOTE:${escapeVCardText(note)}`);

  lines.push("END:VCARD");
  return lines.map((line) => foldLine(line)).join("\r\n");
}

/** 多个联系人 → 完整 .vcf 文本（CRLF 结尾） */
export function buildVCards(contacts, options = {}) {
  return contacts.map((contact) => `${buildVCard(contact, options)}\r\n`).join("");
}
