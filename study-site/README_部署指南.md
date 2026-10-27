# 学习站部署指南（study.lonelybing.top）

> 状态：**已部署上线**。线上地址 <https://study.lonelybing.top/>，未登录一律显示登录页。
> 本文档记录实际部署结果、踩过的坑和日常维护动作。

## 一、整体结构

```
study-site/
├── src/worker.js        # 门禁 Worker：登录页 + 会话校验 + 静态资源透传
├── public/              # 教程静态页（index.html 目录页 + 各阶段教程 html + exercises/ 练习与答案页）
├── wrangler.toml        # Worker 配置（域名 / assets / 非机密变量）
├── wrangler.local.toml  # 本地链路测试配置（含明文弱密钥，仅本地 dev，勿部署）
├── tools_local_login.cjs   # 本地全流程验证脚本（登录/鉴权/登出）
├── tools_local_logout.cjs  # 本地登出失效专项验证
├── .dev.vars            # 本地开发机密（已 gitignore，勿提交）
└── README_部署指南.md    # 本文件
```

访问流程：

```
浏览器 → Worker（先跑）
          ├─ /api/login  POST  → 限流 → Turnstile 校验 → 凭据比对 → 签发 HMAC 会话 Cookie
          ├─ /api/logout POST  → 登记会话黑名单 + 清除 Cookie
          ├─ 未登录 + GET      → 返回内联登录页（picsum 随机图背景 + 深色玻璃卡片）
          └─ 已登录            → env.ASSETS.fetch() 透传教程静态页
```

## 二、实际部署记录（2026-10-25）

| 项目 | 值 |
|------|-----|
| Cloudflare 账号 | zhaozs.0514@gmail.com（Account ID `2437df852592bf0ce8104da7ae8b037c`） |
| Zone | `lonelybing.top`（active，Free Website） |
| Worker 名 | `study-lonelybing` |
| 自定义域名 | `study.lonelybing.top`（`custom_domain = true`，证书由 Cloudflare 自动签发） |
| Turnstile Widget | name `C 语言学习站 study`，hostname `study.lonelybing.top`，mode `managed` |
| Turnstile Site Key | `0x4AAAAAAFkI58zgOin02KwC`（已写进 `wrangler.toml` 的 `[vars]`） |
| Turnstile Secret | 已写入 Worker Secret `TURNSTILE_SECRET_KEY` |
| 其它 Secrets | `STUDY_USER` / `STUDY_PASS` / `STUDY_SESSION_SECRET` |
| 登录凭据 | 用户名 `bingshanak`（密码见密码管理器，本文不写明文） |
| 最近一次部署 | Version ID `4f0bf726-fe75-4da9-b186-174a16459659`（2026-10-27），含按真实学习进度重做的首页 + 新增「阶段二 文字答案」页；共 69 个资源文件 |

> 机密备份（**明文，注意保管**）：`C:\Users\lonel\.study-site-secrets.json`

## 三、三个必须知道的坑（已修复，改动前务必读）

### 坑 1：`run_worker_first = true` 不写，门禁等于没有

Workers 静态资源（`[assets]`）默认**优先返回命中的静态文件**，请求根本不会进 Worker。
也就是说，只要有人猜到 `/06_阶段五_指针.html`，就能**绕过登录直接读教程**。

```toml
[assets]
run_worker_first = true    # ← 缺了这一行，全站门禁形同虚设
```

### 坑 2：TOML 表作用域 —— `routes` 写在 `[assets]` 后面会失效

TOML 里一旦开了 `[assets]`，后面所有键都属于这张表，直到出现下一个表头。
把 `routes` 写在 `[assets]` 下方，它会被当成 `assets.routes` 这个不存在的字段，
表现是**部署成功但自定义域名没绑上**（wrangler 只给一句 `Unexpected fields found in assets field: "routes"` 警告）。

正确写法：`routes` 是 **顶层键**，必须放在任何 `[table]` 之前。

### 附：`html_handling = "none"`

默认 `auto-trailing-slash` 会让 `/xxx.html` 先回 307 跳到 `/xxx`，多一跳。
本站链接一律写全 `.html`，所以设为 `none` 让 URL 与磁盘文件名一一对应；
根路径 `/` 由 `worker.js` 显式改写成 `/index.html`。

### 坑 3：登出只清 Cookie，会话仍然有效

**现象**：点退出后，把原来的 Cookie 再发一次，服务端照常返回受保护内容。

**原因**：会话串是 `过期时间戳.HMAC签名` 的自包含值，签名没过期就无法区分
「用户还拿着」和「已经登出」。清 Cookie 只作用于浏览器，服务端无感知。

