/**
 * tool.xbta.cc Worker 入口
 *
 * 路由策略：
 *   /api/*  → Worker 脚本（JSON 接口）
 *   其余    → 静态资源绑定（命中时不执行本脚本，不消耗 Worker 请求额度）
 *            只有静态未命中时才会走到这里，交回 ASSETS 返回 404 页面。
 */
import { routeApi } from "./api/_router.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return routeApi(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
