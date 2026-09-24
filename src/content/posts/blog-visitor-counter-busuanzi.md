---
title: 给个人博客加上访问量与建站时间统计：不蒜子 Busuanzi 极简方案
published: 2026-09-15T19:00:00+08:00
pinned: false
description: 基于 Jekyll / GitHub Pages 的个人博客，用不蒜子（Busuanzi）极简网页计数器，零后端、两行代码即可显示站点总访问量（PV）与访问人数（UV），再配合一小段原生 JS 显示建站运行时间。附完整配置与常见坑位。
image: ""
tags:
  - 博客
  - 访客统计
  - 教程
category: 博客搭建
slug: blog-visitor-counter-busuanzi
series: "博客"
---

## 为啥要加这个?

博客搭好之后，我第一件事其实就在琢磨：到底有没有人来啊？来了多少次？

这篇就用不蒜子（Busuanzi）这个极简计数器来回答这个问题. 它挺适合个人博客的喵~

- **零后端、零配置**：一个异步加载的 `<script>` 就搞定，不用自建数据库，也不用申请 API Key
- **一行标签一个数值**：想显示啥，就放对应的 `span` 占位
- **免费、轻量**：脚本就几百字节，`defer` 加载不影响页面速度

最后能整出三样东西：站点总访问量（PV）、访问人数（UV），加上建站到现在跑了多久（年/天/时/分/秒）. 新版还多了「今日访问量 / 今日访客数」，顺手一起摆上喵~

顺便说一句，本教程是以 Jekyll / GitHub Pages 博客为例的（改 `_includes/footer.html`）. 你要是用 Hexo、VuePress、Hugo 那些别的框架，思路完全一样，只要找到底部页脚文件，把下面两段代码贴进去就成喵~

**2026-09-22 更新**：不蒜子已经搬到官方新域名（`cdn.busuanzi.cc`），脚本从 `2.3` 升到 `3.6.9`，**元素 id 全变了**——老代码不会报错，只会永远不显示数字. 文中代码已全部换成新版，从旧版过来的话看下面「从旧版换过来？id 全变了」那一节.

## 方法一：只要总访问量（PV）

最省事的一种，页脚里加两行就够了其实。（~~什么？你不知道页脚是什么？~~）.

```html
<script src="https://cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.min.js" defer></script>
<span>本站总访问量 <span id="busuanzi_site_pv">加载中...</span> 次</span>
```

- `busuanzi.min.js` 是统计脚本，`defer` 表示等页面解析完再执行，放在 `footer` 里不会阻塞首屏渲染
- `busuanzi_site_pv` 这个 `span` 会被脚本自动填入「全站累计访问次数」
- 新版是**按 id 认元素**的：脚本拿到接口返回的 JSON 后，逐个 `querySelectorAll('#' + key)` 直接覆盖文本. 所以 id 一个字都不能错，写错了它不报错，只是永远不填（这个设计挺坑的其实）

刷新页面，等个一两秒（首次统计可能要等脚本回源），数字就出来了.

（顺带一提，占位文字用的是官方示例里的 `加载中...`；我自己博客上换成了 `—`，因为脚本只在成功时才覆盖文本，万一被广告拦截器挡了，「加载中」会一直挂在那儿（恼））

## 方法二：访问人数 + 总访问量 + 建站时间

想要更完整的效果（含 UV 和建站运行时间），把下面这段整体贴到`footer.htm` 里面 附近：

```html
<script src="https://cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.min.js" defer></script>
<span id="sitetime"></span>
<script language="javascript">
function siteTime() {
  window.setTimeout("siteTime()", 1000);
  var seconds = 1000;
  var minutes = seconds * 60;
  var hours = minutes * 60;
  var days = hours * 24;
  var years = days * 365;
  var today = new Date();
  var todayYear = today.getFullYear();
  var todayMonth = today.getMonth() + 1;
  var todayDate = today.getDate();
  var todayHour = today.getHours();
  var todayMinute = today.getMinutes();
  var todaySecond = today.getSeconds();
  var t1 = Date.UTC(2023, 6, 24, 20, 0, 0);  // 此处填写建站时间：年,月,日,时,分,秒（半角逗号）
  var t2 = Date.UTC(todayYear, todayMonth, todayDate, todayHour, todayMinute, todaySecond);
  var diff = t2 - t1;
  var diffYears = Math.floor(diff / years);
  var diffDays = Math.floor((diff / days) - diffYears * 365);
  var diffHours = Math.floor((diff - (diffYears * 365 + diffDays) * days) / hours);
  var diffMinutes = Math.floor((diff - (diffYears * 365 + diffDays) * days - diffHours * hours) / minutes);
  var diffSeconds = Math.floor((diff - (diffYears * 365 + diffDays) * days - diffHours * hours - diffMinutes * minutes) / seconds);
  document.getElementById("sitetime").innerHTML = "🕓 Blog already run " + diffYears + " years " + diffDays + " days " + diffHours + " hours " + diffMinutes + " mins " + diffSeconds + " s";
}
siteTime();
</script>
<br />
<span>👤Total Visitors <span id="busuanzi_site_uv">加载中...</span> |</span>
<span>👁️Total Views <span id="busuanzi_site_pv">加载中...</span></span>
<br />
<span>📅Today Views <span id="busuanzi_today_pv">加载中...</span> |</span>
<span>📅Today Visitors <span id="busuanzi_today_uv">加载中...</span></span>
```

这段代码做的事：

