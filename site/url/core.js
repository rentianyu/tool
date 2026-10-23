/**
 * URL 编解码纯逻辑
 */

export function looksEncoded(text) {
  return /%[0-9A-Fa-f]{2}/.test(String(text));
}

export function encodeComponent(text) {
  return encodeURIComponent(String(text));
}

export function decodeComponent(text) {
  try {
    return decodeURIComponent(String(text));
  } catch {
    // 兼容被 + 号当空格的场景与畸形 %xx
    throw new Error("不是合法的百分号编码（可能存在不完整的 %xx）");
  }
}

export function encodeUri(text) {
  return encodeURI(String(text));
}

export function decodeUri(text) {
  try {
    return decodeURI(String(text));
  } catch {
    throw new Error("不是合法的百分号编码");
  }
}

/** 解析 URL 各部分，失败返回 { ok:false, error } */
export function analyze(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, error: "输入为空" };
  let url;
  try {
    url = new URL(text);
  } catch {
    try {
      url = new URL(`http://${text}`);
    } catch {
      return { ok: false, error: "不是合法的 URL" };
    }
  }
  const params = [];
  url.searchParams.forEach((value, key) => {
    params.push({ key, value });
  });
  return {
    ok: true,
    parts: {
      protocol: url.protocol.replace(/:$/, ""),
      host: url.hostname,
      port: url.port || "(默认)",
      path: url.pathname,
      query: url.search.replace(/^\?/, ""),
      hash: url.hash.replace(/^#/, ""),
      origin: url.origin,
    },
    params,
  };
}
