/**
 * <video-facade> 自定义元素：首屏只显示封面 + 播放按钮，点击后才创建
 * 真正的 <video> 或第三方播放器 <iframe>，避免首屏直接拉取境外大视频文件。
 *
 * 由 rehype-video-facade 插件在构建时生成对应结构，此处负责交互与懒加载。
 */
const boundPlayButtons = new WeakSet<HTMLButtonElement>();

function autoplaySrc(src: string): string {
	// 已有 autoplay 参数时仅强制其为 1；否则按现有分隔符追加 autoplay=1
	if (/[?&]autoplay=/i.test(src)) {
		return src.replace(/([?&]autoplay=)\d+/gi, "$11");
	}
	return src + (src.includes("?") ? "&" : "?") + "autoplay=1";
}

async function resolveRemotePoster(platform: string, videoId: string): Promise<string> {
	if (platform === "vimeo") {
		try {
			const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}`);
			if (res.ok) {
				const data = (await res.json()) as { thumbnail_url?: string };
				if (data.thumbnail_url) return data.thumbnail_url;
			}
		} catch {
			// 静默失败，保持占位封面
		}
	} else if (platform === "bilibili") {
		// bvid 无静态封面；尝试查 view 接口（可能受 CORS 限制，失败则保持占位）
		try {
			const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(videoId)}`);
			if (res.ok) {
				const data = (await res.json()) as { data?: { pic?: string } };
				if (data.data?.pic) return data.data.pic;
			}
		} catch {
			// 静默失败
		}
	}
	return "";
}

class VideoFacade extends HTMLElement {
	connectedCallback() {
		const kind = this.dataset.kind;
		if (kind !== "video" && kind !== "iframe") return;
		const src = this.dataset.src;
		if (!src) return;

		this.classList.add("video-facade");
		this.setAttribute("role", "group");

		let playButton = this.querySelector<HTMLButtonElement>(".video-facade-play");
		if (!playButton) {
			playButton = document.createElement("button");
			playButton.type = "button";
			playButton.className = "video-facade-play";
			playButton.setAttribute("aria-label", "播放视频");
			playButton.innerHTML =
				'<span class="video-facade-play-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.7c0-.6.7-1 1.2-.7l6.1 4.1a1 1 0 0 1 0 1.7l-6.1 4.1a.8.8 0 0 1-1.2-.7z"/></svg></span>';
			this.append(playButton);
		}
		if (!boundPlayButtons.has(playButton)) {
			boundPlayButtons.add(playButton);
			playButton.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.activate(playButton!);
			});
		}

		// 无静态封面的第三方平台，异步补封面
		if (kind === "iframe" && !this.dataset.poster && this.dataset.videoId) {
			void resolveRemotePoster(this.dataset.platform || "", this.dataset.videoId).then((url) => {
				if (!url || this.classList.contains("is-playing")) return;
				this.applyPoster(url);
			});
		}

		this.dataset.ready = "true";
	}

	/** 用补到的封面替换占位封面 */
	private applyPoster(url: string) {
		const placeholder = this.querySelector<HTMLElement>(".video-facade-placeholder");
		if (!placeholder) return;
		const img = document.createElement("img");
		img.className = "video-facade-cover";
		img.src = url;
		img.alt = "";
		img.loading = "lazy";
		placeholder.replaceWith(img);
		this.dataset.poster = url;
	}

	private activate(playButton: HTMLButtonElement) {
		if (this.classList.contains("is-playing")) return;
		if (this.dataset.kind === "video") {
			this.activateVideo(playButton);
		} else {
			this.activateIframe(playButton);
		}
	}

	private activateVideo(playButton: HTMLButtonElement) {
		const video = document.createElement("video");
		video.className = "video-facade-player";
		video.src = this.dataset.src || "";
		if (this.dataset.poster) video.poster = this.dataset.poster;
		video.controls = true;
		video.playsInline = true;
		video.setAttribute("aria-label", "视频播放器");

		playButton.hidden = true;
		this.append(video);
		this.classList.add("is-playing");
		void video.play().catch(() => {
			// 自动播放被拦截时不回退，用户可点原生 controls 播放
		});
	}

	private activateIframe(playButton: HTMLButtonElement) {
		const iframe = document.createElement("iframe");
		iframe.className = "video-facade-player";
		iframe.src = autoplaySrc(this.dataset.src || "");
		iframe.setAttribute("allowfullscreen", "");
		iframe.setAttribute("allow", "fullscreen; autoplay; encrypted-media; picture-in-picture");
		iframe.setAttribute("loading", "lazy");
		iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
		iframe.setAttribute("aria-label", "视频播放器");

		playButton.hidden = true;
		this.append(iframe);
		this.classList.add("is-playing");
	}
}

if (!customElements.get("video-facade")) {
	customElements.define("video-facade", VideoFacade);
}

export {};
