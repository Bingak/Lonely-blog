import fs from "node:fs";
import path from "node:path";
import type { CollectionEntry } from "astro:content";
import { url } from "@/utils/url-utils";

function withBase(assetPath: string): string {
	if (!assetPath) return "";
	if (/^(https?:)?\/\//i.test(assetPath) || /^(data|blob):/i.test(assetPath)) {
		return assetPath;
	}
	const normalizedPath = assetPath.startsWith("/")
		? assetPath
		: `/${assetPath}`;
	const base = import.meta.env.BASE_URL || "/";
	if (base !== "/" && normalizedPath.startsWith(base)) {
		return normalizedPath;
	}
	return url(normalizedPath);
}

const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;
// Formats supported by the browser's native HTML5 video player.
const VIDEO_RE = /\.(mp4|webm|mov|ogv|m4v)$/i;

export type LivePhotoReference = { cover: string; video: string };

export function parseLivePhotoReference(src: string): LivePhotoReference | null {
	const marker = "|live-photo=";
	const index = src.indexOf(marker);
	if (index < 0) return null;
	const cover = src.slice(0, index).trim();
	const video = src.slice(index + marker.length).trim();
	return cover && video ? { cover, video } : null;
}

export function isVideo(src: string): boolean {
	if (!src) return false;
	const livePhoto = parseLivePhotoReference(src);
	if (livePhoto) src = livePhoto.cover;
	try {
		const url = new URL(src, "https://x.local");
		return VIDEO_RE.test(url.pathname);
	} catch {
		return VIDEO_RE.test(src);
	}
}

/** 兼容旧调用：扫描本地目录中的图片和视频 */
export function scanAlbumPhotos(albumId: string): string[] {
	return scanLocalPhotos(albumId);
}

/** 扫描本地相册目录中的图片/视频文件（public/gallery/{id}） */
export function scanLocalPhotos(albumId: string): string[] {
	const dir = path.join(process.cwd(), "public", "gallery", albumId);
	if (!fs.existsSync(dir)) return [];
	const files = fs
		.readdirSync(dir)
		.filter((f) => IMAGE_RE.test(f) || VIDEO_RE.test(f))
		.sort();
	// 将 cover.* 排到第一位
	const coverIdx = files.findIndex((f) => /^cover\./i.test(f));
	if (coverIdx > 0) {
		const [coverFile] = files.splice(coverIdx, 1);
		files.unshift(coverFile);
	}
	return files.map((f) => withBase(`/gallery/${albumId}/${f}`));
}

type GalleryEntryLike = {
	id: string;
	data: { photos?: string[]; cover?: string };
};

/**
 * 获取相册全部媒体：本地文件（public/gallery/{id}）+ frontmatter 中 photos 数组
 */
export function getAlbumPhotos(entry: GalleryEntryLike): string[] {
	const localPhotos = scanLocalPhotos(entry.id);
	const remotePhotos = entry.data.photos || [];
	return [...localPhotos, ...remotePhotos];
}

/**
 * 获取相册封面图（跳过视频，封面必须是图片）
 * 优先级：手动指定 > cover.* 文件 > 第一张图片
 */
export function getAlbumCover(
	entry: GalleryEntryLike,
	photos: string[],
): string {
	if (entry.data.cover && !isVideo(entry.data.cover)) {
		return withBase(parseLivePhotoReference(entry.data.cover)?.cover || entry.data.cover);
	}
	const coverFile = photos.find((p) => /\/cover\./i.test(parseLivePhotoReference(p)?.cover || p));
	if (coverFile && !isVideo(coverFile)) {
		return parseLivePhotoReference(coverFile)?.cover || coverFile;
	}
	const firstImage = photos.find((p) => !isVideo(p));
	return firstImage ? parseLivePhotoReference(firstImage)?.cover || firstImage : "";
}

// 保留 CollectionEntry 类型引用避免未使用告警
export type GalleryEntry = CollectionEntry<"gallery">;
