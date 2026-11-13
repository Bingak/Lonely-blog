/**
 * Vercount 访问统计客户端脚本（本地化版）
 *
 * 官方脚本 https://events.vercount.one/js 用 document.getElementById 填充元素，
 * 但本站的 SiteStats 卡片在「桌面右侧栏」和「移动端底部」各渲染一份（相同 id），
 * getElementById 只会命中 DOM 顺序里的第一个（移动端那份，桌面端被 md:hidden 隐藏），
 * 导致桌面端右侧栏的 PV/UV 永远停留在占位符「—」。
 *
 * 这里改为 querySelectorAll 填充所有匹配元素，两份实例都能正确显示；
 * 上报端点走 Worker 反代 /vercount/api/v2/log（见 worker/index.js 的 handleVercount），
 * 避免大陆访客直连 events.vercount.one 超时丢数据。
 */
(function () {
	var API = "/vercount/api/v2/log";
	var STORAGE_KEY = "visitorCountData";
	var COOKIE_PREFIX = "vercount_uv_";
	var KEYS = ["site_pv", "page_pv", "site_uv"];

	function cookieName() {
		var host = window.location.host || "unknown-host";
		return COOKIE_PREFIX + host.replace(/[^a-zA-Z0-9_-]/g, "_");
	}

	function readCookie() {
		var name = cookieName() + "=";
		var parts = document.cookie.split("; ");
		for (var i = 0; i < parts.length; i++) {
			if (parts[i].indexOf(name) === 0) return parts[i].slice(name.length);
		}
		return null;
	}

	function hasVisited() {
		return readCookie() === "1";
	}

	function markVisited() {
		document.cookie = cookieName() + "=1; path=/; max-age=31536000; samesite=lax";
	}

	/** 兼容官方脚本的三种返回形态（success / error / 裸对象），统一成 { site_pv, page_pv, site_uv } */
	function normalize(data) {
		if (data && (data.status === "success" || data.status === "error") && data.data) {
			return {
				site_pv: Number(data.data.site_pv) || 0,
				page_pv: Number(data.data.page_pv) || 0,
				site_uv: Number(data.data.site_uv) || 0,
			};
		}
		return {
			site_pv: Number(data && data.site_pv) || 0,
			page_pv: Number(data && data.page_pv) || 0,
			site_uv: Number(data && data.site_uv) || 0,
		};
	}

	function readCache() {
		try {
			var raw = localStorage.getItem(STORAGE_KEY);
			return raw ? normalize(JSON.parse(raw)) : null;
		} catch (e) {
			return null;
		}
	}

	function writeCache(data) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (e) {
			/* 隐私模式 / 配额满时忽略，不影响展示 */
		}
	}

	/** 填充所有匹配元素（value 直接写数字；container 切回可见） */
	function fill(data) {
		KEYS.forEach(function (key) {
			var value = String(data[key] || "0");
			document
				.querySelectorAll("#vercount_value_" + key + ", #busuanzi_value_" + key)
				.forEach(function (el) {
					el.textContent = value;
				});
			document
				.querySelectorAll("#vercount_container_" + key + ", #busuanzi_container_" + key)
				.forEach(function (el) {
					el.style.display = "inline";
				});
		});
	}

	/** 请求发出前先隐藏 container，避免闪现占位符 */
	function hide() {
		KEYS.forEach(function (key) {
			document
				.querySelectorAll("#vercount_container_" + key + ", #busuanzi_container_" + key)
				.forEach(function (el) {
					el.style.display = "none";
				});
		});
	}

	function pageUrl() {
		var href = window.location.href;
		return href.indexOf("http") === 0 ? href : null;
	}

	function report() {
		hide();
		var url = pageUrl();
		if (!url) return;

		var isNewUv = !hasVisited();
		if (isNewUv) markVisited();

		var controller = new AbortController();
		var timer = setTimeout(function () {
			controller.abort();
		}, 5000);

		fetch(API, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: url, isNewUv: isNewUv }),
			signal: controller.signal,
		})
			.then(function (res) {
				clearTimeout(timer);
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			})
			.then(function (data) {
				var normalized = normalize(data);
				fill(normalized);
				writeCache(normalized);
			})
			.catch(function (err) {
				clearTimeout(timer);
				if (err && err.name === "AbortError") {
					console.warn("Vercount request timeout");
				} else {
					console.warn("Vercount API error:", err instanceof Error ? err.message : err);
				}
				var cached = readCache();
				if (cached) fill(cached);
			});
	}

	function ready(fn) {
		if (document.readyState !== "loading") {
			fn();
		} else {
			document.addEventListener("DOMContentLoaded", fn, { once: true });
		}
	}

	ready(report);
})();
