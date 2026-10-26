// 诊断 Turnstile 为何 api.js 加载成功（window.turnstile 是 object）但 iframe 始终为 0。
// 关键怀疑：headless Edge 被 Turnstile 判定为 bot，静默失败（无 iframe、无 token）。
// 本脚本：用 turnstile.render 显式渲染并捕获 onError 回调 + 读 window.turnstile 的方法列表。
const http = require("http");
const CDP_PORT = 9223;

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
  const tabs = await j(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const ws = tinyWsClient(page.webSocketDebuggerUrl);
  await ws.send("Page.enable"); await ws.send("Runtime.enable");
  const logs = [];
  ws.on((m) => {
    if (m.method === "Runtime.consoleAPICalled") logs.push("LOG " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  await ws.send("Page.navigate", { url: "https://study.lonelybing.top/" });
  await sleep(5000);
  const ev = async (e) => {
    const r = await ws.send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return "EXC:" + r.exceptionDetails.text;
    return r.result && r.result.value;
  };
  console.log("window.turnstile 方法:", await ev(`Object.keys(window.turnstile||{}).join(',')`));
  console.log("显式 render 并挂 onError 回调:");
  const res = await ev(`(function(){
    window.__tsEvts = [];
    try {
      var w = window.turnstile;
      if (!w || !w.render) return 'no-render';
      var host = document.querySelector('.cf-turnstile');
      host.innerHTML = '';
      var id = w.render(host, {
        sitekey: '0x4AAAAAAFkI58zgOin02KwC',
        theme: 'dark',
        callback: function (t) { window.__tsEvts.push('callback len=' + (t||'').length); },
        'error-callback': function (c) { window.__tsEvts.push('error-code=' + c); },
        'timeout-callback': function () { window.__tsEvts.push('timeout'); },
        'expired-callback': function () { window.__tsEvts.push('expired'); }
      });
      return 'widgetId=' + id;
    } catch (e) { return 'RENDER_ERR: ' + e.message; }
  })()`);
  console.log("  ", res);
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    const st = await ev(`JSON.stringify({iframe: document.querySelectorAll('iframe').length, token: (document.querySelector('[name=cf-turnstile-response]')||{value:''}).value.length, evts: window.__tsEvts})`);
    console.log(`   t+${(i + 1) * 1.5}s:`, st);
    const parsed = JSON.parse(st);
    if (parsed.evts.length || parsed.iframe) break;
  }
  console.log("页面日志:\n  " + (logs.filter((l) => !/chrome-extension/.test(l)).join("\n  ") || "（无）"));
  ws.close();
})().catch((e) => { console.error("ERR", e); process.exit(1); });
