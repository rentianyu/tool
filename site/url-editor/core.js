/**
 * URL 编辑器纯逻辑（可在 Node 中单测）
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

/**
 * 解析 URL 为可编辑结构
 * 返回 { ok, state:{protocol, host, port, path, hash, params:[{key,value,enabled}]}, normalized }
 */
export function parseUrl(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return { ok: false, error: "请输入 URL" };
  if (/\s/.test(raw)) return { ok: false, error: "URL 中不能有空格（空格请用 %20）" };

  const text = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "不是合法的 URL" };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { ok: false, error: `暂不支持 ${url.protocol.replace(":", "")} 协议` };
  }

  const params = [];
  url.searchParams.forEach((value, key) => {
    params.push({ key, value, enabled: true });
  });

  return {
    ok: true,
    state: {
      protocol: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port,
      path: safeDecodePath(url.pathname || "/"),
      hash: safeDecodeComponent(url.hash.replace(/^#/, "")),
      params,
    },
    normalized: url.toString(),
    hadProtocol: text === raw,
  };
}

/** 由编辑态拼出最终 URL；不合法时抛错 */
export function buildUrl(state) {
  const protocol = String((state && state.protocol) || "https").replace(/:$/, "");
  const host = String((state && state.host) || "").trim();
  if (!host) throw new Error("缺少域名");
  if (/\s/.test(host)) throw new Error("域名里不能有空格");

  const port = String((state && state.port) || "").trim();
  if (port && !/^\d{1,5}$/.test(port)) throw new Error("端口必须是数字");

  let path = String((state && state.path) || "/").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;

  const query = ((state && state.params) || [])
    .filter((item) => item.enabled !== false && String(item.key == null ? "" : item.key).trim() !== "")
    .map(
      (item) =>
        `${encodeURIComponent(String(item.key).trim())}=${encodeURIComponent(
          item.value == null ? "" : String(item.value)
        )}`
    )
    .join("&");

  const hash = String((state && state.hash) || "").trim().replace(/^#/, "");

  const url = new URL(`${protocol}://${host}${port ? `:${port}` : ""}/`);
  url.pathname = path; // 自动做百分号编码
  url.search = query ? `?${query}` : "";
  url.hash = hash ? `#${hash}` : "";
  return url.toString();
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

/** 从浏览器地址框整段文本里提取 URL（去掉首尾引号/中文标点） */
export function extractUrl(input) {
  const text = String(input == null ? "" : input).trim();
  const match = /https?:\/\/[^\s"'<>）】]+/i.exec(text);
  return match ? match[0] : text.replace(/^[<"'（【]+|[>"'）】]+$/g, "");
}
