<script lang="ts">
/**
 * 更新日志（按天聚合版）（客户端组件）
 *
 * 数据链路：浏览器 → GitHub REST API /repos/{owner}/{repo}/commits（JSON）
 *   → 归一化为 CommitItem → 按类型分类 → 按天聚合 → 分页切片 → 渲染日卡片
 *
 * 同一天的提交聚合成一张日卡片，点击展开显示当日所有完整提交信息。
 * 没有提交的日子不会显示卡片。
 *
 * 为什么放在客户端而不是构建期：
 *   GitHub 匿名 API 限流只有 60 次/小时/IP，构建期拉取会在构建机上吃到限流；
 *   放客户端则每个访客用自己的 IP 额度，且分支有新提交时无需重新构建即可看到。
 */
import { onMount } from "svelte";
import ClientPagination from "@/components/common/ClientPagination.svelte";
import Icon from "@/components/common/Icon.svelte";
import { changelogConfig } from "@/config/changelogConfig";
import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";

interface CommitItem {
	sha: string;
	shortSha: string;
	title: string;
	body: string;
	/** 提交类型：feat / fix / docs / style / chore / other，用于卡片配色 */
	kind: CommitKind;
	author: string;
	authorUrl: string;
	avatar: string;
	date: Date;
	additions: number;
	deletions: number;
	url: string;
}

type CommitKind =
	| "feat"
	| "fix"
	| "docs"
	| "style"
	| "chore"
	| "refactor"
	| "perf"
	| "other";

/** 按天聚合后的结构 */
interface DayGroup {
	/** 日期键，格式 YYYY-MM-DD */
	date: string;
	/** 当日所有提交（按时间倒序） */
	commits: CommitItem[];
	/** 当日出现的提交类型集合 */
	kinds: CommitKind[];
	/** 当日增删行数合计 */
	totalAdditions: number;
	totalDeletions: number;
}

/** GitHub commit API 的原始结构（只声明用到的字段） */
interface GithubCommit {
	sha?: string;
	html_url?: string;
	commit?: {
		message?: string;
		author?: { name?: string; date?: string };
	};
	author?: { login?: string; html_url?: string; avatar_url?: string } | null;
	stats?: { additions?: number; deletions?: number };
}

interface Props {
	repo?: string;
	branch?: string;
	token?: string;
	itemsPerPage?: number;
	maxItems?: number;
	showBody?: boolean;
	showStats?: boolean;
	webBase?: string;
}

let {
	repo = changelogConfig.repo,
	branch = changelogConfig.branch,
	token = changelogConfig.token,
	itemsPerPage = changelogConfig.itemsPerPage,
	maxItems = changelogConfig.maxItems,
	showBody = changelogConfig.showBody,
	showStats = changelogConfig.showStats,
	webBase = changelogConfig.webBase,
}: Props = $props();

let commits = $state<CommitItem[]>([]);
let loading = $state(true);
let failed = $state(false);
let currentPage = $state(1);
let activeKind = $state<CommitKind | "all">("all");
/** 当前展开的日期键，null 表示全部收起 */
let expandedDate = $state<string | null>(null);

