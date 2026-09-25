import type { GalleryConfig } from "@/types/galleryConfig";

// 相册全局配置
// 注意：相册数据（id/名称/描述/图片等）已迁移至内容集合 src/content/gallery/*.md，
// 每个相册对应一个 md 文件，图片列表写在 frontmatter 的 photos 数组中。
// 本地图片仍可放在 public/gallery/{id}/ 目录下，会与 photos 数组合并展示。
export const galleryConfig: GalleryConfig = {
	// 相册列表（已迁移至内容集合，此处保留空数组仅供类型兼容）
	albums: [],

	// 瀑布流最小列宽(px)，浏览器根据容器宽度自动计算列数，默认 240
	// 值越小列数越多，值越大列数越少
	columnWidth: 240,
};