**修复**（`src/worker.js`）：登出时把会话串登记进内存黑名单，校验时命中即拒。

```js
const revokedSessions = new Set();
const REVOKE_MAX = 5000;

async function verifySession(secret, value) {
    if (!value) return false;
    if (revokedSessions.has(value)) return false;   // ← 新增这一行
    /* 签名与过期校验不变 */
}

function handleLogout(request) {
    revokeSession(getCookie(request, SESSION_COOKIE));   // ← 新增
    return new Response(JSON.stringify({ ok: true }), { /* Set-Cookie 清除 */ });
}
```

**局限**：`Set` 是 Worker 实例级内存，实例重启或请求落到别的实例会丢；容量上限 5000，
满了整体清空。要严格需迁 KV / Durable Object。个人站规模够用。
（原来的「服务端不能单独吊销会话」这条局限因此部分缓解，见第五节。）

## 四、日常操作

### 更新教程内容（最常用）

```powershell
# 1) 在桌面学习计划目录里改 md，然后重新生成 html（教程页 + exercises 练习/答案页，自动同步到 public）
python "C:\Users\lonel\Desktop\C语言学习计划_AI生成\tools\md2html.py"

# 2) 重新发布
cd D:\Programing\Blog\study-site
D:\Programing\Blog\node_modules\.bin\wrangler.cmd deploy --config wrangler.toml
```

`tools\md2html.py` 会自动：生成自包含 HTML（自带 CSS、代码高亮、目录、顶部文档导航）、
同步拷贝到 `study-site\public\`（教程页放 `public/` 根，练习与答案页放 `public/exercises/<阶段名>/`），
并清理 `public` 里源 md 已删除的孤儿 html。

当前 `public/` 规模：54 个 html / 5.31 MB = 15 篇教程 + 目录页 + 25 个练习与文字答案页 + 13 个代码答案页。

### 本地全链路调试（不碰线上）

`wrangler.local.toml` 用 Cloudflare 官方 **Turnstile 测试密钥对**（任何 token 都验证通过），
可以在本地把「登录 → 签发会话 → 访问练习页 → 登出」整条链路跑通，不需要真过人机验证。

```powershell
cd D:\Programing\Blog\study-site
# 终端 1
D:\Programing\Blog\node_modules\.bin\wrangler.cmd dev --config wrangler.local.toml --port 8799 --ip 127.0.0.1
# 终端 2
node tools_local_login.cjs     # 未登录/登录/7 个页面/伪造会话/登出
node tools_local_logout.cjs    # 登出后旧 Cookie 必须失效
```

> `wrangler.local.toml` 里的 `STUDY_*` 是明文弱值，**只用于本地，不要用它部署**。

实测结果（2026-10-25，见 `_local_chain_test.txt`）：

| 步骤 | 结果 |
|------|------|
| 未登录 `/` 与练习页 | 200 / 7164B 登录页，含 Turnstile |
| 登录 | 200 `{"ok":true}`，签发 `study_session=…` |
| `/`、`/index.html` | 200 / 15365B 目录页 |
| `/02_阶段一_环境搭建与调试.html` | 200 / 51802B |
| `/exercises/阶段三/练习_题目.html` | 200 / 29904B |
| `/exercises/阶段三/答案_参考_文字题.html` | 200 / 28212B |
| `/exercises/阶段三/答案_参考_代码题.html` | 200 / 29903B |
| `/exercises/51实战二/练习_题目.html` | 200 / 33110B |
| `/exercises/阶段一/答案_参考.html` | 200 / 29291B |
| 伪造会话 `forged.abc` | 被拦 |
| 登出后旧 Cookie 再访问 | 被拦（坑 3 修复前会放行） |

### 代码答案页（13 个 `.c` 答案内联页）

练习页从原来的「题目 + 文字答案」两类扩成三类，`.c` 参考答案也搬上了网站：

| 页面 | 文件名 | 内容 |
|---|---|---|
| 题目 | `练习_题目.html` | 练习描述与要求 |
| 文字答案 | `答案_参考_文字题.html`（阶段一是 `答案_参考.html`） | 思考题的文字解答 |
| 代码答案 | `代码答案.html` | 该阶段所有 `.c` 参考答案，一个文件一个 section，带行号 + 语法高亮 |

数据来源是 `C:\Users\lonel\Desktop\C语言学习计划_AI生成\exercises\<阶段>\` 下的全部 `.c`
（含 `51实战*` 的三文件工程子目录，用 `rglob` 收）。13 个页面合计 8404 行代码，共 5.31 MB。

页面结构（`tools\md2html.py` 的 `convert_ex_code()`）：

```html
<div class="cfile-head"><span class="ex-tag code-tag">CODE</span><span class="cfile-name">答案_练习5_输入检查.c</span></div>
<div class="cfile-scroll">          ← 横向滚动容器，行号/高亮在这里面
  <div class="codehilite"><code><span class="cl">…</span></code></div>
