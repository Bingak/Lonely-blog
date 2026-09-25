// ============================================================================
// 更新日志配置 - 自动从 GitHub 仓库的 commit 记录生成
// Changelog Configuration - Auto-generated from GitHub commit history
// ============================================================================
// 数据来源：同源 API `/api/commits`（由 worker/index.js 转发到 GitHub REST API）
// GitHub 凭据只存在于服务端：用 `wrangler secret put GITHUB_TOKEN` 写入，
// 前端产物里不会出现 token，也不会因为匿名限流（60 次/小时）而随机失败。

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

	/** 代码变更统计（增删行数）最多拉取多少条；列表展示全部，统计仅取最新 N 条 */
	statsLimit: number;

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
	description: "本站基于 Firefly 主题魔改，这里记录每一次 Commit，代码变更统计拉取最新 300 条",

	// 分页：每页 12 天；列表拉取全部提交，代码变更统计仅取最新 300 条
	itemsPerPage: 12,
	maxItems: 10000,
	statsLimit: 300,

	// 卡片内容开关
	showBody: true,
	showStats: true,

	// GitHub 站点地址
	webBase: "https://github.com",
};
