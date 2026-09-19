---
title: 给 8940HX 降压关核之后，风扇终于不吵了
published: 2026-09-19
pinned: false
description: 折腾了一圈 8940HX：降压定频再关掉一个 CCD，打游戏不掉帧、风扇也不吵了，就是生产力会慢点。
image: "./images/amd-bios-start.jpg"
tags: [AMD, 降压, 关核, UMAF, SMUDebugTool, 笔记本]
category: 硬件折腾
slug: amd-8940hx-undervolt-ccd
---

前阵子打游戏，本子风扇又开始起飞了.

为毛这么吵？，CPU 都 80 多度了，可那动静跟要原地升空一样，整个房间都听得见. 你说它热吧，是挺热；你说它不吵吧，它偏偏吵得要命.

这机器是 JIAOLONG 的，CPU 是 8940HX，还带张 5060. 这颗 U 16 核 32 线程，其实是两个 CCD 拼的——==两坨核心==，平时一起上.

可游戏压根吃不满 16 核，多出来那一半基本白给，还跟着发热催风扇. 所以琢磨着：关掉一个 CCD，剩下的降降压、把频率压一压，风扇能闭嘴不？

先说结论：游戏基本无感，帧数没怎么掉，风扇是真安静了；但渲染、编译、跑分这种真吃满 16 核的活会慢点，要用的时候把 CCD 开回来就成.

![Ryzen 9 8940HX：16 核 32 线程的双 CCD 处理器](./images/amd-ryzen-8940hx.jpg)

双 CCD 对生产力当然好，代价也摆着：得照顾俩 CCD 的供电散热，单核少核加速被压得保守；俩一起发热面积大，风扇更乐意转.

思路就三步：关一个 CCD 留 8 核 16 线程；剩下的全核降压；再把频率和温度压一压，别动不动冲高.

## 进入 BIOS 解锁隐藏选项

最大的门槛在这：这些设置零售 BIOS 里根本看不到，厂商图省事，把 AMD PBS / CBS / Overclocking 全藏了. 为毛要藏？，属实搞不懂.

这时候 UMAF_BETA 出场——跑在 UEFI 里的小工具，把藏着的表单摊开，直接改值. 用法简单：塞 U 盘，进 BIOS 关 Secure Boot，从 U 盘启动就成.

![进 UMAF 之前的 AMI Setup 界面](./images/amd-bios-start.jpg)

进去一看，Devices List 里哗啦多出一堆，AMD PBS、CBS、Overclocking 全回来了，跟换了台机器似的.

![解锁后多出来的 AMD PBS / CBS / Overclocking](./images/amd-umaf-devices-list.jpg)

点进 AMD Overclocking，Manual CPU Overclocking、PBO、各种电压控制……平时只在别人超频帖见过的，这下全齐了.

![AMD Overclocking 菜单：PBO、VDDG / VDDP、SoC 电压都在这儿](./images/amd-umaf-overclocking.jpg)

顺带一提，B 站那个视频 ==BV1RM816bEM4== 把流程讲得细，软件评论区置顶. 我这套思路跟它基本一致，想照弄的去看一眼.

## 关掉一个 CCD：8 个核其实够用

重头戏在 CPU Core Count Control. AMD 给张按位控核的位图，CCD00 / CCD01 各 8 位，`1` 开 `0` 关.

![CCD00 全开、CCD01 全关，等于把第二个 CCD 整个关掉](./images/amd-core-count-ccd.jpg)

我把 CCD01 整条设 0，只留 CCD00 那 8 个核. 回系统一看，任务管理器内核变 8、逻辑处理器变 16，L3 从 64MB 掉到 32MB.

![任务管理器：8 核 16 线程，确实只剩一个 CCD 了](./images/amd-taskmanager-8c16t.jpg)

少 8 个核，多核跑分腰斩是肯定的. 但游戏压根用不满 16 核，体感几乎为零；只剩一个 CCD 发热，热量更集中，散热反而省心.

