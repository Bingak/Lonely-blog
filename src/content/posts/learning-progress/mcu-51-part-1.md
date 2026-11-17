---
title: 单片机(一)
published: 2026-11-10
pinned: false
description: 从点亮一颗 LED 开始，把 51 单片机的 GPIO、按键消抖、定时器、数码管和 LCD 过了一遍。
image: "https://img.lonelybing.top/file/post/4.计数器.webp"
tags: [51单片机, 学习笔记, Keil]
category: 学习笔记
slug: mcu-51-part-1
---

想把学习 51 单片机的过程记一下
板子是 STC89C52，11.0592MHz 晶振。代码是在 VSCode 里写的(EIDE)，编译用 Keil C51 工具链，烧录用 stcgal，比开 Keil 那个老界面舒服

##VSCode 的配置

EIDE 把 Keil 的编译器接进 VSCode
项目根目录有一个 `.eide` 文件夹。核心是 `eide.yml`，里面指定芯片类型、源码目录和工具链：

```yaml
version: "4.1"
name: 1.点亮LED
type: C51
srcDirs:
  - src
outDir: build
targets:
  Debug:
    toolchain: Keil_C51
    toolchainConfigMap:
      Keil_C51:
        options:
          global:
            ram-mode: SMALL
            rom-mode: LARGE
          c/cpp-compiler:
            optimization-level: level-8
            optimization-type: SPEED
    uploader: stcgal
    uploadConfigMap:
      stcgal:
        options: C:/Users/lonel/.eide/stc.flash.json
```

烧录的串口和型号写在 `stc.flash.json` 里：

```json
{
    "device": "stc89",
    "port": "COM4"
}
```

头文件路径和 C51 的关键字（code、sfr、sbit 这些）靠 `.vscode/c_cpp_properties.json` 告诉 VSCode，不然编辑器满屏红线。主要是把 Keil 的头文件目录加进 includePath，再把 C51 专有关键字 define 成空或者 char：

```json
{
    "configurations": [{
        "name": "Keil C51",
        "includePath": [
            "${workspaceFolder}/inc",
            "${workspaceFolder}/src",
            "D:/KeilC51/C51/INC",
            "D:/KeilC51/C51/INC/Atmel"
        ],
        "defines": [
            "__C51__",
            "code=", "sfr=char", "sbit=char", "bit=char",
            "interrupt=", "using=", "data=", "xdata="
        ],
        "intelliSenseMode": "${default}"
    }],
    "version": 4
}
```

编译、烧录、清理这些操作 EIDE 已经注册成 VSCode 任务了，`.vscode/tasks.json` 里直接调用它的命令，`Ctrl+Shift+B` 就能 build。.code-workspace 里还推荐了 `cl.eide`、串口监视器这些插件。


## 让一颗LED亮起来

板子上的 LED 是共阳极，接在 P2.0~P2.7，低电平才亮。想点亮 D1，把 P2.0 拉低就行：

```c
#include <REGX52.H>

void main()
{
    P2 = 0xFE;      // 1111 1110，只有 P2.0 是低的
    while (1);
}
```

烧进去看到 D1 亮起来的时候，还是挺高兴的喵~。P0 上没接灯，那组口留给数码管和 LCD 当数据线用了。

## 跑马灯：从写死到算出来

第一步是把 8 个数写死，挨个送进 P2，配一个 Delay500ms：

```c
unsigned char code led[] = {0xFE,0xFD,0xFB,0xF7,0xEF,0xDF,0xBF,0x7F};
void main()
{
    unsigned int i;
    while (1)
    {
        for (i = 0; i < 8; i++)
        {
            P2 = led[i];
            Delay500ms();
        }
    }
}
```

Delay500ms 是用三层空循环堆出来的，i=4、j=205、k=187，还要补一句 `_nop_()`，按 12MHz 算的。后来改成带参数的 `Delay1ms(unsigned int xms)`，里面 i=2、j=239，250ms 就写 `Delay1ms(250)`，省得为每种时长复制一份函数。

## 按键：消抖这件事

独立按键接在 P3 口，最初写成电平跟随——按着就翻转，结果按一次翻好几次，因为机械按键在闭合的那一下会抖。加上延时就好了：

