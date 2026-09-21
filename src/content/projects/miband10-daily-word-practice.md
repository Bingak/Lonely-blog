---
title: "小米手环 10 背单词小程序"
slug: miband10-daily-word-practice
published: 2026-09-15
draft: false
order: 92
description: "小米手环 10 标准版上的每日背单词小程序：从 9 Pro 移植适配 212×520 胶囊窄屏，内置 6200 高中词汇，四档记忆状态与智能抽词重复机制。"
image: "https://img.lonelybing.top/file/post/miband10-daily-word-practice-menu.png"
status: "published"
tags:
  - 小米手环
  - Vela
  - 快应用
  - 背单词
  - 开源项目
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Bingak/MiBand10-Daily-Word-Practice"
  - label: "开发文档"
    icon: "material-symbols:menu-book"
    value: "https://iot.mi.com/vela/quickapp/zh/guide/"
  - label: "爱发电"
    icon: "fa7-solid:heart"
    value: "https://ifdian.net/a/LonelyBing"
lang: "zh_CN"
---

## 项目概述

MiBand10-Daily-Word-Practice 是个跑在小米手环 10 标准版上的每日背单词小程序. 
它本来是 9 Pro 版的 [MiBand-Daily-Word-Practice](https://github.com/Bingak/MiBand-Daily-Word-Practice) 往手环 10 上移植的适配版，
功能和实现方式跟 9 Pro 那版一模一样喵~

尝试把「墨墨背单词」最核心的那点思路——让记忆越模糊的单词出现得越频繁——塞进手环里，（~~肯定有不少bug~~）. *~~高中生福利喵~~~*

开源地址：[https://github.com/Bingak/MiBand10-Daily-Word-Practice](https://github.com/Bingak/MiBand10-Daily-Word-Practice)

开发文档 / 使用说明：[Vela 快应用开发指南](https://iot.mi.com/vela/quickapp/zh/guide/)

爱发电：[https://ifdian.net/a/LonelyBing](https://ifdian.net/a/LonelyBing)

::github{repo="Bingak/MiBand10-Daily-Word-Practice"}

![每日记单词主菜单](https://img.lonelybing.top/file/post/miband10-daily-word-practice-menu.png)

内置词表塞了不少单词汉译和短语，词库文件差不多有 ==6MB== 大. 手环空间不足的话，建议先腾点地方再装.

## 从 9 Pro 到手环 10：移植适配

手环 9 Pro 的屏是 336×480，手环 10 标准版换成了 212×520 的胶囊形窄屏（DPR 2，326 PPI）

- 改动：`manifest.json` 沿用 `designWidth: "device-width"`（px 与物理像素 1:1 映射）、`minPlatformVersion: 1200`、`deviceTypeList: ["watch"]`，手环 10兼容
- 样式重构：移除 336px 固定容器宽度，重排头部时间的绝对定位，字号、按钮、卡片、圆角等尺寸整体按窄屏重调；5 个主菜单按钮在 520px 高度内完整展示，无需滚动
- 逻辑无改动：所用 API（router / storage / prompt / brightness / configuration）与组件（div / text / scroll / switch / input）都是 Vela Level 1 基础能力，两代设备通用

## 技术架构

- 运行平台：小米手环 10 标准版（212×520，DPR 2），基于小米 Vela 快应用（Quick App）框架
- 技术栈：JavaScript 编写业务逻辑，界面使用类 HTML / CSS 的组件描述，整体零后端依赖
- 开发工具：使用 AIoT IDE / AIoT-toolkit 2.0 编译
- 数据存储：词库与学习进度全部保存在设备本地，背诵过程无需联网

## 核心功能

### 四档记忆状态

每个单词被复习的时候，你可以给它四种反馈. 你选哪一档，直接决定它以后出场的频率：

| 状态 | 颜色 | 含义 | 后续行为 |
| --- | --- | --- | --- |
| 熟知 | 🟢 绿色 | 这个词已经是我兄弟了 | **今后练习中不再出现** |
| 认识 | ⚪ 白色 | 见过面，不算熟 | 计入待练习，当天重复 **3 次** |
| 模糊 | 🟡 黄色 | 似曾相识，但不确定 | 计入待练习，当天重复 **5 次** |
| 忘记 | 🔴 红色 | 对不起，我们第一次见 | 计入待练习，当天重复 **7 次** |

![单词学习界面：单词卡片与四档记忆按钮](https://img.lonelybing.top/file/post/miband10-daily-word-practice-learn.png)

### 每日抽词与间隔重复

- 除「熟知」外的所有单词，统一归入 **「待练习单词」**
- 每天从待练习单词内**随机抽取 50 个**单词作为当天的任务
- 当天反复出现的次数按记忆状态区分（认识 3 次 / 模糊 5 次 / 忘记 7 次），越生疏的单词被出现的次数越多
- 一旦标记为熟知，该词便彻底退出练习队列，不再浪费时间

### 复习与学习统计

除了当天的任务，还提供复习功能，可以回看近 7 日学习统计. *数据不会骗人*——坚持没坚持，一眼就能看出来喵~（悲）.

![数据统计界面](https://img.lonelybing.top/file/post/miband10-daily-word-practice-stats.png)

### 设置与关于

设置页有屏幕常亮开关和一键清空数据；关于页展示作者跟版本信息. 当前版本 v1.1.0，适配机型「小米手环 10 标准版」.

![系统设置界面](https://img.lonelybing.top/file/post/miband10-daily-word-practice-settings-2.png)

![相关信息界面](https://img.lonelybing.top/file/post/miband10-daily-word-practice-about.png)

### 简洁的界面

UI 走极简路线，理由很诚实：作者懒得加喵~

## 词库与数据格式

小程序内置高中 6200 词汇表（默认词库）. 词库文件 `words.js` 里每项都是三段式结构：

```js
{
  "english": "terrible",
  "phonetic": "[ˈterəbl]",
  "chinese": "a. 可怕的 | 糟糕的，差劲的 | feel terrible 感觉很难受 | terrible mistake 严重的错误"
}
```

| 字段 | 说明 |
| --- | --- |
| `english` | 英文单词 |
| `phonetic` | 音标 |
| `chinese` | 释义，多个义项与短语之间用 `\|` 分隔 |

顺带一提，想换成自己的词表（考研、雅思啥的），只要保持上面这三段式结构、替掉 `words.js` 就行. 有定制需求也可以找作者聊喵~.

## 使用说明

### 环境准备

1. 准备一台小米手环 10 标准版，存储空间得够（词库约 6MB）
2. 电脑上装个 AIoT IDE（或 AIoT-toolkit 2.0）
3. 参考官方文档摸熟 Vela 快应用的工程结构和编译流程：[https://iot.mi.com/vela/quickapp/zh/guide/](https://iot.mi.com/vela/quickapp/zh/guide/)

### 编译与安装

```bash
# 1. 克隆仓库
git clone https://github.com/Bingak/MiBand10-Daily-Word-Practice.git

# 2. 根据开发文档及相应工具（AIoT IDE / AIoT-toolkit）编译生成 rpk 文件
# 3. 使用自定义表盘工具将 rpk 安装到手环，即可开始使用
```

### 日常使用

1. 打开小程序，进当天的练习，自动从「待练习单词」里抽 50 个喵~
2. 一个个答，按记忆实况选 熟知 / 认识 / 模糊 / 忘记
3. 生词会被反复叩问好几轮，直到当天任务做完喵~
4. 有空翻翻近 7 日学习统计，看看自己是不是又偷懒了喵~!

## 说明与反馈

- 本仓库是小米手环 10 标准版适配版；小米手环 9 Pro 版本请见 [MiBand-Daily-Word-Practice](https://github.com/Bingak/MiBand-Daily-Word-Practice)
- 更新节奏看作者的驾照练习进度（恼），但只要有空就会接着维护
- 作者现在也在用这小程序备考，有问题或建议欢迎来戳：**LonelyBing@outlook.com**
- 觉得有用的话，可以去 [爱发电](https://ifdian.net/a/LonelyBing) 支持一下

希望大家都能取得好成绩！！喵~
