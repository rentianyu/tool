# tool.xbta.cc · 工具箱

一个部署在 Cloudflare 上的工具站：导航页 + 一批互不干扰的小工具，全部在浏览器本地运行（除明确标注 API 的工具）。

- 生产地址：<https://tool.xbta.cc>
- 技术栈：单个 Cloudflare Worker + Static Assets（静态资源绑定），零前端框架、零构建链
- 工具页零依赖、独立 HTML + ES Module，任何一个工具出错都不影响其他工具

## 为什么是 Worker + Static Assets

- 静态资源命中时**不执行 Worker 脚本**，不消耗 Workers 请求额度；
- `html_handling: "drop-trailing-slash"` 让 `/json` 直接 200 返回 `site/json/index.html`，**没有 307 跳转**；
- 需要后端时，同域名下写 `/api/<slug>/<action>` 即可，不用另起服务。

## 目录结构

```
wrangler.jsonc          Worker + assets + route 配置
build.py                扫 meta.json → catalog.json / index.html / version.js
src/
  index.js              入口：/api/* 走脚本，其余交 ASSETS
  api/_router.js        约定式 API 路由（需静态注册模块）
  api/<slug>.js         某个工具的后端（可选）
site/                   ← assets 目录（部署产物 = 源）
  index.html            导航页（由 build.py 生成，勿手改）
  catalog.json          工具清单（生成）
  _headers              安全头与缓存策略
  404.html
  assets/
    app.css             设计系统（暗色默认 + 亮色切换）
    app.js              公共外壳：顶栏/面包屑/搜索/最近使用；导出 toast/copy 等
    lib/dom.js          可选 DOM 小工具
  <slug>/
    index.html          工具页（只写工具本体）
    app.js              UI 逻辑
    core.js             纯逻辑（可在 Node 里单测）
    meta.json           元数据（导航页/搜索/分类数据源）
templates/
  nav.html              导航页模板（含占位符）
  tool/                 新工具模板（复制即用）
```

## 本地开发

```bash
npm install                       # 只装 wrangler（Node 20 + wrangler 4.86.0）
python3 build.py                  # 生成 catalog / index.html / version.js
npx wrangler dev                  # http://127.0.0.1:8787
```

> 沙箱/CI 里不要在慢速挂载盘上 `npm install`，先复制到 `/tmp` 再装。

## 新增一个工具（4 步）

1. `cp -r templates/tool site/<slug>`
2. 改 `site/<slug>/meta.json`
3. 写 `index.html`（只写本体）+ `core.js`（纯逻辑）+ `app.js`（UI）
4. `python3 build.py` → commit & push，GitHub Actions 自动部署

导航页、分类、搜索、面包屑、"最近使用"全部自动派生，**不需要改任何公共文件**。

### meta.json 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✓ | 工具名（中文） |
| `summary` | ✓ | 一句话说明（导航页展示、参与搜索） |
| `category` | ✓ | 分类，内置顺序：编码转换 / 文本处理 / 时间日期 / 加密哈希 / 生成器 / 网络 / 图片 / 开发辅助 |
| `icon` | | 1–2 个字符或 emoji，默认 `•` |
| `order` | | 分类内排序，越小越前，默认 100 |
| `tags` | | 英文关键词（搜索用） |
| `keywords` | | 中文别名/用途词（搜索用） |
| `backend` | | `true` 时必须有 `src/api/<slug>.js` 且在 `_router.js` 注册 |
| `status` | | `stable` / `beta`（beta 显示角标） |
| `since` | | 上线日期 |

### 工具页硬约定（踩过的坑）

1. **页内引用一律用绝对路径**：`/assets/app.css`、`/<slug>/app.js`。
   因为工具页 URL 没有尾斜杠（`/json`），浏览器会把 `./app.js` 解析成 `/app.js`。
2. `<body class="page-tool" data-tool="<slug>">` —— 公共外壳靠它决定是否注入顶栏/面包屑/标题。
3. 工具页**不要自己写顶栏和 `<h1>`**，由 `assets/app.js` 统一注入。
4. 用户输入一律 `textContent` 渲染；需要高亮就切段后拼 DOM，**禁止 `innerHTML` 拼用户内容**。
5. 纯逻辑放 `core.js` 并 `export`，UI 放 `app.js`。这样逻辑可以用 Node 直接单测（见下）。
6. 工具专属样式可写在工具 `index.html` 的 `<style>` 里；能复用的才提到 `assets/app.css`。

### 本地单测该怎么写

`core.js` 不依赖 DOM，可以直接用 Node 跑：

```js
const M = await import('/abs/path/site/json/core.js');
console.assert(M.parseJson('{"a":1}').ok === true);
```

第一次 `node --check` 前记得把 `.js` 复制成 `.mjs`，否则 Node 按 CommonJS 解析会报 import 错误。

## 后端 API（按需）

```
/api/<slug>/<action>   →  src/api/<slug>.js 的 default.fetch(req, env, ctx, { slug, action, url, query })
/api/health            →  内置健康检查，返回 build 时间与工具数
```

新增：

1. 写 `src/api/<slug>.js`：

```js
export default {
  async fetch(request, env, ctx, { action, query }) {
    return Response.json({ ok: true, action, q: query.get('q') });
  },
};
```

2. 在 `src/api/_router.js` 的 `MODULES` 里静态注册（Workers 打包器不支持按变量动态 import）：

```js
const MODULES = { ip: () => import('./ip.js') };
```

3. `meta.json` 里 `"backend": true`（`build.py` 会校验两处一致）。

## 部署

- 域名：`tool.xbta.cc`，DNS 用 `AAAA 100::`（proxied）+ Worker Route `tool.xbta.cc/*`。
  **不用 Workers 自定义域**——自定义域会给该子域单独签发证书并写进 CT 日志。
- 自动部署：push 到 `main` 触发 `.github/workflows/deploy.yml`（`npm ci` → `build.py` → 语法自检 → `wrangler deploy`）。
- 需要的仓库 Secrets：`CLOUDFLARE_API_TOKEN`（Workers Scripts:Edit + Zone:Workers Routes:Edit + Zone:Read）、`CLOUDFLARE_ACCOUNT_ID`。

## 上线自检清单

```bash
curl -sI  https://tool.xbta.cc/            # 200 + 安全头
curl -sI  https://tool.xbta.cc/json        # 200（不是 307）
curl -sI  https://tool.xbta.cc/json/       # 307 → /json
curl -s   https://tool.xbta.cc/api/health  # tools 数量与 build 时间
curl -sI  https://tool.xbta.cc/nope        # 404 + 自定义 404 页
```

## License

MIT
