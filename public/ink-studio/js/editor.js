/* ============================================================
 * 墨驿 InkPost — editor.js
 * 编辑器：工具栏 / 快捷键 / 斜杠命令 / 智能输入 / 查找替换 / 粘贴转换
 * ============================================================ */
"use strict";
window.InkEditor = (function () {
  let ta, gutter, onChange, askModal;
  let slash = { open: false, items: [], sel: 0, start: 0 };

  const $ = s => document.querySelector(s);

  /* ---------------- 基础文本操作 ---------------- */
  function sel() { return { s: ta.selectionStart, e: ta.selectionEnd }; }
  function setSel(s, e) { ta.selectionStart = s; ta.selectionEnd = e == null ? s : e; ta.focus(); }
  function getSelText() { const { s, e } = sel(); return ta.value.slice(s, e); }

  function replaceRange(s, e, text, cursorOffset) {
    ta.setRangeText(text, s, e, "end");
    if (cursorOffset != null) setSel(s + cursorOffset);
    changed();
  }

  function wrapSel(before, after, placeholder) {
    const { s, e } = sel();
    const t = ta.value.slice(s, e) || placeholder || "";
    replaceRange(s, e, before + t + (after == null ? before : after));
    setSel(s + before.length, s + before.length + t.length);
  }

  function lineStart(pos) { return ta.value.lastIndexOf("\n", pos - 1) + 1; }
  function currentLine() {
    const { s } = sel();
    const ls = lineStart(s);
    let le = ta.value.indexOf("\n", s); if (le < 0) le = ta.value.length;
    return { ls, le, text: ta.value.slice(ls, le) };
  }

  function prefixLines(prefix) {
    const { s, e } = sel();
    const ls = lineStart(s);
    let le = ta.value.indexOf("\n", e); if (le < 0) le = ta.value.length;
    const block = ta.value.slice(ls, le);
    const lines = block.split("\n");
    const isOl = /^\d+\./.test(prefix.trim());
    const out = lines.map((l, i) => {
      if (isOl) return (i + 1) + ". " + l.replace(/^\d+\.\s*/, "");
      if (/^[-*+]\s/.test(prefix)) return l.replace(/^([-*+]|\d+\.)\s*/, "") && (prefix + l.replace(/^([-*+]|\d+\.)\s*/, ""));
      return prefix + l;
    });
    replaceRange(ls, le, out.join("\n"));
  }

  function insertBlock(text, selectFrom) {
    const { s } = sel();
    const ls = lineStart(s);
    const needNlBefore = ls > 0 && ta.value[ls - 1] !== "\n" ? "" : "";
    const t = (s === ls && currentLine().text.trim() === "" ? "" : "\n") + text;
    replaceRange(s, sel().e, t);
    if (selectFrom != null) setSel(s + selectFrom);
  }

  function changed() {
    updateGutter();
    if (onChange) onChange(ta.value);
  }

  /* ---------------- 行号 ---------------- */
  function updateGutter() {
    const n = ta.value.split("\n").length;
    const cur = ta.value.slice(0, ta.selectionStart).split("\n").length;
    let h = "";
    for (let i = 1; i <= n; i++) h += (i === cur ? `<span style="color:var(--accent);font-weight:700">${i}</span>` : i) + "\n";
    gutter.innerHTML = h;
    gutter.scrollTop = ta.scrollTop;
  }

  /* ---------------- 工具栏 ---------------- */
  const TB = [
    { icon: "↶", title: "撤销 (Ctrl+Z)", run: () => { ta.focus(); document.execCommand("undo"); changed(); } },
    { icon: "↷", title: "重做 (Ctrl+Y)", run: () => { ta.focus(); document.execCommand("redo"); changed(); } },
    "sep",
    { icon: "H1", title: "一级标题", run: () => prefixLines("# ") },
    { icon: "H2", title: "二级标题", run: () => prefixLines("## ") },
    { icon: "H3", title: "三级标题", run: () => prefixLines("### ") },
    "sep",
    { icon: "B", title: "加粗 (Ctrl+B)", run: () => wrapSel("**", "**", "加粗文字") },
    { icon: "I", title: "斜体 (Ctrl+I)", run: () => wrapSel("*", "*", "斜体") },
    { icon: "S", title: "删除线", run: () => wrapSel("~~", "~~", "删除线") },
    { icon: "H", title: "高亮", run: () => wrapSel("==", "==", "高亮") },
    { icon: "<>", title: "行内代码", run: () => wrapSel("`", "`", "code") },
    { icon: "S▣", title: "剧透遮罩", run: () => wrapSel(":spoiler[", "]", "隐藏内容") },
    "sep",
    {
      icon: "❝▾", title: "引用 / 提示块", menu: [
        ["❝ 引用", () => prefixLines("> ")],
        ["📝 NOTE 提示块", () => admon("NOTE")],
        ["💡 TIP 提示块", () => admon("TIP")],
        ["⚠️ WARNING 提示块", () => admon("WARNING")],
        ["🔥 DANGER 提示块", () => admon("DANGER")],
        ["✅ SUCCESS 提示块", () => admon("SUCCESS")],
      ]
    },
    {
      icon: "≡▾", title: "列表", menu: [
        ["• 无序列表", () => prefixLines("- ")],
        ["1. 有序列表", () => prefixLines("1. ")],
        ["☑ 任务列表", () => prefixLines("- [ ] ")],
      ]
    },
    { icon: "—", title: "分割线", run: () => insertBlock("\n---\n") },
    "sep",
    {
      icon: "🔗▾", title: "链接 / 卡片", menu: [
        ["🔗 链接", () => linkInsert()],
        ["📄 内部链接 [[slug]]", () => wikiInsert()],
        ["🃏 文章卡片 ![[slug]]", () => cardInsert()],
        ["🐙 GitHub 卡片", () => githubInsert()],
      ]
    },
    {
      icon: "🖼▾", title: "图片 / 媒体", menu: [
        ["🖼 图片", () => imageInsert()],
        ["🎞 图片相册 [grid]", () => gridInsert()],
        ["📺 视频嵌入 (B站/YouTube)", () => videoInsert()],
        ["🪟 自定义 Iframe", () => iframeInsert()],
      ]
    },
    {
      icon: "▦▾", title: "表格 / 代码", menu: [
        ["▦ 表格", () => tableInsert()],
        ["</> 代码块", () => codeInsert()],
        ["🗂 代码组 code-group", () => codeGroupInsert()],
        ["🧜 Mermaid 图表", () => langCode("mermaid", "graph TD;\n  A[开始] --> B[结束];")],
        ["🌿 PlantUML 图表", () => langCode("plantuml", "@startuml\nA --> B\n@enduml")],
        ["∑ 行内公式", () => wrapSel("$", "$", "E=mc^2")],
        ["∑ 块级公式", () => insertBlock("\n$$\nE=mc^2\n$$\n")],
      ]
    },
  ];

  function admon(type) {
    askModal("插入提示块", [{ k: "title", label: "自定义标题（可留空）" }], v => {
      insertBlock(`\n> [!${type}]${v.title ? " " + v.title : ""}\n> 内容…\n`);
    });
  }
  function linkInsert() {
    const t = getSelText();
    askModal("插入链接", [
      { k: "text", label: "显示文字", value: t },
      { k: "href", label: "链接地址", ph: "https://…" },
    ], v => { if (v.href) wrapOrInsert(`[${v.text || v.href}](${v.href})`); });
  }
  function wikiInsert() {
    askModal("内部链接", [
      { k: "slug", label: "文章 slug", ph: "my-first-post" },
      { k: "alias", label: "别名（可留空）" },
    ], v => { if (v.slug) wrapOrInsert(`[[${v.slug}${v.alias ? "|" + v.alias : ""}]]`); });
  }
  function cardInsert() {
    askModal("文章卡片", [
      { k: "slug", label: "文章 slug", ph: "my-first-post" },
      { k: "title", label: "卡片标题（可留空）" },
    ], v => { if (v.slug) insertBlock(`\n![[${v.slug}${v.title ? "|" + v.title : ""}]]\n`); });
  }
  function githubInsert() {
    askModal("GitHub 卡片", [{ k: "repo", label: "仓库（owner/repo）", ph: "Bingak/MiDropWin11Menu" }],
      v => { if (v.repo) insertBlock(`\n::github{repo="${v.repo}"}\n`); });
  }
  function imageInsert() {
    askModal("插入图片", [
      { k: "alt", label: "描述（alt）" },
      { k: "src", label: "图片地址", ph: "images/xxx.png 或 https://…" },
    ], v => { if (v.src) wrapOrInsert(`![${v.alt || ""}](${v.src})`); });
  }
  function gridInsert() {
    askModal("图片相册", [
      { k: "imgs", label: "图片地址（每行一个，可用 | 分隔图注；列数按图片数自动计算，最多 4 列）", area: true },
    ], v => {
      if (!v.imgs) return;
      const items = v.imgs.split("\n").map(l => l.trim()).filter(Boolean)
        .map(l => { const [src, alt] = l.split("|").map(x => x.trim()); return `![${alt || ""}](${src})`; });
      insertBlock(`\n[grid]\n${items.join("\n")}\n[/grid]\n`);
    });
  }
  function videoInsert() {
    askModal("视频嵌入", [
      { k: "url", label: "视频链接（自动识别 B站 BV/av/分P、YouTube；其他网址也支持）", ph: "https://www.bilibili.com/video/BV…" },
      { k: "w", label: "宽度（% 或 px，如 100% / 640）", value: "100%" },
      { k: "h", label: "高度（px，如 468）", value: "468" },
    ], v => {
      const html = videoIframe(v.url || "", v.w || "100%", v.h || "468");
      if (html) insertBlock("\n" + html + "\n");
      else alert("未识别的视频链接，请填写完整 URL");
    });
  }
  function videoIframe(url, w, h) {
    const W = (w || "100%").toString(), H = (h || "468").toString();
    const safeAttr = s => String(s).replace(/"/g, "");
    // B站：BV号 / av号 / 分P
    let m = url.match(/bilibili\.com\/video\/(BV[\w]+|av\d+)/i) || url.match(/^(BV[\w]+|av\d+)$/i);
    if (m) {
      const id = m[1];
      const pM = url.match(/[?&]p=(\d+)/);
      const key = /^av/i.test(id) ? `aid=${id.slice(2)}` : `bvid=${id}`;
      return `<iframe width="${safeAttr(W)}" height="${safeAttr(H)}" src="//player.bilibili.com/player.html?${key}&p=${pM ? pM[1] : 1}&autoplay=0&high_quality=1&danmaku=0" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>`;
    }
    // YouTube：watch / youtu.be / shorts / embed
    m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
    if (m) {
      return `<iframe width="${safeAttr(W)}" height="${safeAttr(H)}" src="https://www.youtube.com/embed/${m[1]}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    // 其他视频网站：通用 iframe 嵌入
    if (/^https?:\/\//i.test(url)) {
      return `<iframe width="${safeAttr(W)}" height="${safeAttr(H)}" src="${safeAttr(url)}" frameborder="0" allowfullscreen></iframe>`;
    }
    return null;
  }
  function iframeInsert() {
    askModal("自定义 Iframe", [
      { k: "src", label: "地址", ph: "https://…" },
      { k: "w", label: "宽度", value: "100%" },
      { k: "h", label: "高度", value: "400" },
    ], v => {
      if (!v.src) return;
      insertBlock(`\n<iframe width="${v.w}" height="${v.h}" src="${v.src}" frameborder="0" allowfullscreen></iframe>\n`);
    });
  }
  function tableInsert() {
    askModal("插入表格", [
      { k: "cols", label: "列数", value: "3" },
      { k: "rows", label: "数据行数", value: "2" },
    ], v => {
      const c = Math.max(1, parseInt(v.cols) || 3), r = Math.max(1, parseInt(v.rows) || 2);
      const head = "| " + Array.from({ length: c }, (_, i) => "列" + (i + 1)).join(" | ") + " |";
      const sep = "| " + Array(c).fill("---").join(" | ") + " |";
      const body = Array.from({ length: r }, () => "| " + Array(c).fill(" ").join(" | ") + " |");
      insertBlock("\n" + [head, sep, ...body].join("\n") + "\n");
    });
  }
  function codeInsert() {
    askModal("代码块", [
      { k: "lang", label: "语言", ph: "js / python / bash …", value: "" },
      { k: "title", label: "标题（可留空）" },
      { k: "ln", label: "行号（showLineNumbers / {1,3-5}，可留空）" },
    ], v => {
      const info = [v.title ? `title="${v.title}"` : "", v.ln || ""].filter(Boolean).join(" ");
      const t = getSelText() || "// 代码…";
      wrapOrInsertBlock("```" + (v.lang || "") + (info ? " " + info : "") + "\n" + t + "\n```");
    });
  }
  function codeGroupInsert() {
    askModal("代码组", [{ k: "labels", label: "标签（逗号分隔）", ph: "macOS, Windows, Linux" }], v => {
      const labels = (v.labels || "").split(",").map(x => x.trim()).filter(Boolean);
      const blocks = (labels.length ? labels : ["示例"]).map(l => "```bash title=\"" + l + "\"\n# " + l + " 的命令\n```").join("\n");
      insertBlock(`\n::: code-group${labels.length ? " labels=[" + labels.join(", ") + "]" : ""}\n${blocks}\n:::\n`);
    });
  }
  function langCode(lang, tpl) { insertBlock("\n```" + lang + "\n" + tpl + "\n```\n"); }

  function wrapOrInsert(text) { const { s, e } = sel(); replaceRange(s, e, text); }
  function wrapOrInsertBlock(text) {
    const { s, e } = sel();
    const t = ta.value.slice(s, e);
    if (t) replaceRange(s, e, "```\n" === text.slice(0, 4) ? text : text.replace("// 代码…", t));
    else insertBlock("\n" + text + "\n");
  }

  function buildToolbar() {
    const bar = $("#toolbar");
    TB.forEach(item => {
      if (item === "sep") { const s = document.createElement("span"); s.className = "sep"; bar.appendChild(s); return; }
      if (item.menu) {
        const g = document.createElement("div"); g.className = "tb-group";
        const b = document.createElement("button"); b.className = "tbtn"; b.textContent = item.icon; b.title = item.title;
        const m = document.createElement("div"); m.className = "tb-menu";
        item.menu.forEach(([label, fn]) => {
          const mb = document.createElement("button"); mb.textContent = label;
          mb.onclick = () => { g.classList.remove("open"); fn(); };
          m.appendChild(mb);
        });
        b.onclick = ev => {
          ev.stopPropagation();
          document.querySelectorAll(".tb-group.open").forEach(x => x !== g && x.classList.remove("open"));
          const willOpen = !g.classList.contains("open");
          g.classList.toggle("open");
          if (willOpen) {
            // fixed 定位脱离 #editorPane 的 overflow:hidden 裁剪，按视口定位
            const br = b.getBoundingClientRect();
            m.style.position = "fixed";
            m.style.top = (br.bottom + 4) + "px";
            m.style.left = br.left + "px";
            m.style.right = "auto";
            const mr = m.getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            if (mr.right > vw - 8) { m.style.left = "auto"; m.style.right = Math.max(8, vw - br.right) + "px"; }
          }
        };
        g.appendChild(b); g.appendChild(m); bar.appendChild(g);
      } else {
        const b = document.createElement("button"); b.className = "tbtn"; b.textContent = item.icon; b.title = item.title;
        if (/^[BIHS]$/.test(item.icon)) b.style.fontWeight = item.icon === "B" ? "800" : "600";
        b.onclick = () => item.run();
        bar.appendChild(b);
      }
    });
    document.addEventListener("click", () => document.querySelectorAll(".tb-group.open").forEach(x => x.classList.remove("open")));
    bar.addEventListener("scroll", () => document.querySelectorAll(".tb-group.open").forEach(x => x.classList.remove("open")), { passive: true });
  }

  /* ---------------- 斜杠命令 ---------------- */
  const SLASH = [
    ["H1", "一级标题", "# "], ["H2", "二级标题", "## "], ["H3", "三级标题", "### "],
    ["❝", "引用", "> "], ["•", "无序列表", "- "], ["1.", "有序列表", "1. "],
    ["☑", "任务列表", "- [ ] "], ["—", "分割线", "\n---\n"],
    ["</>", "代码块", () => codeInsert()], ["▦", "表格", () => tableInsert()],
    ["💡", "提示块", () => admon("TIP")], ["🔗", "链接", () => linkInsert()],
    ["🖼", "图片", () => imageInsert()], ["🎞", "图片相册", () => gridInsert()],
    ["📺", "视频嵌入", () => videoInsert()], ["🐙", "GitHub 卡片", () => githubInsert()],
    ["📄", "内部链接", () => wikiInsert()], ["🃏", "文章卡片", () => cardInsert()],
    ["🧜", "Mermaid", () => langCode("mermaid", "graph TD;\n  A --> B;")], ["∑", "块级公式", "\n$$\n\n$$\n"],
  ];

  function slashQuery() {
    // 光标在行首 /xxx 状态
    const { s, e } = sel();
    if (s !== e) return null;
    const { ls, text } = currentLine();
    const m = text.match(/^\/(\w*)$/);
    if (!m) return null;
    return { ls, q: m[1] };
  }
  function slashRefresh() {
    const st = slashQuery();
    const menu = $("#slashMenu");
    if (!st) { menu.hidden = true; slash.open = false; return; }
    const items = SLASH.filter(x => x[1].includes(st.q) || x[0].toLowerCase().includes(st.q.toLowerCase()));
    if (!items.length) { menu.hidden = true; slash.open = false; return; }
    slash = { open: true, items, sel: 0, start: st.ls };
    menu.innerHTML = items.map((it, i) =>
      `<div class="sm-item${i === 0 ? " sel" : ""}" data-i="${i}"><span class="ic">${it[0]}</span>${it[1]}<span class="desc"></span></div>`).join("");
    menu.querySelectorAll(".sm-item").forEach(el => {
      el.onmousedown = ev => { ev.preventDefault(); slashApply(+el.dataset.i); };
    });
    menu.hidden = false;
    // 定位
    const lineH = 23;
    const curLine = ta.value.slice(0, ta.selectionStart).split("\n").length;
    menu.style.top = Math.min(ta.clientHeight - 290, curLine * lineH - ta.scrollTop + 30) + "px";
    menu.style.left = "70px";
  }
  function slashApply(i) {
    const it = slash.items[i]; if (!it) return;
    const { ls } = currentLine();
    const { le } = currentLine();
    replaceRange(ls, le, "");
    $("#slashMenu").hidden = true; slash.open = false;
    if (typeof it[2] === "function") it[2]();
    else { setSel(ls); replaceRange(ls, ls, it[2]); }
  }

  /* ---------------- 智能输入 ---------------- */
  function onKeydown(ev) {
    // 斜杠菜单导航
    if (slash.open) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        slash.sel = (slash.sel + (ev.key === "ArrowDown" ? 1 : -1) + slash.items.length) % slash.items.length;
        $("#slashMenu").querySelectorAll(".sm-item").forEach((el, i) => el.classList.toggle("sel", i === slash.sel));
        return;
      }
      if (ev.key === "Enter") { ev.preventDefault(); slashApply(slash.sel); return; }
      if (ev.key === "Escape") { $("#slashMenu").hidden = true; slash.open = false; return; }
    }

    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && !ev.shiftKey && ev.key.toLowerCase() === "b") { ev.preventDefault(); wrapSel("**", "**", "加粗文字"); return; }
    if (ctrl && !ev.shiftKey && ev.key.toLowerCase() === "i") { ev.preventDefault(); wrapSel("*", "*", "斜体"); return; }
    if (ctrl && !ev.shiftKey && ev.key.toLowerCase() === "k") { ev.preventDefault(); linkInsert(); return; }
    if (ctrl && ev.key.toLowerCase() === "d") { ev.preventDefault(); dupLine(); return; }
    if (ctrl && ev.shiftKey && ev.key.toLowerCase() === "k") { ev.preventDefault(); delLine(); return; }
    if (ctrl && ev.key.toLowerCase() === "f") { ev.preventDefault(); openFind(); return; }
    if (ctrl && ev.key.toLowerCase() === "h") { ev.preventDefault(); openFind(true); return; }
    if (ev.altKey && ev.key === "ArrowUp") { ev.preventDefault(); moveLine(-1); return; }
    if (ev.altKey && ev.key === "ArrowDown") { ev.preventDefault(); moveLine(1); return; }

    if (ev.key === "Tab") { ev.preventDefault(); indent(ev.shiftKey); return; }

    if (ev.key === "Enter") { if (smartEnter()) ev.preventDefault(); return; }

    // 选区自动包裹
    const wraps = { "*": "*", "`": "`", '"': '"', "(": ")", "[": "]", "{": "}", "《": "》", "「": "」" };
    if (wraps[ev.key] && sel().s !== sel().e) {
      ev.preventDefault(); wrapSel(ev.key, wraps[ev.key]); return;
    }
  }

  function smartEnter() {
    const { s, e } = sel();
    if (s !== e) return false;
    const { ls, le, text } = currentLine();
    // 任务/列表/引用续写
    const m = text.match(/^(\s*)((?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?|>\s+)(.*)$/);
    if (!m) return false;
    const [, ind, marker, content] = m;
    if (!content.trim()) { // 空条目 → 结束
      replaceRange(ls, le, "");
      return true;
    }
    let next = marker;
    const om = marker.match(/^(\d+)\./);
    if (om) next = marker.replace(/^\d+/, String(+om[1] + 1));
    replaceRange(s, s, "\n" + ind + next);
    return true;
  }

  function dupLine() {
    const { ls, le, text } = currentLine();
    replaceRange(le, le, "\n" + text);
  }
  function delLine() {
    const { ls, le } = currentLine();
    const end = Math.min(le + 1, ta.value.length);
    replaceRange(ls, end, "");
    setSel(ls);
  }
  function moveLine(dir) {
    const lines = ta.value.split("\n");
    const cur = ta.value.slice(0, sel().s).split("\n").length - 1;
    const tgt = cur + dir;
    if (tgt < 0 || tgt >= lines.length) return;
    [lines[cur], lines[tgt]] = [lines[tgt], lines[cur]];
    ta.value = lines.join("\n");
    const pos = lines.slice(0, tgt).join("\n").length + 1;
    setSel(pos);
    changed();
  }
  function indent(out) {
    const { s, e } = sel();
    const ls = lineStart(s);
    let le = ta.value.indexOf("\n", e); if (le < 0) le = ta.value.length;
    const lines = ta.value.slice(ls, le).split("\n");
    const out2 = lines.map(l => out ? l.replace(/^  /, "") : "  " + l);
    replaceRange(ls, le, out2.join("\n"));
  }

  /* ---------------- 查找替换 ---------------- */
  function openFind(showReplace) {
    $("#findbar").hidden = false;
    $("#replaceInput").style.display = showReplace === false ? "none" : "";
    $("#findInput").focus(); $("#findInput").select();
  }
  function findFlags() { return "g" + ($("#findCase").checked ? "" : "i"); }
  function findRegex() {
    const q = $("#findInput").value;
    if (!q) return null;
    try { return new RegExp($("#findRegex").checked ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), findFlags()); }
    catch { return null; }
  }
  function findCount() {
    const re = findRegex();
    const n = re ? (ta.value.match(re) || []).length : 0;
    $("#findCount").textContent = n ? n + " 处" : "";
    return re;
  }
  function findNext(dir) {
    const re = findCount(); if (!re) return;
    const matches = [...ta.value.matchAll(re)];
    if (!matches.length) return;
    const pos = sel().s;
    let target;
    if (dir > 0) target = matches.find(m => m.index >= (pos === sel().e ? pos : pos + 1)) || matches[0];
    else target = [...matches].reverse().find(m => m.index < pos) || matches[matches.length - 1];
    setSel(target.index, target.index + target[0].length);
    scrollToSel();
  }
  function scrollToSel() {
    const line = ta.value.slice(0, ta.selectionStart).split("\n").length;
    ta.scrollTop = (line - 5) * 23;
  }
  function replaceOne() {
    const re = findRegex(); if (!re) return;
    const t = getSelText();
    re.lastIndex = 0;
    if (t && new RegExp(re.source, findFlags().replace("g", "")).test(t)) {
      replaceRange(sel().s, sel().e, t.replace(new RegExp(re.source, findFlags().replace("g", "")), $("#replaceInput").value));
    }
    findNext(1);
  }
  function replaceAll() {
    const re = findRegex(); if (!re) return;
    ta.value = ta.value.replace(re, $("#replaceInput").value);
    changed(); findCount();
  }

  /* ---------------- 富文本粘贴 → Markdown ---------------- */
  function htmlToMd(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    function walk(node) {
      let out = "";
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, " "); return; }
        const tag = (n.tagName || "").toLowerCase();
        const inner = walk(n);
        switch (tag) {
          case "h1": out += `\n# ${inner.trim()}\n`; break;
          case "h2": out += `\n## ${inner.trim()}\n`; break;
          case "h3": out += `\n### ${inner.trim()}\n`; break;
          case "h4": case "h5": case "h6": out += `\n#### ${inner.trim()}\n`; break;
          case "p": out += `\n${inner.trim()}\n`; break;
          case "br": out += "\n"; break;
          case "strong": case "b": out += `**${inner}**`; break;
          case "em": case "i": out += `*${inner}*`; break;
          case "del": case "s": out += `~~${inner}~~`; break;
          case "code": out += `\`${inner}\``; break;
          case "pre": out += `\n\`\`\`\n${n.textContent.replace(/\n$/, "")}\n\`\`\`\n`; break;
          case "a": out += `[${inner}](${n.getAttribute("href") || ""})`; break;
          case "img": out += `![${n.getAttribute("alt") || ""}](${n.getAttribute("src") || ""})`; break;
          case "blockquote": out += "\n" + inner.trim().split("\n").map(l => "> " + l).join("\n") + "\n"; break;
          case "li": out += `LI_MARK${inner.trim()}\n`; break;
          case "ul": case "ol": out += "\n" + inner + "\n"; break;
          case "table": out += "\n" + tableToMd(n) + "\n"; break;
          case "hr": out += "\n---\n"; break;
          case "script": case "style": case "head": case "meta": case "link": case "title": break;
          default: out += inner;
        }
      });
      return out;
    }
    function tableToMd(t) {
      const rows = [...t.querySelectorAll("tr")].map(tr =>
        [...tr.children].map(c => c.textContent.trim().replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const head = "| " + rows[0].join(" | ") + " |";
      const sep = "| " + rows[0].map(() => "---").join(" | ") + " |";
      return [head, sep, ...rows.slice(1).map(r => "| " + r.join(" | ") + " |")].join("\n");
    }
    let md = walk(doc.body);
    // li 标记转列表
    md = md.split("\n").map(l => l.startsWith("LI_MARK") ? "- " + l.slice(7) : l).join("\n");
    return md.replace(/\n{3,}/g, "\n\n").trim();
  }

  function onPaste(ev) {
    const html = ev.clipboardData.getData("text/html");
    const text = ev.clipboardData.getData("text/plain");
    if (html && text && !/^\s*</.test(text) && /<[a-z][\s\S]*>/i.test(html)) {
      // 看起来是从网页/文档复制的富文本
      ev.preventDefault();
      const md = htmlToMd(html);
      const { s, e } = sel();
      replaceRange(s, e, md);
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init(opts) {
    ta = opts.textarea; gutter = opts.gutter;
    onChange = opts.onChange; askModal = opts.askModal;
    buildToolbar();
    ta.addEventListener("input", () => { changed(); slashRefresh(); });
    ta.addEventListener("keydown", onKeydown);
    ta.addEventListener("paste", onPaste);
    ta.addEventListener("scroll", () => { gutter.scrollTop = ta.scrollTop; if (opts.onScroll) opts.onScroll(); });
    ta.addEventListener("click", () => { updateGutter(); slashRefresh(); });
    ta.addEventListener("keyup", () => updateGutter());
    // 查找栏
    $("#btnFindClose").onclick = () => { $("#findbar").hidden = true; ta.focus(); };
    $("#findInput").addEventListener("input", findCount);
    $("#findInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } if (e.key === "Escape") $("#findbar").hidden = true; });
    $("#btnFindNext").onclick = () => findNext(1);
    $("#btnFindPrev").onclick = () => findNext(-1);
    $("#btnReplace").onclick = replaceOne;
    $("#btnReplaceAll").onclick = replaceAll;
    updateGutter();
  }

  return {
    init, openFind, updateGutter,
    focus: () => ta.focus(),
  };
})();
