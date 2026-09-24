# 关于我 / About Me

你好喵~ 我是 **LonelyBing**，一个在数字世界里默默无闻的一片叶子、普普通通的大学生~ 欢迎来到我的小窝.

## 🛠️ 关于本站

本站使用 **Astro** 框架构建，主题采用的是 [Firefly](https://github.com/CuteLeaf/Firefly)（V6.16.8）——一款基于 [Fuwari](https://github.com/saicaca/fuwari) 二次开发的清新美观且现代化个人博客主题模板，在此感谢 [CuteLeaf](https://github.com/CuteLeaf) 与 [saicaca](https://github.com/saicaca) 的开源贡献.

在原版主题的基础上，我按自己的喜好做了一些魔改（大部分折腾过程都写成博客了，感兴趣的可以翻翻），主要改动如下喵~

### ✨ 导航栏与交互

- **胶囊导航栏**：菜单收进胶囊容器里，悬停时有**滑动指示器**——按钮背景会平滑地跟着鼠标滑动，而不是每个按钮各自闪一下.
- **鼠标聚光灯**：导航栏有一层跟随鼠标移动的高光，像手电筒扫过去一样.
- **圆形角过渡动画**：站名和按钮平时是圆角，悬停时会平滑过渡成胶囊形，点下去还有按压反馈.
- **站名悬停资料卡**：把鼠标放到左上角站名上，会弹出一张小卡片——头像、昵称、签名、社交链接，加上**当年的发文贡献热力图**（类似 GitHub 的小绿格，按月/周统计发文量），以及**建站以来的实时运行时间**（年/月/日/时/分/秒，每秒刷新）. 点击卡片里的头像区域还能跳回本页喵~

### 🎨 主题色与视觉

- **全局主题色系统**：基于 `oklch()` 色空间，通过一个 `--hue` 变量控制全站配色——改一个数字就能切换整个站点的色调（本站当前为青蓝色 hue 200）.
- **文章卡片蓝色细边框**：首页文章卡片带一圈 1.5px 的青蓝色边框，暗色模式下自动调整亮度，让卡片在壁纸上更有层次感.
- **显示设置面板**：点导航栏的调色盘按钮会弹出浮层面板，可以在**不刷新、不重新构建**的情况下切换壁纸四模式（纯色 / 横幅 / 全屏 / 覆盖透明）、全屏布局、文章列表的列表/网格排布、主题色相、卡片样式与樱花特效. 偏好全部存在 localStorage 里，刷新也不会丢喵~
- **Material 3 动态配色**：面板里能切 9 种配色风格（TonalSpot / Vibrant / Content / Expressive / Rainbow / Fruit Salad / Monochrome / Neutral / Fidelity）和 2 种配色规范（MD3 2021 / M3E 2025），背后是 HCT 色空间引擎实时重算主色与次色容器色. 默认那一档**不会注入任何覆盖变量**，所以本站看着还是原生 oklch 的味道——只有你主动切了才会换上 M3 配色（这部分配色引擎的实现借鉴自 [Shirone](https://github.com/LyraVoid/Shirone)，感谢 [LyraVoid](https://github.com/LyraVoid) 的开源分享喵~）.
- **背景纹理**：纯色背景模式下可以多叠一层装饰纹理，六种可选——无纹理、星芒光斑、极客点阵、流光等高线、几何晶体、落樱微瓣. 实现是一层 `position: fixed` 的 SVG mask 叠加层，取色全部由 `--hue` 推导，所以换主题色时纹理会自己跟着变；星芒会呼吸浮动、等高线会横向流光、樱花会斜着飘落，`prefers-reduced-motion` 下自动静止. 切到壁纸模式时纹理会自动让位（不然跟图片打架）. 图案与动画同样借鉴自 [Shirone](https://github.com/LyraVoid/Shirone).

### 🎵 音乐播放器

- **波浪进度条**：播放时是一条涌动的正弦波，暂停时会缓缓落成一条直线（升起快、落下慢，500ms 缓动），支持点击和**按住拖动**实时预览进度，颜色跟着主题色走. 波形路径用的是 M3 Expressive LinearWavy 的算法，借鉴自 [Shirone](https://github.com/LyraVoid/Shirone) 的 `wavy-progress` 实现喵~
- 歌单、歌词、播放模式等逻辑仍是本站原有的 Meting 方案，这次只重画了 UI 层.

### 📊 访问统计

- **不蒜子（Busuanzi）计数**：页脚展示全站总访问量（PV）与访客人数（UV），文章页展示单篇阅读量，零后端、零配置.
- **建站存活计时**：页脚的「本站已存活 X 天 X 小时 X 分 X 秒」从 2026.9.12 开始计数，每秒刷新一次.

### 🧩 页面功能

- **项目页评论区**：项目展示页接入了评论系统，每个项目可以在 frontmatter 里用 `comment` 字段单独开关.
- **全屏随机壁纸 + 名言**：全屏壁纸模式下每次刷新随机换图，页面底部还会附带一句随机中文名言.
- **在线写作**：配置了 `.pages.yml`（Pages CMS），可以直接在 GitHub 网页端写文章、发动态，不用本地跑构建.
- **更新日志页**：客户端拉取 GitHub 仓库的 commit 记录，按类型（新功能/修复/优化等）分类筛选与分页，支持中英文 commit message 宽松匹配，无需重新构建即可看到最新改动. 配置 GitHub Token 后 API 限额从 60 次/小时提升到 5000 次/小时.
- **友链自动申请**：友链页顶部有一个「申请友链」按钮，点开填四项（站点名称 / 链接 / 头像 / 描述），通过 **Cloudflare Turnstile** 人机验证后，`worker/index.js` 的 `POST /api/friend-apply` 会自动在仓库里新建分支、把条目追加进 `src/data/friends.json` 并开一个 PR，本尊点合并即上线，全程不用手动改一行代码喵~ 新条目权重固定给 0 排在末尾，同一站点重复提交会被 409 挡掉，内网与非 http(s) 链接一律拒收.

### ⚙️ 个性化配置

- 相册、打赏页、看板娘、评论区等均替换为自己的内容与账号，站点信息（标题、头像、社交链接等）全部按本站实际配置.

——再次感谢开源社区的分享精神. 如果你也想用这套主题，欢迎从下面的原仓库获取：

- **⭐ Firefly 开源地址：[https://github.com/CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly)**
- **⭐ Fuwari 开源地址：[https://github.com/saicaca/fuwari](https://github.com/saicaca/fuwari)**
- **📝 Firefly 使用文档：[https://docs-firefly.cuteleaf.cn](https://docs-firefly.cuteleaf.cn/)**
- **🎨 Shirone 开源地址（配色引擎与波浪进度条的来源）：[https://github.com/LyraVoid/Shirone](https://github.com/LyraVoid/Shirone)**

::github{repo="CuteLeaf/Firefly"}

::github{repo="saicaca/fuwari"}

---

*感谢你的来访！希望在这里能找到对你有用的内容喵~*