别想着用 `msconfig` 限核偷懒，那只是不调度，核心还通着电发热. 真要整个 CCD 断电，还得 BIOS 位图里关.

## 降压：Curve Optimizer 才是大头

关核是减法，降压才是真提升能效的关键. AMD 的 Curve Optimizer（CO）给每个核一个电压偏移，==同一条曲线整体往下挪==.

BIOS 里当然能直接改：

![BIOS 里的 Curve Optimizer：Per Core 模式，逐核给负偏移](./images/amd-curve-optimizer.jpg)

不过我更爱在 Windows 里用 SMUDebugTool（也叫 Ryzen SDT）. 原因简单：调完不用重启，改个值点 Apply 立刻验稳不稳，试错成本低到离谱.

![SMUDebugTool：Per Core 逐核负偏移，右侧还能设 FMax](./images/amd-smudebugtool.png)

界面在 PBO → Curve Optimizer，Per Core 模式，每核一个框. 我取值大概 ==−20 到 −30==，按每核体质微调——体质差少减一档，体质好多减一档，反正都填负. 调完记得勾 Apply saved profile on startup，不然重启白调.

降压有甜点区：减不够没动静；减过头轻则跑分掉，重则蓝屏重启 :( 悲~*喵* 每调一档最好 Core Cycler、OCCT，或者跑半小时游戏验验，稳了再压.

## 定频：把频率和温度都压一压

降压管电压，定频管频率那股脾气. PBO 里几个开关干这个：

- **PBO Limits** 设 Manual，自己给 PPT / TDC / EDC 定上限，别让它想当然冲功耗
- **Max CPU Boost Clock Override** 填负值，把最高加速频率往下压，断了冲高频吃功耗的念想
- **Platform Thermal Throttle Ctrl** 从 Auto 改手动，==给整颗 CPU 立道温度墙==

这么一套下来，功耗温度曲线特别平，不再忽高忽低，风扇转速跟着平，不会一会儿安静一会儿狂转.

## 实测：温度掉了，帧数几乎没动

光说没用，上数据. 游戏里挂 OSD：

![游戏实测：CPU 约 69°C / 44W，GPU 67°C，帧数依然稳得住](./images/amd-ingame-result.jpg)

CPU 大概 69°C、44W、4.7GHz 上下，GPU 67°C，帧数还稳 120 附近. 跟折腾前比温度肉眼降一截，最直观的是风扇——以前背景一直呼呼响，现在耳朵凑近才听得见.

| 项目 | 折腾前 | 折腾后 |
| --- | --- | --- |
| CPU 核心数 | 16C / 32T | 8C / 16T |
| L3 缓存 | 64MB | 32MB |
| 游戏 CPU 温度 | ~80°C+，波动大 | ~69°C，平稳 |
| 游戏 CPU 功耗 | 偏高、尖峰明显 | ~44W，平稳 |
| 风扇噪音 | 明显、容易起飞 | 大幅降低 |
| 游戏帧数 | 基准 | 基本持平 |
| 多核生产力 | 基准 | 约腰斩（随时能开回来） |

## 碎碎念

折腾一圈下来最大的感受：笔记本的热和吵，有时候真不是一回事. 很多时候 CPU 不算多热，只是风扇策略太激进，或者 PBO 功耗墙太松，一有机会就往高功耗高噪音冲. 降压定频后功耗上限一收，同样负载风扇立刻温柔.

当然清灰也不是没用，恰恰相反. 你机器用两年，风扇出风口积灰，硬件散热本来就被吃掉. 降压定频是软件压噪音，清灰是硬件还散热，俩一块上才叫真安静.

## 工具链接

文中用到的 UMAF_BETA 和 SMUDebugTool，工具链接在这：

夸克网盘：[https://pan.quark.cn/s/ec823ad65a6f#/list/share/10fc534c8bb3465592d33cc3655e39e0](https://pan.quark.cn/s/ec823ad65a6f#/list/share/10fc534c8bb3465592d33cc3655e39e0)

记得及时清灰的效果更好哦~
