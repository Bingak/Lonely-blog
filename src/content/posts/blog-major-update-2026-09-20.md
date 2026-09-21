---
title: 这几天更新了许多内容，大改了下博客
published: 2026-09-21T23:30:00+08:00
pinned: false
description: 9.20-9.21 大改记录：导航栏聚光灯效果 + 胶囊圆角 + 个人资料卡、更新日志页（GitHub 提交集成 + 按天聚合 + 自动分类）、首页文章网格布局、背景壁纸全屏英雄模式、全站主题色从绿变蓝、文章卡片蓝色细边框，以及一堆小改动。45 次提交，两天肝完。
image: "https://img.lonelybing.top/file/post/网格.png"
tags:
  - 博客
  - 更新日志
  - 前端
  - 记录
category: 博客搭建
slug: blog-major-update-2026-09-20
---

## 这几天到底干了啥？

**45 次提交，从 9 月 20 号早上 8 点一直干到 21 号**，改了导航栏、加了更新日志页、首页换网格布局、背景壁纸大改……基本把博客翻了个底朝天喵~ 第二天又接着改了主题色和一些细节，从绿色换成了青蓝色~

![这几天的大改动概览](https://img.lonelybing.top/file/post/个人.png)

下面按模块一个个说吧~

---

## 一、导航栏大改造

这是今天花时间最多的部分，光导航栏相关的提交就有十来个，从下午 5 点改到晚上 8 点，反复调了好几轮喵~

### 1. 聚光灯效果 + 胶囊形状

把导航栏从普通矩形改成了胶囊形（全圆角），鼠标悬停时有一个跟随光标的渐变高亮——叫"聚光灯效果"。

![导航栏聚光灯效果](https://img.lonelybing.top/file/post/导航栏.png)

核心思路是在导航栏容器上加一层 `::before` 伪元素，背景用 `radial-gradient` 跟着鼠标 `mousemove` 走：

```css
.navbar-spotlight::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle 80px at var(--mouse-x) var(--mouse-y),
    rgba(var(--btn-content-rgb), 0.08),
    transparent 70%
  );
  pointer-events: none;
  transition: opacity 0.3s ease;
}
```

然后用 JS 监听鼠标位置，把坐标写进 CSS 变量里：

```js
navbar.addEventListener("mousemove", (e) => {
  const rect = navbar.getBoundingClientRect();
  navbar.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
  navbar.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
});
```

就这么简单，效果挺好看喵~

### 2. 下拉菜单全圆角

下拉菜单也跟着改了，从方角变成圆角，视觉上和导航栏的胶囊形统一了。改动不大，就是把 `border-radius` 从小值改成大值，然后把内边距和间距微调了一下。

### 3. 滑动指示器

导航栏菜单项底部加了一个滑动指示条，切换菜单时会在各项之间平滑滑动——而不是简单地给当前项加下划线。这个效果在 `Navbar.astro` 里改了 64 行代码喵~

### 4. 导航栏个人资料卡

![个人资料卡](https://img.lonelybing.top/file/post/小卡片.png)

新增了 `NavbarProfileCard.astro`（646 行），包含：

- 头像和身份信息
- GitHub / 邮箱 / RSS 等社交链接
- GitHub 贡献热力图（就是那种绿格子日历）
- 暗色主题适配

同时优化了 LQIP（低质量图片占位）文件，移除不必要的图片引用并添加了新图喵~

### 改了多少行？

| 文件 | 改动 |
| --- | --- |
| `NavbarProfileCard.astro` | **+646 行**（全新文件） |
| `Navbar.astro` | 多次修改，累计 +100 行左右 |
| `navbar.css` | +114 行改写（聚光灯 + 胶囊 + 滑动指示器） |
| `NavMenuPanel.astro` | +66 行（全圆角 + 聚光灯） |

---

## 二、更新日志页（重头戏）

这是今天最大的新功能——一个实时从 GitHub API 拉取提交记录的更新日志页面，总共改了 **998+ 行**，横跨 16 个文件喵~

![更新日志页](https://img.lonelybing.top/file/post/更新.png)

### 功能一览

- **GitHub API 集成**：实时拉取仓库提交记录，支持 Token 鉴权避免限流
- **按天聚合**：同一天的提交聚合成一张卡片，点击展开看全部
- **自动分类**：根据 commit message 前缀自动分类（新功能 / 修复 / 优化 / 维护等）
- **多语言支持**：7 种语言的 i18n（中文、英文、日文、韩文、俄文、繁体）
- **分页拉取**：支持拉取最近 200 条提交（超过 100 条自动分页累积）

### 分类规则

用正则匹配 commit message 首行来分类，大小写不敏感：

| 类型 | 匹配关键词 |
| --- | --- |
| 新功能 | `feat` `feature` `add` `新增` `添加` `实现` `完成` `功能` `新` |
| 修复 | `fix` `bugfix` `hotfix` `修复` `修正` `解决` |
| 文档 | `docs` `documentation` `文档` `readme` |
| 样式 | `style` `ui` `css` `样式` `美化` `排版` |
| 重构 | `refactor` `重构` |
| 优化 | `perf` `optimize` `优化` `性能` `改善` `改进` |
| 维护 | `chore` `build` `ci` `deps` `配置` `更新` `修改` `调整` |
| 其他 | 以上都不匹配时兜底 |

分类逻辑写在 `ChangelogFeed.svelte` 里：

```typescript
const KIND_PATTERNS: Array<{ kind: CommitKind; re: RegExp }> = [
  { kind: "feat", re: /^\s*(?:\[|\(|\{)?\s*(?:feat|feature|add|新增|添加|实现|完成|加入|功能|新)/i },
  { kind: "fix", re: /^\s*(?:\[|\(|\{)?\s*(?:fix|bugfix|hotfix|修复|修正|解决)/i },
  // ... 其他类型
];

function classify(message: string): CommitKind {
  const firstLine = message.split("\n")[0];
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(firstLine)) return kind;
  }
  return "other";
}
```

### 按天聚合的实现

把扁平的提交列表按日期分组，每天一张卡片：

```typescript
const groupedByDate = $derived.by(() => {
  const groups: DayGroup[] = [];
  const map = new Map<string, Commit[]>();
  for (const c of filtered) {
    const date = c.date.slice(0, 10); // YYYY-MM-DD
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(c);
  }
  for (const [date, commits] of map) {
    groups.push({ date, commits });
  }
  return groups.sort((a, b) => b.date.localeCompare(a.date));
});
```

点击日期卡片头部就能展开/收起当日所有完整提交信息。没提交的日子自然不会显示卡片喵~

### 涉及的文件

| 文件 | 改动 |
| --- | --- |
| `ChangelogFeed.svelte` | **+382 行**（核心组件） |
| `changelog.astro` | **+80 行**（页面） |
| `changelog.css` | **+337 行**（样式） |
| `changelogConfig.ts` | **+81 行**（配置） |
| `i18n` 7 种语言 | 各 +11 行 |
| 其他 | 导航栏、站点配置、关于页等 |

---

## 三、首页文章网格布局

之前首页文章是一行一个的列表模式，太占空间了。今天改成了网格模式，一行显示 2-3 个喵~

![网格布局](https://img.lonelybing.top/file/post/网格.png)

### 配置改动

就改了两行：

```typescript
// src/config/siteConfig.ts
postListLayout: {
  defaultMode: "grid",   // 从 "list" 改成 "grid"
  grid: {
    columnWidth: 260,    // 从 320 改成 260，让内容区放下 2-3 列
  },
}
```

### 网格模式下的卡片优化

在 `PostCard.astro` 里加了一堆网格模式专属样式：

```css
/* 网格模式：卡片更紧凑 */
:global(.grid-mode) .post-card-content {
  padding: 0.875rem 1rem 1rem !important;
}

:global(.grid-mode) .post-card-title {
  font-size: 1.125rem !important;
  line-height: 1.5rem !important;
  margin-bottom: 0.5rem !important;
}

:global(.grid-mode) .post-card-title::before {
  display: none !important;
}

:global(.grid-mode) .post-card-image {
  aspect-ratio: 16/9 !important;
}
```

还把右侧大箭头按钮从"撑满卡片高度"改成了垂直居中的小按钮，图标从 `text-4xl`(36px) 缩到 `1.5rem`(24px)。~~之前那个大按钮确实有点太长了~~ 喵~

---

## 四、背景壁纸

把背景壁纸从普通模式改成了全屏 + 英雄模式（Hero），替换了新的中文名言壁纸。配置在 `backgroundWallpaper.ts` 里：

```typescript
// 从 normal 改成 banner
mode: "banner",
layout: "hero",
```

改完之后壁纸会铺满整个视口，内容卡片浮在上面，视觉层次感更强了喵~

---

## 五、其他小改动

散落的杂活汇总一下：

| 改动 | 说明 |
| --- | --- |
| **禁用 Live2D 看板娘** | `pioConfig.ts` 里关掉了，之前那只猫娘太碍事了 |
| **页脚文案** | "已运行" 改成 "已存活"（~~听起来更卑微了~~） |
| **打赏者列表** | 更新了打赏者信息，启用了列表显示 |
| **README 大改** | 重写了项目概述，删了 305 行，加了 126 行 |
| **.pages.yml** | 新增 Pages CMS 配置文件 |
| **.gitignore** | 加了临时文件、日志、包管理器的忽略规则 |
| **删除 Obsidian 插件** | 清掉了 Templater 和 obsidian-git，删了 1893 行 |
| **图片链接更新** | 删除不再使用的图片文件，更新图片 URL 列表 |
| **暗色主题优化** | 个人资料卡的文字颜色在深色背景上更可读了 |
| **语法修正** | 修正了 8940HX 降压文章的语法错误 |

---

## 六、主题色大改：从绿变蓝

大改完之后的第二天，又觉得绿色看腻了——干脆把全站主题色从绿色（hue 165）换成了青蓝色（hue 200）喵~

### 一行变量改全站

Firefly 主题的颜色系统是基于 `oklch()` 色空间的，所有颜色都从一个 `--hue` 变量派生出来。所以改主题色只需要改一行：

```typescript
// src/config/siteConfig.ts
hue: 200,  // 从 165（绿）改成 200（青蓝）
```

改完之后，导航栏高亮、按钮悬停、链接颜色、标签背景……全站所有跟颜色相关的元素自动跟着变，不用一个个文件去改。这个设计确实省事喵~

### 文章卡片蓝色细边框

光改主题色还觉得不够，又给首页的文章卡片加了一圈薄薄的蓝色边框（1.5px），让卡片在壁纸上更有层次感：

```css
/* 文章卡片蓝色细边框 */
.post-card-wrapper {
    border: 1.5px solid oklch(0.65 0.18 215 / 0.45);
}
:global(:root.dark) .post-card-wrapper {
    border-color: oklch(0.72 0.16 215 / 0.5);
}
```

一开始用的 1px，后来觉得太细了又加粗到 1.5px，透明度也稍微调高了一点。暗色模式下边框亮度也做了适配，不会在深色背景上看不清喵~

### 其他颜色联动

除了主题色，还有一些散落各处的颜色也跟着改了：

| 位置 | 改动 |
| --- | --- |
| 更新日志统计数字 | 新增数从绿色 `#16a34a` 改成蓝色 `#2563eb` |
| 项目状态标签 | Tailwind 类名从 `green-*` 改成 `blue-*` |
| RSS/Atom 复制提示 | 剪贴板复制成功提示色从 `#10b981` 改成 `#2563eb` |

---

## 七、其他后续调整

大改之后零零散散又修了一些东西：

| 改动 | 说明 |
| --- | --- |
| **更新日志分类更宽松** | 之前"功能：xxx"这种 commit 会被归到"其他"，现在加了`功能`、`新`等关键词，能正确识别为"新功能"了 |
| **关掉站点信息组件** | 侧边栏的 SiteInfo 小组件关掉了，信息在关于页已经有了，侧边栏留给更实用的东西 |
| **GitHub Token 配置** | 更新日志页的 GitHub API 匿名限流 60 次/小时，配了 `PUBLIC_CHANGELOG_GITHUB_TOKEN` 环境变量之后能到 5000 次/小时。注意这个变量是构建时内联的，要在 Cloudflare Pages 的 **Build 环境变量** 里设置，不是 Workers 运行时变量喵~ |

---

## 八、提交统计

这几天总共 **45 次提交**，时间线大概是这样：

| 时段 | 干了啥 |
| --- | --- |
| 9.20 08:00 - 12:00 | 小改动：动态更新、禁用看板娘、文章修正、图片清理 |
| 9.20 12:00 - 15:00 | 打赏者列表、.pages.yml、背景壁纸全屏 |
| 9.20 15:00 - 18:00 | 导航栏大改造（聚光灯 + 胶囊 + 滑动指示器） |
| 9.20 18:00 - 20:00 | 个人资料卡、页脚文案 |
| 9.20 20:00 - 23:00 | 更新日志功能 + 首页网格布局 + 卡片优化 |
| 9.21 | 主题色从绿变蓝、文章卡片蓝色边框、分类规则宽松化、关 SiteInfo、新文章 |

最大的提交是 `9b55802`（更新日志功能，+998 行 / 16 文件），第二是 `8076e6f`（个人资料卡，+681 行 / 5 文件）喵~
