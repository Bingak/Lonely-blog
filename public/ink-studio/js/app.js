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
  const TYPE_NAME = { post: "文章", project: "项目", dynamic: "动态", gallery: "相册" };
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

function buildMarkdown(d) {
    if (d.type === "gallery") return galleryToMd(d);
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
  function fld(label, inner, hint, req) {
    const mark = req === true
      ? '<span class="req-mark" title="必填">*</span>'
      : req === false
        ? '<span class="opt-mark">选填</span>'
        : '';
    return `<div class="field"><label>${label}${mark}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
  }
  function txt(key, value, ph, hint, label, req) {
    return fld(label, `<input data-f="${key}" value="${MD.esc(value || "")}" placeholder="${ph || ""}">`, hint, req);
  }
  function dateFld(key, value, label, withTimeKey, req) {
    const wt = withTimeKey ? !!withTimeKey.value : / \d{2}:\d{2}/.test(value || "");
    return fld(label,
      `<div class="field-row"><input data-f="${key}" value="${MD.esc(value || "")}" placeholder="${wt ? "2026-08-04 10:30:00" : "2026-08-04"}" style="flex:1">
       <button class="tbtn" data-now="${key}" title="填入当前时间">现在</button></div>
       <label class="chk small"><input type="checkbox" data-timeprec="${key}" ${wt ? "checked" : ""}> 包含时分秒</label>`);
  }
  function chips(key, arr, label) {
    return fld(label, `<div class="chip-wrap"><input data-chipin="${key}" placeholder="回车添加" autocomplete="off">
      <div class="tag-suggest" hidden></div>
      <div class="chipbox" data-chips="${key}">${(arr || []).map(t => `<span class="chip">${MD.esc(t)}<b data-chipdel="${MD.esc(t)}">✕</b></span>`).join("")}</div></div>`);
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
      h += dateFld("published", f.published, "发布时间", null, true);
      h += txt("location", f.location, "如：邯郸", "", "位置");
      h += `<label class="chk"><input type="checkbox" data-fb="pinned" ${f.pinned ? "checked" : ""}> 置顶</label>`;
      h += `</div></div>`;
      h += `<div class="fset"><summary>自定义字段</summary><div class="fbody" data-custom></div></div>`;
    } else if (d.type === "project") {
      h += `<div class="fset" open><summary>基础信息</summary><div class="fbody">`;
      h += txt("title", f.title, "项目名 · 一句话描述", "标题中的冒号、引号会自动转义", "项目标题", true);
      h += txt("slug", f.slug, "midrop-win11-menu", "导出文件名优先使用 slug", "Slug", false);
      h += dateFld("published", f.published, "发布日期", null, false);
      h += `<div class="field-row">` +
        fld("排序 order", `<input data-f="order" type="number" value="${f.order ?? ""}" placeholder="95">`) +
        fld("状态 status", `<select data-f="status">${["", "published", "developing", "archived", "paused"].map(s => `<option ${f.status === s ? "selected" : ""} value="${s}">${s || "（默认）"}</option>`).join("")}</select>`) +
        `</div>`;
      h += `<label class="chk"><input type="checkbox" data-fb="draft" ${f.draft ? "checked" : ""}> 草稿（不对读者可见）</label>`;
      h += txt("lang", f.lang, "zh_CN", "与站点默认语言不同时填写", "语言", false);
      h += `</div></div>`;
      h += `<div class="fset" open><summary>简介与封面</summary><div class="fbody">`;
      h += fld("项目描述", `<textarea data-f="description" rows="3">${MD.esc(f.description || "")}</textarea>`, "描述中的冒号、引号会自动转义", false);
      h += txt("image", f.image, "https://img.lonelybing.top/…", "", "封面图片", false);
      h += `</div></div>`;
      h += `<div class="fset" open><summary>标签</summary><div class="fbody">${chips("tags", f.tags, "标签")}</div></div>`;
      h += `<div class="fset" open><summary>相关链接</summary><div class="fbody"><div data-links></div><button class="btn small add-mini" data-addlink>＋ 添加链接</button></div></div>`;
      h += `<div class="fset"><summary>自定义字段</summary><div class="fbody" data-custom></div></div>`;
    } else if (d.type === "gallery") {
      h += `<div class="fset" open><summary>相册信息</summary><div class="fbody">`;
      h += txt("id", f.id, "firefly-2026", "相册唯一标识，用于目录与 URL 路径；修改将视为新相册", "相册 ID", true);
      h += txt("name", f.name, "相册名称", "", "相册名称", true);
      h += fld("相册描述", `<textarea data-f="description" rows="2">${MD.esc(f.description || "")}</textarea>`, "", false);
      h += `<div class="field-row">${txt("location", f.location, "拍摄地点", "", "地点", false)}${txt("date", f.date, "2026-09-24", "格式 YYYY-MM-DD", "日期", false)}</div>`;
      h += txt("cover", f.cover, "封面图 URL（可选，留空用第一张图）", "", "封面图", false);
      h += `<div class="field-row">${txt("password", f.password, "", "访问密码（可选）", "访问密码", false)}${txt("passwordHint", f.passwordHint, "", "输错密码时显示", "密码提示", false)}</div>`;
      h += `</div></div>`;
      h += `<div class="fset" open><summary>相册标签</summary><div class="fbody">${chips("tags", f.tags, "回车添加标签")}</div></div>`;
      h += `<div class="fset" open><summary>图片列表</summary><div class="fbody"><div data-gimgs></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small add-mini" data-addgimg>＋ 添加图片</button><button class="btn small" data-batchgimg>📋 批量添加</button></div><div class="hint">发布时写入 src/content/gallery/{ID}.md，图片列表存于 frontmatter 的 photos 数组。批量添加每行一张，可用 <code>URL|图注</code> 格式。</div></div></div>`;
    } else { // post
      h += `<div class="fset" open><summary>基础信息</summary><div class="fbody">`;
      h += txt("title", f.title, "文章标题", "标题中的冒号、引号会自动转义，无需手写 YAML", "文章标题", true);
      h += dateFld("published", f.published, "发布时间", null, true);
      h += dateFld("updated", f.updated, "更新时间（留空则不输出）", null, false);
      h += fld("文章描述", `<textarea data-f="description" rows="3">${MD.esc(f.description || "")}</textarea>`, "显示在首页文章卡片上；冒号、引号自动转义", false);
      h += txt("slug", f.slug, "my-first-post", "导出文件名优先使用 slug", "自定义 Slug", false);
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
  /* ------- 相册图片 ------- */
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
  /* ------- 批量添加相册图片 ------- */
  function batchAddGimgs() {
    askModal("批量添加图片", [{ k: "text", label: "每行一张图，格式：URL 或 URL|图注", area: true }], v => {
      if (!v.text) return;
      const lines = v.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let n = 0;
      lines.forEach(l => {
        const [src, alt] = l.split("|").map(x => (x || "").trim());
        if (src) { cur.galleryImgs.push({ src, alt: alt || "" }); n++; }
      });
      renderGimgs(); touch();
      toast(`已添加 ${n} 张图片`, "ok");
    });
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
    // chips + 自定义标签下拉
    const getExistingTags = () => {
      const dl = $("#existing-tags");
      return dl ? [...dl.options].map(o => o.value) : [];
    };
    host.querySelectorAll("[data-chipin]").forEach(inp => {
      const box = inp.closest(".chip-wrap");
      const sug = box.querySelector(".tag-suggest");
      let activeIdx = -1;
      const showSuggest = () => {
        const all = getExistingTags();
        const used = (cur.fm[inp.dataset.chipin] || []).map(s => s.toLowerCase());
        const q = inp.value.trim().toLowerCase();
        const items = all.filter(t => !used.includes(t.toLowerCase()) && (!q || t.toLowerCase().includes(q))).slice(0, 8);
        if (!items.length) { sug.hidden = true; return; }
        activeIdx = -1;
        sug.innerHTML = items.map((t, i) => `<div class="tag-sug-item" data-i="${i}" data-v="${MD.esc(t)}">${MD.esc(t)}</div>`).join("");
        sug.hidden = false;
        sug.querySelectorAll(".tag-sug-item").forEach(el => {
          el.onmousedown = e => { e.preventDefault(); pickTag(el.dataset.v); };
        });
      };
      const pickTag = (v) => {
        const k = inp.dataset.chipin;
        cur.fm[k] = cur.fm[k] || [];
        cur.fm[k].push(v);
        inp.value = "";
        sug.hidden = true;
        renderForm(); touch();
      };
      inp.oninput = showSuggest;
      inp.onfocus = showSuggest;
      inp.onblur = () => { setTimeout(() => { sug.hidden = true; }, 150); };
      inp.onkeydown = ev => {
        const items = sug.querySelectorAll(".tag-sug-item");
        if (ev.key === "ArrowDown") {
          if (!sug.hidden && items.length) { ev.preventDefault(); activeIdx = (activeIdx + 1) % items.length; highlight(); }
        } else if (ev.key === "ArrowUp") {
          if (!sug.hidden && items.length) { ev.preventDefault(); activeIdx = (activeIdx - 1 + items.length) % items.length; highlight(); }
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          if (activeIdx >= 0 && items[activeIdx]) pickTag(items[activeIdx].dataset.v);
          else if (inp.value.trim()) { const k = inp.dataset.chipin; cur.fm[k] = cur.fm[k] || []; cur.fm[k].push(inp.value.trim()); renderForm(); touch(); }
        } else if (ev.key === "Escape") {
          sug.hidden = true;
        }
      };
      function highlight() {
        items.forEach((el, i) => el.classList.toggle("on", i === activeIdx));
      }
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
    const batchGimg = host.querySelector("[data-batchgimg]");
    if (batchGimg) batchGimg.onclick = () => batchAddGimgs();
    // 折叠分组：点击 summary 切换 open 属性
    host.querySelectorAll(".fset>summary").forEach(s => {
      s.onclick = () => {
        const fset = s.parentElement;
        if (fset.hasAttribute("open")) fset.removeAttribute("open");
        else fset.setAttribute("open", "");
      };
    });
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
    const gmd = galleryToMd(cur);
    const fm = gmd.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
    $("#pvYaml").textContent = fm;
    $("#pvSource").textContent = gmd;
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
  function updateEditorVisibility() {
    document.body.classList.toggle("no-editor", cur && cur.type === "gallery");
    // 移动端：相册模式隐藏「编辑」标签
    const tab = document.querySelector('#mobileTabs button[data-pane="editor"]');
    if (tab) tab.style.display = (cur && cur.type === "gallery") ? "none" : "";
  }

  function openDoc(id) {
    cur = docs.find(d => d.id === id) || docs[0];
    if (!cur) { cur = newDoc("post"); docs.push(cur); }
    cur.custom = cur.custom || [];
    cur.galleryImgs = cur.galleryImgs || [];
    $("#docType").value = cur.type;
    $("#editor").value = cur.body || "";
    updateEditorVisibility();
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
      const blob = new Blob([galleryToMd(cur)], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (cur.fm.id || "gallery") + ".md";
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
      if (!r.ok) throw new Error("session endpoint unavailable");
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
  /** 从仓库已有 posts/projects/gallery 中提取 tags，填充 #existing-tags datalist */
  async function fetchExistingTags() {
    const g = settings.github;
    if (!g || !g.token || !g.owner || !g.repo) return;
    const dl = $("#existing-tags");
    if (!dl) return;
    const dirs = [`${g.root}/posts`, `${g.root}/projects`, "src/content/gallery"];
    const allTags = new Set();
    for (const dir of dirs) {
      try {
        const r = await ghApi(`/contents/${ghPath(dir)}?ref=${encodeURIComponent(g.branch)}`);
        if (!r.ok) continue;
        const files = await r.json();
        if (!Array.isArray(files)) continue;
        const mds = files.filter(f => f.type === "file" && /\.md$/i.test(f.name));
        for (const f of mds) {
          try {
            const content = await ghGetFile(f.path);
            if (!content) continue;
            const m = content.text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!m) continue;
            const fmText = m[1];
            const tm = fmText.match(/tags\s*:\s*\[([^\]]*)\]/);
            if (tm) {
              [...tm[1].matchAll(/["']([^"']*)["']/g)].forEach(x => x[1] && allTags.add(x[1]));
            } else {
              const lines = fmText.split(/\r?\n/);
              let inTags = false;
              for (const line of lines) {
                if (/^tags\s*:/.test(line)) { inTags = true; continue; }
                if (inTags) {
                  const tm2 = line.match(/^\s*-\s+["']?([^"']+)["']?/);
                  if (tm2) allTags.add(tm2[1]);
                  else if (!/^\s/.test(line)) inTags = false;
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
    dl.innerHTML = [...allTags].sort().map(t => `<option value="${MD.esc(t)}">`).join("");
  }

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
      <button class="btn" id="ghSync">📥 仓库同步</button>
      <button class="btn" id="ghPull">拉取文件…</button>
      <span class="spacer"></span>
      <button class="btn" id="ghSaveCfg">保存设置</button>
      <button class="btn primary" id="ghPush">发布当前文档 ⇧</button>`;
    const collect = () => {
      settings.github = { token: $("#ghToken").value.trim(), owner: $("#ghOwner").value.trim(), repo: $("#ghRepo").value.trim(), branch: $("#ghBranch").value.trim() || "main", root: $("#ghRoot").value.trim() || "src/content" };
      settings.turnstileKey = $("#ghTs").value.trim();
      persist();
    };
    $("#ghSaveCfg").onclick = () => { collect(); closeModal(); toast("设置已保存", "ok"); fetchExistingTags(); };
    $("#ghPush").onclick = async () => { collect(); await ghPush(); };
    $("#ghPull").onclick = async () => { collect(); ghPullAsk(); };
    $("#ghSync").onclick = async () => { collect(); ghSyncAsk(); };
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
    const path = cur._ghPath || `${g.root}/${COLLECTION[cur.type]}/${fileName(cur)}`;
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
  /** 相册发布：写入 src/content/gallery/{id}.md（内容集合，photos 数组存于 frontmatter） */
  async function ghPushGallery() {
    const f = cur.fm;
    const id = (f.id || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) { toast("请填写相册 ID（字母 / 数字 / 连字符）", "err"); return; }
    if (!(f.name || "").trim()) { toast("请填写相册名称", "err"); return; }
    const imgs = cur.galleryImgs.map(x => (x.src || "").trim()).filter(Boolean);
    const md = galleryToMd(cur);
    toast("正在提交相册 " + id + " …");
    try {
      const path = `src/content/gallery/${id}.md`;
      await ghPutFile(path, md, `feat(gallery): 相册「${f.name}」（${imgs.length} 张）[via InkPost]`);
      delete cur._ghPath;
      closeModal();
      toast("相册已提交，Cloudflare 将自动构建 ✓", "ok");
    } catch (e) {
      toast("提交失败：" + e.message, "err");
    }
  }
  /** 相册表单 + 图片 → 内容集合 Markdown（frontmatter 含 photos 数组） */
  function galleryToMd(d) {
    const f = d.fm;
    const q = v => JSON.stringify(String(v ?? ""));
    const arr = v => `[${(v || []).map(x => JSON.stringify(String(x))).join(", ")}]`;
    const photos = (d.galleryImgs || []).map(g => (g.src || "").trim()).filter(Boolean);
    const lines = [
      `id: ${q(f.id)}`,
      `name: ${q(f.name)}`,
      `description: ${q(f.description || "")}`,
      `date: ${q(f.date || "")}`,
      `location: ${q(f.location || "")}`,
      `tags: ${arr(f.tags)}`,
      `cover: ${q(f.cover || "")}`,
      `password: ${q(f.password || "")}`,
      `passwordHint: ${q(f.passwordHint || "")}`,
    ];
    if (photos.length) {
      lines.push(`photos:`);
      photos.forEach(p => lines.push(`  - ${q(p)}`));
    } else {
      lines.push(`photos: []`);
    }
    const body = (d.body || "").replace(/^\n+/, "");
    return "---\n" + lines.join("\n") + "\n---\n" + (body ? "\n" + body + "\n" : "");
  }

  /** 从仓库同步：列出各集合已有文档，点击即可拉取并在线编辑 */
  function ghSyncAsk() {
    const g = settings.github;
    if (!g.token || !g.owner || !g.repo) { toast("请先填写 GitHub 设置", "err"); return; }
    const TABS = {
      post: { label: "📄 文章", dir: `${g.root}/posts`, type: "post" },
      project: { label: "🧩 项目", dir: `${g.root}/projects`, type: "project" },
      dynamic: { label: "💬 动态", dir: `${g.root}/dynamic`, type: "dynamic" },
      gallery: { label: "🖼 相册", dir: "src/content/gallery", type: "gallery" },
    };
    let active = "post";
    $("#modalTitle").textContent = "仓库同步 · 选择已有内容拉取到本地编辑";
    const render = () => {
      const tab = TABS[active];
      $("#modalBody").innerHTML = `<div class="sync-tabs">${Object.entries(TABS).map(([k, v]) => `<button class="sync-tab ${k === active ? "on" : ""}" data-st="${k}">${v.label}</button>`).join("")}</div>
        <div class="sync-list" data-synclist><div style="color:var(--fg3);padding:20px;text-align:center">加载中…</div></div>
        <p style="font-size:11.5px;color:var(--fg3);margin:0">拉取后会新建本地文档，编辑完成点「发布当前文档」即可更新仓库（自动覆盖原文件）。</p>`;
      $$(".sync-tab").forEach(b => b.onclick = () => { active = b.dataset.st; render(); loadList(); });
      $("#modalFoot").innerHTML = `<button class="btn" id="syncClose">关闭</button>`;
      $("#syncClose").onclick = closeModal;
      loadList();
    };
    const loadList = async () => {
      const tab = TABS[active], host = $("[data-synclist]");
      host.innerHTML = '<div style="color:var(--fg3);padding:20px;text-align:center">加载中…</div>';
      try {

        const r = await ghApi(`/contents/${ghPath(tab.dir)}?ref=${encodeURIComponent(g.branch)}`);
        if (!r.ok) { host.innerHTML = `<div style="color:var(--danger);padding:20px">读取失败（${r.status}）</div>`; return; }
        const j = await r.json();
        const files = (Array.isArray(j) ? j : []).filter(f => f.type === "file" && /\.md$/i.test(f.name));
        if (!files.length) { host.innerHTML = '<div style="color:var(--fg3);padding:20px">暂无文档</div>'; return; }
        host.innerHTML = files.map(f => `<div class="sync-item" data-path="${MD.esc(f.path)}" data-sha="${MD.esc(f.sha)}"><span>${MD.esc(f.name)}</span><span class="sync-act">拉取编辑 →</span></div>`).join("");
        host.querySelectorAll("[data-path]").forEach(el => el.onclick = () => (active === "gallery" ? loadAlbumMd(el.dataset.path) : loadMd(el.dataset.path)));
      } catch (e) { host.innerHTML = `<div style="color:var(--danger);padding:20px">${MD.esc(e.message)}</div>`; }
    };
    const loadMd = async (path) => {
      try {
        const f = await ghGetFile(path);
        if (!f) throw new Error("读取失败");
        const name = path.split("/").pop();
        importMarkdown(f.text, name);
        // 标记来源路径，发布时直接覆盖
        cur._ghPath = path; cur._ghSha = f.sha;
        closeModal();
        toast(`已拉取「${name}」，可编辑后发布`, "ok");
      } catch (e) { toast("拉取失败：" + e.message, "err"); }
    };
    const loadAlbumMd = async (path) => {
      try {
        const f = await ghGetFile(path);
        if (!f) throw new Error("读取失败");
        const name = path.split("/").pop();
        // 解析 frontmatter
        const m = f.text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        const fmText = m ? m[1] : "";
        const body = m ? m[2] : f.text;
        const pick = (k) => { const mm = fmText.match(new RegExp(`^${k}\\s*:\\s*"?(.*?)"?\\s*$`, "m")); return mm ? mm[1].replace(/^["']|["']$/g, "") : ""; };
        const fld = {
          id: pick("id") || name.replace(/\.md$/i, ""),
          name: pick("name"),
          description: pick("description"),
          location: pick("location"),
          date: pick("date"),
          cover: pick("cover"),
          password: pick("password"),
          passwordHint: pick("passwordHint"),
          tags: [],
        };
        const tm = fmText.match(/tags\s*:\s*\[([^\]]*)\]/);
        if (tm) fld.tags = [...tm[1].matchAll(/["']([^"']*)["']/g)].map(x => x[1]);
        // 解析 photos 数组（支持 [a,b] 和多行 - 两种格式）
        const imgs = [];
        const pm = fmText.match(/photos\s*:\s*\[([^\]]*)\]/);
        if (pm) {
          [...pm[1].matchAll(/["']([^"']+)["']/g)].forEach(x => imgs.push({ src: x[1], alt: "" }));
        } else {
          const lines = fmText.split(/\r?\n/);
          let inPhotos = false;
          for (const line of lines) {
            if (/^photos\s*:/.test(line)) { inPhotos = true; continue; }
            if (inPhotos) {
              const mm = line.match(/^\s*-\s*["']([^"']+)["']/);
              if (mm) imgs.push({ src: mm[1], alt: "" });
              else if (line.trim() && !/^\s*-\s/.test(line)) break;
            }
          }
        }
        const d = newDoc("gallery");
        d.fm = fld; d.galleryImgs = imgs; d.body = body.replace(/^\n+/, "").replace(/\n+$/, "");
        docs.push(d); openDoc(d.id);
        cur._ghPath = path; cur._ghSha = f.sha;
        closeModal();
        toast(`已拉取相册「${fld.name || fld.id}」（${imgs.length} 张），可编辑后发布`, "ok");
      } catch (e) { toast("拉取失败：" + e.message, "err"); }
    };
    render();
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
    $("#btnPreview").onclick = () => {
      document.body.classList.toggle("no-preview");
      $("#btnPreview").textContent = document.body.classList.contains("no-preview") ? "📖 预览" : "📖 预览";
    };
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
      updateEditorVisibility();
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
    fetchExistingTags();
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
