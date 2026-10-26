// 本地 wrangler dev 全流程验证：用 Turnstile 官方测试密钥（任何 token 都通过），
// 验证 handleLogin -> signSession -> verifySession -> 静态资源透传 整条链路，
// 特别是新增的 /exercises/... 路由在登录后能否正确返回 HTML（而非登录页）。
// 运行：node tools_local_login.cjs
const http = require("http");

const PORT = process.env.PORT || 8799;
const B = `http://127.0.0.1:${PORT}`;

const req = (method, path, opts = {}) =>
  new Promise((resolve, reject) => {
    const r = http.request(
      { host: "127.0.0.1", port: PORT, path, method, headers: opts.headers || {} },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      }
    );
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });

const cookieOf = (h) => {
  const raw = h["set-cookie"] || [];
  const c = Array.isArray(raw) ? raw[0] : raw;
  return c ? c.split(";")[0] : "";
};

(async () => {
  // 1. 未登录 → 登录页
  let r = await req("GET", "/");
  console.log("== 1. 未登录 ==");
  console.log("   GET / ->", r.status, r.body.length, "字节 | 含登录表单:", r.body.includes('id="u"'), "| 含 Turnstile:", r.body.includes("cf-turnstile"));

  r = await req("GET", "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html");
  console.log("   GET 练习页 ->", r.status, r.body.length, "字节 | 被拦:", r.body.includes('id="u"'));

  // 2. 登录（dummy token，测试密钥下必过）
  const body = JSON.stringify({ user: "bingshanak", pass: "zhao.0617", token: "XXXX.DUMMY.TOKEN" });
  r = await req("POST", "/api/login", {
    headers: { "Content-Type": "application/json" },
    body,
  });
  const cookie = cookieOf(r.headers);
  console.log("== 2. 登录 ==");
  console.log("   POST /api/login ->", r.status, "|", r.body.slice(0, 80));
  console.log("   Set-Cookie:", cookie.slice(0, 60) + (cookie.length > 60 ? "…" : ""));
  if (!cookie) { console.log("!! 没有拿到会话 Cookie，后续跳过"); return; }

  // 3. 带 Cookie 访问
  console.log("== 3. 登录后访问 ==");
  const pages = [
    "/",
    "/index.html",
    "/02_%E9%98%B6%E6%AE%B5%E4%B8%80_%E7%8E%AF%E5%A2%83%E6%90%AD%E5%BB%BA%E4%B8%8E%E8%B0%83%E8%AF%95.html",
    "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html",
    "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%AD%94%E6%A1%88_%E5%8F%82%E8%80%83_%E6%96%87%E5%AD%97%E9%A2%98.html",
    "/exercises/51%E5%AE%9E%E6%88%98%E4%BA%8C/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html",
    "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%80/%E7%AD%94%E6%A1%88_%E5%8F%82%E8%80%83.html",
  ];
  for (const p of pages) {
    const rr = await req("GET", p, { headers: { Cookie: cookie } });
    const isLogin = rr.body.includes('id="u"');
    const title = (rr.body.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    const h1 = (rr.body.match(/<h1>([^<]*)/) || [])[1] || "";
    const kicker = (rr.body.match(/class="kicker">([^<]*)</) || [])[1] || "";
    console.log(`   ${decodeURIComponent(p)}`);
    console.log(`      ${rr.status} ${rr.body.length}B 仍被拦=${isLogin} title=${JSON.stringify(title)}`);
    if (!isLogin) console.log(`      h1=${JSON.stringify(h1.slice(0, 34))} kicker=${JSON.stringify(kicker.slice(0, 40))}`);
  }

  // 4. 伪造会话 → 必须拒绝
  r = await req("GET", "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html", { headers: { Cookie: "study_session=forged.abc" } });
  console.log("== 4. 伪造会话 ==");
  console.log("   访问练习页 ->", r.status, "| 被拦（回到登录页）:", r.body.includes('id="u"'));

  // 5. 登出
  r = await req("POST", "/api/logout", { headers: { Cookie: cookie } });
  console.log("== 5. 登出 ==");
  console.log("   POST /api/logout ->", r.status, "| 清除 cookie:", cookieOf(r.headers) === "study_session=");
  await new Promise((x) => setTimeout(x, 300));
  r = await req("GET", "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html", { headers: { Cookie: cookie } });
  console.log("   旧 cookie 再访问 ->", r.status, "| 已失效被拦:", r.body.includes('id="u"'));
  r = await req("GET", "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html");
  console.log("   无 cookie 访问 ->", r.status, "| 被拦:", r.body.includes('id="u"'));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
