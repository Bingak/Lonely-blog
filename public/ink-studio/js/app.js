/* ============================================================
 * 墨驿 InkPost — app.js
 * 状态 / 登录门 / 主题 / 表单 / 文档库 / 导入导出 / GitHub 发布
 * ============================================================ */
"use strict";
(function () {
  const MD = window.InkMD;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ================= 常量 ================= */
  const LS = { docs: "inkpost.docs.v1", current: "inkpost.current", settings: "inkpost.settings" };
  const TYPE_NAME = { post: "文章", project: "项目", dynamic: "动态", gallery: "画廊" };
  const COLLECTION = { post: "posts", project: "projects", dynamic: "dynamic" }; // gallery 走 ghPushGallery，不经此表
  const LICENSES = [
    ["", "不使用"], ["MIT", "MIT License", "https://opensource.org/licenses/MIT"],
    ["Apache-2.0", "Apache License 2.0", "https://www.apache.org/licenses/LICENSE-2.0"],
    ["GPL-3.0", "GNU GPLv3", "https://www.gnu.org/licenses/gpl-3.0.html"],
    ["GPL-2.0", "GNU GPLv2", "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html"],
    ["AGPL-3.0", "GNU AGPLv3", "https://www.gnu.org/licenses/agpl-3.0.html"],
    ["LGPL-3.0", "GNU LGPLv3", "https://www.gnu.org/licenses/lgpl-3.0.html"],
    ["BSD-2-Clause", "BSD 2-Clause", "https://opensource.org/licenses/BSD-2-Clause"],
    ["BSD-3-Clause", "BSD 3-Clause", "https://opensource.org/licenses/BSD-3-Clause"],
    ["MPL-2.0", "Mozilla Public License 2.0", "https://www.mozilla.org/en-US/MPL/2.0/"],
    ["Unlicense", "The Unlicense", "https://unlicense.org/"],
    ["CC-BY-4.0", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["CC-BY-SA-4.0", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
    ["CC-BY-NC-SA-4.0", "CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/"],
    ["CC0-1.0", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
  ];


  /* ================= 状态 ================= */
  const TS_SITEKEY_DEFAULT = "0x4AAAAAAFCFMk3cJMZKa-Q3"; // Cloudflare Turnstile 公开 Site Key
  const SESSION_KEY = "inkpost.session";
  let settings = load(LS.settings, {
    theme: "system",
    turnstileKey: "",
    github: { token: "", owner: "Bingak", repo: "Lonely-blog", branch: "main", root: "src/content" },
  });
  let docs = load(LS.docs, []);
  let cur = null;          // 当前文档
  let saveTimer = null;

  function load(k, dft) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dft; } catch { return dft; } }
  function persist() {
    localStorage.setItem(LS.docs, JSON.stringify(docs));
    localStorage.setItem(LS.current, cur ? cur.id : "");
    localStorage.setItem(LS.settings, JSON.stringify(settings));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(msg, cls) {
    const t = document.createElement("div");
    t.className = "toast-item " + (cls || ""); t.textContent = msg;
    $("#toast").appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function nowStr(withTime) {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : date;
  }

  /* ================= 文档模型 ================= */
  function newDoc(type) {
    return {
      id: uid(), type: type || "post",
      fm: type === "dynamic"
        ? { published: nowStr(true), location: "", pinned: false }
        : type === "gallery"
        ? { id: "", name: "", description: "", location: "", date: nowStr(false), tags: [], cover: "", password: "", passwordHint: "" }
        : { title: "", published: nowStr(false), description: "", tags: [], draft: false, pinned: false, slug: "", comment: true },
      galleryImgs: [], // 仅 gallery
      custom: [],
      body: type === "dynamic" ? "" : "\n在这里开始正文…\n",
      updatedAt: Date.now(),
    };
  }
  function docTitle(d) {
    if (d.type === "gallery") return d.fm.name || "未命名相册";
    return d.fm.title || (d.type === "dynamic" ? "动态 · " + (d.fm.published || "") : "未命名文章");
  }

  /* ================= FrontMatter 构建 ================= */
  function buildFields(d) {
    const f = d.fm, out = [];
    const S = (k, v) => out.push({ k, v, t: "str" });
    if (d.type === "dynamic") {
      out.push({ k: "published", v: f.published, t: "date" });
      S("location", f.location);
      out.push({ k: "pinned", v: !!f.pinned, t: "bool" });
    } else if (d.type === "project") {
      S("title", f.title);
      S("slug", f.slug);
      out.push({ k: "published", v: f.published, t: "date" });
      if (f.draft) out.push({ k: "draft", v: true, t: "bool" });
      out.push({ k: "order", v: f.order, t: "num" });
      S("description", f.description);
      S("image", f.image);
      S("status", f.status);
      out.push({ k: "tags", v: f.tags || [], t: "arr" });
      out.push({ k: "link", v: f.links || [], t: "links" });
      S("lang", f.lang);
      if (f.comment === false) out.push({ k: "comment", v: false, t: "bool" });
    } else { // post（gallery 不走 FrontMatter，见 ghPushGallery）
      S("title", f.title);
      out.push({ k: "published", v: f.published, t: "date" });
      out.push({ k: "updated", v: f.updated, t: "date" });
      S("description", f.description);
      S("image", resolveCover(f));
      out.push({ k: "tags", v: f.tags || [], t: "arrInline" });
      S("category", f.category);
      if (f.draft) out.push({ k: "draft", v: true, t: "bool" });
      out.push({ k: "pinned", v: !!f.pinned, t: "bool" });
      S("slug", f.slug);
      S("lang", f.lang);
      S("author", f.author);
      S("sourceLink", f.sourceLink);
      S("licenseName", f.licenseName);
      S("licenseUrl", f.licenseUrl);
      if (f.comment === false) out.push({ k: "comment", v: false, t: "bool" });
      S("password", f.password);
      S("passwordHint", f.passwordHint);
      S("series", f.series);
      out.push({ k: "seriesOrder", v: f.seriesOrder, t: "num" });
    }
    (d.custom || []).forEach(c => { if (c.k) out.push({ k: c.k, v: c.v, t: "raw" }); });
    return out;
  }

  function galleryBody(d) {
    if (d.type !== "gallery" || !d.galleryImgs.length) return d.body;
    // 博客 remark-image-grid 只认 [grid]（列数按图片数自动计算，最多 4 列），图片不带列表前缀
    const items = d.galleryImgs.map(g => `![${g.alt || ""}](${g.src})`).join("\n");
    return `[grid]\n${items}\n[/grid]\n\n` + (d.body || "").replace(/^\n+/, "");
  }

  function galleryUrlsTxt(d) {
    const urls = d.galleryImgs.map(g => (g.src || "").trim()).filter(Boolean);
    return urls.length ? urls.join("\n") + "\n" : "";
  }
  function buildMarkdown(d) {
    if (d.type === "gallery") return galleryUrlsTxt(d); // 相册走 galleryConfig.ts + urls.txt，不生成 md
    return "---\n" + MD.yamlDump(buildFields(d)) + "\n---\n" + galleryBody(d).replace(/^\n/, "\n");
  }

  /* ================= 文件名 ================= */
  function fileName(d) {
    if (d.type === "dynamic") {
      const m = (d.fm.published || nowStr(true)).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2})[:：-](\d{2})/);
      return (m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : nowStr(true).replace(/[: ]/g, "-")) + ".md";
    }
    const base = (d.fm.slug || d.fm.title || "untitled").trim().replace(/[\\/:*?"<>|]/g, "-");
    return base + ".md";
  }

  /* ================= 表单生成 ================= */
  function fld(label, inner, hint) {
    return `<div class="field"><label>${label}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
  }
  function txt(key, value, ph, hint, label) {
    return fld(label, `<input data-f="${key}" value="${MD.esc(value || "")}" placeholder="${ph || ""}">`, hint);
  }
  function dateFld(key, value, label, withTimeKey) {
    const wt = withTimeKey ? !!withTimeKey.value : / \d{2}:\d{2}/.test(value || "");
    return fld(label,
      `<div class="field-row"><input data-f="${key}" value="${MD.esc(value || "")}" placeholder="${wt ? "2026-08-04 10:30:00" : "2026-08-04"}" style="flex:1">
       <button class="tbtn" data-now="${key}" title="填入当前时间">现在</button></div>
       <label class="chk small"><input type="checkbox" data-timeprec="${key}" ${wt ? "checked" : ""}> 包含时分秒</label>`);
  }
  function chips(key, arr, label) {
    return fld(label, `<input data-chipin="${key}" placeholder="回车添加">
      <div class="chipbox" data-chips="${key}">${(arr || []).map(t => `<span class="chip">${MD.esc(t)}<b data-chipdel="${MD.esc(t)}">✕</b></span>`).join("")}</div>`);
  }
  function segCover(f) {
    const mode = f._coverMode || (f.image ? "custom" : "none");
    const isRand = mode === "random";
    return fld("封面图片", `
      <div class="seg" data-seg="coverMode">
        <button data-v="none" class="${mode === "none" ? "on" : ""}">不使用</button>
        <button data-v="random" class="${isRand ? "on" : ""}">随机 API</button>
        <button data-v="custom" class="${mode === "custom" ? "on" : ""}">自定义</button>
      </div>
      <div data-cover-rand ${isRand ? "" : "hidden"} style="margin-top:8px">
        <div class="hint" style="margin:4px 0">发布后 FrontMatter 写入 <code>image: "api"</code>，博客按 coverImageConfig 的 API 列表依次尝试随机图。</div>
      </div>
      <input data-f="image" ${mode === "custom" ? "" : "hidden"} value="${MD.esc(mode === "custom" ? f.image || "" : "")}" placeholder="图片地址 https://…" style="margin-top:8px">`);
  }
  function licenseFld(f) {
    return fld("开源协议", `<select data-lic>
      ${LICENSES.map(l => `<option value="${l[0]}" ${f.licenseName === l[1] || (!f.licenseName && !l[0]) ? "selected" : ""}>${l[0] || "不使用"}</option>`).join("")}
    </select>`, "选中后自动填充 licenseName 与 licenseUrl");
  }

  function renderForm() {
    const d = cur, f = d.fm, host = $("#formHost");
    let h = "";
    if (d.type === "dynamic") {
      h += `<div class="fset" open><summary>动态信息</summary><div class="fbody">`;
      h += dateFld("published", f.published, "发布时间");
      h += txt("location", f.location, "如：邯郸", "", "位置");
      h += `<label class="chk"><input type="checkbox" data-fb="pinned" ${f.pinned ? "checked" : ""}> 置顶</label>`;
      h += `</div></div>`;
      h += `<div class="fset"><summary>自定义字段</summary><div class="fbody" data-custom></div></div>`;
    } else if (d.type === "project") {
      h += `<div class="fset" open><summary>基础信息</summary><div class="fbody">`;
      h += txt("title", f.title, "项目名 · 一句话描述", "标题中的冒号、引号会自动转义", "项目标题 *");
      h += txt("slug", f.slug, "midrop-win11-menu", "导出文件名优先使用 slug", "Slug");
      h += dateFld("published", f.published, "发布日期");
      h += `<div class="field-row">` +
        fld("排序 order", `<input data-f="order" type="number" value="${f.order ?? ""}" placeholder="95">`) +
        fld("状态 status", `<select data-f="status">${["", "published", "developing", "archived", "paused"].map(s => `<option ${f.status === s ? "selected" : ""} value="${s}">${s || "（默认）"}</option>`).join("")}</select>`) +
        `</div>`;
      h += `<label class="chk"><input type="checkbox" data-fb="draft" ${f.draft ? "checked" : ""}> 草稿（不对读者可见）</label>`;
      h += txt("lang", f.lang, "zh_CN", "与站点默认语言不同时填写", "语言");
      h += `</div></div>`;
      h += `<div class="fset" open><summary>简介与封面</summary><div class="fbody">`;
      h += fld("项目描述", `<textarea data-f="description" rows="3">${MD.esc(f.description || "")}</textarea>`, "描述中的冒号、引号会自动转义");
      h += txt("image", f.image, "https://img.lonelybing.top/…", "", "封面图片");
      h += `</div></div>`;
      h += `<div class="fset" open><summary>标签</summary><div class="fbody">${chips("tags", f.tags, "标签")}</div></div>`;
      h += `<div class="fset" open><summary>相关链接</summary><div class="fbody"><div data-links></div><button class="btn small add-mini" data-addlink>＋ 添加链接</button></div></div>`;
      h += `<div class="fset"><summary>自定义字段</summary><div class="fbody" data-custom></div></div>`;
    } else if (d.type === "gallery") {
      h += `<div class="fset" open><summary>相册信息</summary><div class="fbody">`;
      h += txt("id", f.id, "firefly-2026", "相册唯一标识，用于目录与 URL 路径；修改将视为新相册", "相册 ID *");
      h += txt("name", f.name, "相册名称", "", "相册名称 *");
      h += fld("相册描述", `<textarea data-f="description" rows="2">${MD.esc(f.description || "")}</textarea>`);
      h += `<div class="field-row">${txt("location", f.location, "拍摄地点", "", "地点")}${txt("date", f.date, "2026-09-24", "格式 YYYY-MM-DD", "日期")}</div>`;
      h += txt("cover", f.cover, "封面图 URL（可选，留空用第一张图）", "", "封面图");
      h += `<div class="field-row">${txt("password", f.password, "", "访问密码（可选）", "访问密码")}${txt("passwordHint", f.passwordHint, "", "输错密码时显示", "密码提示")}</div>`;
      h += `</div></div>`;
      h += `<div class="fset" open><summary>相册标签</summary><div class="fbody">${chips("tags", f.tags, "回车添加标签")}</div></div>`;
      h += `<div class="fset" open><summary>图片列表</summary><div class="fbody"><div data-gimgs></div><button class="btn small add-mini" data-addgimg>＋ 添加图片</button><div class="hint">发布时写入 public/gallery/{ID}/urls.txt，每行一个图片 URL</div></div></div>`;
    } else { // post
      h += `<div class="fset" open><summary>基础信息</summary><div class="fbody">`;
      h += txt("title", f.title, "文章标题", "标题中的冒号、引号会自动转义，无需手写 YAML", "文章标题 *");
      h += dateFld("published", f.published, "发布时间");
      h += dateFld("updated", f.updated, "更新时间（留空则不输出）");
      h += fld("文章描述", `<textarea data-f="description" rows="3">${MD.esc(f.description || "")}</textarea>`, "显示在首页文章卡片上；冒号、引号自动转义");
      h += txt("slug", f.slug, "my-first-post", "导出文件名优先使用 slug", "自定义 Slug");
      h += `</div></div>`;
      h += `<div class="fset" open><summary>封面图片</summary><div class="fbody">${segCover(f)}</div></div>`;
      h += `<div class="fset" open><summary>标签与分类</summary><div class="fbody">${chips("tags", f.tags, "标签")}${txt("category", f.category, "如：项目分享", "", "分类")}</div></div>`;
      h += `<div class="fset"><summary>高级设置</summary><div class="fbody">`;
      h += `<div class="checks">
        <label class="chk"><input type="checkbox" data-fb="draft" ${f.draft ? "checked" : ""}> 草稿</label>
        <label class="chk"><input type="checkbox" data-fb="pinned" ${f.pinned ? "checked" : ""}> 置顶</label>
        <label class="chk"><input type="checkbox" data-fb="commentOff" ${f.comment === false ? "checked" : ""}> 关闭评论</label>
      </div>`;
      h += `<div class="field-row">${txt("author", f.author, "留空用站点默认", "", "作者")}${txt("lang", f.lang, "zh-CN", "", "语言")}</div>`;
      h += `<div class="field-row">${txt("series", f.series, "系列名", "", "系列")}${fld("系列序号", `<input data-f="seriesOrder" type="number" value="${f.seriesOrder ?? ""}">`)}</div>`;
      h += txt("sourceLink", f.sourceLink, "https://…", "", "来源链接");
      h += licenseFld(f);
      h += `<div class="field-row">${txt("password", f.password, "", "", "访问密码")}${txt("passwordHint", f.passwordHint, "", "", "密码提示")}</div>`;
      h += `</div></div>`;
      h += `<div class="fset"><summary>自定义字段</summary><div class="fbody" data-custom></div></div>`;
    }
    host.innerHTML = h;
    bindForm(host);
    renderLinks(); renderGimgs(); renderCustom();
  }

  /* ------- 链接列表（project） ------- */
  function renderLinks() {
    const host = $("[data-links]"); if (!host) return;
    const arr = cur.fm.links || (cur.fm.links = []);
    host.innerHTML = arr.map((l, i) => `
      <div class="link-item">
        <button class="mini-del" data-dellink="${i}">✕</button>
        <input data-lk="${i}" data-k="label" value="${MD.esc(l.label || "")}" placeholder="名称（GitHub）">
        <input data-lk="${i}" data-k="icon" value="${MD.esc(l.icon || "")}" placeholder="图标（fa7-brands:github）">
        <input class="lv" data-lk="${i}" data-k="value" value="${MD.esc(l.value || "")}" placeholder="链接 https://…">
      </div>`).join("");
    host.querySelectorAll("[data-lk]").forEach(inp => inp.oninput = () => {
      arr[+inp.dataset.lk][inp.dataset.k] = inp.value; touch();
    });
    host.querySelectorAll("[data-dellink]").forEach(b => b.onclick = () => { arr.splice(+b.dataset.dellink, 1); renderLinks(); touch(); });
  }
  /* ------- 画廊图片 ------- */
  function renderGimgs() {
    const host = $("[data-gimgs]"); if (!host) return;
    const arr = cur.galleryImgs;
    host.innerHTML = arr.map((g, i) => `
      <div class="kv-item">
        <button class="mini-del" data-delgimg="${i}">✕</button>
        <input data-gi="${i}" data-k="src" value="${MD.esc(g.src || "")}" placeholder="图片地址">
        <input data-gi="${i}" data-k="alt" value="${MD.esc(g.alt || "")}" placeholder="图注（可留空）">
      </div>`).join("");
    host.querySelectorAll("[data-gi]").forEach(inp => inp.oninput = () => { arr[+inp.dataset.gi][inp.dataset.k] = inp.value; touch(); });
    host.querySelectorAll("[data-delgimg]").forEach(b => b.onclick = () => { arr.splice(+b.dataset.delgimg, 1); renderGimgs(); touch(); });
  }
  /* ------- 自定义字段 ------- */
  function renderCustom() {
    const host = $("[data-custom]"); if (!host) return;
    host.innerHTML = cur.custom.map((c, i) => `
      <div class="kv-item">
        <button class="mini-del" data-delc="${i}">✕</button>
        <input data-cf="${i}" data-k="k" value="${MD.esc(c.k)}" placeholder="字段名">
        <input class="kv2" data-cf="${i}" data-k="v" value="${MD.esc(c.v)}" placeholder="原样写入的值（如 123 / true / [a, b]）">
      </div>`).join("") + `<button class="btn small add-mini" data-addc>＋ 添加字段</button>`;
    host.querySelectorAll("[data-cf]").forEach(inp => inp.oninput = () => { cur.custom[+inp.dataset.cf][inp.dataset.k] = inp.value; touch(); });
    host.querySelectorAll("[data-delc]").forEach(b => b.onclick = () => { cur.custom.splice(+b.dataset.delc, 1); renderCustom(); touch(); });
    host.querySelector("[data-addc]").onclick = () => { cur.custom.push({ k: "", v: "" }); renderCustom(); touch(); };
  }

  /* ------- 表单事件绑定 ------- */
  function bindForm(host) {
    host.querySelectorAll("[data-f]").forEach(inp => {
      inp.oninput = () => { cur.fm[inp.dataset.f] = inp.value; touch(); };
      inp.onchange = inp.oninput;
    });
    host.querySelectorAll("[data-fb]").forEach(inp => {
      inp.onchange = () => {
        const k = inp.dataset.fb;
        if (k === "commentOff") cur.fm.comment = !inp.checked;
        else cur.fm[k] = inp.checked;
        touch();
      };
    });
    host.querySelectorAll("[data-now]").forEach(b => b.onclick = () => {
      const key = b.dataset.now;
      const withTime = host.querySelector(`[data-timeprec="${key}"]`)?.checked;
      cur.fm[key] = nowStr(withTime);
      renderForm(); touch();
    });
    host.querySelectorAll("[data-timeprec]").forEach(cb => cb.onchange = () => {
      const key = cb.dataset.timeprec, v = cur.fm[key];
      if (v) {
        const m = v.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/);
        cur.fm[key] = cb.checked
          ? `${m[1]} ${m[2] || nowStr(true).slice(11, 16)}:${m[3] || "00"}`
          : m[1];
      }
      renderForm(); touch();
    });
    // chips
    host.querySelectorAll("[data-chipin]").forEach(inp => {
      inp.onkeydown = ev => {
        if (ev.key === "Enter" && inp.value.trim()) {
          ev.preventDefault();
          const k = inp.dataset.chipin;
          cur.fm[k] = cur.fm[k] || [];
          cur.fm[k].push(inp.value.trim());
          renderForm(); touch();
        }
      };
    });
    host.querySelectorAll("[data-chipdel]").forEach(b => b.onclick = () => {
      const box = b.closest("[data-chips]"), k = box.dataset.chips;
      cur.fm[k] = cur.fm[k].filter(t => t !== b.dataset.chipdel);
      renderForm(); touch();
    });
    // 封面分段
    const seg = host.querySelector('[data-seg="coverMode"]');
    if (seg) seg.querySelectorAll("button").forEach(b => b.onclick = () => {
      cur.fm._coverMode = b.dataset.v;
      if (b.dataset.v === "none") cur.fm.image = "";
      renderForm(); touch();
    });
    // 开源协议
    const lic = host.querySelector("[data-lic]");
    if (lic) lic.onchange = () => {
      const L = LICENSES.find(l => l[0] === lic.value);
      cur.fm.licenseName = L && L[0] ? L[1] : "";
      cur.fm.licenseUrl = L && L[0] ? L[2] : "";
      touch();
    };
    const addLink = host.querySelector("[data-addlink]");
    if (addLink) addLink.onclick = () => { (cur.fm.links = cur.fm.links || []).push({ label: "", icon: "", value: "" }); renderLinks(); touch(); };
    const addGimg = host.querySelector("[data-addgimg]");
    if (addGimg) addGimg.onclick = () => { cur.galleryImgs.push({ src: "", alt: "" }); renderGimgs(); touch(); };
  }

  /* ================= 保存 / 刷新 ================= */
  function touch() {
    cur.updatedAt = Date.now();
    $("#saveState").textContent = "保存中…";
    $("#saveState").classList.add("dirty");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist();
      $("#saveState").textContent = "已保存 ✓";
      $("#saveState").classList.remove("dirty");
    }, 500);
    refreshViews();
  }

  function refreshViews() {
    $("#docTitleView").textContent = docTitle(cur);
    $("#docTypeBadge").textContent = cur.type.toUpperCase();
    if (cur.type === "gallery") return refreshGalleryViews();
    const md = buildMarkdown(cur);
    const body = galleryBody(cur);
    // 预览
    let headHtml = "";
    if (cur.type !== "dynamic") {
      const f = cur.fm;
      const cover = resolveCover(f);
      headHtml = `<div class="post-head">${cover ? `<img class="ph-img" src="${MD.esc(cover)}" onerror="this.remove()">` : ""}
        <div class="ph-body"><h1>${MD.esc(f.title || "未命名")}</h1>
        ${f.description ? `<div class="ph-desc">${MD.esc(f.description)}</div>` : ""}
        <div class="ph-meta"><span>📅 ${MD.esc(f.published || "")}</span>
        ${f.category ? `<span>📁 ${MD.esc(f.category)}</span>` : ""}
        ${(f.tags || []).map(t => `<span class="ph-tag">${MD.esc(t)}</span>`).join("")}</div></div></div>`;
    } else {
      headHtml = `<div class="post-head"><div class="ph-body"><div class="ph-meta"><span>💬 动态</span><span>📅 ${MD.esc(cur.fm.published || "")}</span>${cur.fm.location ? `<span>📍 ${MD.esc(cur.fm.location)}</span>` : ""}</div></div></div>`;
    }
    $("#pvPreview").innerHTML = headHtml + MD.render(body);
    // 大纲
    const ol = MD.outline(body);
    $("#pvOutline").innerHTML = ol.length
      ? ol.map(o => `<a class="ol-item" style="padding-left:${(o.level - 1) * 14 + 8}px" data-h="${MD.esc(o.text)}">${"▸".repeat(0)}${MD.esc(o.text)}</a>`).join("")
      : `<p style="color:var(--fg3)">暂无标题</p>`;
    $$("#pvOutline .ol-item").forEach(a => a.onclick = () => {
      switchPv("preview");
      const el = [...$("#pvPreview").querySelectorAll("h1,h2,h3,h4")].find(h => h.textContent.trim() === a.dataset.h);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    });
    // YAML / 源码
    const yaml = MD.yamlDump(buildFields(cur));
    $("#pvYaml").textContent = "---\n" + yaml + "\n---";
    $("#pvSource").textContent = md;
  }

  function refreshGalleryViews() {
    const f = cur.fm;
    const imgs = cur.galleryImgs.filter(g => (g.src || "").trim());
    $("#pvPreview").innerHTML = `<div class="post-head"><div class="ph-body"><h1>${MD.esc(f.name || "未命名相册")}</h1>
      ${f.description ? `<div class="ph-desc">${MD.esc(f.description)}</div>` : ""}
      <div class="ph-meta"><span>📅 ${MD.esc(f.date || "")}</span>${f.location ? `<span>📍 ${MD.esc(f.location)}</span>` : ""}${(f.tags || []).map(t => `<span class="ph-tag">${MD.esc(t)}</span>`).join("")}</div></div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:12px">
      ${imgs.map(g => `<img src="${MD.esc(g.src)}" alt="${MD.esc(g.alt || "")}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px" onerror="this.style.opacity=.25">`).join("") || `<p style="color:var(--fg3)">暂无图片，请在左侧「图片列表」添加</p>`}</div>`;
    $("#pvOutline").innerHTML = `<p style="color:var(--fg3)">相册无大纲</p>`;
    $("#pvYaml").textContent = albumToTs(f);
    $("#pvSource").textContent = galleryUrlsTxt(cur);
  }

  function resolveCover(f) {
    if (f._coverMode === "random") {
      // 博客的随机封面机制：FrontMatter 里写 image: "api"，构建后依次尝试
      // coverImageConfig.randomCoverImage.apis（见 src/config/coverImageConfig.ts），
      // 不支持指定图片编号
      return "api";
    }
    return f.image || "";
  }

  /* 编辑器内容 → 状态 */
  function onEditorInput(v) {
    cur.body = v;
    updateStatus();
    touch();
  }

  function updateStatus() {
    const st = MD.stats(cur.body || "");
    $("#statWords").textContent = st.chars + " 字";
    $("#statLines").textContent = st.lines + " 行";
    $("#statRead").textContent = "约 " + (st.chars ? st.minutes : 0) + " 分钟";
    const ta = $("#editor");
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.split("\n").length;
    const col = ta.selectionStart - before.lastIndexOf("\n");
    $("#statCursor").textContent = `行 ${line}, 列 ${col}`;
  }

  /* ================= 文档切换 ================= */
  function openDoc(id) {
    cur = docs.find(d => d.id === id) || docs[0];
    if (!cur) { cur = newDoc("post"); docs.push(cur); }
    cur.custom = cur.custom || [];
    cur.galleryImgs = cur.galleryImgs || [];
    $("#docType").value = cur.type;
    $("#editor").value = cur.body || "";
    renderForm();
    window.InkEditor.updateGutter();
    updateStatus();
    refreshViews();
    persist();
  }

  /* ================= 文档库 UI ================= */
  function renderLibrary() {
    const list = $("#docList");
    const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = sorted.map(d => `
      <div class="doc-item ${d.id === cur.id ? "active" : ""}" data-id="${d.id}">
        <div class="di-title"><span class="badge">${d.type}</span>${MD.esc(docTitle(d))}</div>
        <div class="di-meta"><span>${new Date(d.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><span>${MD.stats(d.body || "").chars} 字</span></div>
        <div class="di-ops">
          <button class="tbtn" data-op="rename">改名</button>
          <button class="tbtn" data-op="dup">复制</button>
          <button class="tbtn" data-op="del" style="color:var(--danger)">删除</button>
        </div>
      </div>`).join("") || `<p style="color:var(--fg3);padding:12px">暂无文档，点击「＋ 新建」。</p>`;
    list.querySelectorAll(".doc-item").forEach(el => {
      el.onclick = ev => {
        const op = ev.target.dataset.op;
        const d = docs.find(x => x.id === el.dataset.id);
        if (!op) { openDoc(d.id); renderLibrary(); $("#libraryBack").hidden = true; return; }
        ev.stopPropagation();
        if (op === "del") {
          if (!confirm(`删除「${docTitle(d)}」？不可恢复。`)) return;
          docs = docs.filter(x => x.id !== d.id);
          if (cur.id === d.id) openDoc(docs[0] ? docs[0].id : null);
        } else if (op === "rename") {
          const t = prompt("新标题：", d.fm.title || ""); if (t != null) { d.fm.title = t; if (cur.id === d.id) renderForm(); }
        } else if (op === "dup") {
          const c = JSON.parse(JSON.stringify(d)); c.id = uid(); c.fm.title = (c.fm.title || "") + " 副本"; c.updatedAt = Date.now();
          docs.push(c);
        }
        persist(); renderLibrary(); refreshViews();
      };
    });
  }

  /* ================= 导入 / 导出 ================= */
  function importMarkdown(text, name) {
    const { fm, body } = MD.splitFrontMatter(text);
    let type = "post";
    if (!fm.title && fm.published) type = "dynamic";
    else if (fm.link || fm.status !== undefined || fm.order !== undefined) type = "project";
    const KNOWN = {
      post: ["title", "published", "updated", "description", "image", "tags", "category", "draft", "pinned", "slug", "lang", "author", "sourceLink", "licenseName", "licenseUrl", "comment", "password", "passwordHint", "series", "seriesOrder"],
      project: ["title", "slug", "published", "draft", "order", "description", "image", "status", "tags", "link", "lang", "comment"],
      dynamic: ["published", "location", "pinned"],
    }[type];
    const d = newDoc(type);
    d.body = body.replace(/^\n+/, "");
    d.custom = [];
    for (const k in fm) {
      if (KNOWN.includes(k)) {
        if (k === "link") d.fm.links = fm[k];
        else d.fm[k] = fm[k];
      } else {
        d.custom.push({ k, v: typeof fm[k] === "string" ? fm[k] : JSON.stringify(fm[k]) });
      }
    }
    if (fm.image === "api") { d.fm._coverMode = "random"; }
    else if (fm.image) d.fm._coverMode = "custom";
    docs.push(d);
    openDoc(d.id);
    toast(`已导入${name ? "「" + name + "」" : ""}（识别为${TYPE_NAME[type]}）`, "ok");
  }

  function exportMd() {
    if (cur.type === "gallery") {
      const blob = new Blob([galleryUrlsTxt(cur)], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (cur.fm.id || "gallery") + "-urls.txt";
      a.click(); URL.revokeObjectURL(a.href);
      toast("已导出 " + a.download, "ok");
      return;
    }
    const blob = new Blob([buildMarkdown(cur)], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName(cur);
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 " + a.download, "ok");
  }

  /* ================= 通用弹窗 ================= */
  let modalCb = null;
  function askModal(title, fields, cb) {
    $("#modalTitle").textContent = title;
    const body = $("#modalBody");
    body.innerHTML = fields.map(f =>
      f.area
        ? `<label>${f.label}<textarea data-mf="${f.k}" rows="4" placeholder="${f.ph || ""}">${MD.esc(f.value || "")}</textarea></label>`
        : `<label>${f.label}<input data-mf="${f.k}" value="${MD.esc(f.value || "")}" placeholder="${f.ph || ""}"></label>`
    ).join("");
    $("#modalFoot").innerHTML = `<button class="btn" id="mCancel">取消</button><button class="btn primary" id="mOk">确定</button>`;
    modalCb = () => {
      const v = {};
      body.querySelectorAll("[data-mf]").forEach(i => v[i.dataset.mf] = i.value);
      cb(v);
    };
    $("#mOk").onclick = () => { closeModal(); modalCb && modalCb(); window.InkEditor.focus(); };
    $("#mCancel").onclick = closeModal;
    $("#modalBack").hidden = false;
    const first = body.querySelector("[data-mf]"); if (first) first.focus();
  }
  function closeModal() { $("#modalBack").hidden = true; modalCb = null; }
  $("#modalClose").onclick = closeModal;
  $("#modalBack").addEventListener("click", e => { if (e.target.id === "modalBack") closeModal(); });

  /* ================= 主题 ================= */
  function applyTheme() {
    const t = settings.theme;
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("#btnTheme").textContent = t === "light" ? "☀ 浅色" : t === "dark" ? "🌙 深色" : "◐ 跟随系统";
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (settings.theme === "system") applyTheme(); });

  /* ================= 登录门（凭据存 Worker Secrets，前端不可见） ================= */
  let tsToken = "";
  function renderTurnstile() {
    const key = settings.turnstileKey || TS_SITEKEY_DEFAULT;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.onload = () => {
      if (!window.turnstile || !$("#turnstileBox")) return;
      window.turnstile.render("#turnstileBox", {
        sitekey: key,
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        callback: t => { tsToken = t; },
        "expired-callback": () => { tsToken = ""; },
      });
    };
    document.head.appendChild(s);
  }
  /** 返回 true=有效 / false=无效 / "offline"=服务不可达但会话未过期（降级离线） */
  async function checkSession(session) {
    try {
      const r = await fetch("/api/admin-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      });
      const j = await r.json().catch(() => ({}));
      return j.ok === true;
    } catch {
      const exp = Number(String(session).split(".")[0]);
      return Number.isFinite(exp) && exp > Date.now() ? "offline" : false;
    }
  }
  async function initGate() {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      const st = await checkSession(saved);
      if (st === true) return enterApp();
      if (st === "offline") return enterApp(true);
      localStorage.removeItem(SESSION_KEY);
    }
    $("#gateLogin").hidden = false;
    renderTurnstile();
    $("#btnLogin").onclick = tryLogin;
    $("#loginPass").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  }
  async function tryLogin() {
    const msg = $("#loginMsg");
    const user = $("#loginUser").value.trim(), pass = $("#loginPass").value;
    if (!user || !pass) { msg.textContent = "请输入用户名和密码"; return; }
    if (!tsToken) { msg.textContent = "请先完成人机验证"; return; }
    msg.textContent = "登录中…";
    try {
      const r = await fetch("/api/admin-login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass, token: tsToken }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.session) {
        localStorage.setItem(SESSION_KEY, j.session);
        enterApp();
      } else {
        msg.textContent = j.message || "登录失败（" + r.status + "）";
        $("#loginPass").value = "";
        tsToken = "";
        if (window.turnstile) window.turnstile.reset();
      }
    } catch {
      msg.textContent = "无法连接登录服务，请检查网络或 Worker 部署";
      tsToken = "";
      if (window.turnstile) window.turnstile.reset();
    }
  }
  function enterApp(offline) {
    $("#loginGate").style.display = "none";
    $("#app").hidden = false;
    boot();
    if (offline) toast("离线模式：可编辑与导出，发布需联网", "err");
  }
  function lock() {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  /* ================= GitHub ================= */
  function ghSettings() {
    const g = settings.github;
    askModal("GitHub 仓库设置", [], () => {});
    // 直接构建专用界面
    $("#modalTitle").textContent = "GitHub 仓库（提交后由 Cloudflare 自动构建）";
    $("#modalBody").innerHTML = `
      <label>Personal Access Token<input id="ghToken" type="password" value="${MD.esc(g.token)}" placeholder="repo 权限的 PAT"></label>
      <div class="field-row">
        <label style="flex:1">所有者<input id="ghOwner" value="${MD.esc(g.owner)}" placeholder="Bingak"></label>
        <label style="flex:1">仓库<input id="ghRepo" value="${MD.esc(g.repo)}" placeholder="Blog"></label>
      </div>
      <div class="field-row">
        <label style="flex:1">分支<input id="ghBranch" value="${MD.esc(g.branch)}" placeholder="main"></label>
        <label style="flex:1">内容根目录<input id="ghRoot" value="${MD.esc(g.root)}" placeholder="src/content"></label>
      </div>
      <label>Turnstile Site Key（可选，默认用站点公开 Key）<input id="ghTs" value="${MD.esc(settings.turnstileKey)}" placeholder="${TS_SITEKEY_DEFAULT}"></label>
      <p style="font-size:11.5px;color:var(--fg3)">Token 仅保存在本机浏览器 localStorage。提交使用 GitHub Contents API，推送即触发 Cloudflare 构建。登录凭据存于 Worker Secrets，前端不可见。</p>`;
    $("#modalFoot").innerHTML = `
      <button class="btn" id="ghPull">从仓库拉取文件…</button>
      <span class="spacer"></span>
      <button class="btn" id="ghSaveCfg">保存设置</button>
      <button class="btn primary" id="ghPush">发布当前文档 ⇧</button>`;
    const collect = () => {
      settings.github = { token: $("#ghToken").value.trim(), owner: $("#ghOwner").value.trim(), repo: $("#ghRepo").value.trim(), branch: $("#ghBranch").value.trim() || "main", root: $("#ghRoot").value.trim() || "src/content" };
      settings.turnstileKey = $("#ghTs").value.trim();
      persist();
    };
    $("#ghSaveCfg").onclick = () => { collect(); closeModal(); toast("设置已保存", "ok"); };
    $("#ghPush").onclick = async () => { collect(); await ghPush(); };
    $("#ghPull").onclick = async () => { collect(); ghPullAsk(); };
  }
  /** 逐段编码路径：保留 / 不编码，GitHub Contents API 才能正确解析多级路径 */
  const ghPath = p => p.split("/").map(encodeURIComponent).join("/");
  function ghApi(path, opts) {
    const g = settings.github;
    return fetch(`https://api.github.com/repos/${g.owner}/${g.repo}${path}`, {
      ...opts,
      headers: {
        "Authorization": "Bearer " + g.token,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(opts && opts.headers || {}),
      },
    });
  }
  /** 读仓库文件 -> { sha, text }；不存在返回 null */
  async function ghGetFile(rel) {
    const g = settings.github;
    const r = await ghApi(`/contents/${ghPath(rel)}?ref=${encodeURIComponent(g.branch)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.content) return null;
    return { sha: j.sha, text: decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))) };
  }
  /** 写仓库文件：覆盖自动带 sha；新文件目录由 GitHub 自动创建 */
  async function ghPutFile(rel, text, message) {
    const g = settings.github;
    const exist = await ghGetFile(rel);
    const r = await ghApi(`/contents/${ghPath(rel)}`, {
      method: "PUT",
      body: JSON.stringify({
        message, content: btoa(unescape(encodeURIComponent(text))),
        branch: g.branch, ...(exist ? { sha: exist.sha } : {}),
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status);
  }
  async function ghPush() {
    const g = settings.github;
    if (!g.token || !g.owner || !g.repo) { toast("请先填写 GitHub 设置", "err"); return; }
    if (cur.type === "gallery") return ghPushGallery();
    const path = `${g.root}/${COLLECTION[cur.type]}/${fileName(cur)}`;
    toast("正在提交到 " + path + " …");
    try {
      const exist = await ghGetFile(path);
      const r = await ghApi(`/contents/${ghPath(path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `${exist ? "update" : "add"}: ${docTitle(cur)} [via InkPost]`,
          content: btoa(unescape(encodeURIComponent(buildMarkdown(cur)))),
          branch: g.branch, ...(exist ? { sha: exist.sha } : {}),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message || r.status);
      closeModal();
      toast("已提交仓库，Cloudflare 将自动构建 ✓", "ok");
    } catch (e) {
      toast("提交失败：" + e.message, "err");
    }
  }
  /** 相册发布：合并 src/config/galleryConfig.ts + 写 public/gallery/{id}/urls.txt */
  async function ghPushGallery() {
    const f = cur.fm;
    const id = (f.id || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) { toast("请填写相册 ID（字母 / 数字 / 连字符）", "err"); return; }
    if (!(f.name || "").trim()) { toast("请填写相册名称", "err"); return; }
    const imgs = cur.galleryImgs.map(x => (x.src || "").trim()).filter(Boolean);
    if (!imgs.length) { toast("请至少添加一张图片", "err"); return; }
    toast("正在提交相册 " + id + " …");
    try {
      const CFG = "src/config/galleryConfig.ts";
      const cfg = await ghGetFile(CFG);
      if (!cfg) throw new Error("读取 " + CFG + " 失败");
      const merged = mergeAlbumConfig(cfg.text, id, albumToTs(f));
      if (merged == null) throw new Error("解析 " + CFG + " 的 albums 数组失败");
      await ghPutFile(CFG, merged, `feat(gallery): 相册「${f.name}」配置 [via InkPost]`);
      await ghPutFile(`public/gallery/${id}/urls.txt`, galleryUrlsTxt(cur), `feat(gallery): ${id} 图片列表（${imgs.length} 张）[via InkPost]`);
      closeModal();
      toast("相册已提交，Cloudflare 将自动构建 ✓", "ok");
    } catch (e) {
      toast("提交失败：" + e.message, "err");
    }
  }
  /** 扫描 albums 数组区间内的顶层 {...} 对象（识别字符串与注释，不被内部花括号干扰） */
  function scanTopObjects(inner) {
    const objs = [];
    let i = 0, depth = 0, start = -1;
    const n = inner.length;
    while (i < n) {
      const c = inner[i];
      if (c === '"' || c === "'" || c === "`") {
        const q = c; i++;
        while (i < n) {
          if (inner[i] === "\\") { i += 2; continue; }
          if (inner[i] === q) { i++; break; }
          i++;
        }
        continue;
      }
      if (c === "/" && inner[i + 1] === "/") { while (i < n && inner[i] !== "\n") i++; continue; }
      if (c === "/" && inner[i + 1] === "*") { i += 2; while (i < n && !(inner[i] === "*" && inner[i + 1] === "/")) i++; i += 2; continue; }
      if (c === "{") { if (depth === 0) start = i; depth++; }
      else if (c === "}") {
        depth--;
        if (depth === 0 && start >= 0) { objs.push({ s: start, e: i + 1 }); start = -1; }
      }
      i++;
    }
    return objs;
  }
  /** 相册表单值 -> TS 对象字面量（tab 缩进，与 galleryConfig.ts 风格一致） */
  function albumToTs(f) {
    const q = v => JSON.stringify(String(v ?? ""));
    const lines = [`id: ${q(f.id)},`, `name: ${q(f.name)},`];
    if (f.description) lines.push(`description: ${q(f.description)},`);
    if (f.location) lines.push(`location: ${q(f.location)},`);
    if (f.date) lines.push(`date: ${q(f.date)},`);
    if ((f.tags || []).length) lines.push(`tags: [${f.tags.map(q).join(", ")}],`);
    if (f.cover) lines.push(`cover: ${q(f.cover)},`);
    if (f.password) lines.push(`password: ${q(f.password)},`);
    if (f.passwordHint) lines.push(`passwordHint: ${q(f.passwordHint)},`);
    return "{\n" + lines.map(l => "\t\t\t" + l).join("\n") + "\n\t\t}";
  }
  /** 把相册对象合并进 galleryConfig.ts 的 albums：同 id 替换，否则追加；解析失败返回 null */
  function mergeAlbumConfig(src, id, albumText) {
    const m = src.match(/albums\s*:\s*\[/);
    if (!m) return null;
    const arrStart = m.index + m[0].length - 1; // 指向 [
    // 与 scanTopObjects 同样感知字符串与注释，避免描述/注释里的 [ ] 干扰定位
    let depth = 0, arrEnd = -1, i = arrStart;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        const q = c; i++;
        while (i < src.length) {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === q) { i++; break; }
          i++;
        }
        continue;
      }
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
      if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) { arrEnd = i; break; } }
      i++;
    }
    if (arrEnd < 0) return null;
    const inner = src.slice(arrStart + 1, arrEnd);
    const objs = scanTopObjects(inner);
    let hit = null;
    for (const o of objs) {
      const idm = inner.slice(o.s, o.e).match(/id\s*:\s*["']([^"']+)["']/);
      if (idm && idm[1] === id) { hit = o; break; }
    }
    if (hit) return src.slice(0, arrStart + 1 + hit.s) + albumText + src.slice(arrStart + 1 + hit.e);
    if (objs.length) {
      const last = objs[objs.length - 1];
      const cm = inner.slice(last.e).match(/^\s*,/);
      const insAbs = arrStart + 1 + last.e + (cm ? cm[0].length : 0);
      return src.slice(0, insAbs) + "\n\t\t" + albumText + "," + src.slice(insAbs);
    }
    return src.slice(0, arrEnd) + "\t\t" + albumText + ",\n\t" + src.slice(arrEnd);
  }
  function ghPullAsk() {
    const g = settings.github;
    askModal("从仓库拉取 Markdown", [
      { k: "path", label: "文件路径", value: `${g.root}/posts/`, ph: "src/content/posts/xxx.md" },
    ], async v => {
      if (!v.path) return;
      try {
        const r = await ghApi(`/contents/${ghPath(v.path.trim())}?ref=${encodeURIComponent(g.branch)}`);
        if (!r.ok) throw new Error((await r.json()).message || r.status);
        const j = await r.json();
        importMarkdown(decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))), j.name);
      } catch (e) { toast("拉取失败：" + e.message, "err"); }
    });
  }

  /* ================= 移动端面板切换 ================= */
  function bindMobile() {
    const panes = { config: "#configPanel", editor: "#editorPane", preview: "#previewPane" };
    function show(name) {
      Object.entries(panes).forEach(([k, sel]) => $(sel).classList.toggle("show", k === name));
      $$("#mobileTabs button").forEach(b => b.classList.toggle("active", b.dataset.pane === name));
    }
    $$("#mobileTabs button").forEach(b => b.onclick = () => show(b.dataset.pane));
    if (matchMedia("(max-width: 860px)").matches) show("editor");
  }

  /* ================= 启动 ================= */
  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    applyTheme();
    window.InkEditor.init({
      textarea: $("#editor"), gutter: $("#gutter"),
      onChange: onEditorInput, askModal,
      onScroll: () => {
        if (!$("#scrollSync").checked) return;
        const ta = $("#editor"), pv = $("#pvPreview");
        const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
        pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
      },
    });
    const ta = $("#editor");
    ta.addEventListener("keyup", updateStatus);
    ta.addEventListener("click", updateStatus);

    // 顶栏
    $("#btnTheme").onclick = () => {
      settings.theme = settings.theme === "light" ? "dark" : settings.theme === "dark" ? "system" : "light";
      persist(); applyTheme();
    };
    $("#btnExport").onclick = exportMd;
    $("#btnLock").onclick = lock;
    $("#btnGithub").onclick = ghSettings;
    $("#btnZen").onclick = () => document.body.classList.toggle("zen");
    $("#btnCopy").onclick = () => { navigator.clipboard.writeText(buildMarkdown(cur)).then(() => toast("全文已复制", "ok")); };
    $("#btnPrint").onclick = () => window.print();
    $("#btnImport").onclick = () => $("#filePicker").click();
    $("#filePicker").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      importMarkdown(await f.text(), f.name);
      e.target.value = "";
    };
    // 拖拽导入
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", async e => {
      e.preventDefault();
      const f = [...(e.dataTransfer.files || [])].find(x => /\.(md|markdown|txt)$/i.test(x.name));
      if (f) importMarkdown(await f.text(), f.name);
    });
    // 文档库
    $("#btnLibrary").onclick = () => { renderLibrary(); $("#libraryBack").hidden = false; };
    $("#btnCloseLibrary").onclick = () => $("#libraryBack").hidden = true;
    $("#libraryBack").onclick = e => { if (e.target.id === "libraryBack") e.target.hidden = true; };
    $("#btnNewDoc").onclick = () => {
      askModal("新建文档", [{ k: "type", label: "类型（post / project / dynamic / gallery）", value: "post" }], v => {
        const t = ["post", "project", "dynamic", "gallery"].includes(v.type) ? v.type : "post";
        const d = newDoc(t); docs.push(d); openDoc(d.id); renderLibrary();
      });
    };
    $("#btnResetDoc").onclick = () => {
      if (!confirm("重置当前文档？内容与配置将清空。")) return;
      const t = cur.type;
      Object.assign(cur, newDoc(t), { id: cur.id });
      openDoc(cur.id); renderLibrary();
    };
    // 类型切换
    $("#docType").onchange = () => {
      cur.type = $("#docType").value;
      renderForm(); touch();
    };
    // 预览页签
    $$(".pv-tab").forEach(b => b.onclick = () => switchPv(b.dataset.pv));
    // 全局快捷键
    window.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); exportMd(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); renderLibrary(); $("#libraryBack").hidden = false; }
    });

    bindMobile();
    openDoc(localStorage.getItem(LS.current) || (docs[0] && docs[0].id));
  }
  function switchPv(name) {
    $$(".pv-tab").forEach(b => b.classList.toggle("active", b.dataset.pv === name));
    $("#pvPreview").hidden = name !== "preview";
    $("#pvOutline").hidden = name !== "outline";
    $("#pvYaml").hidden = name !== "yaml";
    $("#pvSource").hidden = name !== "source";
  }

  initGate();
})();
