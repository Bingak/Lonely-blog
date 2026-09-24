---
title: 自动添加友链
published: 2026-09-24T21:20:00+08:00
pinned: false
description: 友链页加了个「申请友链」按钮：访客填四项 + Cloudflare Turnstile 人机验证，Worker 直接调 GitHub Contents API 开一个 PR，站长点合并就上线。附 Workers Builds 读不到 .env 导致按钮整块消失的踩坑记录。
image: "https://img.lonelybing.top/file/post/ScreenShot_2026-09-24_210353_601.png"
tags:
  - 博客
  - 前端
  - 更新日志
  - 记录
category: 博客搭建
slug: friend-link-auto-apply-2026-09-24
series: "博客"
---

## 起因

以前加友链的流程是这样的：访客在评论区留言 → 本尊手动往 `src/config/friendsConfig.ts` 里粘一段对象 → 提交 → 等构建。四步里三步是本尊干的（恼）

本尊寻思想自动化，最省事的方案是存数据库或者写文件到 KV——但那样友链数据就脱离仓库了，本尊想要的是**访客提交 → 直接变成一条可审的 PR**，这样我只需要点一下按钮就行了()。

于是最终形状定成这样：

```
访客填表 → Cloudflare Turnstile 人机验证
        → Worker 的 POST /api/friend-apply
        → 调 GitHub Contents API：新建分支 + 改 JSON + 开 PR
        → 站长点 Merge → Workers Builds 自动重新部署
```

关键点是**审核这一步就是 git 合并本身**，不用另做一套后台喵~

