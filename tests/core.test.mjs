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
const J = await import(`${BASE}/codec/core/json.js`);

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
const B = await import(`${BASE}/codec/core/base64.js`);

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
const U = await import(`${BASE}/codec/core/url.js`);

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
const X = await import(`${BASE}/codec/core/radix.js`);

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

/* ---------------- URL 编辑器 ---------------- */
const UE = await import(`${BASE}/url-editor/core.js`);

ok("urlEditor: 解析基本结构", () => {
  const r = UE.parseUrl("https://example.com/a/b?id=1&name=%E4%B8%AD%E6%96%87#top");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.protocol, "https");
  assert.strictEqual(r.state.host, "example.com");
  assert.strictEqual(r.state.port, "");
  assert.strictEqual(r.state.path, "/a/b");
  assert.strictEqual(r.state.hash, "top");
  assert.strictEqual(r.state.params.length, 2);
  assert.strictEqual(r.state.params[1].value, "中文");
  assert.strictEqual(r.state.params[1].enabled, true);
});
ok("urlEditor: 自动补协议", () => {
  const r = UE.parseUrl("example.com/x?y=1");
  assert.strictEqual(r.state.host, "example.com");
  assert.strictEqual(r.hadProtocol, false);
});
ok("urlEditor: 端口与 http", () => {
  const r = UE.parseUrl("http://127.0.0.1:8080/api");
  assert.strictEqual(r.state.protocol, "http");
  assert.strictEqual(r.state.port, "8080");
});
ok("urlEditor: 非法输入", () => {
  assert.strictEqual(UE.parseUrl("").ok, false);
  assert.strictEqual(UE.parseUrl("ht tp://a.com").ok, false);
  assert.strictEqual(UE.parseUrl("ftp://a.com/x").ok, true);
});
ok("urlEditor: 构建往返一致", () => {
  const raw = "https://example.com/a/b?id=1&name=%E4%B8%AD%E6%96%87#top";
  const built = UE.buildUrl(UE.parseUrl(raw).state);
  assert.strictEqual(built, raw);
});
ok("urlEditor: 取消勾选不输出", () => {
  const r = UE.parseUrl("https://a.com/x?a=1&b=2");
  r.state.params[0].enabled = false;
  assert.strictEqual(UE.buildUrl(r.state), "https://a.com/x?b=2");
});
ok("urlEditor: 中文路径自动编码", () => {
  const built = UE.buildUrl({ protocol: "https", host: "a.com", port: "", path: "/中文/文件", hash: "", params: [] });
  assert.strictEqual(built, "https://a.com/%E4%B8%AD%E6%96%87/%E6%96%87%E4%BB%B6");
});
ok("urlEditor: 空值参数保留", () => {
  const built = UE.buildUrl({ protocol: "https", host: "a.com", port: "", path: "/", hash: "", params: [{ key: "flag", value: "", enabled: true }] });
  assert.strictEqual(built, "https://a.com/?flag=");
});
ok("urlEditor: 参数值特殊字符编码", () => {
  const built = UE.buildUrl({ protocol: "https", host: "a.com", port: "", path: "/", hash: "", params: [{ key: "q", value: "a b&c=d/中", enabled: true }] });
  assert.strictEqual(built, "https://a.com/?q=a%20b%26c%3Dd%2F%E4%B8%AD");
});
ok("urlEditor: 缺域名报错", () => assert.throws(() => UE.buildUrl({ host: "" })));
ok("urlEditor: 端口非数字报错", () => assert.throws(() => UE.buildUrl({ host: "a.com", port: "80a" })));
ok("urlEditor: 路径补前导斜杠", () => {
  const built = UE.buildUrl({ protocol: "https", host: "a.com", port: "", path: "api/x", hash: "", params: [] });
  assert.strictEqual(built, "https://a.com/api/x");
});
ok("urlEditor: 路径拆解", () => {
  const s = UE.splitPath("/api/v1/list.json");
  assert.strictEqual(s.dir, "/api/v1/");
  assert.strictEqual(s.last, "list.json");
  assert.strictEqual(s.depth, 3);
  const root = UE.splitPath("/");
  assert.strictEqual(root.dir, "/");
  assert.strictEqual(root.last, "");
});
ok("urlEditor: extractUrl", () => {
  assert.strictEqual(UE.extractUrl("看这个 https://a.com/x?y=1 。"), "https://a.com/x?y=1");
  assert.strictEqual(UE.extractUrl('"https://b.com/z"'), "https://b.com/z");
});