| 部分 | 作用 |
| --- | --- |
| `busuanzi.min.js` | 拉取统计，自动填充下方 UV / PV 的 `span` |
| `#sitetime` + `siteTime()` | 每秒计算「现在 − 建站时间」并刷新，显示成「已运行 X 年 X 天 X 时 X 分 X 秒」 |
| `busuanzi_site_uv` | 全站**访问人数**（独立访客，UV） |
| `busuanzi_site_pv` | 全站**访问量**（浏览次数，PV） |
| `busuanzi_today_uv` / `busuanzi_today_pv` | 新版新增：**今日**访客数 / 今日访问量 |

## 从旧版换过来？id 全变了

旧版（2.x）用的是「外层容器 + 数值」两层结构：脚本拿到数据后先 `texts()` 填文本，再 `shows()` 把外层容器显出来（配合主题里给容器加的 `display: none`，加载慢时不会先露出一片空白）.

新版把这一层砍了，只按 id 填文本，对应的 id 也全换了名：

| 旧版（2.3，`busuanzi.ibruce.info`） | 新版（3.6.9，`cdn.busuanzi.cc`） |
| --- | --- |
| `busuanzi_value_site_pv` | `busuanzi_site_pv` |
| `busuanzi_value_site_uv` | `busuanzi_site_uv` |
| `busuanzi_value_page_pv` | `busuanzi_page_pv` |
| `busuanzi_container_*`（外层容器） | 没有这个概念了，删掉 |
| — | `busuanzi_today_pv` / `busuanzi_today_uv`（新增） |

所以旧代码升新版，**光换 `script` 的地址是没用的**，得把每个 id 一起改掉——而且改错了完全不报错，这点最要命（悲）. 另外两边的数据也是各存各的，换过来等于从 0 开始重新数，具体的坑写在下面「注意事项」里了.

## 两个必须改 / 必须注意的点

### 1. 更改建站时间（NO Ctrl+C\V 喵~）

记得替换成你自己建站的时间：

```js
var t1 = Date.UTC(2023, 6, 24, 20, 0, 0);  // 年,月,日,时,分,秒
```

这里有个大坑要提醒一下（我当初就栽过）：JS 的月份是从 0 开始数的——`0 = 1 月`，`6 = 7 月`，`11 = 12 月`. 所以上面那行 `6` 其实是 **7 月 24 日 20:00**. 本尊照抄之后发现"多/少了几个月"，基本都是栽在这个 0-based 月份上 :( 填之前记得先把月份减 1 喵~

### 2. 文案可以随便改

代码里的 `🕓 Blog already run ...`、`👤Total Visitors`、`👁️Total Views`、`📅Today Views` 都只是文字和 emoji，按你博客风格改就好. emoji 可以在常用表情网站（比如 emojixd）里挑.

## 想要「单篇文章阅读量」？

原教程没提，但 Busuanzi 也支持**每篇文章的阅读数**，只要在文章模板（通常是 `post.html` 或文章页脚）加：

```html
<span>👁️本文阅读量 <span id="busuanzi_page_pv">加载中...</span> 次</span>
```

`busuanzi_page_pv` 会按当前页面 URL 统计独立阅读数，和全站 PV 互不干扰. 新版还有个 `busuanzi_page_uv`（本页独立访客），想更细可以一起放.

不过有个坑得提前说：如果你主题用的是局部换页那一套（swup、instant.page 之类），页脚往往不在被替换的容器里，脚本只在**首次整页加载**时跑一次，页级数字会一直停在旧页面那个值上. 我自己的博客就是这情况，所以页脚只摆了站点级的数，没敢放本页阅读量（乐）

## 注意事项（啰嗦几句~）

- **首次加载可能看不到数字**：脚本是 `defer` 的，且首次回源统计需要一两秒，刷新后耐心等一下；若一直挂着占位文字，检查 `cdn.busuanzi.cc` 是否可达（个别地区/网络环境访问不稳定）
- **域名有硬门槛**：官方公告里写了，`127.0.0.1`、`localhost`、纯 IPv4、纯 IPv6，以及**长度超过 22 字符**的域名一律禁止接入. 也就是说本地起服务是永远测不出数字的，必须挂到真实域名上——我盯着空白页脚怀疑人生的那次，就栽在这儿（悲）
- **换服务不继承历史**：不蒜子属于第三方计数，数据存在人家服务器上. 从旧域名（`busuanzi.ibruce.info`）换到新域名（`cdn.busuanzi.cc`），**老数据不会跟过来**，计数从 0 重新数起；反过来换回去也一样. 换之前想清楚，别像我一样换完才发现从 0 开始（恼）
- **换主题 / 换模板会丢统计**：Busuanzi 的统计跟着「页面 URL + 脚本」走，不会丢数据本身，但你要是重做了页脚却没重新贴这段代码，前台就不显示——代码记得备份
- **隐私提示**：访客统计属于第三方计数，不收集个人身份信息，但你如果面向欧盟(应该不会吧?)用户，建议在隐私声明里提一句
- **不是精准分析工具**：它给出的是「总量级」概览，要做来源、停留时长、留存这类精细分析，得上 Google Analytics / Plausible / Umami 等专业的东西

不蒜子官网在这：[https://www.busuanzi.cc/](https://www.busuanzi.cc/)（脚本走的是 `cdn.busuanzi.cc`，别跟旧版的 `busuanzi.ibruce.info` 搞混了）. 本文配置思路参考自 ThreeStones1029 的博客教程，并结合常见踩坑点做了补充.

## 说明与反馈

- 两行代码即可实现，性价比极高
- 想要更完整的运营数据，再叠加一个轻量分析工具（如 Umami 自托管）就够了
- 欢迎反馈问题与建议：**LonelyBing@outlook.com**
- 觉得有用的话，可以去 [爱发电](https://ifdian.net/a/LonelyBing) 支持一下

就这样，祝大家的博客都有人看吧 ~ 但别像我一样天天盯着那几个数字发呆（笑）喵~