/** 提交标题前缀 → 类型。[feat] / feat: / 🐛 都归一到同一类 */
const KIND_PATTERNS: Array<{ kind: CommitKind; re: RegExp }> = [
	{ kind: "feat", re: /^\s*(?:\[|\(|\{)?\s*(?:feat|feature|add|新增|添加|实现|完成|加入|功能|新)/i },
	{ kind: "fix", re: /^\s*(?:\[|\(|\{)?\s*(?:fix|bugfix|hotfix|修复|修正|修正|解决|修补)/i },
	{ kind: "docs", re: /^\s*(?:\[|\(|\{)?\s*(?:docs?|documentation|文档|说明| readme|readme)/i },
	{ kind: "style", re: /^\s*(?:\[|\(|\{)?\s*(?:style|ui|css|样式|美化|排版)/i },
	{
		kind: "refactor",
		re: /^\s*(?:\[|\(|\{)?\s*(?:refactor|重构)/i,
	},
	{ kind: "perf", re: /^\s*(?:\[|\(|\{)?\s*(?:perf|optimize|优化|性能|改善|改进|提速)/i },
	{
		kind: "chore",
		re: /^\s*(?:\[|\(|\{)?\s*(?:chore|build|ci|deps|bump|配置|依赖|更新|修改|调整|移除|删除|清理|替换|更换|升级|初始化|安装)/i,
	},
];

/** 各类型的展示元信息（图标 + 语义色，供卡片徽章与筛选按钮复用） */
const KIND_META: Record<CommitKind, { label: string; icon: string }> = {
	feat: { label: "新功能", icon: "material-symbols:auto-awesome" },
	fix: { label: "修复", icon: "material-symbols:build" },
	docs: { label: "文档", icon: "material-symbols:description" },
	style: { label: "样式", icon: "material-symbols:palette" },
	refactor: { label: "重构", icon: "material-symbols:rebase-edit" },
	perf: { label: "优化", icon: "material-symbols:speed" },
	chore: { label: "维护", icon: "material-symbols:handyman" },
	other: { label: "其他", icon: "material-symbols:commit" },
};

function classify(message: string): CommitKind {
	for (const { kind, re } of KIND_PATTERNS) {
		if (re.test(message)) return kind;
	}
	return "other";
}

function normalize(raw: GithubCommit, base: string): CommitItem {
	const message = (raw.commit?.message || "").trim();
	// 首行作标题，其余作摘要
	const [firstLine = "", ...rest] = message.split("\n");
	const sha = raw.sha || "";
	return {
		sha,
		shortSha: sha.slice(0, 7),
		title: firstLine.trim() || "(无提交说明)",
		body: rest
			.map((line) => line.trim())
			.filter((line) => line && !/^co-authored-by:/i.test(line))
			.join(" "),
		kind: classify(firstLine),
		author: raw.author?.login || raw.commit?.author?.name || "unknown",
		authorUrl: raw.author?.html_url || `${base}/${repo}`,
		avatar: raw.author?.avatar_url || "",
		date: new Date(raw.commit?.author?.date || Date.now()),
		additions: raw.stats?.additions ?? 0,
		deletions: raw.stats?.deletions ?? 0,
		url: raw.html_url || `${base}/${repo}/commit/${sha}`,
	};
}

/**
 * 拉取最新 N 条 commits（N = maxItems）
 * GitHub API 单页上限 100，配置超过 100 会自动分页累积拉取。
 */
async function fetchAllCommits(): Promise<GithubCommit[]> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const perPage = 100;
	const pages = Math.ceil(maxItems / perPage);
	const all: GithubCommit[] = [];

	for (let page = 1; page <= pages; page++) {
		const api = `https://api.github.com/repos/${repo}/commits?per_page=${perPage}&page=${page}`;
		const url = branch ? `${api}&sha=${encodeURIComponent(branch)}` : api;

		const response = await fetch(url, { headers });
		if (!response.ok) throw new Error(`GitHub API ${response.status}`);

		const batch = (await response.json()) as GithubCommit[];
		if (batch.length === 0) break; // 没有更多提交了
		all.push(...batch);
		if (all.length >= maxItems) break;
	}

	// 截断到 maxItems 条
	return all.slice(0, maxItems);
}

/** 获取单个 commit 的 stats（additions/deletions） */
async function fetchCommitStats(
	sha: string,
): Promise<{ additions: number; deletions: number }> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const url = `https://api.github.com/repos/${repo}/commits/${sha}`;
	const response = await fetch(url, { headers });
	if (!response.ok) return { additions: 0, deletions: 0 };

	const data = await response.json();
	return {
		additions: data.stats?.additions ?? 0,
		deletions: data.stats?.deletions ?? 0,
	};
}

async function loadCommits(): Promise<void> {
	loading = true;
	failed = false;
	try {
		// 第一步：分页拉取所有 commits
		const allRaw = await fetchAllCommits();

		// 归一化所有 commits
		const normalized = allRaw.map((item) => normalize(item, webBase));

		// 第二步：批量获取 stats（仅对前 N 个 commit，避免过多 API 调用）
		// 有 token 时限制 50 个，无 token 时限制 30 个
		const statsLimit = token ? 50 : 30;
		const commitsNeedingStats = normalized
			.filter((c) => c.additions === 0 && c.deletions === 0)
			.slice(0, statsLimit);

		if (commitsNeedingStats.length > 0) {
			// 并发获取 stats，每批 5 个，避免触发限流
			const batchSize = 5;
			for (let i = 0; i < commitsNeedingStats.length; i += batchSize) {
				const batch = commitsNeedingStats.slice(i, i + batchSize);
				await Promise.all(
					batch.map(async (commit) => {
						const stats = await fetchCommitStats(commit.sha);
						commit.additions = stats.additions;
						commit.deletions = stats.deletions;
					}),
				);
				// 批次间短暂延迟，避免触发 GitHub 限流
				if (i + batchSize < commitsNeedingStats.length) {
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			}
		}

		commits = normalized;
		currentPage = 1;
		expandedDate = null;
	} catch {
		failed = true;
		commits = [];
	} finally {
		loading = false;
	}
}

onMount(() => {
	void loadCommits();
});

/** 当前筛选结果（分页基于筛选后的集合，切类型时回到第一页） */
const filtered = $derived(
	activeKind === "all"
		? commits
		: commits.filter((item) => item.kind === activeKind),
);

/** 按天聚合：把筛选后的 commits 按日期分组，倒序排列 */
const groupedByDate = $derived.by(() => {
	const groups: Record<string, CommitItem[]> = {};
	for (const commit of filtered) {
		const key = formatDate(commit.date);
		if (!groups[key]) groups[key] = [];
		groups[key].push(commit);
	}
	return Object.entries(groups)
		.map(([date, dayCommits]) => {
			const kindSet = new Set<CommitKind>();
			let totalAdd = 0;
			let totalDel = 0;
			for (const c of dayCommits) {
				kindSet.add(c.kind);
				totalAdd += c.additions;
				totalDel += c.deletions;
			}
			return {
				date,
				commits: dayCommits,
				kinds: [...kindSet],
				totalAdditions: totalAdd,
				totalDeletions: totalDel,
			} as DayGroup;
		})
		.sort((a, b) => b.date.localeCompare(a.date));
});

/** 分页基于天数，每天一张卡片 */
const totalPages = $derived(Math.max(1, Math.ceil(groupedByDate.length / itemsPerPage)));
const pagedDays = $derived(
	groupedByDate.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
);

/** 只保留实际出现过的类型，避免空筛选按钮 */
const availableKinds = $derived(
	(Object.keys(KIND_META) as CommitKind[]).filter((kind) =>
		commits.some((item) => item.kind === kind),
	),
);

function selectKind(kind: CommitKind | "all"): void {
	activeKind = kind;
	currentPage = 1;
	expandedDate = null;
}

function toggleDay(date: string): void {
	expandedDate = expandedDate === date ? null : date;
}

function formatDate(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function handlePageChange(page: number): void {
	currentPage = page;
	expandedDate = null;
	// 翻页后回到列表顶部，避免停在半空
	document
		.querySelector(".changelog-page")
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<!-- 加载中骨架 -->
{#if loading}
	<div class="changelog-day-list" aria-busy="true">
		{#each Array(6) as _, index (index)}
			<div class="changelog-day is-skeleton card-base" aria-hidden="true">
				<div class="changelog-day-header">
					<div class="skeleton-line w-1/4"></div>
					<div class="skeleton-line w-1/6"></div>
				</div>
				<div class="skeleton-line w-3/4"></div>
				<div class="skeleton-line w-2/3"></div>
			</div>
		{/each}
	</div>
{:else if failed}
	<!-- 失败态：常见原因是匿名 API 限流，给出重试入口 -->
	<div class="changelog-state card-base">
		<span class="changelog-state-icon">
			<Icon icon="material-symbols:cloud-off" />
		</span>
		<p>{i18n(I18nKey.changelogError)}</p>
		<button type="button" class="changelog-retry btn-card" onclick={() => loadCommits()}>
			{i18n(I18nKey.changelogRetry)}
		</button>
	</div>
{:else if commits.length === 0}
	<div class="changelog-state card-base">
		<span class="changelog-state-icon">
			<Icon icon="material-symbols:inbox" />
		</span>
		<p>{i18n(I18nKey.changelogEmpty)}</p>
	</div>
{:else}
	<!-- 类型筛选（全部 + 实际出现的类型） -->
	<div class="changelog-filter">
		<button
			type="button"
			class="changelog-pill"
			data-active={activeKind === "all" ? "" : undefined}
			onclick={() => selectKind("all")}
		>
			{i18n(I18nKey.changelogAll)}
			<span class="changelog-pill-count">{commits.length}</span>
		</button>
		{#each availableKinds as kind (kind)}
			{@const meta = KIND_META[kind]}
			{@const count = commits.filter((item) => item.kind === kind).length}
			<button
				type="button"
				class="changelog-pill"
				data-kind={kind}
				data-active={activeKind === kind ? "" : undefined}
				onclick={() => selectKind(kind)}
			>
				<Icon icon={meta.icon} />
				{meta.label}
				<span class="changelog-pill-count">{count}</span>
			</button>
		{/each}
	</div>

	<!-- 日卡片列表：同一天的提交聚合成一张卡片，点击展开 -->
	<div class="changelog-day-list">
		{#each pagedDays as day (day.date)}
			<section class="changelog-day card-base" class:is-expanded={expandedDate === day.date}>
				<button
					type="button"
					class="changelog-day-header"
					onclick={() => toggleDay(day.date)}
					aria-expanded={expandedDate === day.date}
				>
					<time class="changelog-day-date" datetime={day.date}>
						{day.date}
					</time>
					<span class="changelog-day-count">
						{day.commits.length} 次提交
					</span>
					<!-- 当日出现的类型徽章 -->
					<span class="changelog-day-kinds">
						{#each day.kinds as kind (kind)}
							<span class="changelog-kind" data-kind={kind}>
								<Icon icon={KIND_META[kind].icon} />
								{KIND_META[kind].label}
							</span>
						{/each}
					</span>
					{#if showStats}
						<span class="changelog-day-stats">
							<em>+{day.totalAdditions}</em>
							<i>-{day.totalDeletions}</i>
						</span>
					{/if}
					<!-- 展开/收起指示器 -->
					<span class="changelog-day-chevron" aria-hidden="true">
						<Icon icon="material-symbols:keyboard-arrow-down" />
					</span>
				</button>

				{#if expandedDate === day.date}
					<div class="changelog-day-body">
						{#each day.commits as commit (commit.sha)}
							<article class="changelog-commit" data-kind={commit.kind}>
								<header class="changelog-commit-head">
									<span class="changelog-kind" data-kind={commit.kind}>
										<Icon icon={KIND_META[commit.kind].icon} />
										{KIND_META[commit.kind].label}
									</span>
									<code class="changelog-sha">{commit.shortSha}</code>
								</header>

								<h3 class="changelog-title">
									<a href={commit.url} target="_blank" rel="noopener noreferrer">
										{commit.title}
									</a>
								</h3>

								{#if showBody && commit.body}
									<p class="changelog-body">{commit.body}</p>
								{/if}

								<footer class="changelog-foot">
									<a
										class="changelog-author"
										href={commit.authorUrl}
										target="_blank"
										rel="noopener noreferrer"
										title={commit.author}
									>
										{#if commit.avatar}
											<img src={commit.avatar} alt="" loading="lazy" decoding="async" />
										{/if}
										<span>{commit.author}</span>
									</a>
									{#if showStats}
										<span class="changelog-stats" aria-hidden="true">
											<em>+{commit.additions}</em>
											<i>-{commit.deletions}</i>
										</span>
									{/if}
								</footer>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</div>

	<!-- 分页：按天数分页 -->
	<ClientPagination
		totalItems={groupedByDate.length}
		{itemsPerPage}
		{currentPage}
		onPageChange={handlePageChange}
	/>
{/if}