---
title: 给 8940HX 降压关核之后，风扇终于不吵了
published: 2026-09-17
pinned: false
description: 折腾了一圈 8940HX：降压定频再关掉一个 CCD，打游戏不掉帧、风扇也不吵了，就是生产力会慢点。
image: "./images/amd-bios-start.jpg"
tags: [AMD, 降压, 关核]
category: 硬件折腾
slug: amd-8940hx-undervolt-ccd
---

最近打游戏，本子风扇又开始起飞了.

CPU 都 80 多度了，跟要原地升空一样，(直升机已起飞)
这机器是鸡哥的8940HX，5060. 这颗 U16 核32 线程，其实是两个 CCD 拼的——==两坨核心==，平时一起上.

可游戏压根吃不满 16 核(没优化,发热量巨大)。所以琢磨着：关掉一个 CCD，剩下的降降压、把频率压一压，降降低点噪音。

结论：游戏基本无感，帧数没怎么掉，但是风扇是真安静了；但渲染、编译、跑分这种真吃满 16 核的活会慢点，要用的时候把 CCD 开回来就可以.

![Ryzen 9 8940HX：16 核 32 线程的双 CCD 处理器](./images/amd-ryzen-8940hx.jpg)

双 CCD 对生产力当然好，代价也摆着：得照顾俩 CCD 的供电散热，单核少核加速被压得保守；俩一起发热面积大，风扇更乐意转喵~.

三步：
1关一个 CCD 留 8 核 16 线程；
2剩下的全核降压；
3再把频率和温度压一压.(定频).

## 进入 BIOS 解锁隐藏选项
记得关闭安全启动

可恶的鸡哥 BIOS 里根本没有这些选项。
需用到相关bios:UMAF_BETA .用法简单：U 盘(f32)，进 BIOS 关 Secure Boot，然后从 U 盘启动。

![进 UMAF 之前的 AMI Setup 界面](./images/amd-bios-start.jpg)
如图：

![解锁后多出来的 AMD PBS / CBS / Overclocking](./images/amd-umaf-devices-list.jpg)

点进 AMD Overclocking，Manual CPU Overclocking、PBO、各种电压控制……等等

![AMD Overclocking 菜单：PBO、VDDG / VDDP、SoC 电压都在这儿](./images/amd-umaf-overclocking.jpg)

顺带一提，B 站那个视频 ==BV1RM816bEM4== 把流程讲得细，软件评论区置顶. 我的思路跟它基本一致。

## 关掉一个 CCD：8 个核其实够用

打开CPU Core Count Control. 
有一几个选项，CCD00 / CCD01 各 8 位，`1` 开 `0` 关.

![CCD00 全开、CCD01 全关，等于把第二个 CCD 整个关掉](./images/amd-core-count-ccd.jpg)

我把 CCD01 整条设 0，只留 CCD00 那 8 个核.任务管理器内核变 8、逻辑处理器变 16，L3 从 64MB 掉到 32MB.

![任务管理器：8 核 16 线程，确实只剩一个 CCD 了](./images/amd-taskmanager-8c16t.jpg)

少 8 个核，多核跑分腰斩是肯定的. 但游戏压根用不满 16 核，体感几乎为零；只剩一个 CCD 发热，热量更集中，散热更小

## 降压Curve Optimizer 才是大头

关核是减法，降压才是真提升能效的关键. AMD 的 Curve Optimizer（CO）给每个核一个电压偏移，==同一条曲线整体往下挪==.

BIOS 里当然能直接改：
其实得先在SMUDebugTool (调完不用重启,立即生效) 慢慢摸好体制，每次降压完成后要跑一跑负载。
~~其实不必须进bios里面改，而且bios里最高负30~~
![BIOS 里的 Curve Optimizer：Per Core 模式，逐核给负偏移](./images/amd-curve-optimizer.jpg)


![SMUDebugTool：Per Core 逐核负偏移，右侧还能设 FMax](./images/amd-smudebugtool.png)

界面在 PBO → Curve Optimizer，Per Core 模式，每核一个框. 我取值大概 ==−20 到 −30==，按每核体质微调——体质差少减一档，体质好多减一档，都填负(negative). 调完记得按 Apply saved profile on startup

降压有甜点区：减不够没动静；减过头轻则跑分掉，重则蓝屏重启 :( 悲~*喵* 每调一档最好 Core Cycler、OCCT，或者跑半小时游戏验验，稳了再压.

## 定频：把频率压一压

降压管电压，定频管频率，其实说是最高5.4Ghz，但根本用不到那么高的频率. 
PBO 里

- **PBO Limits** 设 Manual，自己给 PPT / TDC / EDC 定上限，
- **Max CPU Boost Clock Override** 填负值，降低频率
- **Platform Thermal Throttle Ctrl** 从 Auto 改手动，==字面意思==

这样下来功耗温度曲线特别平，不再忽高忽低，风扇转速跟着平，不会一会儿安静一会儿狂转

## 实测：温度掉了，帧数几乎没动喵~


![游戏实测：CPU 约 69°C / 44W，GPU 67°C，帧数依然稳得住](./images/amd-ingame-result.jpg)

CPU 大概 70°C、44W、4.7GHz 上下，GPU 67°C，. 温度肉眼降一截，最直观的是风扇噪音，明显下降(室友都说好！)

| 项目        | 折腾前        | 折腾后      |
| --------- | ---------- | -------- |
| CPU 核心数   | 16C / 32T  | 8C / 16T |
| L3 缓存     | 64MB       | 32MB     |
| 游戏 CPU 温度 | ~80°C+，波动大 | ~70°C，平稳 |
| 游戏 CPU 功耗 | 偏高、尖峰明显    | ~44W，平稳  |
| 风扇噪音      | 明显、起飞      | 大幅降低     |
| 游戏帧数      | 基准         | 持平       |
| 多核生产力     | 基准         | ~腰斩      |

## 碎碎念

笔记本里AMD NO！
~~但是便宜，尤其现在硬件涨价~~

当然清灰效果更好喵~

## 工具链接

文中用到的 UMAF_BETA 和 SMUDebugTool，工具链接在这：

夸克网盘：[https://pan.quark.cn/s/ec823ad65a6f#/list/share/10fc534c8bb3465592d33cc3655e39e0](https://pan.quark.cn/s/ec823ad65a6f#/list/share/10fc534c8bb3465592d33cc3655e39e0)

记得及时清灰的效果更好哦~
