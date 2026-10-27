/**
 * study.lonelybing.top —— C 语言学习站门禁 Worker
 *
 * 职责：
 *   1. 全站门禁：未登录的 GET 请求一律返回内联登录页（picsum 随机背景 + Turnstile 人机验证）
 *   2. POST /api/login   { user, pass, token }  -> 校验限流 -> Turnstile -> 凭据 -> 签发 HMAC 会话 Cookie
 *   3. POST /api/logout  -> 清除会话 Cookie
 *   4. 已登录请求 -> env.ASSETS.fetch(request) 透传教程静态页
 *
 * 凭据存 Worker Secrets（部署时用 wrangler secret put 写入）：
 *   STUDY_USER            登录用户名
 *   STUDY_PASS            登录密码
 *   STUDY_SESSION_SECRET  会话签名密钥（任意长随机串）
 *   TURNSTILE_SECRET_KEY  Turnstile Secret Key
 * 站点密钥（会出现在前端 HTML 里，不算机密）走 [vars]：
 *   TURNSTILE_SITE_KEY
 */

const SESSION_COOKIE = "study_session";
const SESSION_TTL = 12 * 3600 * 1000; // 12 小时
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * 已登出的会话黑名单。
 * 登出只靠"清 Cookie"是不够的：Cookie 存在用户浏览器里，攻击者或用户自己
 * 手里留着同一个字符串，服务端仍会认为它有效（签名没过期就没法分辨）。
 * 所以登出时把会话串登记到这里，verifySession 命中即拒。
 * 代价：Worker 实例级内存，重启/多实例会丢；换正式方案应迁到 KV/Durable Object。
 */
const revokedSessions = new Set();
const REVOKE_MAX = 5000;

/** 内存限流：每 IP 60 秒最多 10 次登录尝试（Worker 实例级，够用且不引入 KV 成本） */
const loginHits = new Map();
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 10;

function rateLimited(ip) {
	const now = Date.now();
	const rec = loginHits.get(ip) || { count: 0, start: now };
	if (now - rec.start > RATE_WINDOW) {
		rec.count = 0;
		rec.start = now;
	}
	rec.count += 1;
	loginHits.set(ip, rec);
	// 顺手清理过期记录，避免 Map 无限增长
	if (loginHits.size > 5000) {
		for (const [k, v] of loginHits) {
			if (now - v.start > RATE_WINDOW) loginHits.delete(k);
		}
	}
	return rec.count > RATE_MAX;
}

/** 常数时间比较，防时序侧信道 */
function safeEqual(a, b) {
	if (typeof a !== "string" || typeof b !== "string") return false;
	const la = a.length;
	const lb = b.length;
	const len = Math.max(la, lb);
	let diff = la ^ lb;
	for (let i = 0; i < len; i++) {
		const ca = i < la ? a.charCodeAt(i) : 0;
		const cb = i < lb ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

async function hmacKey(secret) {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

function bufToHex(buf) {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 签发会话：<expires>.<hmac-hex> */
async function signSession(secret) {
	const expires = Date.now() + SESSION_TTL;
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expires)));
	return `${expires}.${bufToHex(sig)}`;
}

/** 校验会话：签名一致、未过期、且未被登出作废 */
async function verifySession(secret, value) {
	if (!value) return false;
	if (revokedSessions.has(value)) return false;
	const dot = value.indexOf(".");
	if (dot <= 0) return false;
	const expires = value.slice(0, dot);
	const sig = value.slice(dot + 1);
	if (!/^\d+$/.test(expires) || !/^[0-9a-f]{64}$/.test(sig)) return false;
	if (Number(expires) < Date.now()) return false;
	const key = await hmacKey(secret);
	const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expires));
	return safeEqual(bufToHex(expected), sig);
}

/** 登记一个已登出的会话（带容量上限，防内存无限增长） */
function revokeSession(value) {
	if (!value) return;
	revokedSessions.add(value);
	if (revokedSessions.size > REVOKE_MAX) {
		// 简单兜底：装满了就整体清空（极端情况下旧会话可能重新有效，换取有界内存）
		revokedSessions.clear();
	}
}

function getCookie(request, name) {
	const raw = request.headers.get("Cookie") || "";
	for (const part of raw.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return v.join("=");
	}
	return null;
}

async function verifyTurnstile(secret, token, ip) {
	if (!secret) return { ok: false, error: "服务端未配置 Turnstile" };
	if (!token) return { ok: false, error: "请先完成人机验证" };
	const body = new URLSearchParams({
		secret,
		response: token,
		remoteip: ip || "",
	});
	const resp = await fetch(TURNSTILE_VERIFY, { method: "POST", body });
	const data = await resp.json().catch(() => ({}));
	if (!data.success) {
		return { ok: false, error: "人机验证未通过，请刷新后重试" };
	}
	return { ok: true };
}

