---
title: 无痛校园跑
published: 2026-10-04 20:44:11
updated: 2026-10-04
description: 二呗学校加入了校园跑，每天还有两个随机打卡点，中途还有人脸验证，而且识别度是真的垃圾
image: "https://img.lonelybing.top/file/post/1791119354909_%E6%88%90%E5%8A%9F%E4%B8%8A%E4%BC%A0.jpg"
tags: [Android, Life]
category: 硬件折腾
pinned: false
slug: fuck-school-runner
---
# 先声明

<span style="font-size:32px">本教程供学习交流与参考</span>，
:spoiler[请勿用于商业行为].<span style="color:red">另外推荐大家还是要强身健体的</span>

说白了就是本尊被校园跑逼出来的研究

<span style="font-size:24px">继上篇文章搓了个软件后台后，实现本地授权</span>

[[reverse-app-api|逆向app接口,重新搭建本地后台网站]]

:spoiler[(软件不做分享)]

<img src="https://img.lonelybing.top/file/post/1791035355836_phone.jpg" width="200" />

美滋滋喵~

## 校园跑是个什么东西

学校这学期把校园跑算进了体育成绩，规则挺二呗:
每次路线上随机刷两个打卡点，跑到点附近自动打卡；中途还会弹人脸验证，可它的人脸识别精度是真的垃圾，得特定姿势才识别（~~像在进行某种仪式~~）。

配速有下限，走快了不算、跑太慢也不算

## 前提
<span style="color:red"><span style="font-size:18px">手机一定要root才能用!!!，并做好环境隐藏！！</span></span>
(否则某些离谱软件会检测到异常，然后挂科,~~那就完蛋了miao~~)

为什么非要 root：安卓自己带的「模拟位置」是开发者选项里那个开关，App很容易检测，这就绕不开 root。而且得把 root 痕迹藏好，

本尊用的`Sukisu`,隐藏教程我就不多说了，豆包都会awa
<span style="color:purple">(理论上过了春秋检测就行了，具体看你软件检测力度，还是保险起见好)</span>

模拟定位我用的==LocusMimic==(<span style="font-size:12px">建议支持作者</span>)

::github{repo="wchunlin1006/LocusMimic"}

LSP记得勾选作用软件:

![LSP勾选作用软件](https://img.lonelybing.top/file/post/1791119196657_LSP-hook.jpg "=30%")

只勾校园跑那一个就行()

模式选推荐就行
![模式选推荐](https://img.lonelybing.top/file/post/1791119359567_LocusMimic.jpg "=30%")

记得去LSP激活模块，==Magisk==用户不要给==永久==root权限，有时候会掉，然后掉了就卸载重新安装。
本尊就掉过一次，当时以为模块坏了，排查半天，最后发现是授权掉回「仅本次」了

跑太快了运动世界路线上会变红，这些东西大家可以按照自己的想法来

## 软件介绍
###  ==功能很多==
![功能很多](https://img.lonelybing.top/file/post/1791119986926_功能很多.jpg "=45%")
定位相关的开关基本都齐了，还带轨迹回放之类的花活，本尊实际只用到其中三四个
### ==支持精度调节==
![支持精度调节](https://img.lonelybing.top/file/post/1791119987368_支持精度调节.jpg "=45%")
精度别拉太满，太「准」反而假。真实 GPS 是会浮动的
### 抖动强度
![建议设置明显](https://img.lonelybing.top/file/post/1791119987371_建议设置明显.jpg "=45%")
这个开关替本尊模拟真实 GPS 的小幅漂移，建议设置明显一点，
### 地图配置
![地图需自己配置](https://img.lonelybing.top/file/post/1791119985679_地图需自己配置.jpg "=45%")
这块是唯一要自己动手的：路线、坐标得自己导进去，根据打卡点来设置,~~当然自由移动的操纵杆也不是不行~~

## 缺点是该软件好像没有步数传感器hook的功能
### 所以，如果只用这个软件，会导致步频为零
![](https://img.lonelybing.top/file/post/1791119361060_无效.jpg "=45%")

校园跑后台不只看坐标，步频对不上速度可能会被判异常

**不过当然有解决办法awa喵~（步频模拟模块）**
::github{repo="BieFan1029/FUCK-RUN-"}
![好用](https://img.lonelybing.top/file/post/1791120403290_runhook.jpg "=45%")
**hook系统框架和相关软件即可喵~**
![](https://img.lonelybing.top/file/post/1791611158387.jpg "=45%")

## <span style="color:red">提醒!!</span>

<span style="font-size:18px">步频模拟模块在测试的时候</span>
(*hook小米运动健康时不生效，不清楚原因*)，
可恶喵~。因为这个浪费了`大把时间`，**结果后面测其他软件是没问题的**

本尊把能想的都想了：重装模块、改作用域、重启手机，甚至怀疑是自己 root 的姿势不对。最后换了个 App 测试就可以生效(服了也是)

## 一切就绪
### 成功!
![成功记录](https://img.lonelybing.top/file/post/1791120736206_goodd.jpg "=45%")
<span style="color:pink">成功上传，步频正常</span>
![成功上传](https://img.lonelybing.top/file/post/1791119354909_成功上传.jpg "=45%")


## 碎碎念

技术本身中立，看完这篇你直接躺着跑()，但下周体测八百米的时候别骂本尊~

- 本文仅供学习交流使用，目的是研究技术，请勿用于非法用途喵~
- 推荐大家还是不要偷懒，强身健体对身体有好处的
- 有问题欢迎交流：**support@lonelybing.top**
