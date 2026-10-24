---
title: C语言学习进程（二）：循环练习场
published: 2026-10-24
pinned: false
description: 从猜数游戏到素数、辗转相除、三层嵌套，还顺手用了一回 goto。错得挺诚实
tags:
  - C
  - 学习记录
  - 零基础
  - 编程入门
category: 编程学习
slug: c-language-learning-progress-2
---

上一篇还在打印数字，这一篇直接开始玩游戏了
先上代码

```c
#include <stdio.h>
#include <stdlib.h> //rand随机数

int main() {
    // x%n的结果是[0,n-1]的一个整数
    int number = rand() % 100 + 1; 
    int a;
    int count = 0;
    printf("我已经想好了一个1到100之间的数.\n");
    while (a != number) {
        printf("请输入数字:");
        count += 1;
        scanf("%d", &a);
        if (a > number) {
            printf("大\n");
        }
        else {
            printf("小\n");
        }
    }
    printf("恭喜你猜中数字!共猜了%d次\n", count);
}
```

`rand() % 100 + 1`，程序自己藏一个 1 到 100 的数
然后你猜，它报大了还是小了，猜中为止
你在那儿人肉二分，它在旁边看戏

那行注释是本尊写给自己看的
`x % n` 的结果是 0 到 n-1，再加 1，范围就落到 1 到 100
模运算这玩意，边界想清楚再写
不想清楚，它替你想，还专往坏了想

然后是那个 bug
`while (a != number)` 里的 `a`，第一次判断的时候压根没初始化
C 也不管，直接拿栈上不知道谁留下的垃圾值来比
碰巧不等于 `number`，循环正常进去，程序跑得完美
哪天垃圾值正好撞上答案，它一开场就恭喜你，共猜 0 次
能跑跟写对了，是两码事
回头看代码才发现的，愣了 3 秒，然后就是哈哈哈
反正现在文件里它还这么躺着，留着当纪念了喵

## 输到 -1 才算完

```c
#include <stdio.h>

int main() {
    int sum = 0;
    int count = 0;
    int number;
    do {
        printf("请输入数字,回车确定,输入-1退出:");
        scanf("%d", &number);
        if (number != -1) {
            count++;
            sum += number;
        }
    } while (number != -1);
    printf("平均数为%.2f\n", 1.0*sum / count);
}
```

`do while` 在这儿就顺了，先问一遍，再决定要不要继续
-1 是哨兵，见到就收工，不算进平均数
`1.0*sum / count` 这写法，上一篇 `3 / 4` 变 0 的旧账在这儿还上了
整数除整数还是整数，先乘个 `1.0` 变小数再除，两位小数就出来了
教训就一条，写除法前先看两边是啥类型
不看，它就把小数部分吞给你看

对了，要是上来就输 -1，count 是 0
除下来直接给个 nan，程序还不崩
平静地打一个 nan，很有性格喵

## 拆数字就两板斧

```c
#include <stdio.h>

int main() {
    int x, digit;
    int ret = 0;
    printf("整数求逆\n");
    printf("请输入数字:");
    scanf("%d", &x);
    while (x >0) {
        digit = x % 10;
        ret = ret * 10 + digit;
        x /= 10;
    }
    printf("%d", ret);
    return 0;
}
```

数位数、求逆、正序分解，全是同一套动作
`x % 10` 拿个位，`x /= 10` 砍一位，转圈，x 到 0 就停
求逆就是中间加一句 `ret = ret * 10 + digit`，拆一个拼一个，拼出来就是反的
水仙花也是这套拆法，n 位数每位 n 次方加回来，153 就是 1 + 125 + 27，对上就打印
循环写熟以后看啥数都想给它 % 10 一下
副作用了属于是喵

## 素数，和那个活下来的 b

```c
#include <stdio.h>

int main()
{
    int x;
    int i = 2;
    char isPrime = 'y';
    printf("请输入数字\n");
    scanf("%d", &x);
    while (i < x) {
        if (x % i == 0) {
            isPrime = 'n';
            break; //跳出循环
        }
        i++;
    }

    if (isPrime == 'y') {
        printf("是素数\n");
    }
    else {
        printf("不是素数\n");
    }

    return 0;
}
```

标记加 break 是标准套路
先假定是素数，逮到一个除数就改标记，跳
单个数写顺了就往上叠，外面再套一层，1 到 100 的素数全打一遍
区间求和那题，本尊写了个当时自己都觉得聪明的判断

```c
for (b = 2; b < a; b++) {
    if (a % b == 0) {
        break;
    }
}
if (b == a) {
    num++;
    sum += a;
}
```