```c
if (P3_1 == 0)
{
    Delay(20);
    while (P3_1 == 0);
    Delay(20);
    P2_0 = ~P2_0;
}
```

先等 20ms 让抖动过去，再等松手，最后再等 20ms。后来把这套逻辑封装成 K_Key / S_Key 模块，用一个 `static bReleased` 记住上一次的状态，变成非阻塞的，主循环不用再卡在 while 里等松手。

显示的部分一开始是 `P2=~num` 直接取反，后来改成 `P2=~(0x01<<num)`，想法是让第 num 颗灯亮。这里有个数得留意：num 大于 8 的时候，`0x01<<8` 在 char 里溢出成 0，取反之后全灭，跟预期对不上。

## 定时器，终于不用数空循环了

空循环延时不准，也占着 CPU。Timer0 工作在方式 1，16 位不自动重装：

```c
TMOD = TMOD & 0xF0;      // 清掉 Timer0 的模式位
TMOD = TMOD | 0x01;      // 方式1，16位
TH0 = 64535 / 256;
TL0 = 64535 % 256;       // 0xFC17，1001个机器周期约1ms@12MHz
```

64535 = 65536 - 1001，12MHz 下一个机器周期 1us，数 1001 次差不多就是 1ms。配合 `_crol_` / `_cror_` 做循环移位，跑马灯就不需要在 main 里手动数数了。

## 数码管：一次只能亮一位

8 位数码管的段选接 P0，位选通过 74HC138 接到 P2.2/P2.3/P2.4。段码表是固定的那 10 个：

```c
unsigned char code NixieTable[] =
{0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F};
```

所谓动态扫描，就是一次只点亮一位，送段码、延时 1ms、熄灭，再切下一位。循环够快的时候看上去 8 位同时亮着：

```c
P0 = NixieTable[n];
Delay(1);
P0 = 0x00;
```

![8位数码管计数器](https://img.lonelybing.top/file/post/4.计数器.webp)

计数值用 `unsigned long`，不然 8 位数码管还没跑满就溢出了。静态数码管那版更简单，固定位选 `P2_4=0;P2_3=1;P2_2=0;`，然后 `P0=0x7D`，显示一个 6。

## LCD1602 和矩阵键盘

LCD1602 的接线是 RS=P2.6、RW=P2.5、EN=P2.7，数据口还是 P0。初始化按数据手册发 0x38、0x0c、0x06、0x01，第一行地址 `0x80|(col-1)`，第二行加上 0x40。显示 "Hello,World!" 的时候是一个字符一个字符送，每个之间 Delay(200ms)，看着它一个字一个字冒出来。

![LCD1602 调试](https://img.lonelybing.top/file/post/LCD液晶调试.webp)

矩阵键盘是 P1 口的 4×4，列码 0xf7/0xfb/0xfd/0xfe，行线组合出来 0x77 对应 1，一直到 0xee 对应 16。矩阵键盘扫描比独立按键慢，32 位除法在 8051 上更慢，所以 DisplayNumber.c 里用 `static lastCount` 缓存上次算出来的每一位，数没变就不重新除，这个注释写得很直白。

密码锁就是这套东西的组合：5 位密码 12345，12 号键删除，11 号键确认，LCD 上显示 Password / OK / ERR

![密码锁](https://img.lonelybing.top/file/post/密码器.webp)

## 计时器

LCD 计时器用 Timer0 做 50ms 定时，重装值 0x4C00=19456，数 46080 个机器周期正好 50ms@12MHz，20 次就是 1 秒。读计数变量的时候要关中断，不然读到一半被中断改掉：

```c
unsigned char ea = EA;
EA = 0;
/* 读总时间 */
EA = ea;
```

LCD 第一行写 Clock:，按暂停的时候换成 Pause 。后面 LED 流水灯那版把晶振换成 11.0592MHz，重装值也跟着改成 0xFC67（921 个周期约 0.99935ms），源码注释里写着"若用 12MHz 请改 0xFC/0x18 可精确 1ms"。

到这里 GPIO、按键、定时器、数码管、LCD、矩阵键盘都过了一遍。板子上的资源基本都被点亮过一次，接下来就是拿它们拼点像样的东西喵~