</div>
```

实现上几个关键点（改之前务必读）：

1. **高亮必须整文件一次转换，再按行切**。逐行喂给 pygments 会让 C lexer
   丢掉跨行状态，块注释第二行起被当成普通代码，中文注释还会被拆成
   `<span class="n">编译</span><span class="err">：</span>`。
2. **行号用 CSS 计数器**（`.cl::before { counter-increment: cln }`），
   空行是 `<span class="cl"></span>` + `:empty::after { content:"\00a0" }`，
   保证页面上第 N 行就是源文件第 N 行。已逐阶段核对：页面 `cl` 行数与
   源文件 `splitlines()` 行数完全一致。
3. **中文注释会被判成 `err` token**（默认样式画红框），必须覆盖：
   `.codehilite .err { border:none; background:none; color:inherit }`。
4. **右缘渐隐要挂在外层 `.cfile-scroll` 上**，不能挂 `.codehilite`：
   `overflow:auto` 的元素会裁掉自己的 `absolute` 后代，且该后代会随
   `scrollLeft` 一起跑出视口。渐变色硬编码，不用 `var(--code-bg)`
   —— 深色模式下该变量解析成 `rgb(22,27,35)`，与代码块自身 `rgb(32,32,32)`
   差一档会留脏接缝。
5. 渐变宽 40px，`SCROLL_JS_CODE` 监听 scroll/resize 切 `has-more` / `at-end`；
   实测亮度从 38.6 降到 26.5（32%），肉眼可辨。

页面入口：目录页 `index.html` 的「配套练习」区每行末尾有紫色「代码」链接，
页面顶部导航也有「💻 代码答案」。

### 改密码

```powershell
cd D:\Programing\Blog\study-site
# 交互式写入单个机密（回车后粘贴新密码）
D:\Programing\Blog\node_modules\.bin\wrangler.cmd secret put STUDY_PASS --config wrangler.toml
```

或用批量方式（一次更新多个，避免逐个粘贴）：

```powershell
@'
{"STUDY_USER":"bingshanak","STUDY_PASS":"新密码","STUDY_SESSION_SECRET":"新的长随机串"}
'@ | Set-Content -Encoding utf8 .secrets-tmp.json
D:\Programing\Blog\node_modules\.bin\wrangler.cmd secret bulk .secrets-tmp.json --config wrangler.toml
Remove-Item .secrets-tmp.json
```

> 改 `STUDY_SESSION_SECRET` 会让**所有已登录会话立即失效**，适合「踢掉所有设备」。

### 轮换 Turnstile

Dashboard → Turnstile → 选中 `C 语言学习站 study` → Rotate Secret Key，
然后 `wrangler secret put TURNSTILE_SECRET_KEY`。

## 五、安全说明

- 密码只存 Worker Secrets，不进 git、不进前端产物、不进 `public/`
- 会话 Cookie：`HttpOnly + Secure + SameSite=Lax`，12 小时过期，HMAC-SHA256 签名（常数时间比较，防时序侧信道）
- 登录接口：每 IP 每分钟 10 次限流 + Turnstile 人机验证
- 全站响应加 `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`
- 登录页 `Cache-Control: no-store`

**已知局限（个人学习站可接受）**：

1. 限流计数在 Worker 实例内存里，跨实例不共享 —— 极端情况下可被绕过，但不能暴力爆破
2. 登出黑名单同样是实例内存，见坑 3：重启/多实例会丢，因此「登出」在跨实例时可能仍放行旧 Cookie
   （要严格吊销，改 `STUDY_SESSION_SECRET` 全量失效，见「改密码」一节）
3. 密码是明文比对（存 Secret 里），没有做哈希存储 —— 因为只有一组凭据，Secret 本身已是加密存储

## 六、界面与移动端（2026-10-25 重做）

### 三处样式入口

| 位置 | 管什么 | 改哪里 |
|---|---|---|
| `tools\md2html.py` 的 `PAGE_CSS` / `SCROLL_CSS` | 15 篇教程页 | 改完必须重跑 `python tools\md2html.py` |
| `public\index.html` | 教程目录页 | 直接改（md2html 不会覆盖它） |
| `src\worker.js` 的 `loginPage()` | 登录页（内联在 Worker 里） | 改完要 `wrangler deploy` |

### 设计要点

- **自包含单文件**：CSS 全内联，断网双击也能看；不引外部字体/JS
- **三档断点**：桌面 50rem 单栏 → ≤860px 平板收紧 → ≤560px 手机单列
- **跟随系统深浅色**：`prefers-color-scheme`，代码高亮用 pygments 的 `default`（浅）/ `native`（深）两套色板，深色规则排在后面覆盖
- **横向滚动不撑破屏**：每个 `<table>` 包在 `.table-wrap` 里；代码块自己 `overflow-x:auto`；两者都套了 `.scroll-hint` 外框，溢出时右缘显示渐隐提示（有 JS 判断，不溢出就不显示）
- **吸顶导航**：手机上文档导航吸顶 + 横向滑动，当前页自动滚到中间；桌面端改为平铺换行、不吸顶
- **回到顶部**：滚过 480px 出现，右下角
- **触控尺寸**：按钮/输入 ≥ 48px，复选框 19px

### iOS 专项修复（改了别退回去）

1. **输入框必须 `font-size: 16px`** —— 小于 16px 时 Safari 聚焦会自动放大整个页面，且不会缩回来
2. **不要用 `background-attachment: fixed`** —— iOS 上会失效或抖动；改成 `::before` 绝对定位铺满
3. **`viewport-fit=cover` + `env(safe-area-inset-*)`** —— 刘海屏/灵动岛不被裁切

### 验证方法（可复现）

用 CDP 做真实设备模拟，比改窗口大小靠谱（Chromium 有最小窗口宽度，`--window-size=390` 并不会真的得到 390 视口）：

```powershell
# 1. 起一个带调试端口的浏览器
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new `
  --remote-debugging-port=9222 --user-data-dir="$env:TEMP\edgecdp" --no-first-run about:blank

# 2. 截图（390×844 手机 / 1280 桌面，可指定 light|dark 与滚动位置）
node tools\shot_mobile.js "https://study.lonelybing.top/" 390 844 out.png dark 0

# 3. 直接读 DOM 状态（例如检查是否出现横向溢出）
node tools\eval_cdp.js "JSON.stringify({vw:innerWidth,sw:document.documentElement.scrollWidth})" 390 light
```

