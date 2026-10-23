/**
 * URL 编辑器纯逻辑（可在 Node 中单测）
 *
 * 支持全协议：
 *   - 层级结构：scheme://host[:port]/path?query#hash（http/https/ftp/ssh/file/自定义 scheme…）
 *   - 非层级结构：scheme:opaque?query#hash（mailto:/tel:/sms:/data:/urn:/magnet:…）
 */

/** 解码路径（保留 %2F %3F %23 等结构性保留字符） */
export function safeDecodePath(value) {
  const text = String(value == null ? "" : value);
  try {
    return decodeURI(text);
  } catch {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }
}

/** 解码单个查询参数 / 锚点（把 + 视为空格） */
export function safeDecodeComponent(value) {
  const text = String(value == null ? "" : value);
  try {
    return decodeURIComponent(text.replace(/\+/g, "%20"));
  } catch {
    return text;
  }
}

/** 路径编码：编码中文/空格，但保留 / : @ 等合法字符，并把 ? # 转义掉 */
function encodePath(value) {
  return encodeURI(String(value).replace(/\?/g, "%3F").replace(/#/g, "%23"));
}

/** scheme 是否为常见「有主机」型（用户漏写 // 时也能识别为层级） */
const HOST_SCHEMES = /^(https?|ftps?|wss?|ssh|sftp|git|svn|file|rtsp|rtmp|mms|smtp|imap|pop3|ldaps?|mqtt|redis|mongodb)$/i;

/** scheme 是否为常见「无主机」型 */
const OPAQUE_SCHEMES = /^(mailto|tel|sms|data|urn|magnet|javascript|about|chrome|opera|view-source|blob)$/i;

/**
 * 解析 URL 为可编辑结构
 * 返回 { ok, state:{protocol, hierarchical, host, port, path, hash, params}, normalized, hadProtocol }
 */
export function parseUrl(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return { ok: false, error: "请输入 URL" };
  if (/\s/.test(raw)) return { ok: false, error: "URL 中不能有空格（空格请用 %20）" };

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw);
  const hasSlashes = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
  const text = schemeMatch ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "不是合法的 URL" };
  }

  const protocol = url.protocol.replace(":", "");
  const params = [];
  url.searchParams.forEach((value, key) => {
    params.push({ key, value, enabled: true });
  });

  let hierarchical;
  if (hasSlashes) {
    hierarchical = true;
  } else if (OPAQUE_SCHEMES.test(protocol) && !url.hostname) {
    hierarchical = false;
  } else if (HOST_SCHEMES.test(protocol)) {
    hierarchical = true;
  } else {
    hierarchical = Boolean(url.hostname);
  }

  const path = hierarchical ? safeDecodePath(url.pathname || "/") : safeDecodeComponent(url.pathname || "");
  // 保留 userinfo（如 ssh://git@host、ftp://user:pass@host），随主机一起编辑
  const userinfo = url.username ? `${url.username}${url.password ? `:${url.password}` : ""}@` : "";

  return {
    ok: true,
    state: {
      protocol,
      hierarchical,
      host: `${userinfo}${url.hostname}`,
      port: url.port,
      path: path || (hierarchical ? "/" : ""),
      hash: safeDecodeComponent(url.hash.replace(/^#/, "")),
      params,
    },
    normalized: url.toString(),
    hadProtocol: Boolean(schemeMatch),
  };
}

/** 由编辑态拼出最终 URL；不合法时抛错 */
export function buildUrl(state) {
  const source = state || {};
  const protocol = String(source.protocol || "https")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(protocol)) {
    throw new Error("协议不合法：需以字母开头，如 https / ftp / mailto / weixin");
  }

  const query = (source.params || [])
    .filter((item) => item.enabled !== false && String(item.key == null ? "" : item.key).trim() !== "")
    .map(
      (item) =>
        `${encodeURIComponent(String(item.key).trim())}=${encodeURIComponent(
          item.value == null ? "" : String(item.value)
        )}`
    )
    .join("&");

  const hash = String(source.hash || "").trim().replace(/^#/, "");
  const suffix = `${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;

  const hierarchical = source.hierarchical !== false;
  const path = String(source.path == null ? "" : source.path);

  if (hierarchical) {
    const host = String(source.host || "").trim();
    if (!host && protocol !== "file") throw new Error("缺少域名");
    if (/\s/.test(host)) throw new Error("域名里不能有空格");

    const port = String(source.port || "").trim();
    if (port && !/^\d{1,5}$/.test(port)) throw new Error("端口必须是数字");

    let normalizedPath = path.trim() || "/";
    if (!normalizedPath.startsWith("/")) normalizedPath = `/${normalizedPath}`;

    return `${protocol}://${host}${port ? `:${port}` : ""}${encodePath(normalizedPath)}${suffix}`;
  }

  // 非层级：scheme:opaque（mailto / tel / data / urn …）
  return `${protocol}:${encodePath(path.trim())}${suffix}`;
}

/**
 * URL 解码：把 %xx 还原成可读字符，最多解 3 层
 * 返回 { text, rounds, changed }
 */
export function decodeUrlText(input) {
  let text = String(input == null ? "" : input).trim();
  let rounds = 0;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9a-fA-F]{2}/.test(text)) break;
    let next = null;
    try {
      next = decodeURIComponent(text);
    } catch {
      try {
        next = decodeURI(text);
      } catch {
        break;
      }
    }
    if (next === text) break;
    text = next;
    rounds += 1;
  }
  return { text, rounds, changed: rounds > 0 };
}

/** 路径拆解：目录 / 末段 / 层级 */
export function splitPath(path) {
  const clean = String(path == null ? "" : path).split(/[?#]/)[0] || "/";
  const segments = clean.split("/").filter(Boolean);
  return {
    dir: segments.length > 1 ? `/${segments.slice(0, -1).join("/")}/` : "/",
    last: segments.length ? segments[segments.length - 1] : "",
    segments,
    depth: segments.length,
  };
}

/** 新建一个空参数 */
export function emptyParam() {
  return { key: "", value: "", enabled: true };
}

/** 从整段文本里提取 URL（去掉首尾引号/中文标点），支持任意 scheme */
export function extractUrl(input) {
  const text = String(input == null ? "" : input).trim();
  const slashed = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>）】]+/.exec(text);
  if (slashed) return slashed[0];
  const opaque = /\b(mailto|tel|sms|data|urn|magnet):[^\s"'<>）】]+/i.exec(text);
  if (opaque) return opaque[0];
  return text.replace(/^[<"'（【]+|[>"'）】]+$/g, "");
}

/** 该协议能否直接发起 HTTP 请求（只有 http/https 可以） */
export function canRequest(protocol) {
  return /^https?$/i.test(String(protocol || "").replace(/:$/, ""));
}
