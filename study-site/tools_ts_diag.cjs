// 诊断 Turnstile 在 headless Edge 里为何不渲染：
// 直接访问 api.js，把响应体、最终 URL、错误打出来
const http = require("http");
const CDP_PORT = 9223;

const j = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej);
});

function tinyWsClient(url) {
  const net = require("net");
  const crypto = require("crypto");
  const u = new URL(url);
  const key = crypto.randomBytes(16).toString("base64");
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
    on(h) { handlers.push(h); },
    close() { sock.destroy(); },
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tabs = await j(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const ws = tinyWsClient(page.webSocketDebuggerUrl);
  await ws.send("Page.enable");
  await ws.send("Network.enable");
  await ws.send("Runtime.enable");

  const reqs = [];
  ws.on((m) => {
    if (m.method === "Network.responseReceived") {
      const r = m.params.response;
      if (/turnstile|challenges\.cloudflare/.test(r.url)) reqs.push({ url: r.url, status: r.status, mime: r.mimeType });
    }
    if (m.method === "Network.loadingFailed") {
      const r = m.params;
      if (/turnstile|challenges\.cloudflare/.test(r.requestId || "")) { /* 占位 */ }
    }
  });

  await ws.send("Page.navigate", { url: "https://study.lonelybing.top/" });
  await sleep(6000);

  const ev = async (expr) => {
    const r = await ws.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return "EXC:" + r.exceptionDetails.text;
    return r.result && r.result.value;
  };

  console.log("== 页面里 Turnstile 相关状态 ==");
  console.log("  window.turnstile 存在:", await ev(`typeof window.turnstile`));
  console.log("  iframe 数:", await ev(`document.querySelectorAll('iframe').length`));
  console.log("  .cf-turnstile 子节点数:", await ev(`(document.querySelector('.cf-turnstile')||{}).children ? document.querySelector('.cf-turnstile').children.length : -1`));
  console.log("  .cf-turnstile 存在:", await ev(`!!document.querySelector('.cf-turnstile')`));
  console.log("  页面 HTML 里 cf-turnstile div:", await ev(`document.body.innerHTML.includes('cf-turnstile')`));
  console.log("");
  console.log("== 直接 fetch api.js 看浏览器侧是否可达 ==");
  const fetchRes = await ev(`(async () => {
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/api.js', { method: 'GET' });
      const txt = await r.text();
      return 'status=' + r.status + ' len=' + txt.length + ' head=' + txt.slice(0, 60).replace(/\\s+/g,' ');
    } catch (e) { return 'FETCH_ERR: ' + e.message; }
  })()`);
  console.log("  ", fetchRes);
  console.log("");
  console.log("== 网络层 Turnstile 请求 ==");
  console.log(reqs.length ? reqs.map((r) => `   ${r.status} ${r.mime} ${r.url.slice(0, 90)}`).join("\n") : "   （无任何 turnstile 请求）");
  ws.close();
})().catch((e) => { console.error("ERR", e); process.exit(1); });
