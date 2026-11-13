/**
 * 视频门面（facade）插件：把自托管 <video> 与第三方播放器 <iframe> 转成
 * <video-facade> 自定义元素，首屏只渲染封面 + 播放按钮，点击后才加载真正的
 * 视频 / 播放器 iframe，避免境外服务器首屏直接拉取大视频文件导致的加载慢。
 *
 * 与 rehype-live-photo 风格一致：不依赖 unist-util-visit，手写递归遍历；
 * 未知的 <video-facade> 标签会被 astro 原样输出为 HTML，由客户端脚本接管。
 *
 * 注意：markdown 里的裸 HTML <video>/<iframe> 在 HAST 里是 `raw` 节点而非 `element`
 * 节点（rehypeRaw 在本插件之后才运行），因此需要额外把 raw 节点解析成元素再处理。
 */

import { fromHtml } from "hast-util-from-html";

// 匹配可能含 <video> / <iframe> 的裸 HTML 片段（避免解析所有 raw 节点）
const RAW_VIDEO_RE = /<(?:video|iframe)\b/i;

// YouTube: youtube.com/embed/ID | youtube-nocookie.com/embed/ID | youtu.be/ID
const YOUTUBE_EMBED_RE = /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([\w-]{6,})/i;
// Vimeo: player.vimeo.com/video/ID
const VIMEO_EMBED_RE = /player\.vimeo\.com\/video\/(\d+)/i;
// Bilibili: player.bilibili.com/player.html
const BILIBILI_PLAYER_RE = /player\.bilibili\.com\/player\.html/i;

function toAbsoluteUrl(src) {
	if (typeof src !== "string") return "";
	if (src.startsWith("//")) return `https:${src}`;
	return src;
}

/** 取 <video> 的 src（优先 src 属性，其次 <source> 子元素） */
function getVideoSrc(node) {
	const props = node.properties || {};
	if (typeof props.src === "string" && props.src) return props.src;
	const children = Array.isArray(node.children) ? node.children : [];
	for (const child of children) {
		if (child && child.type === "element" && child.tagName === "source") {
			const p = child.properties || {};
			if (typeof p.src === "string" && p.src) return p.src;
		}
	}
	return "";
}

