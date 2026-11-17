---
title: 单片机(二)
published: 2026-11-17
pinned: false
description: 接着上一回，做 10 秒游戏、串口通信、LED 点阵和 I2C 存储，中间把时钟从 Timer2 迁到了 Timer1。
image: "https://img.lonelybing.top/file/post/串口通信.webp"
tags: [51单片机, 学习笔记, Keil]
category: 学习笔记
slug: mcu-51-part-2
---

## 计时精度和一次定时器迁移

后面几个程序都要计时，所以先把 1ms 的初值算清楚。晶振 11.0592MHz，12 分频，一个机器周期是 12/11.0592MHz≈1.085us，1ms 要数 1000/1.085≈922 次，初值就是 65536-922=64614=0xFC66。实际算下来 1ms 约 1.0004ms，一天会慢 37 秒左右，做秒级显示看不出来

最早那版时钟用的是 Timer2，16 位自动重装：

```c
RCAP2H = 0xFC;
RCAP2L = 0x66;
T2CON = 0x00;
ET2 = 1;
EA = 1;
TR2 = 1;

void Timer2_ISR() interrupt 5
{
    TF2 = 0;             // Timer2 的溢出标志要软件清
    /* 累加时、分、秒 */
}
```

Timer2 的好处是自动重装，不用在中断里重新写 TH/TL。后来统一改成 Timer1 方式 1，手动重装：

```c
TMOD &= 0x0F;
TMOD |= 0x10;            // Timer1 方式1
TH1 = 0xFC;
TL1 = 0x66;

void Timer1_ISR() interrupt 3
{
    TH1 = 0xFC;
    TL1 = 0x66;
    /* 累加时、分、秒 */
}
```

改完之后：串口也用 Timer1（方式 2，自动重装 0xFA），两者共用 TH1/TL1，程序里同时开就会打架。有一版串口处理的 main 里还留着 `Clock_Init() /*启动Timer2*/` 的旧注释，实际 Clock_Init 早就改成 Timer1 了

## 10 秒挑战游戏

这个程序是用 5 位数码管显示 SS.mmm，K1 控制开始/暂停/复位，目标是在正好 10.000 秒的时候按停。