function jsonResponse(data, status) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

/** 登录页 HTML：picsum 随机图背景 + 深色玻璃拟态卡片 + Turnstile */
function loginPage(siteKey, message) {
	const seed = Math.random().toString(36).slice(2, 12);
	const bg = `https://picsum.photos/seed/${seed}/1920/1080`;
	const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
	const msgHtml = message ? `<div class="msg" role="alert">${esc(message)}</div>` : "";
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d1017">
<meta name="format-detection" content="telephone=no">
<title>学习站 · 登录</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

  body {
    margin: 0;
    min-height: 100svh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding:
      calc(20px + env(safe-area-inset-top))
      calc(16px + env(safe-area-inset-right))
      calc(20px + env(safe-area-inset-bottom))
      calc(16px + env(safe-area-inset-left));
    background: #0d1017;
    color: #e9edf5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }

  /* 背景与遮罩分两层，用 fixed 定位代替 background-attachment: fixed
     （后者在 iOS Safari 上会失效/抖动） */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    background: url("${bg}") center / cover no-repeat;
  }
  body::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(1000px 520px at 50% -6%, rgba(28,34,54,.28), transparent 62%),
      linear-gradient(180deg, rgba(10,12,20,.42), rgba(8,10,16,.80));
  }

  .card {
    position: relative;
    z-index: 1;
    width: min(94vw, 400px);
    padding: clamp(24px, 5.4vw, 38px) clamp(20px, 5vw, 34px) clamp(20px, 4.4vw, 30px);
    border-radius: 20px;
    background: rgba(18, 22, 34, .64);
    border: 1px solid rgba(255, 255, 255, .14);
    box-shadow:
      0 1px 0 rgba(255,255,255,.10) inset,
      0 26px 70px rgba(0, 0, 0, .55);
    backdrop-filter: blur(16px) saturate(1.35);
    -webkit-backdrop-filter: blur(16px) saturate(1.35);
  }

  h1 {
    margin: 0 0 6px;
    font-size: clamp(19px, 5vw, 22px);
    font-weight: 650;
    letter-spacing: .04em;
  }
  .sub {
    margin: 0 0 clamp(18px, 4vw, 26px);
    font-size: 12.5px;
    line-height: 1.6;
    color: #9aa4ba;
  }

  label {
    display: block;
    margin: 14px 0 7px;
    font-size: 12.5px;
    color: #aab3c8;
  }

  input {
    width: 100%;
    min-height: 48px;
    padding: 13px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, .16);
    background: rgba(255, 255, 255, .065);
    color: #eef2fa;
    /* 关键：必须 ≥16px，否则 iOS Safari 聚焦输入框会自动放大页面 */
    font-size: 16px;
    font-family: inherit;
    line-height: 1.3;
    outline: none;
    transition: border-color .2s, background .2s, box-shadow .2s;
    -webkit-appearance: none;
    appearance: none;
  }
  input:focus {
    border-color: #6ea8fe;
    background: rgba(255, 255, 255, .10);
    box-shadow: 0 0 0 3px rgba(110, 168, 254, .18);
  }

  .cf-box {
    margin-top: 20px;
    display: flex;
    justify-content: center;
    min-height: 65px;
  }

  button {
    width: 100%;
    min-height: 50px;
    margin-top: 22px;
    padding: 13px;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    background: linear-gradient(135deg, #4f7cff, #7a5cff);
    color: #fff;
    font-family: inherit;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: .12em;
    transition: transform .14s, box-shadow .2s, opacity .2s, filter .2s;
    -webkit-appearance: none;
    appearance: none;
  }
  button:active { transform: scale(.985); filter: brightness(.96); }
  button:disabled { opacity: .6; cursor: wait; transform: none; box-shadow: none; }

  .msg {
    margin-top: 16px;
    padding: 11px 13px;
    border-radius: 10px;
    background: rgba(255, 90, 90, .14);
    border: 1px solid rgba(255, 90, 90, .34);
    color: #ffb9b9;
    font-size: 13px;
    line-height: 1.55;
    text-align: center;
    animation: pop .22s ease-out;
  }
  @keyframes pop {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: none; }
  }

  .foot {
    margin-top: 20px;
    text-align: center;
    font-size: 11.5px;
    color: #79839a;
  }
  .foot a { color: #8fb4ff; text-decoration: none; }

  @media (max-width: 380px) {
    .card { border-radius: 16px; }
    .cf-box { min-height: 60px; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: .01ms !important; animation-duration: .01ms !important; }
  }
</style>
</head>
<body>
<div class="card">
  <h1>学习站</h1>
  <div class="sub">内部教程 · 需登录访问</div>
  <form id="f" novalidate>
    <label for="u">用户名</label>
    <input id="u" name="user" type="text" autocomplete="username"
           autocapitalize="off" autocorrect="off" spellcheck="false"
           enterkeyhint="next" required>
    <label for="p">密码</label>
    <input id="p" name="pass" type="password" autocomplete="current-password"
           enterkeyhint="go" required>
    <div class="cf-box">
      <div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="dark"></div>
    </div>
    <button id="btn" type="submit">进 入</button>
  </form>
  ${msgHtml}
  <div class="foot">随机背景 · <a href="https://picsum.photos/" target="_blank" rel="noopener">picsum.photos</a></div>
</div>
<script>
(function () {
  var form = document.getElementById("f");
  var btn = document.getElementById("btn");
  var card = document.querySelector(".card");

  function showError(text) {
    var old = card.querySelector(".msg");
    if (old) old.remove();
    var div = document.createElement("div");
    div.className = "msg";
    div.setAttribute("role", "alert");
    div.textContent = text;
    card.appendChild(div);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (btn.disabled) return;

    var user = document.getElementById("u").value.trim();
    var pass = document.getElementById("p").value;
    if (!user || !pass) {
      showError("请输入用户名和密码");
      return;
    }

    var tokenEl = document.querySelector("[name=cf-turnstile-response]");
    var token = tokenEl ? tokenEl.value : "";
    if (!token) {
      showError("请先完成人机验证");
      return;
    }

    var old = card.querySelector(".msg");
    if (old) old.remove();

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = "验证中…";

    try {
      var r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user, pass: pass, token: token }),
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d.ok) {
        location.href = "/";
        return;
      }
      showError(d.error || "登录失败，请重试");
    } catch (err) {
      showError("网络异常，请检查连接后重试");
    }

    btn.disabled = false;
    btn.textContent = label;
    if (window.turnstile) {
      try { turnstile.reset(); } catch (err) { /* 忽略 */ }
    }
  });
})();
</script>
</body>
</html>`;
}

const SECURITY_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
};

/** 给任意响应补上安全头（登录页与静态页都要，登录表单最怕被套框点劫持） */
function withSecurityHeaders(resp) {
	const wrapped = new Response(resp.body, resp);
	for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
		wrapped.headers.set(k, v);
	}
	return wrapped;
}

async function handleLogin(request, env) {
	const ip = request.headers.get("CF-Connecting-IP") || "unknown";
	if (rateLimited(ip)) {
		return jsonResponse({ ok: false, error: "尝试过于频繁，请 1 分钟后再试" }, 429);
	}
	let body;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ ok: false, error: "请求格式错误" }, 400);
	}
	const { user, pass, token } = body || {};
	if (!env.STUDY_USER || !env.STUDY_PASS || !env.STUDY_SESSION_SECRET) {
		return jsonResponse({ ok: false, error: "服务端未配置登录凭据" }, 503);
	}
	const ts = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip);
	if (!ts.ok) return jsonResponse({ ok: false, error: ts.error }, 403);

	if (!safeEqual(user || "", env.STUDY_USER) || !safeEqual(pass || "", env.STUDY_PASS)) {
		return jsonResponse({ ok: false, error: "用户名或密码错误" }, 401);
	}
	const session = await signSession(env.STUDY_SESSION_SECRET);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Set-Cookie": `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
		},
	});
}

