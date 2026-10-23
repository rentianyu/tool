/**
 * /api/url-editor/request  —— URL 编辑器的请求代理
 *
 * 为什么需要服务端：浏览器直连第三方站点会被 CORS 拦住，看不出真实响应。
 * 这里由 Worker 代为请求，只读、限时、限体积，并做 SSRF 防护。
 *
 * 安全约束：
 *   1. 仅 http/https，仅 GET
 *   2. Origin/Referer 必须来自本站（挡跨站滥用）
 *   3. IP 字面量直接判定；域名经 DoH 解析后检查是否命中内网/保留地址
 *      （DoH 不可用时降级放行并标记 dnsChecked=false，因为 Cloudflare Worker
 *       本身无法访问内网地址，这里主要是纵深防御）
 *   4. 手动跟随最多 3 次重定向，每次重新校验
 *   5. 15s 超时，响应体最多 512 KB
 *   6. 返回响应头时剔除 set-cookie
 *   7. 禁止请求本接口自身，避免递归放大
 */

const MAX_BODY = 512 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const DNS_TIMEOUT_MS = 3000;
const DNS_TTL_MS = 60000;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const ok = (data) => new Response(JSON.stringify(data), { headers: HEADERS });
const fail = (error, code = "error", status = 400) =>
  new Response(JSON.stringify({ ok: false, error, code }), { status, headers: HEADERS });

/* ---------------- 同源校验 ---------------- */
function trusted(request) {
  const origin = request.headers.get("Origin") || "";
  const referer = request.headers.get("Referer") || "";
  const allow = (value) =>
    /^https?:\/\/tool\.xbta\.cc(\/|$)/.test(value) ||
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(value);
  return allow(origin) || allow(referer);
}

/* ---------------- IP 判定 ---------------- */
function isIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function isPrivateV4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // 链路本地（含云元数据）
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // 组播 / 保留
  return false;
}

function isPrivateV6(ip) {
  const value = ip.toLowerCase();
  if (value === "::1" || value === "::") return true;
  if (/^f[cd]/.test(value)) return true; // fc00::/7
  if (/^fe[89ab]/.test(value)) return true; // fe80::/10
  if (value.startsWith("::ffff:")) return isPrivateV4(value.slice(7));
  if (value.startsWith("2001:db8")) return true;
  return false;
}

function isPrivateAddress(ip) {
  return ip.includes(":") ? isPrivateV6(ip) : isPrivateV4(ip);
}

/* ---------------- DNS over HTTPS（带超时与缓存） ---------------- */
const DNS_CACHE = new Map();

async function dohQuery(host, type, buildUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(host, type), {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const want = type === "A" ? 1 : 28;
    return (data.Answer || []).filter((a) => a.type === want).map((a) => String(a.data));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function resolveHost(host) {
  const cached = DNS_CACHE.get(host);
  if (cached && Date.now() - cached.t < (cached.ips.length ? DNS_TTL_MS : 30000)) return cached.ips;

  const resolvers = [
    (h, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(h)}&type=${t}`,
    (h, t) => `https://1.1.1.1/dns-query?name=${encodeURIComponent(h)}&type=${t}`,
  ];

  let ips = [];
  for (const build of resolvers) {
    const [a, aaaa] = await Promise.all([dohQuery(host, "A", build), dohQuery(host, "AAAA", build)]);
    ips = a.concat(aaaa);
    if (ips.length) break;
  }
  // 解析失败也缓存一段时间，避免同一域名连续请求反复等待超时
  DNS_CACHE.set(host, { ips, t: Date.now() });
  return ips;
}

/** 返回 { checked: boolean }；命中内网直接抛错 */
async function assertPublicTarget(target) {
  const host = target.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) {
    if (isPrivateAddress(host)) throw new Error(`目标指向内网/保留地址（${host}），已拒绝`);
    return { checked: true };
  }
  if (/^localhost$|\.local$|\.internal$|\.localhost$/i.test(host)) {
    throw new Error("目标指向本机/内网域名，已拒绝");
  }
  const ips = await resolveHost(host);
  if (!ips.length) return { checked: false }; // 解析不可用：交给实际请求报错
  const bad = ips.find((ip) => isPrivateAddress(ip));
  if (bad) throw new Error(`目标解析到内网/保留地址（${host} → ${bad}），已拒绝`);
  return { checked: true };
}

/* ---------------- 响应头清洗 ---------------- */
function cleanHeaders(headers) {
  const out = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie" || lower === "set-cookie2") return;
    out[lower] = value;
  });
  return out;
}

/* ---------------- 读取响应体（限量） ---------------- */
async function readBody(response) {
  if (!response.body) return { text: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY) {
      const over = bytes - MAX_BODY;
      chunks.push(value.subarray(0, Math.max(0, value.byteLength - over)));
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(value);
  }
  const size = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const merged = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  });
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
  } catch {
    text = "";
  }
  return { text, bytes, truncated };
}

/* ---------------- 主流程 ---------------- */
export default {
  async fetch(request) {
    if (!trusted(request)) return fail("仅允许本站页面调用该接口", "forbidden", 403);
    if (request.method !== "GET" && request.method !== "POST") {
      return fail("仅支持 GET/POST", "method_not_allowed", 405);
    }

    let target = new URL(request.url).searchParams.get("url") || "";
    if (request.method === "POST") {
      try {
        const body = await request.json();
        if (body && typeof body.url === "string") target = body.url;
      } catch {
        /* 退回 query 里的 url */
      }
    }
    target = String(target || "").trim();
    if (!target) return fail("缺少 url 参数", "missing_url");
    if (target.length > 4096) return fail("URL 过长", "url_too_long");

    let current;
    try {
      current = new URL(target);
    } catch {
      return fail("不是合法的 URL", "invalid_url");
    }
    if (!/^https?:$/.test(current.protocol)) return fail("仅支持 http/https", "bad_protocol");

    const started = Date.now();
    const redirects = [];
    let dnsChecked = true;
    let response = null;

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (current.hostname === "tool.xbta.cc" && current.pathname.startsWith("/api/url-editor")) {
          return fail("不能通过本接口请求本接口自身", "recursive");
        }
        const check = await assertPublicTarget(current);
        dnsChecked = dnsChecked && check.checked;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        response = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; xbta-url-editor/2.0; +https://tool.xbta.cc/url-editor)",
            accept: "*/*",
          },
        });
        clearTimeout(timer);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) break;
          const next = new URL(location, current);
          if (!/^https?:$/.test(next.protocol)) return fail("重定向到非 http 协议，已拒绝", "bad_redirect");
          redirects.push({ from: current.toString(), to: next.toString(), status: response.status });
          current = next;
          continue;
        }
        break;
      }
    } catch (err) {
      const message =
        err && err.name === "AbortError" ? `请求超时（>${TIMEOUT_MS}ms）` : err.message || "请求失败";
      return fail(message, "fetch_failed", 502);
    }

    const elapsedMs = Date.now() - started;
    const { text, bytes, truncated } = await readBody(response);

    return ok({
      ok: true,
      finalUrl: current.toString(),
      status: response.status,
      statusText: response.statusText,
      elapsedMs,
      bytes,
      truncated,
      dnsChecked,
      contentType: response.headers.get("content-type") || "",
      headers: cleanHeaders(response.headers),
      redirects,
      body: text,
    });
  },
};
