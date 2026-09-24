/* ============================================================
 * 墨驿 InkPost — markdown.js
 * YAML FrontMatter 序列化/解析（自动转义引号与冒号）
 * 自研 Markdown → HTML 渲染器（含 Firefly 扩展语法）
 * ============================================================ */
"use strict";
window.InkMD = (function () {

  /* ---------------- HTML 转义 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------- YAML 序列化 ---------------- */
  // 需要加引号的字符串：含冒号、引号、#、首尾空格、特殊起始符、YAML 保留字等
  function needsQuote(s) {
    if (s === "") return false; // 空串不输出字段
    if (/^\s|\s$/.test(s)) return true;
    if (/[:#'"&*!|>%@`{}\[\],?]/.test(s)) return true;
    if (/^(yes|no|true|false|null|on|off|~)$/i.test(s)) return true;
    if (/^[\d\-+.]/.test(s) && !isNaN(Number(s))) return true; // 数字样式
    return false;
  }
  function yStr(s) {
    s = String(s);
    if (!needsQuote(s)) return s;
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  // 日期样式不加引号
  function yDate(s) { return String(s); }

  /**
   * 把有序键值对序列化为 YAML。
   * fields: [{k, v, t}]  t: 'str'|'date'|'bool'|'num'|'arr'|'arrInline'|'links'|'raw'
   * 空值自动跳过。
   */
  function yamlDump(fields) {
    const out = [];
    for (const f of fields) {
      const { k, v, t } = f;
      if (v === undefined || v === null || v === "") continue;
      switch (t) {
        case "bool":
          out.push(`${k}: ${v ? "true" : "false"}`); break;
        case "num":
          if (v !== "" && !isNaN(Number(v))) out.push(`${k}: ${Number(v)}`); break;
        case "date":
          out.push(`${k}: ${yDate(v)}`); break;
        case "arr": { // 块式列表
          const arr = (v || []).filter(x => x !== "");
          if (!arr.length) break;
          out.push(`${k}:`);
          arr.forEach(x => out.push(`  - ${yStr(x)}`));
          break;
        }
        case "arrInline": { // 行内列表 [a, b]
          const arr = (v || []).filter(x => x !== "");
          if (!arr.length) break;
          out.push(`${k}: [${arr.map(yStr).join(", ")}]`);
          break;
        }
        case "links": { // projects 的 link 列表 [{label,icon,value}]
          const arr = (v || []).filter(o => o && (o.label || o.value));
          if (!arr.length) break;
          out.push(`${k}:`);
          arr.forEach(o => {
            out.push(`  - label: ${yStr(o.label || "")}`);
            if (o.icon) out.push(`    icon: ${yStr(o.icon)}`);
            out.push(`    value: ${yStr(o.value || "")}`);
          });
          break;
        }
        case "raw": // 自定义字段原样写入
          out.push(`${k}: ${v}`); break;
        default:
          out.push(`${k}: ${yStr(v)}`);
      }
    }
    return out.join("\n");
  }

  /* ---------------- YAML FrontMatter 解析 ---------------- */
  function unquote(s) {
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"') && s.length >= 2)
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
      return s.slice(1, -1).replace(/''/g, "'");
    return s;
  }
  function parseScalar(s) {
    const t = s.trim();
    if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
    if (t !== "" && !isNaN(Number(t)) && !/^\d{4}-/.test(t)) return Number(t);
    return unquote(t);
  }
  /**
   * 解析 frontmatter（支持标量、行内数组、块式数组、link 对象数组）。
   * 返回 { fm:{...}, customOrder:[...] }，未知键也保留。
   */
  function yamlParse(yaml) {
    const fm = {};
    const lines = yaml.split(/\r?\n/);
    let i = 0, curKey = null, curLink = null;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      // link 对象数组项属性
      if (curKey && curLink && /^\s{4}\w/.test(line)) {
        const m = line.match(/^\s+([\w-]+):\s*(.*)$/);
        if (m) curLink[m[1]] = parseScalar(m[2]);
        i++; continue;
      }
      // 块式数组项
      const li = line.match(/^\s+-\s*(.*)$/);
      if (li && curKey) {
        const val = li[1];
        const lm = val.match(/^([\w-]+):\s*(.*)$/);
        if (lm) { // 对象数组项（link）
          curLink = {}; curLink[lm[1]] = parseScalar(lm[2]);
          fm[curKey].push(curLink);
        } else {
          curLink = null;
          fm[curKey].push(parseScalar(val));
        }
        i++; continue;
      }
      // 顶层键
      const m = line.match(/^([\w-]+):\s*(.*)$/);
      if (m) {
        curKey = m[1]; curLink = null;
        const rest = m[2].trim();
        if (rest === "") { fm[curKey] = []; } // 可能是块式数组
        else if (rest.startsWith("[") && rest.endsWith("]")) {
          fm[curKey] = rest.slice(1, -1).split(",").map(x => parseScalar(x)).filter(x => x !== "");
          curKey = null;
        } else { fm[curKey] = parseScalar(rest); curKey = null; }
        i++; continue;
      }
      i++;
    }
    // 空数组占位（无子项）还原为空字符串
    for (const k in fm) if (Array.isArray(fm[k]) && fm[k].length === 0) fm[k] = "";
    return fm;
  }

  function splitFrontMatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { fm: {}, body: text };
    return { fm: yamlParse(m[1]), body: text.slice(m[0].length) };
  }

  /* ================= Markdown 渲染 ================= */
  function renderInline(s) {
    // 先保护行内代码
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0001" + (codes.length - 1) + "\u0001"; });
    s = esc(s);
    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, a, src, t) => `<img src="${esc(src)}" alt="${esc(a)}"${t ? ` title="${esc(t)}"` : ""} loading="lazy">`);
    // 链接
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, a, href, t) => `<a href="${esc(href)}" target="_blank" rel="noopener"${t ? ` title="${esc(t)}"` : ""}>${a}</a>`);
    // 粗斜体
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "<em>$1</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/==([^=]+)==/g, "<mark>$1</mark>");
    // spoiler
    s = s.replace(/:spoiler\[([^\]]+)\]/g, '<span class="spoiler" onclick="this.classList.toggle(\'open\')">$1</span>');
    // 行内数学
    s = s.replace(/\$([^$\n]+)\$/g, '<span class="math">$1</span>');
    // wiki 链接
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug, alias) => {
      const t = (alias || slug).trim(), tg = slug.trim();
      if (tg.startsWith("#")) return `<a class="wiki-link" href="${esc(tg)}">${esc(t)}</a>`;
      return `<a class="wiki-link" href="/posts/${encodeURIComponent(tg)}/" target="_blank">${esc(t)}</a>`;
    });
    // 还原行内代码
    s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
    return s;
  }

  const ADMON = ["note","tip","important","warning","caution","danger","success","example","question","bug","failure","quote","abstract","info","fail"];
  const ADM_ICON = {note:"📝",tip:"💡",important:"❗",warning:"⚠️",caution:"⚠️",danger:"🔥",success:"✅",example:"📌",question:"❓",bug:"🐛",failure:"❌",quote:"💬",abstract:"📄",info:"ℹ️",fail:"❌"};

  function highlight(code, lang) {
    // 轻量高亮：注释、字符串、数字、关键字
    let h = esc(code);
    h = h.replace(/(&quot;.*?&quot;|".*?"|'.*?'|`[^`]*`)/g, '<span class="str">$1</span>');
    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    const kw = /^(js|ts|javascript|typescript|jsx|tsx|py|python|go|rust|java|c|cpp|cs|sh|bash|powershell|ps1|yaml|yml|json|html|css|sql)$/i;
    if (kw.test(lang || "")) {
      h = h.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|class|new|def|print|func|package|type|struct|match|fn|pub|use|async|await|try|catch|throw|null|true|false|None|self|this|interface|enum|switch|case|break|continue|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)\b/g, '<span class="kw">$1</span>');
    }
    h = h.replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="com">$1</span>');
    return h;
  }

  function renderCodeBlock(lang, info, code) {
    lang = (lang || "").toLowerCase();
    const titleM = (info || "").match(/title="([^"]*)"/);
    const title = titleM ? titleM[1] : "";
    const showLn = /\bshowLineNumbers\b|\{[\d,\-]+\}/.test(info || "") && !/\bnoLineNumbers\b/.test(info || "");
    const markM = (info || "").match(/\{([\d,\-\s]+)\}/);
    const marked = new Set();
    if (markM) markM[1].split(",").forEach(p => {
      const r = p.trim().split("-").map(Number);
      if (r.length === 2) for (let x = r[0]; x <= r[1]; x++) marked.add(x);
      else if (!isNaN(r[0])) marked.add(r[0]);
    });
    if (lang === "mermaid" || lang === "plantuml") {
      return `<pre class="${lang === "mermaid" ? "mermaid-card" : "puml-card"}"><div class="cb-head"><span>${esc(title || lang)}</span><span>${lang}</span></div><code>${esc(code)}</code></pre>`;
    }
    let html;
    if (showLn) {
      html = code.split("\n").map((ln, i) => {
        const n = i + 1;
        const mk = marked.has(n) ? ' style="background:rgba(122,162,255,.12)"' : "";
        return `<span${mk}><span class="ln">${n}</span>${highlight(ln, lang) || " "}</span>`;
      }).join("\n");
    } else {
      html = highlight(code, lang);
    }
    return `<pre><div class="cb-head"><span>${esc(title)}</span><span>${esc(lang)}</span></div><code>${html}</code></pre>`;
  }

  function renderTable(rows) {
    const parseRow = r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const head = parseRow(rows[0]);
    const aligns = parseRow(rows[1]).map(c => /^:-+:$/.test(c) ? "center" : /^-+:$/.test(c) ? "right" : "left");
    let h = "<table><thead><tr>" + head.map((c, i) => `<th style="text-align:${aligns[i] || "left"}">${renderInline(c)}</th>`).join("") + "</tr></thead><tbody>";
    for (let i = 2; i < rows.length; i++)
      h += "<tr>" + parseRow(rows[i]).map((c, j) => `<td style="text-align:${aligns[j] || "left"}">${renderInline(c)}</td>`).join("") + "</tr>";
    return h + "</tbody></table>";
  }

  function renderList(items, ordered) {
    let html = ordered ? "<ol>" : "<ul>";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const next = items[i + 1];
      const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      const content = task
        ? `<input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}> ${renderInline(task[2])}`
        : renderInline(it.text);
      html += `<li${task ? ' class="task"' : ""}>${content}`;
      // 更深的连续缩进项 → 子列表
      if (next && next.indent > it.indent) {
        let j = i + 1; const sub = [];
        while (j < items.length && items[j].indent > it.indent) { sub.push(items[j]); j++; }
        html += renderList(sub, next.ordered);
        i = j - 1;
      }
      html += "</li>";
    }
    return html + (ordered ? "</ol>" : "</ul>");
  }

  /** 主渲染：Markdown body → HTML */
  function render(md) {
    const lines = md.split(/\r?\n/);
    let html = "", i = 0;
    const para = [];
    const flushPara = () => {
      if (para.length) { html += "<p>" + renderInline(para.join("\n")).replace(/\n/g, "<br>") + "</p>"; para.length = 0; }
    };

    while (i < lines.length) {
      const line = lines[i];

      // 代码块
      const fence = line.match(/^```(\w*)\s*(.*)$/);
      if (fence) {
        flushPara();
        const buf = []; i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += renderCodeBlock(fence[1], fence[2], buf.join("\n"));
        continue;
      }
      // 块级数学
      if (/^\$\$\s*$/.test(line)) {
        flushPara();
        const buf = []; i++;
        while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += `<div class="math math-block">${esc(buf.join(" "))}</div>`;
        continue;
      }
      // Docusaurus 容器 :::type / ::: code-group
      const docus = line.match(/^:::\s*([\w-]*)(?:\s*\[([^\]]*)\]|\s+(.*))?$/);
      if (docus) {
        flushPara();
        const kind = (docus[1] || "").toLowerCase();
        const buf = []; i++;
        while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        if (kind === "code-group") {
          // labels=[a,b]
          const labM = (docus[3] || "").match(/labels=\[([^\]]*)\]/);
          const labels = labM ? labM[1].split(",").map(x => x.trim()) : [];
          const parts = render(buf.join("\n"));
          html += `<div class="admon adm-note"><div class="ad-title">🗂 代码组${labels.length ? "：" + esc(labels.join(" / ")) : ""}</div>${parts}</div>`;
        } else if (ADMON.includes(kind)) {
          const custom = docus[2] || docus[3] || "";
          html += `<div class="admon adm-${kind}"><div class="ad-title">${ADM_ICON[kind] || "📝"} ${esc(custom || kind.toUpperCase())}</div>${render(buf.join("\n"))}</div>`;
        } else {
          html += render(buf.join("\n"));
        }
        continue;
      }
      // Obsidian !!! / ???
      const obs = line.match(/^(!{3}|\?{3})\s*(\w+)?\s*"?(.*?)"?\s*$/);
      if (obs && (obs[2] || obs[3])) {
        flushPara();
        const kind = (obs[2] || "note").toLowerCase();
        const buf = []; i++;
        while (i < lines.length && /^\s+\S/.test(lines[i])) buf.push(lines[i++].replace(/^\s{4}/, ""));
        const body = render(buf.join("\n"));
        if (obs[1] === "???") html += `<details><summary>${ADM_ICON[kind] || "📝"} ${esc(obs[3] || kind.toUpperCase())}</summary>${body}</details>`;
        else html += `<div class="admon adm-${ADMON.includes(kind) ? kind : "note"}"><div class="ad-title">${ADM_ICON[kind] || "📝"} ${esc(obs[3] || kind.toUpperCase())}</div>${body}</div>`;
        continue;
      }
      // 标题
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara();
        const lv = h[1].length, id = "h-" + encodeURIComponent(h[2].replace(/[#*`]/g, "").trim());
        html += `<h${lv} id="${id}">${renderInline(h[2])}</h${lv}>`;
        i++; continue;
      }
      // 分割线
      if (/^(\s*[-*_]\s*){3,}$/.test(line)) { flushPara(); html += "<hr>"; i++; continue; }
      // GitHub 卡片
      const gh = line.match(/^::github\{repo="([^"]+)"\}\s*$/);
      if (gh) {
        flushPara();
        html += `<div class="gh-card"><div class="gh-ic">🐙</div><div><div class="gh-repo">${esc(gh[1])}</div><div class="gh-sub">GitHub 仓库卡片 · 前台自动拉取数据</div></div></div>`;
        i++; continue;
      }
      // 文章卡片 ![[slug]]
      const pc = line.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/);
      if (pc) {
        flushPara();
        const slug = pc[1].trim(), t = (pc[2] || pc[1]).trim();
        html += `<a class="post-card" href="/posts/${encodeURIComponent(slug)}/" target="_blank"><div class="pc-title">📄 ${esc(t)}</div><div class="pc-path">/posts/${esc(slug)}/</div></a>`;
        i++; continue;
      }
      // 图片画廊 [grid cols=3] ... [/grid]
      if (/^\[grid(?:\s+cols=(\d))?\]\s*$/i.test(line)) {
        flushPara();
        const cols = Math.min(6, Math.max(1, +(RegExp.$1 || 2)));
        const buf = []; i++;
        while (i < lines.length && !/^\[\/grid\]\s*$/i.test(lines[i])) buf.push(lines[i++]);
        i++;
        const imgs = [];
        buf.forEach(l => {
          const m = l.match(/^[-*]?\s*!\[([^\]]*)\]\(([^)\s]+)/);
          if (m) imgs.push({ alt: m[1], src: m[2] });
        });
        html += `<div class="grid-gallery" style="grid-template-columns:repeat(${cols},1fr)">` +
          imgs.map(g => `<img src="${esc(g.src)}" alt="${esc(g.alt)}" title="${esc(g.alt)}" loading="lazy">`).join("") + "</div>";
        continue;
      }
      // 引用块（含提示块）
      if (/^>\s?/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
        const adm = buf[0] && buf[0].match(/^\[!(\w+)\]\s*(.*)$/);
        if (adm && ADMON.includes(adm[1].toLowerCase())) {
          const kind = adm[1].toLowerCase();
          const custom = adm[2] || "";
          html += `<div class="admon adm-${kind}"><div class="ad-title">${ADM_ICON[kind] || "📝"} ${esc(custom || kind.toUpperCase())}</div>${render(buf.slice(1).join("\n"))}</div>`;
        } else {
          html += `<blockquote>${render(buf.join("\n"))}</blockquote>`;
        }
        continue;
      }
      // 表格
      if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        flushPara();
        const rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        html += renderTable(rows);
        continue;
      }
      // 列表
      const lm = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (lm) {
        flushPara();
        const items = [];
        while (i < lines.length) {
          const m2 = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (!m2) break;
          items.push({ indent: m2[1].length, ordered: /^\d/.test(m2[2]), text: m2[3] });
          i++;
        }
        html += renderList(items, items[0].ordered);
        continue;
      }
      // 原始 HTML（iframe / span / div 等整行）
      if (/^\s*<(iframe|div|span|details|summary|br|video|img|p|section)\b/i.test(line)) {
        flushPara();
        html += line + "\n"; i++; continue;
      }
      // 空行
      if (/^\s*$/.test(line)) { flushPara(); i++; continue; }
      // 普通段落行
      para.push(line); i++;
    }
    flushPara();
    return html;
  }

  /** 提取大纲 */
  function outline(md) {
    const out = [];
    md.split(/\r?\n/).forEach(l => {
      const m = l.match(/^(#{1,4})\s+(.*)$/);
      if (m) out.push({ level: m[1].length, text: m[2].replace(/[#*`]/g, "").trim() });
    });
    return out;
  }

  /* 统计 */
  function stats(md) {
    const cjk = (md.match(/[一-鿿]/g) || []).length;
    const words = (md.replace(/[一-鿿]/g, " ").match(/[A-Za-z0-9_]+/g) || []).length;
    const total = cjk + words;
    return { chars: total, lines: md.split("\n").length, minutes: Math.max(1, Math.round(total / 350)) };
  }

  return { esc, yamlDump, yamlParse, splitFrontMatter, render, outline, stats, yStr };
})();
