// ============================================================================
// 更新日志配置 - 自动从 GitHub 仓库的 commit 记录生成
// Changelog Configuration - Auto-generated from GitHub commit history
// ============================================================================
// 数据来源：GitHub REST API /repos/{owner}/{repo}/commits
// 无需 Token 即可访问公开仓库（匿名限流 60 次/小时/IP），
// 若配置了 token 则限流提升到 5000 次/小时，适合频繁访问的站点。

export interface ChangelogConfig {
	/** 页面开关（同时应用站点总体开关 siteConfig.pages.changelog） */
	enable: boolean;

	/** 目标仓库：owner/repo 形式，如 Bingak/Lonely-blog */
	repo: string;

	/** 分支或 tag，留空则用仓库默认分支 */
	branch: string;

	/** 页面标题与描述 */
	title: string;
	description: string;

	/** 每页展示多少条 commit */
	itemsPerPage: number;

	/** 最多拉取多少条（GitHub API 单页上限 100，配置超过 100 会自动分页累积拉取） */
	maxItems: number;

	/**
	 * GitHub Personal Access Token（可选）
	 * 公开仓库不填也能用，只是限流更严；
	 * 建议通过环境变量注入，不要直接写死在仓库里（会被公开看到）。
	 * 支持 public 前缀：由构建脚本注入到 import.meta.env.PUBLIC_CHANGELOG_GITHUB_TOKEN
	 */
	token: string;

	/** 是否在卡片中显示 commit 摘要（正文首行） */
	showBody: boolean;

	/** 是否显示 commit 的增删行数统计 */
	showStats: boolean;

	/**
	 * 让链接指向的提交页地址
	 * 例如 "https://github.com"（GitHub），留空则用默认值
	 */
	webBase: string;
}

export const changelogConfig: ChangelogConfig = {
	// 页面开关
	enable: true,

	// 目标仓库（本站自身仓库）
	repo: "Bingak/Lonely-blog",

	// 分支，留空使用仓库默认分支
	branch: "main",

	// 页面文案
	title: "更新日志",
	description: "本站基于 Firefly 主题魔改，这里记录每一次改动",

	// 分页：每页 12 天，最多拉取 200 条（GitHub API 单页上限 100，自动分 2 页拉取）
	itemsPerPage: 12,
	maxItems: 200,

	// 可选 Token：留空即匿名访问。若 GitHub 限流导致页面报错，
	// 可在部署平台配置环境变量 PUBLIC_CHANGELOG_GITHUB_TOKEN=ghp_xxx 后重新构建
	token:
		(typeof import.meta !== "undefined" &&
			import.meta.env?.PUBLIC_CHANGELOG_GITHUB_TOKEN) ||
		"",

	// 卡片内容开关
	showBody: true,
	showStats: true,

	// GitHub 站点地址
	webBase: "https://github.com",
};