function handleLogout(request) {
	revokeSession(getCookie(request, SESSION_COOKIE));
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
		},
	});
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/api/login" && request.method === "POST") {
			return handleLogin(request, env);
		}
		if (url.pathname === "/api/logout" && request.method === "POST") {
			return handleLogout(request);
		}

		// 其余一切请求先过门禁
		const session = getCookie(request, SESSION_COOKIE);
		const authed = env.STUDY_SESSION_SECRET
			? await verifySession(env.STUDY_SESSION_SECRET, session)
			: false;

		if (!authed) {
			if (request.method !== "GET") {
				return jsonResponse({ ok: false, error: "未登录" }, 401);
			}
			return withSecurityHeaders(
				new Response(loginPage(env.TURNSTILE_SITE_KEY || "", ""), {
					status: 200,
					headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
				}),
			);
		}

		// 已登录：透传静态资源
		// 资源层关掉了 html_handling，"/" 需要显式指向 /index.html
		let assetRequest = request;
		if (url.pathname === "/" || url.pathname === "") {
			const indexUrl = new URL(request.url);
			indexUrl.pathname = "/index.html";
			assetRequest = new Request(indexUrl.toString(), request);
		}
		const resp = await env.ASSETS.fetch(assetRequest);
		return withSecurityHeaders(resp);
	},
};
