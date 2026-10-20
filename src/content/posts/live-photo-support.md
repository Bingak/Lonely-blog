---
title: 让博客支持动态照片
published: 2026-10-20T17:50:00+08:00
updated: 2026-10-20 17:54:00
description: "从 ImgHub 原图上传、InkPost / Ink Studio 粘贴识别，到博客里的单次播放和渐变切换，把动态照片接进静态博客喵~"
image: "https://img.lonelybing.top/file/ScreenShot_2026-10-20_175230_305.png"
tags: [博客, 动态照片, 图床, 记录]
category: 博客搭建
pinned: false
slug: live-photo-support-2026-10-20
series: 博客
---

以前想在博客里放一张动态照片，要先把封面和动态视频分别上传，再把两个地址填进编辑器。只要漏掉一个链接，最后就只剩一张普通图片。这次把图床、在线编辑器和博客展示串在一起，写完一行就能发布动态照片喵~

---

## 一、动态照片也要先保护原文件

动态照片通常由一张静态封面和一段短视频组成。苹果 Live Photo、小米动态照片以及其他安卓设备的动态照片，上传后都需要能对应到这两部分，博客才能在静态封面和动态画面之间切换。

图床用的是 CloudFlare-ImgBed，文件存储在 Telegram。普通图片上传时的压缩处理可能会破坏动态照片的视频部分，所以动态照片走原文件上传流程，封面保持原样不做压缩，动态视频则在浏览器里重新编码来减小体积（浏览器不支持或压缩后体积没有明显下降时，会自动回退到原视频）。上传完成后，图床会提供封面和动态视频的链接喵~

---

## 二、一行复制，粘贴后自动识别

上传面板新增了「动态照片」模式。上传完成后可以一键复制一组地址，中间用 `|` 分隔：

```text
https://img.lonelybing.top/file/1792468720028.jpg|https://img.lonelybing.top/file/1792468720028.motion.mp4
```

把这一行直接粘贴进 InkPost / Ink Studio，编辑器会识别封面和视频地址，并转换成博客能读的动态照片语法，不用在两个输入框之间来回复制了喵~

相册也能使用同样的链接对；静态博客只引用图床上的 URL，不要求把照片文件放进博客仓库。原有普通图片和视频上传流程保持不变。

---

## 三、默认是封面，点击后只播放一次

页面初次加载时只显示静态封面，不会自动播放视频。点击封面上的「动态照片」按钮后，视频会在封面原有的尺寸范围内播放一次；播放结束后回到封面，不会循环。

视频会按比例完整放进封面区域。视频与封面的宽高比不同时，可能会出现留边，但不会把视频放大到撑开文章版面，也不会为了铺满区域而裁切画面。播放开始时封面淡出、视频淡入；结束时再淡回封面，切换会柔和一些喵~

---

## 四、从上传到发布

整个流程现在是这样的：

1. 在 ImgHub 选择「动态照片」上传模式，上传照片素材并复制封面和视频链接
2. 在 InkPost / Ink Studio 中把链接对粘贴到一行，编辑器自动识别
3. 发布文章、动态或相册内容，博客通过图床链接加载封面和视频
4. 读者看到静态封面，点击后播放一次，结束后回到封面

这次调整也修好了现有动态照片展示的封面引用：页面用图片作为静态封面，用对应的 MP4 作为动态部分。静态站点不需要保存或处理这些媒体文件，内容仓库里保留的只是链接喵~

---

## 五、关键代码实现

博客端把动态照片拆成「封面图片 + 视频 URL」处理。文章或动态正文沿用 Markdown 图片语法，只需在图片标题里标记视频地址：

```markdown
![](https://img.lonelybing.top/file/1792468720028.jpg "live-photo=https://img.lonelybing.top/file/1792468720028.motion.mp4")
```

`src/plugins/rehype-live-photo.mjs` 在 Markdown 转 HTML 时识别这个标记，把原图片包进自定义的 `<live-photo>` 元素。封面仍是普通 `<img>`，视频地址放在 `data-video-url` 上：

```js
const match = title.match(/^live-photo[=:](https?:\/\/\S+)$/i);
if (match && parent?.children) {
  const image = { ...node, properties: { ...properties } };
  delete image.properties.title;
  parent.children[parent.children.indexOf(node)] = {
    type: "element",
    tagName: "live-photo",
    properties: { dataVideoUrl: match[1] },
    children: [image],
  };
}
```

`src/utils/live-photo.ts` 注册自定义元素。用户点击按钮时才创建并播放 `<video>`；视频结束或加载失败会移除播放层，按钮恢复可用。视频没有设置循环：

```ts
const video = document.createElement("video");
video.src = this.dataset.videoUrl || "";
video.poster = image.currentSrc || image.src;
video.playsInline = true;
video.preload = "metadata";

video.addEventListener("playing", () => {
  requestAnimationFrame(() => this.classList.add("is-playing"));
}, { once: true });
video.addEventListener("ended", finish);
video.addEventListener("error", finish);
this.insertBefore(video, playButton);
void video.play();
```

封面图片保留布局尺寸，视频绝对定位覆盖在封面上，`object-fit: contain` 让不同宽高比的视频完整显示；播放状态通过透明度过渡切换：

```css
live-photo.live-photo > img {
  position: relative;
  transition: opacity 280ms ease;
}

live-photo.live-photo > video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 280ms ease;
}

live-photo.live-photo.is-playing > img { opacity: 0; }
live-photo.live-photo.is-playing > video { opacity: 1; }
```

相册使用 `src/utils/gallery-utils.ts` 解析图床链接对。它会校验封面是图片地址、动态部分是浏览器可播放的视频地址，再把它们作为一个相册项目传给展示组件：

```ts
const parts = src.split("|").map((part) => part.trim());
if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
try {
  const cover = new URL(parts[0]);
  const video = new URL(parts[1]);
  if (!/^https?:$/.test(cover.protocol) || !/^https?:$/.test(video.protocol)) return null;
  if (!IMAGE_RE.test(cover.pathname) || !VIDEO_RE.test(video.pathname)) return null;
} catch {
  return null;
}
return { cover: parts[0], video: parts[1] };
```

上传端和博客展示端各司其职：ImgHub 负责原文件上传并生成链接，博客只保存链接和播放逻辑，因此静态站点构建不需要读取或托管动态照片文件喵~

---
## 最后

动态照片从手机里的一个小片段，变成了可以直接写进博客的一行内容。上传时保留原文件，编辑时少复制一次，浏览时也不会让视频突然撑满整篇文章。

以后发相册或者记录日常时，可以把那一瞬间的动作也一起留下来了喵~