function playIconNode() {
	return {
		type: "element",
		tagName: "svg",
		properties: { viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true" },
		children: [
			{
				type: "element",
				tagName: "path",
				properties: {
					d: "M5 3.7c0-.6.7-1 1.2-.7l6.1 4.1a1 1 0 0 1 0 1.7l-6.1 4.1a.8.8 0 0 1-1.2-.7z",
				},
				children: [],
			},
		],
	};
}

function playButtonNode() {
	return {
		type: "element",
		tagName: "button",
		properties: {
			type: "button",
			className: ["video-facade-play"],
			"aria-label": "播放视频",
		},
		children: [
			{
				type: "element",
				tagName: "span",
				properties: { className: ["video-facade-play-icon"], "aria-hidden": "true" },
				children: [playIconNode()],
			},
		],
	};
}

/** 封面节点：有 poster 用 <img>，否则用占位 div（客户端异步补封面） */
function coverNode(poster, platformLabel) {
	if (poster) {
		return {
			type: "element",
			tagName: "img",
			properties: {
				className: ["video-facade-cover"],
				src: poster,
				alt: "",
				loading: "lazy",
			},
			children: [],
		};
	}
	return {
		type: "element",
		tagName: "div",
		properties: {
			className: ["video-facade-cover", "video-facade-placeholder"],
			"aria-hidden": "true",
		},
		children: [{ type: "text", value: platformLabel }],
	};
}

function buildVideoFacade(node) {
	const src = getVideoSrc(node);
	if (!src) return null;
	const props = node.properties || {};
	const poster = typeof props.poster === "string" ? props.poster : "";

	// 封面：有 poster 用图片（零视频请求）；无 poster 用 preload=metadata 的
	// 静音 video 抓取第一帧作封面（仅下载元数据/首帧，不下载整段视频）。
	const cover = poster
		? coverNode(poster, "")
		: {
				type: "element",
				tagName: "video",
				properties: {
					className: ["video-facade-cover"],
					src,
					preload: "metadata",
					muted: true,
					playsinline: true,
				},
				children: [],
			};

	const data = {
		className: ["video-facade"],
		"data-kind": "video",
		"data-src": src,
	};
	if (poster) data["data-poster"] = poster;

	return {
		type: "element",
		tagName: "video-facade",
		properties: data,
		children: [cover, playButtonNode()],
	};
}

function buildIframeFacade(node) {
	const props = node.properties || {};
	const rawSrc = typeof props.src === "string" ? props.src : "";
	if (!rawSrc) return null;
	const src = toAbsoluteUrl(rawSrc);

	let platform = "";
	let videoId = "";
	let poster = "";

	const yt = src.match(YOUTUBE_EMBED_RE);
	if (yt) {
		platform = "youtube";
		videoId = yt[1];
		poster = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
	} else if (VIMEO_EMBED_RE.test(src)) {
		platform = "vimeo";
		videoId = src.match(VIMEO_EMBED_RE)[1];
		// 无静态封面，客户端走 oEmbed 异步补封面
	} else if (BILIBILI_PLAYER_RE.test(src)) {
		platform = "bilibili";
		const aid = src.match(/[?&]aid=(\d+)/i);
		const bvid = src.match(/[?&]bvid=([A-Za-z0-9]+)/i);
		if (aid) {
			videoId = aid[1];
			poster = `https://i0.hdslb.com/bfs/archive/${videoId}.jpg`;
		} else if (bvid) {
			videoId = bvid[1];
			// bvid 无静态封面，客户端查 view 接口补封面
		}
	}

	// 非视频平台 iframe 不处理，保留原样
	if (!platform) return null;

	const data = {
		className: ["video-facade"],
		"data-kind": "iframe",
		"data-platform": platform,
		"data-video-id": videoId,
		"data-src": src,
	};
	if (poster) data["data-poster"] = poster;

	const platformLabel = {
		bilibili: "Bilibili",
		youtube: "YouTube",
		vimeo: "Vimeo",
	}[platform];

	return {
		type: "element",
		tagName: "video-facade",
		properties: data,
		children: [coverNode(poster, platformLabel), playButtonNode()],
	};
}

/**
 * 把 raw 节点解析成元素节点：裸 HTML <video>/<iframe> 在 rehype 管线里先以 raw 节点
 * 存在（rehypeRaw 晚于本插件运行），这里用 hast-util-from-html 解析成 fragment 后，
 * 将内部元素交给后续逻辑处理。非视频片段保持原样返回 null。
 */
function parseRawToElements(rawNode) {
	const value = typeof rawNode.value === "string" ? rawNode.value : "";
	if (!RAW_VIDEO_RE.test(value)) return null;
	let fragment;
	try {
		fragment = fromHtml(value, { fragment: true });
	} catch {
		return null;
	}
	// fromHtml 返回 root 节点，children 是解析出的顶层元素
	return Array.isArray(fragment?.children) ? fragment.children : null;
}

function visit(node, parent) {
	if (!node || typeof node !== "object") return;
	if (node.type === "element") {
		let facade = null;
		if (node.tagName === "video") {
			facade = buildVideoFacade(node);
		} else if (node.tagName === "iframe") {
			facade = buildIframeFacade(node);
		}
		if (facade && parent?.children) {
			parent.children[parent.children.indexOf(node)] = facade;
			return;
		}
	}
	// raw 节点：解析出真实元素后再处理（覆盖 markdown 里手写的 <video>/<iframe>）
	if (node.type === "raw") {
		const elements = parseRawToElements(node);
		if (elements && elements.length && parent?.children) {
			const idx = parent.children.indexOf(node);
			parent.children.splice(idx, 1, ...elements);
			for (const el of elements) visit(el, parent);
			return;
		}
	}
	if (Array.isArray(node.children)) {
		for (const child of [...node.children]) visit(child, node);
	}
}

export default function rehypeVideoFacade() {
	return (tree) => visit(tree, null);
}
