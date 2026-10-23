import assert from "node:assert";
import { createHmac } from "node:crypto";

const BASE = new URL("../site", import.meta.url).href.replace(/\/$/, "");
let pass = 0;
const fails = [];

function ok(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    fails.push(`${name}: ${err.message}`);
  }
}
async function okAsync(name, fn) {
  try {
    await fn();
    pass += 1;
  } catch (err) {
    fails.push(`${name}: ${err.message}`);
  }
}

/* ---------------- JSON ---------------- */
const J = await import(`${BASE}/json/core.js`);

ok("json: 解析合法", () => assert.strictEqual(J.parseJson('{"a":1}').ok, true));
ok("json: 空输入报错", () => assert.strictEqual(J.parseJson("  ").ok, false));
ok("json: 错误有行列", () => {
  const r = J.parseJson('{\n  "a": 1,\n  "b": }\n}');
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.line >= 1, "应给出行号");
  assert.ok(typeof r.error.message === "string" && r.error.message.length > 0);
});
ok("json: 缩进 2", () => assert.strictEqual(J.stringify({ a: 1 }, 2), '{\n  "a": 1\n}'));
ok("json: 紧凑", () => assert.strictEqual(J.stringify({ a: 1, b: [2] }, 0), '{"a":1,"b":[2]}'));
ok("json: 键排序递归", () => {
  const out = J.sortKeysDeep({ b: 1, a: { d: 2, c: 3 } });
  assert.deepStrictEqual(Object.keys(out), ["a", "b"]);
  assert.deepStrictEqual(Object.keys(out.a), ["c", "d"]);
});
ok("json: 路径 a.b[0].c", () => {
  const v = { a: { b: [{ c: 42 }] } };
  assert.strictEqual(J.getByPath(v, "a.b[0].c").value, 42);
});
ok("json: 路径带引号键", () => {
  const v = { "x-y": { z: "ok" } };
  assert.strictEqual(J.getByPath(v, '["x-y"].z').value, "ok");
});
ok("json: 路径不存在", () => assert.strictEqual(J.getByPath({ a: 1 }, "a.b").ok, false));
ok("json: 转义字面量", () => assert.strictEqual(J.toJsonLiteral('a"b'), '"a\\"b"'));
ok("json: 统计深度", () => {
  const s = J.statsOf({ a: { b: { c: 1 } } }, "{}");
  assert.strictEqual(s.depth, 4);
});

/* ---------------- Base64 ---------------- */
const B = await import(`${BASE}/base64/core.js`);

ok("base64: 往返中文", () => {
  const enc = B.encodeText("凯哥 tool 站");
  assert.strictEqual(B.decodeText(enc), "凯哥 tool 站");
});
ok("base64: 已知值", () => assert.strictEqual(B.encodeText("abc"), "YWJj"));
ok("base64: URL-safe 无 padding", () => {
  const enc = B.encodeText("????>>>>>", { urlSafe: true });
  assert.ok(!/[+/=]/.test(enc), `不应含 +/=：${enc}`);
  assert.strictEqual(B.decodeText(enc), "????>>>>>");
});
ok("base64: 缺 padding 可解", () => assert.strictEqual(B.decodeText("YWJj"), "abc"));
ok("base64: 非法字符报错", () => assert.throws(() => B.decodeText("!!!!")));
ok("base64: 识别判断", () => {
  assert.strictEqual(B.isProbablyBase64("YWJjZA=="), true);
  assert.strictEqual(B.isProbablyBase64("你好"), false);
});
ok("base64: 文件 mime 猜测", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);
  assert.strictEqual(B.guessMimeFromBytes(png), "image/png");
});

/* ---------------- URL ---------------- */
const U = await import(`${BASE}/url/core.js`);

ok("url: encode component", () => assert.strictEqual(U.encodeComponent("a b/c"), "a%20b%2Fc"));
ok("url: decode component", () => assert.strictEqual(U.decodeComponent("a%20b%2Fc"), "a b/c"));
ok("url: 畸形编码报错", () => assert.throws(() => U.decodeComponent("%E4%ZZ")));
ok("url: 结构解析", () => {
  const r = U.analyze("https://tool.xbta.cc/json?a=1&b=%E4%B8%AD#top");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.parts.host, "tool.xbta.cc");
  assert.strictEqual(r.parts.port, "(默认)");
  assert.strictEqual(r.params.length, 2);
  assert.strictEqual(r.params[1].value, "中");
});
ok("url: 无协议自动补", () => assert.strictEqual(U.analyze("example.com/x").parts.host, "example.com"));
ok("url: 非法 URL", () => assert.strictEqual(U.analyze("").ok, false));

/* ---------------- Timestamp ---------------- */
const T = await import(`${BASE}/timestamp/core.js`);

