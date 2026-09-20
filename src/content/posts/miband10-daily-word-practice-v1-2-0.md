---
title: 小米手环 10 背单词 v1.2.0
published: 2026-09-16T13:00:00+08:00
pinned: false
description: 小米手环 10 背单词小程序 v1.2.0 更新：通过数据瘦身、紧凑字符串分片、惰性加载三层优化，词库从 1.07MB 降到 382KB 且启动零对象构造；同时把硬编码的每日 50 词改为 10~200 可自定义并持久化。
image: "https://img.lonelybing.top/file/post/miband10-daily-word-practice-settings-2.png"
tags: [小米手环, Vela, 快应用, 开源项目]
category: 项目分享
slug: miband10-daily-word-practice-v1-2-0
series: "小米手环"
seriesOrder: 3
---

## 更新

[MiBand10-Daily-Word-Practice](https://github.com/Bingak/MiBand10-Daily-Word-Practice) v1.1.0 发完之后，收到两条反馈喵~

1. **内置约 6000 词时，安装到手环会导致设备重启**；
2. **每日背诵数量写死 50 个**，有同学感觉不够喵~（~~好学生~~）

这次把两个问题都处理了喵~.

开源地址：[https://github.com/Bingak/MiBand10-Daily-Word-Practice](https://github.com/Bingak/MiBand10-Daily-Word-Practice)

::github{repo="Bingak/MiBand10-Daily-Word-Practice"}

![系统设置界面：新增的每日背诵数量步进器](https://img.lonelybing.top/file/post/miband10-daily-word-practice-settings-2.png)


## 问题一：为啥 6000 词就重启了

### 现象

| 词库规模 | 安装表现 |
| --- | --- |
| 约 6000 词（`words.js` 1.07MB） | 安装后设备重启 |
| 约 500 词 | 正常安装、正常运行 |

一开始我以为是资源文件太大，手环性能有限，
把代码扔给ai，问题不在那里(***~~其实我也看不懂，反正能跑就行了喵~~~***)

### 根因：对象太多了

原来的词库长这样——一个巨无霸的对象数组字面量：

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

关键在这：模块被求值那一瞬间，JS 引擎就得把 6574 个对象外加约 2 万个字符串全部提供出来(**~~AI写的，好像就是性能不够~~**)，而且这些对象从启动一直常驻到退出. 紧接着 `filter` 和展开运算符又各复制出一份全量引用数组.

等于说，内存峰值里同时存着 3~4 份「全量词表规模」的数据，直接把快应用的堆上限给击穿了 → 引擎 OOM → 固件 watchdog 把设备复位了.

500 词能装、6000 词就重启，这也顺带解释了一个挺反直觉的事儿：为啥减词数有用，但「同样词数换个格式」可能也有用——决定死活的其实是**峰值对象数**，不是磁盘上那几个字节喵~

## 优化方案：

### 第一层：数据瘦身

可以通过tools/build_words.py` 做预处理，占用下降64%：

- **精简释义**：原释义把每个义项的所有搭配短语都塞进去了（比如 `feel terrible 感觉很难受 | terrible mistake 严重的错误`）
- **去重**：源数据里有 **765 条完全重复的词语**去重后唯一单词数是 **5809**

```text
原始文本 : 1.07 MB
精简释义 : 698.5 KB（−34.6%）
再去重后 : 382 KB  （−64.3%）
```

### 第二层：从对象数组改成紧凑字符串

这一步是最核心的. 分片文件里不再有任何对象，就剩一行一个词条的纯字符串：

```js
// src/common/words/part_00.js（新版）
export default "abandon\u0001[əˈbændən]\u0001v. 放弃;抛弃\nabandoned\u0001...";
```

用 `\u0001` 当字段分隔符、`\n` 当词条分隔符. 好处在于**模块顶层只有字符串字面量，求值时零对象构造**——启动时 JS 引擎只要攥着 30 个字符串，而不是 5809 个对象.

5809 个词按每片 200 条切成 **30 个分片**（`part_00.js` ~ `part_29.js`），再附带一个记录元信息的 `index.js`.

### 第三层：惰性分片加载

又加了 `src/common/wordLoader.js`，改成只在抽词时按需解析：

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

`pickDaily(count, excludeMap)` 的策略是：随机挑 6~20 个不重复分片 → 片内 Fisher-Yates 打乱 → 按配额取词 → 取满即停.

为啥要这么绕一圈？因为要是只从一片里取，50 个词全存在同一个字母区间里，今天抽到的可能全是 `a` 开头. 多分片配额抽样既保住了随机性，又让**内存峰值跟访问的分片数量脱钩**（每片解析完立刻释放）. 实测抽 50 词能覆盖 12 种不同首字母喵~

`learn.ux` 里那段 `filter` + `[...]` + `shuffle` 我也一并删了，「熟知」词的排除改成抽样时逐条跳过，不再先建个全量池.

## 顺手挖出俩数据 Bug喵~

跑构建脚本的时候顺带看了看数据，额，词库就有问题：

- **320 个单词的释义一直都是空的**：源数据里 318 条键名写成了大写 `Chinese`（不是 `chinese`）、1 条写成了 `chromatic`，还有 2 条音标键拼成了 `photetic` / `photnetic`. 代码里按 `chinese` 取值自然取不到——也就是说这 320 个词在 App 里**只显示单词、不显示中文**
- **765 条完全重复**：6574 条记录里唯一单词只有 5809 个

构建脚本里我加了键名容错表（`Chinese` / `CHINESE` / `chromatic` 这些一律归一）和按 `english` 去重（保留释义最完整的那条），这两个bug在 v1.2.0 的词库里都修复了.

## 改动二：每日背诵数量能修改了喵~

原来那个 50 是硬编码在抽词逻辑里的. 现在改成从 `storage` 读，设置页也给了入口.

### 设置页新增卡片喵~

`settings.ux` 里加了一张「每日背诵数量」卡片：`[－] 50 [＋]` 步进器（步长 10），点中间的数字还会弹出常用档位（20 / 50 / 100 / 200）.

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

校验我做了三层：`normalizeDaily`（非法值回落 50、越界钳到 10~200）、步进到边界时弹 toast、读取时顺手把历史脏数据修回合法范围.

### 生效时机喵~

`learn.ux` 现在从 `daily_word_count` 读数量，替代硬编码，会话里再记一份 `dailyCount` 用来做变更检测：

- **当天一个词都还没看过就改设置** → 立即重抽，马上生效
- **当天已经开始背了再改** → 次日生效，不打断当前进度

另外我把当日进度的 `storage` 写入改成了 **400ms 节流合并**（页面销毁时强制落盘）. 词量拉到 200 的时候，每次点击都全量写一遍，开销还是挺可观的.

## 优化前后对比喵~

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

## 现在到底能装多少词喵~

基于 5809 词的实测数据（常驻 382KB 字符串、抽词峰值几十 KB、耗时 <7ms）线性外推：

| 词库规模 | 预估常驻体积 | 建议 |
| --- | --- | --- |
| 5809 词（当前） | 382 KB | 实测通过，余量充足 |
| 8000 ~ 10000 词 | 约 530 ~ 660 KB | 安全 |
| 15000 词 | 约 1 MB | 仍可，建议实机验证 |
| 20000 词以上 | 1.3 MB+ | 受 rpk 包体与安装期解压内存限制，不建议 |

要还是重启，可以用 `--limit` 二分定位阈值：`python tools/build_words.py --limit 3000`. 构建脚本还支持 `--per-part`（每片词条数，默认 200）和 `--keep-detail`（保留完整释义，不做精简）.

## 升级与构建喵~

```bash
# 1. 拉取最新代码
git pull

# 2.（可选）重新生成分片词库
python tools/build_words.py --per-part 200

# 3. 用 AIoT IDE / AIoT-toolkit 编译生成 rpk
# 4. 通过自定义表盘工具安装到手环
```

从旧版本升上已有的学习进度和「熟知」词表都存在设备本地 `storage` 里，不受词库格式变更影响，不用清空数据

## 说明与反馈喵~


数据体检脚本我也留在仓库里了（`tools/build_words.py`），换自己的词表时直接跑一遍就能查重、查空释义.

想换成四六级 / 考研 / 雅思词表，替换 `data/words.source.js` 再重新构建就行.

有问题或建议欢迎来聊：**LonelyBing@outlook.com**

觉得有用的话，可以去 [爱发电](https://ifdian.net/a/LonelyBing) 支持一下~

希望大家都能取得好成绩！！喵~