![10秒挑战游戏](https://img.lonelybing.top/file/post/10秒游戏.webp)

K4 是作弊键，如果暂停时读数落在 9800~10200ms 之间，就调用 `Clock_SetMs(10000)` 直接修正到 10.000 秒。
这样就算手速差一点，也能假装自己按得很准~

## 串口通信

9600bps@11.0592MHz，初始化代码基本是固定套路：

```c
PCON |= 0x80;            // SMOD=1，波特率加倍
SCON = 0x50;             // 方式1，允许接收
AUXR &= 0xBF;            // 定时器1时钟为12T
AUXR &= 0xFE;            // 串口1选择定时器1
TMOD &= 0x0F;
TMOD |= 0x20;            // 定时器1方式2，自动重装
TL1 = 0xFA;
TH1 = 0xFA;
ET1 = 0;
TR1 = 1;
EA = 1;
ES = 1;
```

AUXR 不在标准 8051 的头文件里，得自己 `sfr AUXR = 0x8E;`。接收中断里把收到的字节取反送到 P2，再原样发回去：

```c
void UART_Routine() interrupt 4
{
    if (RI == 1)
    {
        P2 = ~SBUF;
        UART_SdenByte(SBUF);
        RI = 0;
    }
}
```

这里踩过一个坑。最早那个发送函数写成了：

```c
void UART_SdenByte(unsigned char Byte)
{
    SBUF = Byte;
    while (TI == 0)
    {
        TI = 1;
    }
}
```

应该是等 TI 置 1 之后清零，结果写成了在循环里把 TI 置 1，等于自己把退出条件造出来了，数据发得对不对全看运气。函数名还拼成了 Sden。后面 LED 点阵那个工程里把串口模块重写了一遍，`Uart_SendByte` 里 `while(TI==0); TI=0;`，才算真正修好。

![串口通信](https://img.lonelybing.top/file/post/串口通信.webp)

串口那部分还做过一版命令交互：按 K1 先回一句 "hello, what do you want to do?\r\n"，然后发 m1~m4 点亮数码管，L1~L4 点亮 LED，发 "beer" 就让蜂鸣器响 1 秒——本来想写 beep，拼错了，干脆将错就错留成彩蛋。接收用 20ms 无字符间隔作为一帧的结束，存进 arr[10] 再 strcmp 匹配。

## LED 点阵屏和 74HC595

8×8 点阵只有 16 个引脚，直接用单片机的口线去接太浪费，所以用 74HC595 移位寄存器，只占 3 根线：SER=P3.4、SCK=P3.6、RCK=P3.5。

```c
void WriteByte_74HC595(unsigned char Data)
{
    unsigned int i;
    for (i = 0; i < 8; i++)
    {
        SER = (Data & 0x80) ? 1 : 0;
        SCK = 0;
        SCK = 1;
        Data <<= 1;
    }
    RCK = 1;
    RCK = 0;
}
```

一位一位地送，送完 8 位再给 RCK 一个上升沿锁存。显示一列的时候先送列数据，再选通对应的行：

```c
void MatrixLED_ShowColumn(unsigned char col, unsigned char Data)
{
    WriteByte_74HC595(Data);
    P0 = ~(0x80 >> (col - 1));
    Delay(1);
    P0 = 0XFF;
}
```

中间那个 `Delay(1)` 之后紧跟 `P0=0XFF` 是消隐用的，不灭一下的话拖尾会糊成一片。动画数据放在 Animation[] 数组里，每 11 帧换一列，滚起来就是一个简单的小图案。

![LED点阵屏](https://img.lonelybing.top/file/post/LED点阵屏.webp)

## I2C 和 AT24C02

最后一个是 I2C  EEPROM，AT24C02。没有硬件 I2C，用 P2.1 当 SCL、P2.0 当 SDA，纯软件模拟起始、停止、应答这些时序。读的时候要在发完设备地址后再发一次 START（repeated START），写完之后 `DelayMs(10)` 等它自己写完，不然马上读会读不到。

```c
I2C_Start();
I2C_SendByte(0xA0);      // 写地址
I2C_SendByte(addr);
I2C_SendByte(dat);
I2C_Stop();
DelayMs(10);
```

按键分配是 K1 写、K2 读、K3 加一、K4 清零。这版里还留了个小 bug：调用的是 `DisplayNumber_right(...)`，定义的却是 `DisplayNumber`，编译的时候才发现对不上。

![I2C-E2PROM](https://img.lonelybing.top/file/post/I2C-E2PROM.webp)

顺带一提，定时器与时序那个任务里，我本来想用蜂鸣器做 1~100Hz 的方波，怕吵到别人，先用 LED 代替了。频率用 K1/K2 调，翻转靠的是非阻塞的写法：

```c
if (Clock_GetTotalMs() - ms >= 500 / Frequency)
{
    ms += 500 / Frequency;
    output = !output;
}
```

![1-100Hz方波](<https://img.lonelybing.top/file/post/1-100HZ(方波).webp>)

方波之外还做了个 0~59 的计数器，把数值存在 EEPROM 的 0 号地址里，断电再上电还能接着数。数码管显示用了新加的 Show_Left() 做左对齐，末位用 Nixie(4,10) 关掉。

时钟那版的样子是 LCD1602 上显示日:时:分:秒，K1 暂停，K2 复位。因为要读 32 位的时间变量，读之前 EA=0，读完再恢复，免得读到一半被中断改掉。LCD 的接线跟前面一样，RS=P2.6、RW=P2.5、EN=P2.7，数据口 P0。

![时钟](https://img.lonelybing.top/file/post/时钟.webp)

最后那个「时钟芯片与液晶显示」的任务目前还是个空壳，main.c 里只有一行 `#include <REGX52.H>`，DS1302 之类的还没动。等之后再补喵~
