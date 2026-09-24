---
title: 为博客添加动态切换等功能
published: 2026-09-23T23:10:00+08:00
pinned: false
description: 把显示设置面板正式开启，然后往里塞了 Material 3 动态配色（9 种风格 + 2 种配色规范）、纯色模式下的六种背景纹理，顺手把音乐播放器的进度条换成了会涌动的波浪。附 @material/material-color-utilities@0.4.0 缺 .js 后缀的 pnpm patch 踩坑记录。
image: ""
tags:
  - 博客
  - 前端
  - 更新日志
  - 记录
category: 博客搭建
slug: blog-dynamic-display-settings-2026-09-23
series: "博客"
---

## 一、添加设置面板

Firefly 主题本来就带一个显示设置面板组件，只是默认 `enable: false` 关着的——因为开启后整套运行时切换逻辑会打进客户端产物，大概 +33 KB/页。本尊权衡了一下还是决定开，毕竟谁不想不重新构建就能换壁纸和配色喵~

```typescript
// src/config/displaySettingsConfig.ts
enable: true,
```

开启后导航栏会多一个调色盘按钮，点开浮层能切：

![显示设置面板的壁纸标签页](https://img.lonelybing.top/file/post/display-panel-wallpaper-banner.png)

| 项目 | 选项 |
| --- | --- |
| 页面背景 | 纯色 / 横幅 / 全屏 / 覆盖透明 |
| 全屏布局 | classic / hero |
| 文章列表 | 列表 / 网格 |
| 主题色相 | 0-360 滑条 |
| 卡片样式 | 边框、跟随主题 |
| 特效 | 樱花 |

![全屏壁纸模式下的透明设置](https://img.lonelybing.top/file/post/display-panel-wallpaper-fullscreen.png)

![特效标签页的樱花开关](https://img.lonelybing.top/file/post/display-panel-effects-sakura.png)

偏好全部存在 localStorage 里，刷新不丢。另外这一项也可以不改代码，直接在部署平台配 `PUBLIC_DISPLAY_SETTINGS=true` 环境变量覆盖喵~（记得是**构建环境变量**，`PUBLIC_*` 是构建时内联进产物的，配成运行时变量不会生效）

---

## 二、Material 3 动态配色：九种风格 + 两种规范

这是这次最大的一块。参考了 [Shirone](https://github.com/LyraVoid/Shirone) 的实现，把 M3 的 HCT 色空间配色引擎搬了过来。

### 面板长这样

外观标签页里，色相滑条下面多了两组：

- **配色风格**：3×3 九宫格，每格三个小圆点是该风格的实时预览色（用 `resolveScheme` 现算的，不是写死的示意色），选中的会有背景高亮
- **配色规范**：`MD3 2021` / `M3E 2025` 两选一

九种风格分别是 TonalSpot（色调点）、Vibrant（鲜艳）、Content（内容）、Expressive（表现）、Rainbow（彩虹）、Fruit Salad（水果沙拉）、Monochrome（单色）、Neutral（中性）、Fidelity（保真）。

![外观标签页的配色风格九宫格与配色规范](https://img.lonelybing.top/file/post/mc-color-styles.png)

### 引擎部分

`src/utils/mc-utils.ts` 是核心，负责把「色相 + 明暗 + 风格 + 规范」算成一套 M3 角色色：

```typescript
export function resolveScheme(
  hue: number,
  isDark: boolean,
  style: McStyle,
  spec: McSpec,
): McScheme {
  const sourceColorHct = seedFromHue(hue);      // Hct.from(hue, 60, 50)
  const scheme = buildScheme(sourceColorHct, isDark, style, spec);
  // 约 50 个角色 → argbToHex → { primary: "#...", ... }
}
```

`buildScheme` 里就是一串 switch，按风格选 `SchemeVibrant` / `SchemeExpressive` / `SchemeFruitSalad`……这些类，规范则决定用 2021 还是 2025 的对比度曲线。

### 怎么接到本站的颜色系统上

本站的颜色全部从 `--hue` 派生，写死在 `variables.styl` 里。本尊不想把这套东西推翻重写，所以做的是**覆盖 + 回退**：

```stylus
--primary: var(--mc-primary, oklch(0.70 0.14 var(--hue)))
--selection-bg: var(--mc-secondary-container, oklch(0.85 0.06 var(--hue)))
```

JS 只在 `<html>` 上写 `--mc-*` 这两个变量，没写的时候浏览器自动用后面的 oklch 回退值。所以：

- **默认那一档（色调点 + 2025）根本不注入任何覆盖变量**，站点看着跟原来一模一样，还是本尊调了半天的青蓝色
- 只有主动切了别的风格，M3 配色才接管

这个设计很重要喵~ 不然一上线全站颜色就变了（恼）

### 明暗切换和色相联动

M3 方案是分亮暗两套算的，所以任何会影响颜色的操作之后都得重算一遍。三个入口都挂上了钩子：`setHue`、`applyThemeToDocument`、系统主题监听的 `handleSystemThemeChange`。

```typescript
// src/utils/setting-utils.ts
// 色相/明暗变化后重算 M3 配色方案（动态导入：面板关闭时 M3 引擎不进主包）
function refreshMcScheme(): void {
  void import("@utils/mc-theme-utils").then((m) => m.applyCurrentScheme());
}
```

这里用动态 `import()` 而不是顶部静态导入，是为了让面板关闭时整套 M3 引擎不进主包——不然白省了体积喵~

---

## 三、纯色背景下的六种纹理

壁纸模式选「纯色」的时候，壁纸标签页会多出一节「背景纹理」，六个选项：

![壁纸模式四选一，这里选中的是纯色背景](https://img.lonelybing.top/file/post/texture-solid-mode.png)

| 纹理 | 说明 |
| --- | --- |
| 无纹理 | 默认，干净 |
| 星芒光斑 | 四角星 + 小十字，16s 呼吸浮动 |
| 极客点阵 | 48px 网格点 + 十字 + 角标，静止 |
| 流光等高线 | 240px 波浪线，32s 横向流动 |
| 几何晶体 | 菱形 + 圆 + 三角，静止 |
| 落樱微瓣 | 樱花瓣斜向分布，28s 对角飘落 |

![六种纹理的三列选项](https://img.lonelybing.top/file/post/texture-presets.png)

### 实现方式

一层 `position: fixed` 的叠加层，`z-index: -1` 落在页面背景之上、内容之下，图案是**内联 SVG data URI 当 mask**，底色是渐变：

```css
#texture-canvas {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: var(--texture-opacity);
}

html[data-wallpaper-mode="none"][data-texture-preset="starlight"] #texture-canvas {
  background: linear-gradient(135deg, var(--texture-a) 0%, var(--texture-b) 50%, var(--texture-c) 100%);
  mask-image: url("data:image/svg+xml,%3Csvg ...%3E");
  mask-size: 140px 140px;
  mask-repeat: repeat;
  animation: texture-starlight-float 16s ease-in-out infinite;
}
```

零外部请求，图案本体是 SVG 路径，颜色靠 `--hue` 推导：

```css
--texture-a: var(--primary);
--texture-b: oklch(0.72 0.12 calc(var(--hue) + 70));
--texture-c: oklch(0.68 0.13 calc(var(--hue) - 70));
```

所以换主题色时纹理会自己跟着变，暗色模式下另有单独一档浓度（浅色 `0.4` / 暗色 `0.35`）喵~

这里踩过一个小坑：一开始照搬参考实现里的 `0.12`，结果在浅色页面上**几乎完全看不见**，本尊一度以为是 mask 没生效（悲）。原因是本站浅色底色的亮度高达 `oklch(0.95)`，纹理色大概 `0.7`，`0.12` 的不透明度混合下来只差 0.03 个亮度，肉眼根本分不出来。所以浓度这东西得按自己主题的明度算，别照抄喵~

### 面板图标要加进离线集合

六个按钮的图标一开始全渲染成了空心圆圈——因为本站 Svelte 组件用的 `Icon.svelte` 是 **@iconify 离线模式**，只认 `src/constants/icons-data.json` 里预裁剪好的那几十个图标，没网请求也不会自动兜底，找不到就画一个空心圆当占位（所以不报错，只是不显示）.

解法是从本地已装的 `@iconify-json/material-symbols` 里把需要的图标抠出来追加进 JSON：

```javascript
const src = require("./node_modules/@iconify-json/material-symbols/icons.json");
const data = JSON.parse(fs.readFileSync(p, "utf8"));
for (const w of want) {
  if (!data["material-symbols"].icons[w]) data["material-symbols"].icons[w] = src.icons[w];
}
```

顺便一提，`block-rounded` 这个名字在 material-symbols 里**根本不存在**，得用 `block`——查名字最靠谱的办法是直接翻 `node_modules/@iconify-json/*/icons.json` 的 `icons` 键喵~

### 两个小细节

**只在纯色模式生效**：选择器前置了 `html[data-wallpaper-mode="none"]`，切到横幅/全屏/覆盖透明时纹理自动让位——不然跟图片打架（笑）

**动画静止**：`prefers-reduced-motion: reduce` 下三条 keyframes 全部 `animation: none`，尊重一下晕 3D 的访客~

动画本体是平移 `mask-position`，不是移动元素，所以很轻：

```css
@keyframes texture-topography-flow {
  0%   { mask-position: 0px 0px; }
  100% { mask-position: 240px 0px; }
}
```

另外纹理预设是在主题初始化的那段内联脚本里、首帧之前恢复到 `<html data-texture-preset>` 上的，不然刷新时会看到纹理晚一步闪出来喵~

---

## 四、音乐播放器的波浪进度条

原来的进度条是一根普通横条，这次换成了会涌动的正弦波。逻辑层（Meting 歌单、歌词、播放模式）一行没动，只重画了 UI。

![播放中的波浪进度条，已播部分是波、未播部分是直线](https://img.lonelybing.top/file/post/music-player-wave.png)

### 波浪是怎么画出来的

不是 canvas，也不是音频分析——是纯 SVG path 用二次贝塞尔近似正弦曲线，算法来自 M3 Expressive 的 LinearWavy 组件：

```javascript
function _wavePath(w, amp, startX) {
  var hw = WAVE_LEN / 2, cy0 = ((WAVE_H - WAVE_STROKE) / 2) * amp;
  var d = 'M ' + _fmt(startX) + ' ' + _fmt(WAVE_H / 2);
  var ax = startX + hw, cx = startX + hw / 2;
  var k = Math.round(startX / hw), cy = k % 2 === 0 ? cy0 : -cy0;
  while (ax <= w) {
    d += ' Q ' + _fmt(cx) + ' ' + _fmt(WAVE_H / 2 + cy) + ', ' + _fmt(ax) + ' ' + _fmt(WAVE_H / 2);
    ax += hw; cx += hw; cy *= -1;
  }
  return d;
}
```

已播部分是波浪，未播部分是一根直线，接在波浪头部后面：

```javascript
var head = waveW * (lastProgress / 100);
ui.waveBar.setAttribute('d', _wavePath(Math.max(head, 0.01), amp, -WAVE_LEN));
ui.waveTrack.setAttribute('d', _linePath(head, waveW));
```

`viewBox` 宽度被设成容器的实际像素宽（`1 用户单位 = 1px`），所以 CSS 里 `translateX(-40px)` 刚好是一个波长，流动动画无缝循环喵~

### 播放 / 暂停的状态变化

振幅 `amp` 是个 0..1 的值：`1` 满波，`0` 就退化成一条直线。切换时用 rAF 补间：

```javascript
var speed = ampTarget > amp ? 1 / 0.4 : 1 / 0.5; // 升起快、落下慢
amp += (ampTarget - amp) * Math.min(1, dt * speed);
```

所以点暂停的时候波浪是**缓缓摊平**的，比瞬间消失好看很多（乐）

### 拖拽 seek

原来是 `click` 一下跳转，这次改成 pointer 事件三件套：按下即冻结波浪流动（`.wave-dragging` 把 `animation-play-state` 设成 `paused`），拖动实时重画波形预览，抬起才真正 `mgr.seek()`。加上 `ResizeObserver` 监听容器宽度，侧栏收放、窗口缩放都能自动重算 viewBox 喵~

---

## 五、踩坑：0.4.0 的 import 少了 .js 后缀

装完依赖一跑就炸了：

```
Cannot find module '...\@material\material-color-utilities\dynamiccolor\dynamic_color'
imported from ...\dynamiccolor\color_spec_2025.js
```

文件明明就在那儿（`dynamic_color.js`），一度以为是 pnpm 装坏了，重装了三遍（悲）

后来直接 grep 包内部才发现是**上游打包的 bug**——一共 10 处相对 import 漏了 `.js` 后缀：

```
dynamiccolor/color_spec_2025.js:21   from './dynamic_color'
scheme/scheme_content.js:17          from '../dynamiccolor/dynamic_scheme'
scheme/scheme_expressive.js:17       from '../dynamiccolor/dynamic_scheme'
... 另外 8 个 scheme_*.js 同上
```

浏览器打包器会帮忙补后缀，所以平时用 Vite 直接 import 不一定暴露；但 Node 的 ESM 解析器严格要求写全，Astro 服务端渲染一走 Node 就炸了。

### 解法：pnpm patch

比起塞一个解析插件，直接给包打个补丁更干净，而且能落盘进仓库、CI 上重新装依赖也照样生效：

```bash
pnpm patch @material/material-color-utilities@0.4.0
# 在提示的目录里把 10 处 import 补上 .js
sed -i "s|from './dynamic_color';|from './dynamic_color.js';|" dynamiccolor/color_spec_2025.js
sed -i "s|from '../dynamiccolor/dynamic_scheme';|from '../dynamiccolor/dynamic_scheme.js';|" scheme/scheme_*.js
pnpm patch-commit "node_modules/.pnpm_patches/@material/material-color-utilities@0.4.0"
```

产物是 `patches/@material__material-color-utilities@0.4.0.patch`，`pnpm-workspace.yaml` 里自动写入：

```yaml
patchedDependencies:
  '@material/material-color-utilities@0.4.0': patches/@material__material-color-utilities@0.4.0.patch
```

**记得把 `patches/` 目录提交进仓库**喵~ 只提交 `package.json` 是不够的，补丁文件不在的话 CI 上还是原版，（本尊差点就漏了这个喵~）

---

## 六、涉及的文件

| 文件 | 改动 |
| --- | --- |
| `src/utils/mc-utils.ts` | 新增，M3 HCT 配色引擎（风格 / 规范 → 角色色） |
| `src/utils/mc-theme-utils.ts` | 新增，`applyCurrentScheme` 写 `--mc-*` 覆盖变量 |
| `src/utils/texture-utils.ts` | 新增，纹理预设枚举与 localStorage 读写 |
| `src/styles/textures.css` | 新增，六种纹理的 mask 图案与 keyframes |
| `src/styles/variables.styl` | 六处颜色改成 `var(--mc-x, oklch(...))` 覆盖 + 回退 |
| `src/utils/setting-utils.ts` | 三处挂 `refreshMcScheme()` 钩子 |
| `src/components/controls/DisplaySettingsIntegrated.svelte` | 配色九宫格 + 规范切换 + 纹理六宫格 |
| `src/components/features/MusicPlayer.astro` | UI 重排 + 波浪 SVG 进度条 |
| `src/components/features/MusicPlayerView.astro` | 波浪渲染、振幅补间、拖拽 seek |
| `src/layouts/Layout.astro` | 挂载纹理层 + 首帧恢复脚本 |
| `src/config/displaySettingsConfig.ts` | 开启面板，新增 4 个开关 |
| `src/i18n` 6 种语言 | 各 +20 行词条 |
| `patches/…material-color-utilities@0.4.0.patch` | 上游 import 后缀修复 |

---

## 说明与反馈

- 配色引擎、波浪进度条、背景纹理三块都借鉴自 [Shirone](https://github.com/LyraVoid/Shirone)，README 中英文与关于页都写了来源和版权行，这里再正式感谢一次 [LyraVoid](https://github.com/LyraVoid) 的开源分享喵~
- 面板总开关关掉时，M3 引擎和纹理逻辑都不会进主包，构建体积不受影响
- 欢迎反馈问题与建议：**LonelyBing@outlook.com**

就这样~ 现在博客终于做到不重新构建就能换壁纸、换配色、换纹理了，本尊可以安心摸鱼了喵~