`b` 是在循环外面声明的，循环结束了它还活着
中途 break 的，`b` 一定小于 `a`
全部除数试完都没除开的，`b` 正好等于 `a`
一个循环变量退役了还能出来当证据
写完才反应过来的，诶，还能这么判

## 嵌套循环，三层起步

```c
#include <stdio.h>

int main() {
    int i, j, k, n;
    printf("请输入行数:");
    scanf("%d", &n);
    i = 1;
    while (i<=n) {
        j = 1;
        while (j<=i) {
            printf("%d*%d=%d", j, i, i * j);
            if (i*j<10) {
                printf("   ");
                
            }
            else {
                printf("  ");
            }
            j++;
        }
        i++;
        printf("\n");
    }
    
    return 0;
} 
```

乘法表是嵌套入门，外层管行，内层管列
中间那个空格判断是纯手工对齐，乘积小于 10 的多垫一个空格
不然整个表是斜的
丑可以忍，斜不能忍

凑硬币直接上三层，1 角 2 角 5 角凑 x 元

```c
#include <stdio.h>

int main() {
    int x, one,two, five;
    printf("请输入金额:\n");
    scanf("%d", &x);
    for (one = 1; one < x * 10; one++) {
        for (two = 1; two < x * 10 / 2; two++) {
            for (five = 1; five < x * 10 / 5; five++) {
                if (one + two*2 + five*5 == x*10) {
                    printf("可以用%d个1角加%d个2角加%d个5角得到%d元\n", one, two, five, x);
                    goto out;
                }
            }
        }
    }
out: //退出
    return 0;
}
```

三层里找到答案要一口气全跳出来，本尊用了 `goto out`
写的时候知道这玩意名声不好
但 3 层 break 得一层一层往外剥，剥完还得加标记判断
goto 一下两秒解决，就当它是个紧急出口
还有个尾巴，循环从 1 开始数，0 个 1 角这种方案直接被跳过
题能过，严谨谈不上
无重复数字那题也是三层，`i != j != k` 是不能这么写的
只能 if 一层套一层，括号快比代码多了

## 辗转相除，两行半的老算法

```c
#include <stdio.h>

int main() {
    int a, b;
    int t;
    printf("请输入a和b的值:");
    scanf("%d%d", &a, &b);
    while (b != 0)  {
        t = a % b;
        a = b;
        b = t;
    }
    printf("最大公约数为:%d\n", a);
}
```

最大公约数本尊写了两版，第一版还在注释里躺着
从 1 试到小的那个数，能同时除尽就记下来
能过，就是笨，挨家挨户敲门问你是公约数吗
辗转相除就舒服了，大数模小数，余数顶小的，小的顶大的，转到余数为 0，剩那个就是答案
两千年前的人琢磨的，现在两行半写完，就挺离谱的

然后第二天写约分最简分式，a/b 约到最简就是分子分母同除最大公约数
那个 while 原样抄过去就行
第一次体会到啥叫复用，有点爽了喵

## 注释里全是化石

```c
#include <stdio.h>

int main() {
    int n;
    int i = 1;
    double total = 0.0;
    printf("请输入n的值:");
    scanf("%d", &n);
    while (i<=n) {
        if (i % 2 == 0) {
            total += (-1.0 / i);
            i++;
        }
        else {
            total += (1.0 / i);
            i++;
        }
    }
    printf("前%d项和为%f\n", n, total);
}
```

这个文件里现在存着三版代码，两版在注释里躺着
最早用的 `float`，后来换 `double`，课上说的，位数多了 float 会飘
然后 while 换 for，再加上正负交替
化石没删，留着能看清自己怎么一步步改过来的
反正也不占地方

前 n 项求和那题更好玩，2/1 + 3/2 + 5/3 + 8/5，分子分母各自是斐波那契
后一项的分子是前一项的分子加分母

```c
tmp = b;
b += a;
a = tmp;
```

`b += a` 会把原来的 `a` 冲掉，所以先拿 `tmp` 存一手
3 行，数列自己往前长，有点优雅了喵

两个星期，文件夹里多了 18 个 .c，全是循环，有一天一口气写了 9 个
下一步该进函数了，听说就是把这些循环打包起来反复用
正好，辗转相除那个已经复用过一回了

反正这两个星期最大的感受就是，C 从来不替你猜
`a` 没初始化，它就敢拿垃圾值上战场，跑得还挺欢 [捂脸]

- 本文是本尊的学习记录，代码有错欢迎指出
- 有事先发邮件：support@lonelybing.top