/* ---------------- URL 编辑器：全协议 ---------------- */
ok("urlEditor: mailto 非层级解析", () => {
  const r = UE.parseUrl("mailto:a@b.com?subject=hi%20there&body=%E4%BD%A0%E5%A5%BD");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.protocol, "mailto");
  assert.strictEqual(r.state.hierarchical, false);
  assert.strictEqual(r.state.host, "");
  assert.strictEqual(r.state.path, "a@b.com");
  assert.strictEqual(r.state.params[0].value, "hi there");
  assert.strictEqual(r.state.params[1].value, "你好");
});
ok("urlEditor: tel 非层级", () => {
  const r = UE.parseUrl("tel:13800138000");
  assert.strictEqual(r.state.protocol, "tel");
  assert.strictEqual(r.state.hierarchical, false);
  assert.strictEqual(r.state.path, "13800138000");
  assert.strictEqual(UE.buildUrl(r.state), "tel:13800138000");
});
ok("urlEditor: data URI 往返", () => {
  const raw = "data:text/plain,hello";
  const r = UE.parseUrl(raw);
  assert.strictEqual(r.state.protocol, "data");
  assert.strictEqual(r.state.hierarchical, false);
  assert.strictEqual(UE.buildUrl(r.state), raw);
});
ok("urlEditor: 自定义 scheme 带 //", () => {
  const r = UE.parseUrl("weixin://dl/chat?id=1#top");
  assert.strictEqual(r.state.protocol, "weixin");
  assert.strictEqual(r.state.hierarchical, true);
  assert.strictEqual(r.state.host, "dl");
  assert.strictEqual(r.state.path, "/chat");
  assert.strictEqual(UE.buildUrl(r.state), "weixin://dl/chat?id=1#top");
});
ok("urlEditor: file:/// 空主机", () => {
  const r = UE.parseUrl("file:///etc/passwd");
  assert.strictEqual(r.state.protocol, "file");
  assert.strictEqual(r.state.hierarchical, true);
  assert.strictEqual(r.state.host, "");
  assert.strictEqual(UE.buildUrl(r.state), "file:///etc/passwd");
});
ok("urlEditor: ftp/ssh 层级", () => {
  assert.strictEqual(UE.parseUrl("ftp://ftp.example.com:2121/pub/x").state.port, "2121");
  assert.strictEqual(UE.parseUrl("ssh://git@host/x").state.host, "git@host");
  assert.strictEqual(UE.buildUrl(UE.parseUrl("ssh://git@host/x").state), "ssh://git@host/x");
});
ok("urlEditor: mailto 构建", () => {
  const built = UE.buildUrl({
    protocol: "mailto",
    hierarchical: false,
    host: "",
    port: "",
    path: "a@b.com",
    hash: "",
    params: [{ key: "subject", value: "hi there", enabled: true }],
  });
  assert.strictEqual(built, "mailto:a@b.com?subject=hi%20there");
});
ok("urlEditor: 协议大小写归一", () => {
  const r = UE.parseUrl("HTTPS://Example.COM/A");
  assert.strictEqual(r.state.protocol, "https");
  assert.strictEqual(r.state.host, "example.com");
});
ok("urlEditor: 非法协议报错", () => {
  assert.throws(() => UE.buildUrl({ protocol: "1abc", host: "a.com" }));
  assert.throws(() => UE.buildUrl({ protocol: "ht tp", host: "a.com" }));
  assert.strictEqual(UE.buildUrl({ protocol: "", host: "a.com" }), "https://a.com/");
});
ok("urlEditor: canRequest 只认 http/https", () => {
  assert.strictEqual(UE.canRequest("https"), true);
  assert.strictEqual(UE.canRequest("HTTPS"), true);
  assert.strictEqual(UE.canRequest("http"), true);
  assert.strictEqual(UE.canRequest("mailto"), false);
  assert.strictEqual(UE.canRequest("ftp"), false);
  assert.strictEqual(UE.canRequest("weixin"), false);
});
ok("urlEditor: URL 解码单层", () => {
  const r = UE.decodeUrlText("https%3A%2F%2Fa.com%2Fx%3Fb%3D1");
  assert.strictEqual(r.text, "https://a.com/x?b=1");
  assert.strictEqual(r.rounds, 1);
  assert.strictEqual(r.changed, true);
});
ok("urlEditor: URL 解码多层", () => {
  const r = UE.decodeUrlText("https%253A%252F%252Fa.com%252Fx");
  assert.strictEqual(r.text, "https://a.com/x");
  assert.strictEqual(r.rounds, 2);
});
ok("urlEditor: URL 解码中文", () => {
  const r = UE.decodeUrlText("https://a.com/%E4%B8%AD%E6%96%87?q=%E6%B5%8B%E8%AF%95");
  assert.ok(r.text.includes("中文"));
  assert.ok(r.text.includes("测试"));
});
ok("urlEditor: URL 解码无变化", () => {
  const r = UE.decodeUrlText("https://a.com/plain");
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.text, "https://a.com/plain");
});
ok("urlEditor: extractUrl 支持任意 scheme", () => {
  assert.strictEqual(UE.extractUrl("看 weixin://dl/chat?id=1 。"), "weixin://dl/chat?id=1");
  assert.strictEqual(UE.extractUrl("发我：mailto:a@b.com"), "mailto:a@b.com");
});

