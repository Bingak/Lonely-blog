import type { GalleryConfig } from "@/types/galleryConfig";

// 相册配置
export const galleryConfig: GalleryConfig = {
	// 相册列表
	albums: [
		// 支持jpg/png/webp/avif/gif格式
		// id: 相册唯一标识符（用于目录命名和URL路径），比如设置：id: "firefly-2026", 对应 public/gallery/firefly-2026/目录
		// cover: 手动指定封面图（可选，不填会把cover.*文件作为封面图，如果没有cover.*文件，则使用第一张图片作为封面图）
		// name: 相册名称
		// description: 相册描述
		// location: 相册拍摄地点
		// date: 相册日期，格式为 YYYY-MM-DD，用于排序和显示
		// tags: 相册标签，用于分类和过滤
		// password: 访问密码，设置后需要输入密码才能查看相册内容（可选）
		// passwordHint: 密码提示，设置后在输入密码错误时显示（可选，需配合password使用）
		// 每添加一个数组项就相当于添加了一个相册，记得在 public/gallery/ 目录下创建对应的子目录并放入图片
		{
			id: "yihuan",
			name: "异环",
			description: "喵喵喵~，异环游戏日常",
			location: "异环",
			date: "2026-09-14",
			tags: ["异环", "游戏"],
		},
		{
			id: "encrypted",
			name: "加密的哦~",
			description:
				"重要的人才能看哦~",
			location: "未知",
			date: "2026-09-12",
			tags: ["Life", "Love"],
			password: "0928",
			passwordHint: "你猜猜",
		},
		{
			id: "handan",
			name: "邯郸",
			description: "邯郸一日游",
			location: "邯郸",
			date: "2026-09-13",
			tags: ["Life", "游玩"],
		},
	],

	// 瀑布流最小列宽(px)，浏览器根据容器宽度自动计算列数，默认 240
	// 值越小列数越多，值越大列数越少
	columnWidth: 240,
};