判定标准：`scrollWidth === innerWidth` 就是不横向溢出。

## 七、故障排查

| 现象 | 排查方向 |
|------|----------|
| 访问域名 404 / 522 | `routes` 是否被写进了 `[assets]` 表里（坑 2）；Dashboard → Workers → study-lonelybing → Settings → Domains 看域名是否 Active |
| 能直接打开 `xxx.html` 不登录 | `run_worker_first` 是否被改回 false（坑 1） |
| 登录后仍跳回登录页 | Cookie 是否被浏览器拦（必须 HTTPS / 自定义域名访问）；`STUDY_SESSION_SECRET` 是否刚被改过 |
| 退出后旧链接还能打开 |  Worker 实例已重启导致黑名单丢失（坑 3 局限），或当前请求落到别的实例；确认方法：换 `STUDY_SESSION_SECRET` 全量失效 |
| 登录报「人机验证未通过」 | Turnstile 的 hostname 是否包含当前域名；`TURNSTILE_SITE_KEY` 与 `TURNSTILE_SECRET_KEY` 是否成对 |
| 登录报「服务端未配置登录凭据」 | 三个 `STUDY_*` Secret 是否都写进了 `study-lonelybing`（不是别的 Worker） |
| 点教程链接 307 跳转 | `html_handling` 被改回了默认值 |
| 练习页 404（教程页正常） | `md2html.py` 没重跑（`public/exercises/` 下缺文件），或 md 源文件被删导致孤儿 html 被清理 |
| 代码答案页中文注释出现红框 | `.codehilite .err` 的覆盖规则被删了 |
| 代码答案页行号与源文件错位 | 有人把「整文件一次高亮再按行切」改回了逐行高亮；或 `pop()` 尾行空串的逻辑被去掉 |
| 手机上代码被硬切断、没有渐隐 | `.cfile-scroll::after` 被挪进 `.codehilite` 里了（会被 overflow 裁掉） |

## 八、wrangler 命令行注意

- 本机 `wrangler` 只在 `D:\Programing\Blog\node_modules\.bin\wrangler.cmd`（4.127.1），
  直接敲 `wrangler` 会落到其它安装或提示 `Win32 application` 错误，必须用完整路径。
- `--cwd` 参数在本机不可靠，**一律用 `--config <配置文件>`**。
- 部署成功会打印 `Current Version ID`，排查线上行为时拿它对版本。
