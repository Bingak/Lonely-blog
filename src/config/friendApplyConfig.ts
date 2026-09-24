// 友链申请配置：友链页的申请表单 + worker/index.js 的 POST /api/friend-apply
export interface FriendApplyConfig {
	// 是否启用申请表单（关闭后友链页不渲染按钮）
	enable: boolean;
	// Cloudflare Turnstile 站点密钥（公开值，构建时由 .env 的 PUBLIC_TURNSTILE_SITE_KEY 内联）；为空时表单不渲染
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
	// `?.` 是必需的：scripts/ 下的构建脚本经 src/config/index.ts 导入本文件时跑在纯 Node 里，没有 import.meta.env
	turnstileSiteKey: import.meta.env?.PUBLIC_TURNSTILE_SITE_KEY ?? "",
	githubRepo: "Bingak/Lonely-blog",
	baseBranch: "main",
	dataPath: "src/data/friends.json",
};
