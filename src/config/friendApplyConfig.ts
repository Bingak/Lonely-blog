// 友链申请配置：友链页的申请表单 + worker/index.js 的 POST /api/friend-apply
export interface FriendApplyConfig {
	// 是否启用申请表单（关闭后友链页不渲染按钮）
	enable: boolean;
	// Cloudflare Turnstile 站点密钥（公开值）；为空时表单不渲染
	turnstileSiteKey: string;
	// 友链数据所在仓库，服务端在此仓库开 PR
	githubRepo: string;
	// PR 的目标分支
	baseBranch: string;
	// 仓库内友链数据文件路径，服务端读取并追加条目
	dataPath: string;
}

export const friendApplyConfig: FriendApplyConfig = {
	enable: true,
	// Turnstile 站点密钥本身就是公开值（会出现在页面 HTML 里），所以直接写死兜底：
	// CI（Workers Builds）读不到 gitignored 的 .env，只靠环境变量会让按钮整块消失
	turnstileSiteKey: import.meta.env?.PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFCFMk3cJMZKa-Q3",
	githubRepo: "Bingak/Lonely-blog",
	baseBranch: "main",
	dataPath: "src/data/friends.json",
};
