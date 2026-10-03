---
title: 逆向app接口,重新搭建本地后台网站
published: 2026-10-03T14:00:00+08:00
pinned: false
description: 把某app的接口逆向一遍，从抓包分析到反编译找签名，再用 Node.js 搭了个本地后台，把App的请求全拐到自己服务器上，顺便把VIP验证也重写了一遍。附 HTTP Toolkit 抓包 + jadx 反编译 + Frida hook 的完整踩坑记录。
image: "https://img.lonelybing.top/file/post/1791035359580_界面.png"
tags:
  - 逆向
  - Android
  - Node.js
  - 记录
category: 折腾笔记
slug: reverse-app-api
series: "逆向"
---

## 起因

事情是这样的：本尊在用某app的时候，发现它的VIP功能挺有意思，但本尊只想研究一下它的接口设计，顺便看看能不能在本地搭一套后台出来玩——毕竟纯前端没意思，有来有回才叫折腾喵~

某app的包名是 `某包名`，对应的官网是 `某网站`。本尊的目标很明确：

1. 搞清楚它的接口长啥样、怎么签名的
2. 把核心接口在本地复刻一遍
3. 让App乖乖走本尊的本地服务器
4. VIP验证什么的，当然也要自己说了算

最终的效果就是手机上点开某app，数据全从本尊电脑上跑，想返回啥返回啥喵~

