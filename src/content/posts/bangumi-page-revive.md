---
title: 番组页复活小记
published: 2026-10-05 21:58:40
updated: 2026-10-05
description: bangumi一直「数据拉取失败」，发现bangumi被墙了,镜像也被封了，于是乎
tags:
  - Cloudflare
  - 博客
category: 博客搭建
image: ""
pinned: false
slug: bangumi-page-revive
---

## 阵亡

数据源用的是第三方镜像 `api.bangumi.pro`，直连测试失败。换官方 `api.bgm.tv` 更别说了。连封面图床 `lain.bgm.tv` 也一起被f封了

（~~这是什么隔墙喂饭~~）。

## 挖条隧道

依据Worker 代理 GitHub API的原理，
加了两条路由：

- `/api/bangumi/v0/*` 转发官方 API，顺手把 JSON 里的 `lain.bgm.tv` 图片地址改写成站内代理
- `/api/bangumi-pic/*` 专门搬封面图

两层都垫了边缘缓存，API 十分钟、图片七天，上游限流被挡住了，回头客直接吃缓存还更快。配置里的 `apiUrl` 换成相对路径 `/api/bangumi`(走自己域名)

## 一点尾巴

条目详情页的链接还是指向官方 `bgm.tv`，没梯子的访客看得到数据和封面，点进去依旧打不开。这部分本尊暂时救不了