/* ---------------- vCard（表格转通讯录） ---------------- */
const V = await import(`${BASE}/vcf/core.js`);

const TSV = "姓名\t手机\t公司\n张三\t138 0013 8000\t示例科技\n李四\t+86 139-0013-9000\t客户单位";

ok("vcf: 检测制表符", () => assert.strictEqual(V.detectDelimiter(TSV), "\t"));
ok("vcf: 检测逗号", () => assert.strictEqual(V.detectDelimiter("a,b,c\n1,2,3"), ","));
ok("vcf: 解析 TSV", () => {
  const rows = V.parseTable(TSV);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], ["姓名", "手机", "公司"]);
  assert.strictEqual(rows[1][1], "138 0013 8000");
});
ok("vcf: 引号包裹与逗号字段", () => {
  const rows = V.parseTable('姓名,备注\n张三,"北京, 朝阳"\n李四,"说""好"""');
  assert.strictEqual(rows[1][1], "北京, 朝阳");
  assert.strictEqual(rows[2][1], '说"好"');
});
ok("vcf: cleanCell 去 BOM 与零宽", () => {
  assert.strictEqual(V.cleanCell("\uFEFF 张三\u200B "), "张三");
});
ok("vcf: 表头识别（中文）", () => {
  const map = V.guessFieldMap(["姓名", "手机号", "公司", "职位", "邮箱", "其它"]);
  assert.deepStrictEqual(map, ["name", "mobile", "org", "title", "email", "ignore"]);
});
ok("vcf: 表头识别（英文与带括号）", () => {
  const map = V.guessFieldMap(["Full Name", "Mobile Phone", "Company"]);
  assert.strictEqual(map[0], "name");
  assert.strictEqual(map[1], "mobile");
  assert.strictEqual(map[2], "org");
  assert.strictEqual(V.guessFieldMap(["联系电话（必填）"])[0], "mobile");
});
ok("vcf: 手机/电话两列分开映射", () => {
  const map = V.guessFieldMap(["姓名", "手机", "电话"]);
  assert.deepStrictEqual(map, ["name", "mobile", "phone"]);
  // 只有「电话」一列时优先当手机
  assert.strictEqual(V.guessFieldMap(["姓名", "电话"])[1], "mobile");
});
ok("vcf: 无姓名列时第 0 列兜底", () => {
  const map = V.guessFieldMap(["称呼", "电话"]);
  assert.strictEqual(map[0], "name");
});
ok("vcf: 手机号清洗", () => {
  assert.strictEqual(V.normalizePhone("138 0013 8000"), "13800138000");
  assert.strictEqual(V.normalizePhone("+86 139-0013-9000"), "+8613900139000");
  assert.strictEqual(V.normalizePhone("１３８００１３８０００"), "13800138000");
  assert.strictEqual(V.normalizePhone("010-12345678 转 802"), "01012345678");
  assert.strictEqual(V.normalizePhone("123"), "");
  assert.strictEqual(V.normalizePhone(""), "");
});
ok("vcf: 生成联系人（跳过无名行 + 去重）", () => {
  const rows = [
    ["张三", "138 0013 8000", "示例科技"],
    ["", "", "孤立公司"],
    ["李四", "+86 139-0013-9000", "客户单位"],
    ["张三重复", "13800138000", "示例科技"],
  ];
  const map = ["name", "mobile", "org"];
  const r = V.buildContacts(rows, map, { dedup: true });
  assert.strictEqual(r.contacts.length, 2);
  assert.strictEqual(r.skipped, 1);
  assert.strictEqual(r.duplicates, 1);
  assert.strictEqual(r.contacts[0].mobile, "13800138000");
});
ok("vcf: 无名但有手机时用号码当姓名", () => {
  const r = V.buildContacts([["", "13900139000"]], ["name", "mobile"], { dedup: false });
  assert.strictEqual(r.contacts[0].name, "13900139000");
});
ok("vcf: 文本转义", () => {
  assert.strictEqual(V.escapeVCardText("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
});
ok("vcf: 折行不切断多字节且不超 75 字节", () => {
  const src = `NOTE:${"中文测试".repeat(20)}`;
  const folded = V.foldLine(src);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1, "应发生折行");
  lines.forEach((line) => {
    const bytes = new TextEncoder().encode(line).length;
    assert.ok(bytes <= 75, `行超长：${bytes}`);
  });
  const restored = lines.map((line, index) => (index === 0 ? line : line.slice(1))).join("");
  assert.strictEqual(restored, src);
});
ok("vcf: 单张名片字段", () => {
  const card = V.buildVCard(
    {
      name: "张三",
      mobile: "13800138000",
      phone: "01012345678",
      org: "示例科技",
      dept: "研发部",
      title: "项目经理",
      email: "z@example.com",
      address: "北京朝阳",
      wechat: "zs_wx",
      remark: "常用",
      url: "https://example.com",
    },
    { nameSplit: true },
  );
  assert.ok(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n"));
  assert.ok(card.includes("FN:张三"));
  assert.ok(card.includes("N:张;三;;;"));
  assert.ok(card.includes("ORG:示例科技;研发部"));
  assert.ok(card.includes("TITLE:项目经理"));
  assert.ok(card.includes("TEL;TYPE=CELL:13800138000"));
  assert.ok(card.includes("TEL;TYPE=VOICE:01012345678"));
  assert.ok(card.includes("EMAIL;TYPE=INTERNET:z@example.com"));
  assert.ok(card.includes("ADR;TYPE=WORK:;;北京朝阳;;;;"));
  assert.ok(card.includes("NOTE:微信：zs_wx；常用"));
  assert.ok(card.endsWith("END:VCARD"));
});
ok("vcf: 不拆分姓名", () => {
  const card = V.buildVCard({ name: "欧阳修" }, { nameSplit: false });
  assert.ok(card.includes("N:欧阳修;;;;"));
});
ok("vcf: 多张名片 CRLF 结尾", () => {
  const text = V.buildVCards([{ name: "张三" }, { name: "李四" }]);
  assert.strictEqual((text.match(/BEGIN:VCARD/g) || []).length, 2);
  assert.ok(text.endsWith("END:VCARD\r\n"));
  assert.ok(!/[^\r]\n/.test(text), "换行必须是 CRLF");
});

/* ---------------- 结果 ---------------- */
console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log("  ✗", f));
  process.exitCode = 1;
} else {
  console.log("全部通过 ✓");
}
