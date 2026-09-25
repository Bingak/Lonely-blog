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

/** 兼容旧调用：仅扫描本地目录图片 */
export function scanAlbumPhotos(albumId: string): string[] {
	return scanLocalPhotos(albumId);
}

/** 扫描本地相册目录中的图片文件（public/gallery/{id}） */
export function scanLocalPhotos(albumId: string): string[] {
	const dir = path.join(process.cwd(), "public", "gallery", albumId);
	if (!fs.existsSync(dir)) return [];
	const files = fs
		.readdirSync(dir)
		.filter((f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f))
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
 * 获取相册全部图片：本地文件（public/gallery/{id}）+ frontmatter 中 photos 数组
 */
export function getAlbumPhotos(entry: GalleryEntryLike): string[] {
	const localPhotos = scanLocalPhotos(entry.id);
	const remotePhotos = entry.data.photos || [];
	return [...localPhotos, ...remotePhotos];
}

/**
 * 获取相册封面图
 * 优先级：手动指定 > cover.* 文件 > 第一张图片
 */
export function getAlbumCover(
	entry: GalleryEntryLike,
	photos: string[],
): string {
	if (entry.data.cover) return withBase(entry.data.cover);
	const coverFile = photos.find((p) => /\/cover\./i.test(p));
	return coverFile || photos[0] || "";
}

// 保留 CollectionEntry 类型引用避免未使用告警
export type GalleryEntry = CollectionEntry<"gallery">;
