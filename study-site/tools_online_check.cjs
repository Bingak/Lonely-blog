// 线上登出修复 + 练习页全量验证（分页请求，避免一次拉太多）
const http = require("http");
const BASE = "study.lonelybing.top";
const https = require("https");

function req(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      { host: BASE, path, method, headers: { "User-Agent": "curl/8", ...(opts.headers || {}) } },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d })); }
    );
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

const PAGES = [
  "/",
  "/index.html",
  "/02_%E9%98%B6%E6%AE%B5%E4%B8%80_%E7%8E%AF%E5%A2%83%E6%90%AD%E5%BB%BA%E4%B8%8E%E8%B0%83%E8%AF%95.html",
  "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html",
  "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%AD%94%E6%A1%88_%E5%8F%82%E8%80%83_%E6%96%87%E5%AD%97%E9%A2%98.html",
  "/exercises/51%E5%AE%9E%E6%88%98%E4%BA%8C/%E7%BB%83%E4%B9%A0_%E9%A2%98%E7%9B%AE.html",
  "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%80/%E7%AD%94%E6%A1%88_%E5%8F%82%E8%80%83.html",
  "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%AD%94%E6%A1%88_%E5%8F%82%E8%80%83_%E4%BB%A3%E7%A0%81%E9%A2%98.html",
];

(async () => {
  console.log("== 线上（未登录）==");
  for (const p of PAGES) {
    const r = await req("GET", p);
    const isLogin = r.body.includes('id="u"');
    const title = (r.body.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    console.log(`   ${p}\n      ${r.status} ${r.body.length}B 被拦=${isLogin} ${title.slice(0, 46)}`);
  }
  console.log("== 练习页内容抽查（未登录返回登录页是预期）==");
  const r = await req("GET", "/exercises/%E9%98%B6%E6%AE%B5%E4%B8%89/%E7%AD%94%E6%A1%88_%E5%8F%82%E8%80%83_%E4%BB%A3%E7%A0%81%E9%A2%98.html");
  console.log("   阶段三答案_代码题.html:", r.status, r.body.length + "B", "| 被拦:", r.body.includes('id="u"'));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
