/**
 * JWT 解析与 HMAC 校验（纯浏览器，Web Crypto）
 */

function b64urlToBytes(part) {
  const src = String(part).replace(/-/g, "+").replace(/_/g, "/");
  const pad = src.length % 4;
  const padded = pad ? src + "=".repeat(4 - pad) : src;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function b64urlDecodeText(part) {
  const bytes = b64urlToBytes(part);
  return new TextDecoder("utf-8").decode(bytes);
}

export function normalizeToken(input) {
  return String(input || "")
    .trim()
    .replace(/^authorization\s*:\s*/i, "")
    .replace(/^bearer\s+/i, "")
    .trim();
}

export function decodeJwt(input) {
  const token = normalizeToken(input);
  if (!token) return { ok: false, error: "输入为空" };
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: `JWT 应为三段（header.payload.signature），当前 ${parts.length} 段` };
  }
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlDecodeText(parts[0]));
  } catch {
    return { ok: false, error: "Header 解码失败，可能不是合法 JWT" };
  }
  try {
    payload = JSON.parse(b64urlDecodeText(parts[1]));
  } catch {
    return { ok: false, error: "Payload 解码失败（不是 JSON）" };
  }
  return {
    ok: true,
    token,
    header,
    payload,
    signature: parts[2],
    signingInput: `${parts[0]}.${parts[1]}`,
  };
}

/** 校验 HMAC 签名，返回 { ok, matched } */
export async function verifyHmac(decoded, secret, forcedAlgo) {
  const algo = forcedAlgo || decoded.header.alg || "";
  if (!/^HS(256|384|512)$/.test(algo)) {
    return { ok: false, error: `仅支持 HS256/HS384/HS512，当前为 ${algo || "未知"}` };
  }
  if (!secret) return { ok: false, error: "请填写密钥" };

  // Web Crypto 的 HMAC hash 名是 "SHA-256"，不是 JWT 的 "HS256"
  const hash = algo.replace(/^HS/, "SHA-");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(decoded.signingInput)));

  const expected = b64urlToBytes(decoded.signature);
  if (sig.length !== expected.length) return { ok: true, matched: false };
  let diff = 0;
  for (let i = 0; i < sig.length; i += 1) diff |= sig[i] ^ expected[i];
  return { ok: true, matched: diff === 0 };
}

export function describeClaims(payload, now = Date.now()) {
  const rows = [];
  const exp = payload.exp;
  const iat = payload.iat;
  const nbf = payload.nbf;

  const fmt = (sec) => {
    if (typeof sec !== "number") return "-";
    const d = new Date(sec * 1000);
    return `${d.toISOString()}（本地 ${d.toLocaleString("zh-CN", { hour12: false })}）`;
  };

  if (typeof exp === "number") {
    const left = exp * 1000 - now;
    const status = left > 0 ? "有效" : "已过期";
    const human =
      Math.abs(left) > 86400000
        ? `${Math.floor(Math.abs(left) / 86400000)} 天`
        : Math.abs(left) > 3600000
        ? `${Math.floor(Math.abs(left) / 3600000)} 小时`
        : `${Math.max(0, Math.floor(Math.abs(left) / 60000))} 分钟`;
    rows.push(["exp 过期时间", fmt(exp)]);
    rows.push(["过期状态", left > 0 ? `还有 ${human}（有效）` : `已过期 ${human}`]);
  } else {
    rows.push(["exp 过期时间", "未设置（永不过期）"]);
  }
  if (typeof iat === "number") rows.push(["iat 签发时间", fmt(iat)]);
  if (typeof nbf === "number") {
    const notYet = nbf * 1000 > now;
    rows.push(["nbf 生效时间", `${fmt(nbf)}${notYet ? "（尚未生效）" : ""}`]);
  }
  if (payload.iss) rows.push(["iss 签发者", String(payload.iss)]);
  if (payload.sub) rows.push(["sub 主体", String(payload.sub)]);
  if (payload.aud) rows.push(["aud 受众", Array.isArray(payload.aud) ? payload.aud.join(", ") : String(payload.aud)]);
  if (payload.jti) rows.push(["jti 编号", String(payload.jti)]);
  return rows;
}