![手机上跑本地接口的效果](https://img.lonelybing.top/file/post/1791035355836_phone.jpg)

---

## 一、抓包：先把接口摸清楚

逆向第一步当然是抓包。本尊用的是 **HTTP Toolkit**，比 Charles 界面好看，免费版也够用。

### 准备工作

手机上装个证书，WiFi 里代理设成本机 IP。然后打开某app，随便点点——

嗯？怎么全是 CONNECT 看不到内容？

哦对，现在的App基本都开了 SSL Pinning（证书锁定），光装系统证书没用，App 自己会校验服务器证书是不是它预期的那一个。

### 坑 1：Android 7+ 不信任用户证书

本尊的手机是 Android 14，默认不信任用户安装的证书。HTTP Toolkit 装的证书在「用户凭据」里，App 根本不认。

解决办法要么是把证书挪到系统凭据里（需要 root），要么用 Frida hook 掉 SSL Pinning。本尊选了后者——毕竟 root 太麻烦，Frida 一把梭喵~

```bash
# 手机上启动 frida-server（要和电脑上 frida-tools 版本一致）
adb shell /data/local/tmp/frida-server -D &

# 电脑上跑 objection 一键绕过 SSL Pinning
objection -g 某包名 explore
```

进到 objection 的交互界面后，输入：

```
android sslpinning disable
```

搞定！再切回 HTTP Toolkit，请求就全都明明白白地躺在那儿了。

### 接口分析

抓了几分钟，主要接口就这些：

| 接口 | 作用 |
| --- | --- |
| `POST /api/v1/login` | 登录，拿 token |
| `GET /api/v1/user/info` | 获取用户信息（含 VIP 状态） |
| `GET /api/v1/content/list` | 内容列表 |
| `GET /api/v1/content/detail` | 内容详情 |
| `POST /api/v1/vip/verify` | VIP 验证（重点） |

每个请求头里都带了这些东西：

```
Authorization: Bearer <token>
X-Timestamp: 1727932800
X-Sign: a1b2c3d4e5f6...
X-Device: <设备ID>
```

`X-Sign` 一看就是签名，得反编译才能知道怎么算的喵~

---

## 二、反编译：扒签名算法

抓包只能看到请求长啥样，签名怎么生成的还得去代码里找。

### 工具准备

- **jadx-gui**：反编译 dex 到 Java 代码，带 GUI 方便搜
- **apktool**：解资源文件、AndroidManifest.xml
- **Frida**：运行时 hook，验证猜想

先把 APK 拖进 jadx-gui，等它慢慢反编译完。

### 找签名逻辑

本尊的经验是：直接搜 "sign" 或者 "X-Sign" 关键词，大概率能定位到。

搜了一下 `X-Sign`，在 `某包名.network.SignUtils` 这个类里找到了：

```java
public static String getSign(Map<String, String> params, String timestamp) {
    // 把参数按 key 排序
    TreeMap<String, String> sorted = new TreeMap<>(params);
    // 拼时间戳
    sorted.put("timestamp", timestamp);
    // 拼成 key1=value1&key2=value2 的形式
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, String> entry : sorted.entrySet()) {
        sb.append(entry.getKey()).append("=").append(entry.getValue()).append("&");
    }
    // 末尾拼上固定盐值
    sb.append("secret=").append(SECRET_KEY);
    // MD5 后转大写
    return md5(sb.toString()).toUpperCase();
}
```

就这？MD5 加固定密钥？也太朴素了吧喵~

不过等等，`SECRET_KEY` 是哪来的？跟过去一看：

```java
private static final String SECRET_KEY = nativeGetSecretKey();

static {
    System.loadLibrary("native-lib");
}

private static native String nativeGetSecretKey();
```

哦，藏在 so 库里了。Java 层直接看不到，得动 native 层。

### 坑 2：so 里的密钥不好直接扒

`.so` 文件是 native 库，在 `lib/arm64-v8a/libnative-lib.so`。直接用 strings 命令可能能找到，但本尊试过了——密钥不在明文字符串里，应该是运行时拼出来的。

没关系，Frida 直接 hook 这个 native 方法，把返回值打印出来不就行了：

```javascript
// hook_native.js
Java.perform(function() {
    var SignUtils = Java.use("某包名.network.SignUtils");
    SignUtils.nativeGetSecretKey.implementation = function() {
        var result = this.nativeGetSecretKey();
        console.log("[+] nativeGetSecretKey 返回值:", result);
        return result;
    };
});
```

跑起来：

```bash
frida -U -f 某包名 -l hook_native.js --no-pause
```

几秒钟后控制台就吐出来了：

```
[+] nativeGetSecretKey 返回值: xxxxxxxx_SuperSecretKey_xxxxxxxx
```

拿到密钥，签名算法就完全复刻出来了喵~

### 验证一下

本尊用 Node.js 写了个同样的签名函数，跟抓包里的已知签名对了一下：

```javascript
import crypto from "node:crypto";

function getSign(params, timestamp, secretKey) {
  const sorted = { ...params, timestamp };
  const keys = Object.keys(sorted).sort();
  const queryString = keys
    .map((k) => `${k}=${sorted[k]}`)
    .join("&") + `&secret=${secretKey}`;
  return crypto.createHash("md5").update(queryString).digest("hex").toUpperCase();
}
```

随便拿一条抓包记录里的参数和时间戳算一遍，结果和请求头里的 `X-Sign` 完全一致。完美，签名搞定喵~

---

## 三、搭本地后台

接口和签名都搞清楚了，接下来就是自己写一套后台。本尊用的是 **Node.js + Express**，轻量够用。

### 项目结构

```
local-server/
├── src/
│   ├── index.js          # 入口，起服务
│   ├── middleware/
│   │   ├── sign.js       # 签名校验中间件
│   │   └── auth.js       # token 校验中间件
│   ├── routes/
│   │   ├── user.js       # 用户相关接口
│   │   ├── content.js    # 内容相关接口
│   │   └── vip.js        # VIP 验证接口
│   └── data/
│       └── mock.json     # Mock 数据
├── package.json
└── .env
```

### 签名校验中间件

每个请求进来先过一遍签名校验，和App端反过来：

```javascript
// src/middleware/sign.js
import crypto from "node:crypto";

const SECRET_KEY = "xxxxxxxx_SuperSecretKey_xxxxxxxx"; // 刚扒出来的密钥

export function verifySign(req, res, next) {
  const timestamp = req.headers["x-timestamp"];
  const clientSign = req.headers["x-sign"];

  if (!timestamp || !clientSign) {
    return res.status(401).json({ code: 401, message: "签名缺失" });
  }

  // 时间戳差超过 5 分钟就拒掉，防止重放
  const diff = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (diff > 300) {
    return res.status(401).json({ code: 401, message: "请求已过期" });
  }

  // 拼接参数（GET 取 query，POST 取 body）
  const params = req.method === "GET" ? req.query : req.body;
  const sorted = { ...params, timestamp };
  const keys = Object.keys(sorted).sort();
  const queryString = keys
    .map((k) => `${k}=${sorted[k]}`)
    .join("&") + `&secret=${SECRET_KEY}`;

  const serverSign = crypto
    .createHash("md5")
    .update(queryString)
    .digest("hex")
    .toUpperCase();

  if (serverSign !== clientSign) {
    return res.status(401).json({ code: 401, message: "签名错误" });
  }

  next();
}
```

### VIP 验证接口

这是最有意思的部分。本尊把 VIP 状态改成自己说了算，想让谁是 VIP 谁就是 VIP 喵~

```javascript
// src/routes/vip.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.post("/verify", authMiddleware, (req, res) => {
  // 本尊的本地后台：所有登录用户全是永久VIP！
  res.json({
    code: 0,
    message: "success",
    data: {
      isVip: true,
      vipLevel: 99,
      expireTime: "2099-12-31 23:59:59",
      vipName: "至尊终身会员",
      privileges: ["全部功能", "无限制使用", "专属客服", "抢先体验"]
    }
  });
});

export default router;
```

### 用户信息接口

同理，用户信息接口也返回本地构造的数据：

```javascript
// src/routes/user.js
router.get("/info", authMiddleware, (req, res) => {
  res.json({
    code: 0,
    message: "success",
    data: {
      userId: "local_user_001",
      nickname: "本地测试用户",
      avatar: "https://img.lonelybing.top/avatar.png",
      coin: 99999,
      isVip: true,
      vipExpire: "2099-12-31"
    }
  });
});
```

### 启动服务

```javascript
// src/index.js
import express from "express";
import cors from "cors";
import { verifySign } from "./middleware/sign.js";
import userRoutes from "./routes/user.js";
import contentRoutes from "./routes/content.js";
import vipRoutes from "./routes/vip.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 登录接口不需要签名校验（还没 token 呢）
app.post("/api/v1/login", (req, res) => {
  // 随便啥账号密码都返回一个本地 token
  const token = "local_token_" + Date.now();
  res.json({
    code: 0,
    message: "success",
    data: { token, userId: "local_user_001" }
  });
});

// 其余接口统一验签
app.use(verifySign);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/vip", vipRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`本地后台跑起来了喵~ 端口: ${PORT}`);
});
```

启动之后，手机浏览器访问 `http://<电脑IP>:3000/api/v1/user/info` 测一下，能返回数据就说明后台没问题。

![本地后台界面](https://img.lonelybing.top/file/post/1791035359580_界面.png)

---

## 四、让 App 走本地接口

后台搭好了，但 App 还是往官方服务器发请求。怎么让它改成本机地址呢？

### 方案一：DNS 劫持（最简单）

在路由器或者 hosts 文件里把 `某网站` 的域名指到本机 IP。但问题是——本尊的本地服务跑在 3000 端口，App 请求的是 443（HTTPS），端口不一样。

而且 App 会校验证书，就算 DNS 指过来了，证书不对也会报错（虽然之前用 Frida 绕过了 SSL Pinning，但那是临时的）。

### 方案二：反向代理（推荐）

用 nginx 或者直接在 Node 服务前面再加一层，监听 443 端口，用自签证书搞 HTTPS。

本尊直接用 **mkcert** 生了个本地证书，然后把服务改成 HTTPS：

```bash
# 安装 mkcert（Windows 用 scoop 或者直接下二进制）
mkcert -install
mkcert 某网站 localhost 192.168.1.100  # 你的电脑IP
```

然后改 Node 服务：

```javascript
import https from "node:https";
import fs from "node:fs";

const options = {
  key: fs.readFileSync("./certs/某网站+3-key.pem"),
  cert: fs.readFileSync("./certs/某网站+3.pem")
};

https.createServer(options, app).listen(443, "0.0.0.0", () => {
  console.log("HTTPS 本地后台跑在 443 端口了喵~");
});
```

手机上把 `某网站` 的 hosts 指到电脑 IP（用 **Hosts Go** 或者 Magisk 模块），打开 App——

完美！请求全部打到本尊的本地服务器上了喵~

### 坑 3：App 里硬编码了多个域名

本尊最开始只改了主域名，结果发现有些接口还是往官方走。翻了一下反编译的代码，原来 App 里有好几个 baseUrl，分别对应不同业务线。

继续用 Frida hook，把所有 baseUrl 都换掉：

```javascript
Java.perform(function() {
    var BaseUrlConfig = Java.use("某包名.config.BaseUrlConfig");
    BaseUrlConfig.getMainBaseUrl.implementation = function() {
        return "https://某网站/";
    };
    BaseUrlConfig.getApiBaseUrl.implementation = function() {
        return "https://某网站/api/v1/";
    };
    BaseUrlConfig.getCdnBaseUrl.implementation = function() {
        return "https://某网站/cdn/";
    };
    console.log("[+] 所有 baseUrl 已替换成本地地址");
});
```

这样就全齐了。如果想做得彻底一点，也可以直接改 smali 重打包，不过 Frida hook 更灵活，改完不用重新装 App。

---

## 五、效果验证

全部搞完之后，打开某app：

- ✅ 登录成功（随便输啥都能登）
- ✅ 用户信息显示「至尊终身会员」
- ✅ 内容列表正常加载（本尊自己写的 mock 数据）
- ✅ VIP 功能全开，没有任何限制
- ✅ 抓包一看，所有请求都走的本地 443 端口

手机上的效果就是这样的：

![手机端效果](https://img.lonelybing.top/file/post/1791035355836_phone.jpg)

### 坑 4：部分接口本尊还没实现

App 启动时会调一堆初始化接口，本尊只实现了核心的那几个，其他的全返回 404 了。结果 App 倒是没崩，只是有些地方显示空数据——容错做得还不错喵~

补了几个关键的初始化接口（比如 `config/init`、`home/banner`），页面就完整了。剩下的边角接口看心情补，不影响主流程就行。

---

## 六、涉及的工具与文件

| 工具/文件 | 用途 |
| --- | --- |
| HTTP Toolkit | 抓包分析 HTTP 请求 |
| jadx-gui | 反编译 APK 到 Java 代码 |
| Frida + objection | 运行时 hook，绕过 SSL Pinning、打印密钥 |
| mkcert | 生成本地 HTTPS 证书 |
| Node.js + Express | 本地后台服务 |
| Hosts Go（手机端） | 手机上改 hosts，把域名指到本机 |

本地后台的代码大概就这些文件：

```
local-server/
├── src/
│   ├── index.js
│   ├── middleware/
│   │   ├── sign.js
│   │   └── auth.js
│   ├── routes/
│   │   ├── user.js
│   │   ├── content.js
│   │   └── vip.js
│   └── data/
│       └── mock.json
├── certs/
│   ├── 某网站+3.pem
│   └── 某网站+3-key.pem
├── package.json
└── frida_scripts/
    ├── hook_ssl.js
    ├── hook_native.js
    └── hook_baseurl.js
```

---

## 说明与反馈

- 本文仅供学习交流使用，逆向的目的是研究技术，请勿用于非法用途喵~
- 不同 App 的签名算法和验证逻辑千差万别，本文里的某app算是比较简单的（MD5 + 固定密钥），复杂的可能会用 HMAC、RSA、甚至 native 层全程加密
- 如果目标 App 用了 HTTP/2 或者 QUIC，HTTP Toolkit 可能抓不全，那就要上 tcpdump + Wireshark 了
- Frida 的版本一定要和手机上的 frida-server 对应上，不然连不上
- 想做得更彻底可以改 smali 重打包，把 baseUrl 和签名密钥直接替换掉，这样不用 Frida 也能跑
- 有问题欢迎交流：**support@lonelybing.top**

就这样~ 现在某app彻底变成本尊的本地玩具了，想加啥功能加啥功能，摸鱼的时间又多了喵~
