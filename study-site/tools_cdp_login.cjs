// 登录流程 CDP 测试 v4：
//   · 用 headless=new + 禁用自动化开关 + 真实 UA，尽量让 Turnstile 认为不是 bot
//   · 先等 12s 让 Turnstile 自动/手动完成，再提交
//   · 登录成功后逐页检查并截图
// 运行：node tools_cdp_login.cjs
const http = require("http");
const fs = require("fs");
const path = require("path");
const CDP_PORT = 9223;
const B = "https://study.lonelybing.top";
const SHOT_DIR = path.join(__dirname, "tools_shots");

const j = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej);
});

function tinyWsClient(url) {
  const net = require("net"); const crypto = require("crypto");
  const u = new URL(url); const key = crypto.randomBytes(16).toString("base64");
  const sock = net.connect(Number(u.port), u.hostname);
  const pending = new Map(); let id = 0; const handlers = [];
  let buf = Buffer.alloc(0); let opened = false; const queue = [];
  sock.on("connect", () => sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
  function sendFrame(p) {
    const d = Buffer.from(p, "utf8"); const m = crypto.randomBytes(4); let h;
    if (d.length < 126) h = Buffer.from([0x81, 0x80 | d.length]);
    else if (d.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0xfe; h.writeUInt16BE(d.length, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 0xff; h.writeBigUInt64BE(BigInt(d.length), 2); }
    const mk = Buffer.alloc(d.length); for (let i = 0; i < d.length; i++) mk[i] = d[i] ^ m[i % 4];
    sock.write(Buffer.concat([h, m, mk]));
  }
  sock.on("data", (c) => {
    buf = Buffer.concat([buf, c]);
    if (!opened) { const i = buf.indexOf("\r\n\r\n"); if (i === -1) return; opened = true; buf = buf.slice(i + 4); while (queue.length) sendFrame(queue.shift()); }
    while (buf.length >= 2) {
      const b2 = buf[1]; let len = b2 & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const pl = buf.slice(off, off + len).toString("utf8"); buf = buf.slice(off + len);
      let m; try { m = JSON.parse(pl); } catch { continue; }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else handlers.forEach((h) => h(m));
    }
  });
  return {
    send(method, params) { return new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result))); const s = JSON.stringify({ id: mid, method, params: params || {} }); if (!opened) queue.push(s); else sendFrame(s); }); },
    on(h) { handlers.push(h); }, close() { sock.destroy(); },
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const tabs = await j(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const ws = tinyWsClient(page.webSocketDebuggerUrl);
  await ws.send("Page.enable"); await ws.send("Runtime.enable");
  const ev = async (e) => {
    const r = await ws.send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return "EXC:" + r.exceptionDetails.text;
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    const r = await ws.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(r.data, "base64"));
    console.log("     截图 ->", path.relative(process.cwd(), path.join(SHOT_DIR, name)));
  };
  const tokLen = async () => (await ev(`(document.querySelector('[name=cf-turnstile-response]')||{value:''}).value.length`)) || 0;
  const iframeN = async () => (await ev(`document.querySelectorAll('iframe').length`)) || 0;

  console.log("== 1. 打开登录页 ==");
  await ws.send("Page.navigate", { url: B + "/" });
  for (let i = 0; i < 14; i++) {
    await sleep(1500);
    const t = await tokLen(), f = await iframeN();
    if (t) { console.log(`   t+${(i + 1) * 1.5}s: token 就绪（len=${t}）, iframe=${f}`); break; }
    if (i === 13) console.log(`   14s 后 token 仍为 0, iframe=${f}`);
    else if (i % 4 === 3) console.log(`   t+${(i + 1) * 1.5}s: iframe=${f}, token=0（等待中）`);
  }
  await shot("01_login_page.png");

  console.log("== 2. 填写并提交 ==");
  await ev(`document.getElementById('u').value='bingshanak'`);
  await ev(`document.getElementById('p').value='zhao.0617'`);
  console.log("   token 长度:", await tokLen());
  await ev(`document.querySelector('button[type=submit]').click()`);
  await sleep(9000);
  console.log("   路径:", await ev("location.pathname"));
  console.log("   msg:", JSON.stringify(await ev(`(document.querySelector('.msg')||{}).textContent||''`)));
  console.log("   有退出按钮:", await ev(`!!document.getElementById('logout')`));
  console.log("   cookie 含 study_session:", await ev(`document.cookie.includes('study_session')`));
  await shot("03_after_login.png");

  console.log("== 3. 逐页检查 ==");
  const pages = [
    "/index.html",
    "/02_阶段一_环境搭建与调试.html",
    "/exercises/阶段三/练习_题目.html",
    "/exercises/阶段三/答案_参考_文字题.html",
    "/exercises/51实战二/练习_题目.html",
    "/exercises/阶段一/练习_题目.html",
  ];
  for (const p of pages) {
    await ws.send("Page.navigate", { url: B + encodeURI(p) });
    await sleep(2800);
    const t = await ev("document.title");
    const loginGated = await ev(`!!document.getElementById('u')`);
    const h1 = await ev(`(document.querySelector('h1')||{}).textContent||''`);
    const kicker = await ev(`(document.querySelector('.kicker')||{}).textContent||''`);
    const sw = await ev("document.documentElement.scrollWidth");
    const cw = await ev("document.documentElement.clientWidth");
    console.log(`  ${p}`);
    console.log(`     title=${JSON.stringify(t)} 仍被拦=${loginGated}`);
    console.log(`     h1=${JSON.stringify(String(h1).slice(0, 34))} kicker=${JSON.stringify(String(kicker).slice(0, 40))}`);
    console.log(`     横向溢出: ${sw > cw}`);
  }
  ws.close();
})().catch((e) => { console.error("ERR", e); process.exit(1); });