ok("ts: 秒解析", () => {
  const r = T.parseInput("1700000000");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.date.getTime(), 1700000000000);
});
ok("ts: 毫秒解析", () => {
  const r = T.parseInput("1700000000123");
  assert.strictEqual(r.date.getTime(), 1700000000123);
});
ok("ts: 日期解析", () => {
  const r = T.parseInput("2026-10-23 13:30:00");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.date.getFullYear(), 2026);
});
ok("ts: 非法输入", () => assert.strictEqual(T.parseInput("not-a-date").ok, false));
ok("ts: describe 字段", () => {
  const d = T.describe(new Date(1700000000000));
  assert.strictEqual(d.seconds, 1700000000);
  assert.strictEqual(d.iso, "2023-11-14T22:13:20.000Z");
  assert.ok(d.local.includes("2023"));
});
ok("ts: 相对时间", () => {
  const now = Date.now();
  assert.ok(T.relativeTime(new Date(now + 3600_000), now).includes("后"));
  assert.ok(T.relativeTime(new Date(now - 86400_000), now).includes("前"));
});

/* ---------------- Hash ---------------- */
const H = await import(`${BASE}/hash/core.js`);

ok("hash: md5(abc)", () => assert.strictEqual(H.md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72"));
ok("hash: md5(空串)", () => assert.strictEqual(H.md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e"));
ok("hash: md5 中文", () => assert.strictEqual(H.md5Hex("中文"), "a7bac2239fcdcb3a067903d8077c4a07"));
await okAsync("hash: sha256(abc)", async () => {
  const r = await H.hashAll(new TextEncoder().encode("abc"));
  const sha256 = r.find((x) => x.algo === "SHA-256");
  assert.strictEqual(sha256.hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.strictEqual(r.length, 5, "应有 5 种算法");
});
await okAsync("hash: sha1/sha512 存在", async () => {
  const r = await H.hashAll(new TextEncoder().encode("abc"));
  assert.strictEqual(r.find((x) => x.algo === "SHA-1").hex, "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.ok(r.find((x) => x.algo === "SHA-512").hex.length === 128);
});

/* ---------------- Random ---------------- */
const R = await import(`${BASE}/random/core.js`);

ok("random: uuid 格式", () => {
  const id = R.uuidV4();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
ok("random: uuid 唯一", () => {
  const set = new Set(Array.from({ length: 500 }, () => R.uuidV4()));
  assert.strictEqual(set.size, 500);
});
ok("random: 字符串长度与字符集", () => {
  const s = R.randomString(32, R.CHARSETS.hex);
  assert.strictEqual(s.length, 32);
  assert.match(s, /^[0-9a-f]{32}$/);
});
ok("random: 密码含各类且长度正确", () => {
  const p = R.password({ length: 20, upper: true, lower: true, digit: true, symbol: true, noAmbiguous: true });
  assert.strictEqual(p.length, 20);
  assert.match(p, /[A-Z]/);
  assert.match(p, /[a-z]/);
  assert.match(p, /[2-9]/);
  assert.match(p, /[^A-Za-z0-9]/);
  assert.ok(!/[0O1lI|]/.test(p), `不应含易混字符：${p}`);
});
ok("random: 密码至少 4 位", () => assert.throws(() => R.password({ length: 2 })));
ok("random: 整数范围", () => {
  for (let i = 0; i < 300; i += 1) {
    const n = R.randomIntBetween(3, 7);
    assert.ok(n >= 3 && n <= 7, `越界 ${n}`);
  }
});

/* ---------------- Radix ---------------- */
const X = await import(`${BASE}/radix/core.js`);

ok("radix: 10→16", () => assert.strictEqual(X.convert("255", 10, 16).text, "ff"));
ok("radix: 16→10", () => assert.strictEqual(X.convert("ff", 16, 10).text, "255"));
ok("radix: 2→10", () => assert.strictEqual(X.convert("11111111", 2, 10).text, "255"));
ok("radix: 大整数", () => assert.strictEqual(X.convert("123456789012345678901234567890", 10, 16).text, "18ee90ff6c373e0ee4e3f0ad2"));
ok("radix: 非法字符", () => assert.throws(() => X.convert("2", 2, 10)));
ok("radix: 负数", () => assert.strictEqual(X.convert("-255", 10, 16).text, "-ff"));
ok("radix: 文本→hex", () => assert.strictEqual(X.textToHex("中", { separator: "" }), "e4b8ad"));
ok("radix: hex→文本", () => assert.strictEqual(X.hexToText("e4 b8 ad"), "中"));
ok("radix: bin 往返", () => assert.strictEqual(X.binToText(X.textToBin("A")), "A"));
ok("radix: 字节长度", () => assert.strictEqual(X.byteLength("中"), 3));

/* ---------------- JWT ---------------- */
const W = await import(`${BASE}/jwt/core.js`);

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64url(JSON.stringify({ sub: "abc", name: "凯哥", iat: 1700000000, exp: 1900000000 }));
const signingInput = `${header}.${payload}`;
const sig = b64url(createHmac("sha256", "secret").update(signingInput).digest());
const goodToken = `${signingInput}.${sig}`;

ok("jwt: 解码", () => {
  const r = W.decodeJwt(goodToken);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.header.alg, "HS256");
  assert.strictEqual(r.payload.name, "凯哥");
  assert.strictEqual(r.payload.exp, 1900000000);
});
ok("jwt: 去 Bearer 前缀", () => {
  const r = W.decodeJwt(`Bearer ${goodToken}`);
  assert.strictEqual(r.ok, true);
});
ok("jwt: 段数错误", () => assert.strictEqual(W.decodeJwt("a.b").ok, false));
ok("jwt: 非 JSON payload", () => assert.strictEqual(W.decodeJwt("e30.@@@@.sig").ok, false));
await okAsync("jwt: 签名匹配", async () => {
  const r = W.decodeJwt(goodToken);
  const v = await W.verifyHmac(r, "secret", "");
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.matched, true);
});
await okAsync("jwt: 签名不匹配", async () => {
  const r = W.decodeJwt(goodToken);
  const v = await W.verifyHmac(r, "wrong", "");
  assert.strictEqual(v.matched, false);
});
ok("jwt: 过期状态", () => {
  const rows = W.describeClaims({ exp: Math.floor(Date.now() / 1000) - 60 });
  assert.ok(rows.some(([k, v]) => k === "过期状态" && v.includes("已过期")));
});

/* ---------------- Regex ---------------- */
const G = await import(`${BASE}/regex/core.js`);

ok("regex: 全量匹配", () => {
  const r = G.findAll("(\\w+)@(\\w+)\\.com", "g", "a@b.com c@d.com");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.matches.length, 2);
  assert.strictEqual(r.matches[0].groups[0], "a");
});
ok("regex: 零宽不死循环", () => {
  const r = G.findAll("a*", "g", "aaa");
  assert.strictEqual(r.ok, true);
  assert.ok(r.matches.length >= 1 && r.matches.length < 100);
});
ok("regex: 非法正则", () => assert.strictEqual(G.findAll("(", "g", "x").ok, false));
ok("regex: 高亮分段", () => {
  const r = G.findAll("b", "g", "abcb");
  const segs = G.splitByMatches("abcb", r.matches);
  assert.strictEqual(segs.map((s) => s.text).join(""), "abcb");
  assert.strictEqual(segs.filter((s) => s.hit).length, 2);
});
ok("regex: 替换", () => {
  const r = G.replaceAll("(\\d+)", "g", "a1b22", "[$1]");
  assert.strictEqual(r.replaced, "a[1]b[22]");
  assert.strictEqual(r.count, 2);
});

/* ---------------- Diff ---------------- */
const D = await import(`${BASE}/diff/core.js`);

ok("diff: 完全相同", () => {
  const r = D.diffLines("a\nb\n", "a\nb\n");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.stats.add, 0);
  assert.strictEqual(r.stats.del, 0);
  assert.strictEqual(r.stats.same, 2);
});
ok("diff: 新增行", () => {
  const r = D.diffLines("a\nb", "a\nx\nb");
  assert.strictEqual(r.stats.add, 1);
  assert.strictEqual(r.stats.del, 0);
});
ok("diff: 删除行", () => {
  const r = D.diffLines("a\nx\nb", "a\nb");
  assert.strictEqual(r.stats.del, 1);
});
ok("diff: 修改行", () => {
  const r = D.diffLines("a\nold\nc", "a\nnew\nc");
  assert.strictEqual(r.stats.del, 1);
  assert.strictEqual(r.stats.add, 1);
  assert.strictEqual(r.stats.same, 2);
});
ok("diff: 行号正确", () => {
  const r = D.diffLines("a\nb", "a\nb\nc");
  const last = r.rows[r.rows.length - 1];
  assert.strictEqual(last.type, "add");
  assert.strictEqual(last.bLine, 3);
  assert.strictEqual(last.aLine, null);
});
ok("diff: 统一格式", () => {
  const r = D.diffLines("a\nb", "a\nc");
  assert.ok(D.toUnified(r.rows).includes("-b"));
});
ok("diff: 大输入保护", () => {
  const big = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}-line-${i}`).join("\n");
  const r = D.diffLines(big(2100, "a"), big(2100, "b"));
  assert.strictEqual(r.ok, false);
});

/* ---------------- 结果 ---------------- */
console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log("  ✗", f));
  process.exitCode = 1;
} else {
  console.log("全部通过 ✓");
}
