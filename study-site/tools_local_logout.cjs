// 修正版登出验证：复用同一个 cookie 串，登出后立刻再访问，检查是否被拦
const http = require("http");
const PORT = 8799;
const path = process.argv[2] || "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html";

function req(m, p, o = {}) {
  return new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port: PORT, path: p, method: m, headers: o.headers || {} }, (x) => {
      let d = ""; x.on("data", (c) => (d += c)); x.on("end", () => res({ status: x.statusCode, body: d, headers: x.headers }));
    });
    r.on("error", rej); if (o.body) r.write(o.body); r.end();
  });
}
const MARK = 'id="u"';

(async () => {
  const l = await req("POST", "/api/login", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: "bingshanak", pass: "zhao.0617", token: "XXXX.DUMMY.TOKEN" }),
  });
  const ck = (l.headers["set-cookie"] || [])[0].split(";")[0];
  const before = await req("GET", path, { headers: { Cookie: ck } });
  await req("POST", "/api/logout", { headers: { Cookie: ck } });
  const after = await req("GET", path, { headers: { Cookie: ck } });
  const none = await req("GET", path);
  console.log("cookie:", ck.slice(0, 34) + "…");
  console.log("登出前        :", before.status, before.body.length + "B", "真实页:", !before.body.includes(MARK));
  console.log("登出后(旧cookie):", after.status, after.body.length + "B", "被拦:", after.body.includes(MARK));
  console.log("登出后(无cookie):", none.status, none.body.length + "B", "被拦:", none.body.includes(MARK));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
