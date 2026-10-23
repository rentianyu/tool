/**
 * 约定式 API 路由：/api/<slug>/<action>?query
 *
 * 新增一个需要后端的工具：
 *   1. 新建 src/api/<slug>.js，默认导出 { async fetch(req, env, ctx, params) }
 *   2. 在下方 MODULES 里静态注册（Workers 打包器不支持运行时按变量 import）
 *   3. 对应工具的 meta.json 里 "backend": true
 *
 * params = { slug, action, url, query }
 *   action 为 /api/<slug>/ 之后的第一段，可为空字符串；query 为 URLSearchParams。
 */
import { BUILD_TIME, SITE_VERSION, TOOL_COUNT } from "../version.js";

const MODULES = {
  "url-editor": () => import("./url-editor.js"),
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

function fail(message, status = 400, code = "bad_request") {
  return json({ ok: false, error: message, code }, { status });
}

export async function routeApi(request, env, ctx) {
  const url = new URL(request.url);
  const rest = url.pathname.slice(4).split("/").filter(Boolean); // "/api/xxx" -> ["xxx"]

  const slug = rest[0] || "";
  const action = rest[1] || "";

  // 内置健康检查：用于部署后确认线上版本
  if (slug === "health") {
    return json({
      ok: true,
      service: "tool.xbta.cc",
      build: BUILD_TIME,
      tools: TOOL_COUNT,
      colo: request.cf ? request.cf.colo : null,
      now: new Date().toISOString(),
    });
  }

  if (!slug) return fail("缺少工具名，用法：/api/<slug>/<action>", 400, "missing_slug");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return fail("工具名不合法", 400, "invalid_slug");

  const loader = MODULES[slug];
  if (!loader) return fail(`没有名为 "${slug}" 的后端接口`, 404, "not_found");

  let mod;
  try {
    mod = await loader();
  } catch (err) {
    return fail(`接口模块加载失败：${err.message}`, 500, "module_error");
  }

  const handler = mod.default;
  if (!handler || typeof handler.fetch !== "function") {
    return fail(`接口模块 "${slug}" 未导出 fetch`, 500, "bad_module");
  }

  try {
    return await handler.fetch(request, env, ctx, {
      slug,
      action,
      url,
      query: url.searchParams,
    });
  } catch (err) {
    return fail(err && err.message ? err.message : "接口执行异常", 500, "handler_error");
  }
}
