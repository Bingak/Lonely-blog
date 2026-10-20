class LivePhoto extends HTMLElement {
	connectedCallback() {
		if (this.dataset.ready || !this.dataset.videoUrl) return;
		const image = this.querySelector("img");
		if (!image) return;
		this.dataset.ready = "true";
		this.classList.add("live-photo");
		this.setAttribute("role", "group");

		const playButton = document.createElement("button");
		playButton.type = "button";
		playButton.className = "live-photo-play";
		playButton.setAttribute("aria-label", "播放动态照片");
		playButton.innerHTML = '<span class="live-photo-play-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.7c0-.6.7-1 1.2-.7l6.1 4.1a1 1 0 0 1 0 1.7l-6.1 4.1a.8.8 0 0 1-1.2-.7z"/></svg></span><span>动态照片</span>';
		playButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.play(image, playButton);
		});
		this.append(playButton);
	}

	private play(image: HTMLImageElement, playButton: HTMLButtonElement) {
		if (this.querySelector("video")) return;
		const video = document.createElement("video");
		video.className = "live-photo-video";
		video.src = this.dataset.videoUrl || "";
		video.poster = image.currentSrc || image.src;
		video.playsInline = true;
		video.preload = "metadata";
		video.setAttribute("aria-label", "动态照片视频");
		const finish = () => {
			if (video.dataset.finishing) return;
			video.dataset.finishing = "true";
			this.classList.remove("is-playing");
			const cleanup = () => {
				video.remove();
				playButton.hidden = false;
			};
			video.addEventListener("transitionend", (event) => {
				if (event.propertyName === "opacity") cleanup();
			}, { once: true });
			window.setTimeout(cleanup, 400);
		};
		video.addEventListener("playing", () => {
			requestAnimationFrame(() => this.classList.add("is-playing"));
		}, { once: true });
		video.addEventListener("ended", finish);
		video.addEventListener("error", finish);
		playButton.hidden = true;
		this.insertBefore(video, playButton);
		void video.play().catch(() => {
			video.remove();
			this.classList.remove("is-playing");
			playButton.hidden = false;
		});
	}
}

if (!customElements.get("live-photo")) {
	customElements.define("live-photo", LivePhoto);
}
