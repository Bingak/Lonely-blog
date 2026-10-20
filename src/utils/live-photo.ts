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
		playButton.innerHTML = '<span aria-hidden="true">▶</span><span>动态照片</span>';
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
		video.addEventListener("ended", () => {
			video.remove();
			image.hidden = false;
			playButton.hidden = false;
		});
		video.addEventListener("error", () => {
			video.remove();
			image.hidden = false;
			playButton.hidden = false;
		});
		image.hidden = true;
		playButton.hidden = true;
		this.insertBefore(video, playButton);
		void video.play().catch(() => {
			video.remove();
			image.hidden = false;
			playButton.hidden = false;
		});
	}
}

if (!customElements.get("live-photo")) {
	customElements.define("live-photo", LivePhoto);
}