![友链页的申请按钮与表单弹窗](https://img.lonelybing.top/file/post/ScreenShot_2026-09-24_210353_601.png)

---

## 一、先把友链数据搬出 TS

服务端要能读写这份数据，所以不能继续以 TypeScript 数组的形式存在——`friendsConfig.ts` 里手写一坨对象，机器改起来要么正则（怕坏），要么 AST（太重）。换成纯 JSON 就干净多了：整份文件重新序列化一遍，diff 也永远只动这一个文件。

新文件 `src/data/friends.json`：

```json
[
	{
		"title": "夏夜流萤",
		"imgurl": "https://weavatar.com/avatar/d252655d...",
		"desc": "飞萤之火自无梦的长夜亮起，绽放在终竟的明天。",
		"siteurl": "https://blog.cuteleaf.cn",
		"tags": ["Blog"],
		"weight": 10,
		"enabled": true
	}
]
```

`friendsConfig.ts` 那字面量替换成三行：

```typescript
import friendsData from "../data/friends.json";

// 友链数据存放在 src/data/friends.json，友链申请 Function 会以 PR 形式追加条目
export const friendsConfig: FriendLink[] = friendsData;
```

排序逻辑（`getEnabledFriends`）没修改，构建时 Astro 直接把 JSON 吃进去喵~

---

## 二、表单弹窗：用原生 `<dialog>`

点击顶部按钮弹一个浮层，包含四个必填项：网站名称 / 网站链接 / 头像链接 / 网站描述。

本来打算写一套遮罩 + Esc 关闭 + 焦点管理的，后来想到 `<dialog>` 原生就有这些行为，`showModal()` 一行搞定，于是全删了（）：

```astro
<dialog id="friend-apply-dialog" data-sitekey={friendApplyConfig.turnstileSiteKey} class="card-base m-auto max-h-[85vh] w-[min(92vw,26rem)] overflow-y-auto rounded-(--radius-large) p-6">
```

配点背景修饰一下完事：

```css
#friend-apply-dialog {
  border: none;
}
#friend-apply-dialog::backdrop {
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(2px);
}
```

### 坑 1：弹窗跑到左上角

上线第一版弹窗贴在页面左上角（悲）。原因是 `<dialog>` 默认靠 `margin: auto` 居中，而 Tailwind 的 preflight 把全局 margin 重置成 0，居中机制当场失效。补一个 `m-auto` 就回去了喵~

### 坑 2：`form.title` 不是输入框

读值时想当然写了 `form.title.value`——`title` 是 `HTMLElement` 上的全局属性，`form.title` 返回的是表单的 title 字符串，不是那个名为 `title` 的输入框（）。改成老老实实按 id 取喵~

```js
const payload = {
  title: document.getElementById("fa-title").value.trim(),
  siteurl: document.getElementById("fa-siteurl").value.trim(),
  imgurl: document.getElementById("fa-imgurl").value.trim(),
  desc: document.getElementById("fa-desc").value.trim(),
  "cf-turnstile-response": turnstileToken,
};
```

### 坑 3：swup 会重跑内联脚本

本站开了 swup 页面过渡，切回友链页时 `<script is:inline>` 会被重新执行一遍，事件监听器会越叠越多，点一次提交发三次请求（笑）。用一个 `dataset` 标记挡住二次绑定：

```js
const dialog = document.getElementById("friend-apply-dialog");
if (!dialog || dialog.dataset.bound) return;
dialog.dataset.bound = "1";
```

---

## 三、Turnstile 只在打开时才加载

Cloudflare 的人机验证脚本要几百毫秒才能拉下来，而且没人点按钮的时候没必要提前塞进首页喵~ 所以走**显式渲染（explicit render）**：页面不带 `<script>`，第一次点「申请友链」才动态插：

```js
script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileOnload&render=explicit";
document.head.appendChild(script);
```

`onload` 回调里再 `turnstile.render()` 到那个空 div 上，token 存进变量，提交前先检查：

```js
widgetId = window.turnstile.render(turnstileBox, {
  sitekey: siteKey,
  theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
  callback: (token) => { turnstileToken = token; },
  "expired-callback": () => { turnstileToken = ""; },
});
```

因为脚本是异步插的，渲染时机不固定，所以拿一个 `window.__turnstileQueue` 兜住「widget 已经打开但脚本还没到」这个窗口期。提交失败时记得 `turnstile.reset()`——一次性 token 用掉就作废了，不重置的话访客改完内容再点会一直 403 喵~

前端只做「有没有验证过」的软判断，**硬的校验全在 Worker**，不然绕开 JS 直接 curl 就打进来了喵~

---

## 四、Worker 端：一个路由 + 五步 GitHub API

本站是部署在 Cloudflare **Workers**，所以逻辑直接加在已有的 `worker/index.js` 上，`handleFriends` 旁边多一条路由：

```js
if (url.pathname === "/api/friend-apply") {
  if (request.method !== "POST")
    return jsonResponse({ error: "仅支持 POST" }, 405, { Allow: "POST" });
  return handleFriendApply(request, env);
}
```

### 先验人，再验内容

```js
const remoteIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for");
if (!(await verifyTurnstile(secret, turnstileToken, remoteIp))) {
  return jsonResponse({ ok: false, message: "人机验证未通过，请重试" }, 403);
}
```

`siteverify` 就 POST 到 `https://challenges.cloudflare.com/turnstile/v0/siteverify`，带 `secret` / `response` / `remoteip`。

内容校验里有两个小讲究：

**URL 不能乱填。** 友链是要渲染 `<img>` 和 `<a>` 的，顺手挡掉内网与非 http(s) 协议，免得变成 SSRF 跳板或者 `javascript:` 链接：

```js
function parsePublicUrl(raw) {
	if (typeof raw !== "string") return null;
	let url;
	try { url = new URL(raw.trim()); } catch { return null; }
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	const host = url.hostname.toLowerCase();
	if (host === "localhost" || host.endsWith(".local") || !host.includes(".")) return null;
	url.hash = "";
	return url;
}
```

**去重按键要归一化。** 有人填 `https://x.com`，有人填 `https://X.com/`，字符串比较会漏。所以抽一个去重键，忽略大小写、末尾斜杠和 hash：

```js
function siteKeyOf(url) {
	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
}
```

命中已有条目直接 409「该站点已在友链列表中，无需重复申请」喵~

### 开 PR 的四连调用

GitHub 写文件不像想象中一个请求就够——Contents API 的 `PUT` 必须带当前文件的 `sha`，而本尊又不想让机器人直接推 `main`（那样合并前没人能拦，也丢了审计记录）。所以完整链路是：

```js
// 1) 读当前 friends.json，拿 content + sha
await ghJson(token, `/repos/${repo}/contents/${FRIEND_DATA_PATH}?ref=${base}`);
// 2) 读 main 的 HEAD sha
await ghJson(token, `/repos/${repo}/git/ref/heads/${base}`);
// 3) 用这个 sha 建分支 friend-apply/<时间戳>
await ghJson(token, `/repos/${repo}/git/refs`, { method: "POST", body: ... });
// 4) 在新分支上 PUT 文件（带 sha）
await ghJson(token, `/repos/${repo}/contents/${FRIEND_DATA_PATH}`, { method: "PUT", body: ... });
// 5) 开 PR
await ghJson(token, `/repos/${repo}/pulls`, { method: "POST", body: ... });
```

新条目的权重固定给 `0`，让它排在友链末尾——毕竟还没被本尊看过（乐）。PR 描述里把四个字段和提交时间列出来，扫一眼就能判断要不要合并：

```js
friends.push({ title, imgurl: imgUrl.href, desc, siteurl: siteUrl.href, weight: 0, enabled: true });
```

GitHub 返回的 `html_url` 一路带回前端，成功后直接给访客一个「查看 PR」链接，比干巴巴一句「提交成功」可信多了喵~

任何一步失败都会把上游的 `message` 冒泡出来（502），本尊调试时靠这个才第一次跑通——因为一开始 PAT 只给了 Contents 权限，建 PR 那步一直 403（悲）。

---

## 五、密钥与两种"环境变量"

这套东西要三个凭据，**而且全都是运行时的**，用 `wrangler secret put` 或控制台 Variables 配：

| 名称 | 位置 | 说明 |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | Worker 密钥 | 服务端校验用，绝不能进前端 |
| `FRIEND_APPLY_GITHUB_TOKEN` | Worker 密钥 | fine-grained PAT，只授权本仓库的 `Contents: RW` + `Pull requests: RW` |
| `PUBLIC_TURNSTILE_SITE_KEY` | 构建环境变量 | 前端渲染 widget 用，公开值 |

### 就是这最后一条把本尊坑了

`PUBLIC_*` 是**构建时内联**进产物的，跟 Worker 运行时变量完全是两回事。而本站 `.env` 在 `.gitignore` 里，所以 Workers Builds 在云端跑 `pnpm build` 时根本读不到它，站点密钥取到空字符串，于是这个判断直接假了：

```typescript
const showApply = friendApplyConfig.enable && !!friendApplyConfig.turnstileSiteKey;
```

结果就是**按钮连弹窗一起从页面上消失**，而 MDX 里新写的说明文字照常部署上去了——看着像"上一秒还有下一秒就没了"（恼）

最开始的线上那份能显示，是因为那次推的是本地构建的产物。

修法很直白：Turnstile 的 site key 本身就是公开值，最终一定要出现在 HTML 里让人拿去用，那没什么好藏的，直接写死兜底，环境变量存在时仍然优先：

```typescript
turnstileSiteKey: import.meta.env?.PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFCFMk3cJMZKa-Q3",
```

顺便一提这里的 `?.` 不是多余的：`scripts/` 下有构建脚本会经 `src/config/index.ts` 导入这份配置，那会儿跑在纯 Node 里，`import.meta.env` 是 `undefined`，写成 `.PUBLIC_...` 会直接把 `pnpm build` 顶崩喵~

---

## 六、涉及的文件

| 文件 | 改动 |
| --- | --- |
| `src/data/friends.json` | 新增，友链数据从 TS 搬过来 |
| `src/config/friendsConfig.ts` | 字面量数组 → `import` JSON |
| `src/config/friendApplyConfig.ts` | 新增，开关 + 站点密钥 + 仓库/分支/数据路径 |
| `src/pages/friends.astro` | 申请按钮 + `<dialog>` 表单 + Turnstile 懒加载与提交脚本 |
| `worker/index.js` | `POST /api/friend-apply` 全套：验人、验内容、建分支、开 PR |
| `src/content/spec/friends.mdx` | 申请流程说明改为「点顶部按钮填表」 |

---

## 说明与反馈

- 目前只做了中文文案，表单里的字段名是写死的，暂时没进 i18n 词条喵~
- Worker 只往 `src/data/friends.json` 这一个文件写，不会碰仓库其他内容；给它的 PAT 也只有 Contents + Pull requests 两项权限
- 合并 PR 之后 Workers Builds 会自动重新构建部署，站长不需要再做任何手动操作
- 重复提交同一个站点会被 409 挡掉；想改已上线的友链还是直接改 JSON 比较快
- 欢迎反馈问题与建议：**support@lonelybing.top**

就这样~ 现在加友链对本尊来说只剩下点一下 Merge 的手速了，本尊可以继续摸鱼了喵~
