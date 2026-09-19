---
title: 给个人博客加上访问量与建站时间统计：不蒜子 Busuanzi 极简方案
published: 2026-09-15T19:00:00+08:00
pinned: false
description: 基于 Jekyll / GitHub Pages 的个人博客，用不蒜子（Busuanzi）极简网页计数器，零后端、两行代码即可显示站点总访问量（PV）与访问人数（UV），再配合一小段原生 JS 显示建站运行时间。附完整配置与常见坑位。
image: ""
tags: [博客, GitHub Pages, Jekyll, 不蒜子, 访客统计, 教程]
category: 博客搭建
slug: blog-visitor-counter-busuanzi
---

## 先说为啥要加这个

博客搭起来之后，我第一件事其实就在琢磨：到底有没有人来啊？来了多少次？

这篇就是用不蒜子（Busuanzi）这个极简计数器来回答这个问题的。它挺适合个人博客的：

- **零后端、零配置**：一个异步加载的 `<script>` 就搞定，不用自建数据库，也不用申请 API Key
- **一行标签一个数值**：想显示什么，就放对应的 `span` 占位
- **免费、轻量**：脚本只有几 KB，异步加载不影响页面速度

最后能整出三样东西：站点总访问量（PV）、访问人数（UV），再加上建站到现在跑了多久（年/天/时/分/秒）。

顺便说一句，本教程是以 Jekyll / GitHub Pages 博客为例的（改 `_includes/footer.html`）。要是你用 Hexo、VuePress、Hugo 那些别的框架，思路完全一样，只要找到底部页脚文件，把下面两段代码贴进去就成。

## 方法一：只要个总访问量（PV）

最省事的一种，页脚里加两行就够了。

**修改位置**：Jekyll 项目的 `_includes/footer.html`，找到版权信息（`copyright`）附近插入：

```html
<script async src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
<span id="busuanzi_container_site_pv">本站总访问量<span id="busuanzi_value_site_pv"></span>次</span>
```

- `busuanzi.pure.mini.js` 是异步加载的统计脚本，放在 `footer` 里不会阻塞首屏渲染
- `busuanzi_value_site_pv` 这个 `span` 会被脚本自动填入「全站累计访问次数」

刷新页面，等个一两秒（首次统计可能要等脚本回源），数字就蹦出来了。

## 方法二：访问人数 + 总访问量 + 建站时间

想要更完整的效果（含 UV 和建站运行时间），把下面这段整体贴到 `_includes/footer.html` 的 `copyright` 附近：

```html
<script async src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
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
<span id="busuanzi_container_site_uv">
  👤Total Visitors <span id="busuanzi_value_site_uv"></span> |
</span>
<span id="busuanzi_container_site_pv">
  👁️Total Views <span id="busuanzi_value_site_pv"></span>
</span>
```

这段代码做的事：

| 部分 | 作用 |
| --- | --- |
| `busuanzi.pure.mini.js` | 异步拉取统计，自动填充下方 UV / PV 的 `span` |
| `#sitetime` + `siteTime()` | 每秒计算「现在 − 建站时间」并刷新，显示成「已运行 X 年 X 天 X 时 X 分 X 秒」 |
| `busuanzi_value_site_uv` | 全站**访问人数**（独立访客，UV） |
| `busuanzi_value_site_pv` | 全站**访问量**（浏览次数，PV） |

## 两个必须改 / 必须注意的点

### 1. 把建站时间改成你自己的

找到这一行，替换成你真正建站的时间：

```js
var t1 = Date.UTC(2023, 6, 24, 20, 0, 0);  // 年,月,日,时,分,秒
```

这里有个大坑要提醒一下（我当初就栽过）：JavaScript 的月份是从 0 开始数的——`0 = 1 月`，`6 = 7 月`，`11 = 12 月`。所以上面那行 `6` 其实是 **7 月 24 日 20:00**。好多人照抄之后发现自己博客"凭空多/少了几个月"，基本都是栽在这个 0-based 月份上。填之前记得先把月份减 1。

### 2. 文案可以随便改

代码里的 `🕓 Blog already run ...`、`👤Total Visitors`、`👁️Total Views` 都只是文字和 emoji，按你博客风格改就好。emoji 可以在常用表情网站（如 emojixd）里挑。

## 想要「单篇文章阅读量」？

原教程没提，但 Busuanzi 也支持**每篇文章的阅读数**，只要在文章模板（通常是 `_layouts/post.html` 或文章页脚）加：

```html
<span id="busuanzi_container_page_pv">
  👁️本文阅读量 <span id="busuanzi_value_page_pv"></span> 次
</span>
```

`busuanzi_value_page_pv` 会按当前页面 URL 统计独立阅读数，和全站 PV 互不干扰。

## 注意事项（啰嗦几句）

- **首次加载可能看不到数字**：脚本是异步的，且首次回源统计需要一两秒，刷新后耐心等一下；若一直为空，检查 `busuanzi.ibruce.info` 是否可达（个别地区/网络环境访问不稳定）
- **换主题 / 换模板会丢统计**：Busuanzi 的统计是跟着「页面 URL + 脚本」走的，不会丢数据本身，但如果你重做了页脚却没有重新贴这段代码，前台就不显示——代码记得备份
- **隐私提示**：访客统计属于第三方计数，不收集个人身份信息，但如果你面向欧盟用户，建议在隐私声明里提一句
- **不是精准分析工具**：它给出的是「总量级」概览，要做来源、停留时长、留存这类精细分析，得上 Google Analytics / Plausible / Umami 等

不蒜子官网在这：[https://busuanzi.ibruce.info/](https://busuanzi.ibruce.info/)。本文配置思路参考自 ThreeStones1029 的博客教程，并结合常见踩坑点做了补充。

## 说明与反馈

- 两行代码就能看到「有人来过」，对个人博客来说性价比极高
- 想要更完整的运营数据，再叠加一个轻量分析工具（如 Umami 自托管）就够了
- 欢迎反馈问题与建议：**LonelyBing@outlook.com**
- 觉得有用的话，可以去 [爱发电](https://ifdian.net/a/LonelyBing) 支持一下

就这样，祝大家的博客都有人看吧 ~ 也别像我一样天天盯着那几个数字发呆（笑）。
