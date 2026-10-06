const GITHUB_REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * 把指令里的 repo 归一化成 "owner/repo"。
 * 编辑器预览认完整 URL，文章里两种写法都会出现，站点侧不能只认裸格式，
 * 否则卡片会被判非法直接隐藏。
 */
export function parseGithubRepository(input: unknown): string | null {
	if (typeof input !== "string") return null;
	const trimmed = input.trim();
	if (GITHUB_REPOSITORY_PATTERN.test(trimmed)) return trimmed;

	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}
	if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;

	const [owner, rawName] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
	if (!owner || !rawName) return null;
	const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
	const repo = `${owner}/${name}`;
	return GITHUB_REPOSITORY_PATTERN.test(repo) ? repo : null;
}

/** 紧凑计数（如 1.2K / 3.4M），去掉英文字符计数里的窄不换行空格 */
export function formatCount(value: number): string {
	return Intl.NumberFormat("en-us", {
		notation: "compact",
		maximumFractionDigits: 1,
	})
		.format(value)
		.replaceAll(" ", "");
}
