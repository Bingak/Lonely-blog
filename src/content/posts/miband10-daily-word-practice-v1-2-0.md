---
title: 小米手环 10 背单词 v1.2.0
published: 2026-09-15T13:00:00+08:00
pinned: false
description: 小米手环 10 背单词小程序 v1.2.0 更新：通过数据瘦身、紧凑字符串分片、惰性加载三层优化，词库从 1.07MB 降到 382KB 且启动零对象构造；同时把硬编码的每日 50 词改为 10~200 可自定义并持久化。
image: "./images/miband10-daily-word-practice-settings-2.png"
tags: [小米手环, Vela, 快应用, 性能优化, 背单词, 开源项目]
category: 项目分享
slug: miband10-daily-word-practice-v1-2-0
series: "小米手环"
seriesOrder: 3
---

## 🌟 更新概述

[MiBand10-Daily-Word-Practice](https://github.com/Bingak/MiBand10-Daily-Word-Practice) 在 v1.1.0 发布后收到两个很实际的反馈：

1. **内置约 6000 词时，安装到手环会导致设备重启**；把词表砍到 500 词才装得上
2. **每日背诵数量写死 50 个**，想多背或少背都没地方改

v1.2.0 把这两个问题都处理了。有意思的是，第一个问题的根因和「文件体积」关系不大——真正杀死设备的是**一次性创建的 JS 对象数量**。

**⭐ 开源地址：[https://github.com/Bingak/MiBand10-Daily-Word-Practice](https://github.com/Bingak/MiBand10-Daily-Word-Practice)**

::github{repo="Bingak/MiBand10-Daily-Word-Practice"}

![系统设置界面：新增的每日背诵数量步进器](images/miband10-daily-word-practice-settings-2.png)

> [!NOTE]
> 本文记录的是一次完整的排查与优化过程。如果你的 Vela 快应用也遇到「装到设备上就重启」，排查思路可以直接复用。

## 🔍 问题一：为什么 6000 词会让手环重启

### 现象

| 词库规模 | 安装表现 |
| --- | --- |
| 约 6000 词（`words.js` 1.07MB） | 安装后设备重启 |
| 约 500 词 | 正常安装、正常运行 |

看起来很像「资源文件太大」，很容易往「包体超限」的方向去猜。但把代码摊开看，问题其实在别处。

### 根因：对象太多

原来的词库长这样——一个巨大的对象数组字面量：

```js
// src/common/words.js（旧版，1.07MB，6574 条）
export const words = [
  { "english": "terrible", "phonetic": "[ˈterəbl]", "chinese": "a. 可怕的 | 糟糕的……" },
  { "english": "abandon",  "phonetic": "[əˈbændən]", "chinese": "v. 放弃 | 抛弃……" },
  // ... 后面还有 6572 条
]
```

而 `learn.ux` 里是**静态 import**：

```js
import { words } from '../../common/words.js';

// 页面初始化时
const familiarSet = new Set(userFamiliar);
const learnPool = words.filter(w => !familiarSet.has(w.english));  // 全表复制一份
const shuffled = this.shuffle([...learnPool]);                     // 再复制一份
```

关键在于：**模块被求值的那一刻，JS 引擎就要把 6574 个对象 + 约 2 万个字符串全部构造出来**，而且这些对象从启动到退出一直常驻。紧接着 `filter` 和展开运算符又各克隆出一份全量引用数组。

于是内存峰值里同时躺着 3~4 份「全量词表规模」的数据，直接击穿手环快应用的堆上限 → 引擎 OOM → 固件 watchdog 复位设备。

**500 词能装、6000 词重启，正好卡在这个阈值上。** 这也解释了一个反直觉的点：为什么减少词数有效，但「同样的词数换个格式」可能也有效——决定因素是**峰值对象数**，而不是磁盘上的字节数。

## 🛠 优化方案：三层瘦身

### 第一层：数据瘦身

写了 `tools/build_words.py` 做预处理，两刀下去砍掉 64%：

- **精简释义**：原释义把每个义项的所有搭配短语都塞进去了（如 `feel terrible 感觉很难受 | terrible mistake 严重的错误`）。手环 212px 宽的屏幕根本显示不下，保留词性 + 核心义项即可
- **去重**：源数据里有 **765 条完全重复**的词（详见后文），去重后唯一单词数为 **5809**

```text
原始文本 : 1.07 MB
精简释义 : 698.5 KB（−34.6%）
再去重后 : 382 KB  （−64.3%）
```

### 第二层：从对象数组改成紧凑字符串

这是最核心的一步。分片文件里不再有任何对象，只有一行一个词条的纯字符串：

```js
// src/common/words/part_00.js（新版）
export default "abandon\u0001[əˈbændən]\u0001v. 放弃;抛弃\nabandoned\u0001...";
```

用 `\u0001` 作字段分隔符、`\n` 作词条分隔符。这样做的好处是**模块顶层只有字符串字面量，求值时零对象构造**——启动时 JS 引擎只需要持有 30 个字符串，而不是 5809 个对象。

5809 个词按每片 200 条切成 **30 个分片**（`part_00.js` ~ `part_29.js`），外加一个记录元信息的 `index.js`。

### 第三层：惰性分片加载

新增 `src/common/wordLoader.js`，只在抽词时按需解析：

```js
import RAW_PARTS, { META } from './words/index.js';
const FIELD_SEP = '\u0001';

function collectFromPart(partIndex, limit, exclude, pickedMap, out) {
  if (limit <= 0) return;
  const raw = RAW_PARTS[partIndex];
  if (!raw) return;

  const lines = raw.split('\n');          // 只 split 命中的这一片
  const order = shuffleIdx(lines.length);

  for (let j = 0; j < order.length && limit > 0; j++) {
    const line = lines[order[j]];
    if (!line) continue;
    const eng = line.substring(0, line.indexOf(FIELD_SEP));
    // 批次内去重 + 跳过已标记「熟知」的词
    if (pickedMap[eng] || exclude[eng]) continue;
    pickedMap[eng] = true;
    out.push(parseLine(line));
    limit--;
  }

  // 主动释放这一片的解析结果，峰值内存始终只有 1 个分片
  lines.length = 0;
  order.length = 0;
}
```

`pickDaily(count, excludeMap)` 的策略是：随机挑 6~20 个不重复分片 → 片内 Fisher-Yates 打乱 → 按配额取词 → 取满即停。

这么设计是有理由的：如果只从一个分片取，那 50 个词会全挤在同一个字母区间里，今天抽到的可能全是 `a` 开头。多分片配额抽样既保证了随机性，又让**内存峰值与访问的分片数量无关**（每片解析完立即释放）。实测抽 50 词覆盖 12 种不同首字母。

`learn.ux` 里那段 `filter` + `[...]` + `shuffle` 也一并删掉了，「熟知」词的排除改在抽样时逐条跳过，不再先建全量池。

> [!TIP]
> 源词表已从 `src/common/words.js` 移到 `data/words.source.js`，**不再参与 rpk 打包**。如果你是自己构建，务必确认 `src/` 下没有残留的旧词库，否则优化等于白做。

## 🐛 顺手挖出的两个数据 Bug

跑构建脚本时顺带做了数据体检，结果发现词库本身就有问题：

- **320 个单词的释义一直是空的**：源数据里 318 条键名写成了大写 `Chinese`（而非 `chinese`）、1 条写成了 `chromatic`，还有 2 条音标键拼成了 `photetic` / `photnetic`。代码里按 `chinese` 取值自然取不到——也就是说这 320 个词在 App 里**只显示单词不显示中文**
- **765 条完全重复**：6574 条记录里唯一单词只有 5809 个

构建脚本里加了键名容错表（`Chinese` / `CHINESE` / `chromatic` 等一律归一）与按 `english` 去重（保留释义最完整的那条），这两个问题都已在 v1.2.0 的词库中修复。

## ⚙️ 问题二：每日背诵数量可自定义

原来的 50 是硬编码在抽词逻辑里的。现在改成从 `storage` 读取，并在设置页提供入口。

### 设置页新增卡片

`settings.ux` 里加了一张「每日背诵数量」卡片：`[－] 50 [＋]` 步进器（步长 10），点中间的数字还会弹出常用档位（20 / 50 / 100 / 200）。

```js
const KEY_DAILY = 'daily_word_count';
const DAILY_DEFAULT = 50;
const DAILY_MIN = 10;
const DAILY_MAX = 200;
const DAILY_PRESETS = [20, 50, 100, 200];

const normalizeDaily = (val) => {
  const n = parseInt(val, 10);
  if (isNaN(n)) return DAILY_DEFAULT;   // 非法值回落默认
  if (n < DAILY_MIN) return DAILY_MIN;  // 越界钳制
  if (n > DAILY_MAX) return DAILY_MAX;
  return n;
};

changeDaily(delta) {
  let next = this.dailyCount + delta;
  if (next < DAILY_MIN) {
    next = DAILY_MIN;
    prompt.showToast({ message: `最少 ${DAILY_MIN} 个` });
  } else if (next > DAILY_MAX) {
    next = DAILY_MAX;
    prompt.showToast({ message: `最多 ${DAILY_MAX} 个` });
  }
  if (next === this.dailyCount) return;
  this.dailyCount = next;
  this.persistDaily(next);
}
```

校验做了三层：`normalizeDaily` 兜底（非法值回落 50、越界钳制到 10~200）、步进到边界时弹 toast 提示、读取时会把历史脏数据顺手修正回合法范围。

### 生效时机

`learn.ux` 现在从 `daily_word_count` 读取数量替代硬编码，并在会话里记一份 `dailyCount` 用于变更检测：

- **当天一个词都还没看过就改设置** → 立即重抽，马上生效
- **当天已经开始背了再改** → 次日生效，不打断当前进度

另外把当日进度的 `storage` 写入改成了 **400ms 节流合并**（页面销毁时强制落盘）。词量拉到 200 时，每次点击都全量写一遍的开销还是很可观的。

## 📊 优化前后对比

| 指标 | v1.1.0 | v1.2.0 |
| --- | --- | --- |
| 词库文本体积 | 1.07 MB | **382 KB**（−64.3%） |
| 唯一单词数 | 5809（6574 条含重复） | **5809** |
| 启动时常驻对象 | 6574 个对象 + 约 2 万字符串 | **30 个字符串** |
| 抽词峰值内存 | 3~4 份全量引用数组 | **约 1 个分片（200 条）** |
| 抽 50 词耗时 | — | **< 7 ms** |
| 释义为空的词 | 320 个 | **0** |
| 每日背诵数量 | 固定 50 | **10 ~ 200 可配** |
| 安装表现 | 设备重启 | **正常** |

## 🔢 现在能装多少词

基于 5809 词的实测数据（常驻 382KB 字符串、抽词峰值几十 KB、耗时 <7ms）线性外推：

| 词库规模 | 预估常驻体积 | 建议 |
| --- | --- | --- |
| 5809 词（当前） | 382 KB | 实测通过，余量充足 |
| 8000 ~ 10000 词 | 约 530 ~ 660 KB | 安全 |
| 15000 词 | 约 1 MB | 仍可，建议实机验证 |
| 20000 词以上 | 1.3 MB+ | 受 rpk 包体与安装期解压内存限制，不建议 |

> [!TIP]
> 如果你的固件版本仍然重启，可以用 `--limit` 二分定位阈值：
> `python tools/build_words.py --limit 3000`
> 构建脚本还支持 `--per-part`（每片词条数，默认 200）与 `--keep-detail`（保留完整释义，不做精简）。

## 📖 升级与构建

```bash
# 1. 拉取最新代码
git pull

# 2.（可选）重新生成分片词库
python tools/build_words.py --per-part 200

# 3. 用 AIoT IDE / AIoT-toolkit 编译生成 rpk
# 4. 通过自定义表盘工具安装到手环
```

> [!NOTE]
> 从旧版本升级时，已有的学习进度与「熟知」词表保存在设备本地 `storage` 中，不受词库格式变更影响，无需清空数据。

## 💬 说明与反馈

- 这次优化的核心结论其实很朴素：**在内存受限的嵌入式设备上，决定生死的是「峰值对象数」而不是「文件字节数」**。同样的 5809 个词，换个表示方式就能从「必崩」变成「毫无压力」
- 数据体检脚本也留在仓库里了（`tools/build_words.py`），换自己的词表时可以直接跑一遍查重、查空释义
- 想换成四六级 / 考研 / 雅思词表，替换 `data/words.source.js` 后重新构建即可
- 欢迎反馈问题与建议：**LonelyBing@outlook.com**
- 觉得有用的话，可以去 [爱发电](https://ifdian.net/a/LonelyBing) 支持一下

**希望大家都能取得好成绩！！**
