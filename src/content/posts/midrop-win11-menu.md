---
title: 让「使用小米互传发送」进入 Windows 11 新版右键菜单第一层：MiDropWin11Menu
published: 2026-09-13
pinned: false
description: 通过只含 AppxManifest.xml 的稀疏 MSIX 包为小米互传授予包标识，让「使用小米互传发送」进入 Windows 11 新版右键菜单第一层——不改原厂注册表，不重分发二进制，可完整回滚。
image: "https://img.lonelybing.top/file/post/midrop-win11-menu.png"
tags: [Windows 11, 右键菜单, 小米互传, Shell 扩展, MSIX, PowerShell]
category: 项目分享
slug: midrop-win11-menu
---

## 作用

Win11 的右键菜单被微软拆成两层了喵~ 新版那层（就是你右键直接弹出来那个）规矩挺坑：只有拿到「包标识」（package identity）的 Shell 扩展才可以站第一层，剩下的全被放进「显示更多选项」那个 Win10 老菜单.

离谱的是，小米互联服务那个右键处理器 `MiDropShellExt.dll` 早就把 `IExplorerCommand` 接口写好了. 论接口，它按理来说可以进新菜单. 可它跟着小米服务以纯 Win32 方式装的，没有包标识，于是就只能显示在「显示更多选项」里——明明本事够，就是没进门条喵~（恼）.

MiDropWin11Menu作用:塞个只含 `AppxManifest.xml` 的稀疏 MSIX 包，把包标识补上. 具体是用 `-ExternalLocation` 把包的声明目录指到小米原装目录，再把标识授给原厂 CLSID `{504d69c0-cb52-48df-b5b5-7161829fabc8}`. 这样 `MiDropShellExt.dll` 就名正言顺地进到第一层了喵~

开源地址：[https://github.com/Bingak/MiDropWin11Menu](https://github.com/Bingak/MiDropWin11Menu)

::github{repo="Bingak/MiDropWin11Menu"}

该项目不包含、不修改、也不重新分发任何小米的二进制文件，放心喵~

## 原理

补个包标识（不是自己重写一个扩展，作者懒得写，也写不过人家喵~）.

```mermaid
graph TD
    P["稀疏 MSIX 包（仅含 AppxManifest.xml）"] -->|授予包标识| C["原厂 CLSID {504d69c0-cb52-48df-b5b5-7161829fabc8}"]
    P -->|ExternalLocation 指向| D["小米互联服务 native-interconnect/win32 目录"]
    D --> E["MiDropShellExt.dll（已实现 IExplorerCommand）"]
    C --> E
    E --> F["Windows 11 新版右键菜单第一层"]
```

这么做好处挺明显的：

- 原厂 DLL 原封不动，一行业务代码都不用写喵~
- 不用给小米的二进制打补丁，也不用重新分发它喵~
- 系统全局设置没动，右键菜单不会退回 Win10 那种旧样式喵~

## 有啥特点

- 不写代码、不打补丁、不重新分发小米二进制喵~
- 不修改原厂注册表：`HKLM\SOFTWARE\Classes` 下的原厂键值一个不动，旧菜单入口不受影响喵~
- 不把右键菜单改回 Win10 样式，也不碰系统全局行为喵~
- 两条安装路线：路线 B（签名 `.msix`，不动全局开关）和路线 A（免 SDK 松散文件注册，推荐，得开开发人员模式）喵~
- 备份、回滚、只读体检脚本，外加还原原厂注册表的 `.reg` 文件都在推荐
- 安装的时候临时关掉 Windows 安全中心实时防护，脚本跑完自动恢复（~~可用性未知~~喵~）
- 不瞎卸载东西(~~某次作者把原厂注册表删掉了~~)
- 支持单文件、多选和文件夹

## 得先准备啥

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 11（内部版本 ≥ **22000**），**64 位** |
| 前置软件 | 已安装「小米互联服务」，目录形如 `C:\Program Files\MI\HyperConnect\<版本>\resources\native-interconnect\win32` |
| 路线 B 额外要求 | Windows SDK（提供 `MakeAppx` / `SignTool` 签名工具） |
| 路线 A 额外要求 | 已开启 Windows 开发人员模式 |

我实测的环境是 Windows 11 25H2（26200.9168）x64 + 小米互联服务 2.0.1.452.

## 食用方法

### 方式一：一键安装（推荐）

下载仓库，双击 `一键安装.cmd`，脚本自己提权然后菜单出来：

```text
[1] 路线 B 安装（签名，需 Windows SDK）
[2] 路线 A 安装（免 SDK，需开发人员模式）
[3] 体验一下（注册后测试，回车自动还原）
[4] 彻底删除
[5] 查看当前状态
[0] 退出
```

选 `[3]`体验一下喵~

### 方式二：命令行安装

#### 路线 B：签名安装(占用4G左右)

不动任何系统全局开关：

```powershell
# 安装 Windows SDK
winget install --id Microsoft.WindowsSDK.10.0.26100 --accept-package-agreements

# 执行签名安装脚本
powershell -ExecutionPolicy Bypass -File .\Install-RouteB-SignedMsix.ps1
```

#### 路线 A：免 SDK 安装（得开开发人员模式）(推荐，占用较小)

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-RouteA-DevMode.ps1 -EnableDeveloperMode
```

提醒一下，路线 A 要开开发人员模式，会放宽一些系统安全策略. 没啥特殊理由喵~

### 验证是否生效

安装脚本会自动重启 `explorer.exe`. 然后你右键一个文件，新版菜单第一层就会出现 ==使用小米互传发送== 了.

![Windows 11 新版右键菜单第一层中的「使用小米互传发送」](images/midrop-win11-menu.png)

要是没出现，注销再重新登录一次试试.

### 体检和卸载

```powershell
# 只读体检，不做任何修改
powershell -ExecutionPolicy Bypass -File .\Diagnose.ps1

# 完整回滚
powershell -ExecutionPolicy Bypass -File .\Uninstall.ps1
```

`Uninstall.ps1` 还支持这些可选开关：

| 开关 | 作用 |
| --- | --- |
| `-KeepBackup` | 保留安装前生成的备份 |
| `-KeepDeveloperMode` | 保留开发人员模式设置 |
| `-KeepSdk` | 保留 Windows SDK |
| `-NoRestartExplorer` | 不自动重启资源管理器 |
| `-PurgeRegistryVerbs` | 一并清理注册表动词项 |
| `-KeepRegistryVerbs` | 保留注册表动词项 |

## 翻车了能退回来不喵~
我可在「能退回去」这块下了不少功夫喵~

- 安装前自动备份现有状态，卸载脚本据此完整回滚
- 卸载时只清脚本自己新增的非原厂 `MiDropExtMenu` 键，不动原厂注册表项
- 仓库里给了还原原厂注册表的 `.reg` 文件，随时能恢复
- 不改 `HKLM\SOFTWARE\Classes` 下的原厂键值，就算方案翻车了，原来那个「显示更多选项」入口也可使用

## 许可证

脚本、清单和文档都按 MIT 授权（看仓库里的 `LICENSE` 文件就行）.

最后再啰嗦一句：这项目不包含、不修改、也不重新分发小米的任何二进制文件，纯属非官方作品，跟小米公司没啥关系，别找我（恼）喵~
