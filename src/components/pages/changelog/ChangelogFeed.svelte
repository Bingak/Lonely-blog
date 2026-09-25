<script lang="ts">
/**
 * 更新日志（按天聚合版）（客户端组件）
 *
 * 数据链路：浏览器 → 同源 API `/api/commits` → Cloudflare Worker → GitHub REST API
 *   → 归一化为 CommitItem → 按类型分类 → 按天聚合 → 分页切片 → 渲染日卡片
 *
 * 增删行数（stats）为什么要单独一批请求：GitHub 的 commits **列表**接口不返回 stats，
 * 只能逐个 commit 去问详情。早期实现是逐条请求、且写死只补最新 50 条，
 * 导致第 51 条往后的日期全显示成 `+0 -0`（看起来像「这天没改代码」）。
 * 现在改为走 Worker 的批量接口 `/api/commits/stats?shas=…`，一次问一批，
 * 并把 maxItems 全量补齐；仍取不到的行显示 `—`，与真实的 0 区分开。
 *
 * 分组支持两档粒度，右上角胶囊可切换（默认按月）：
 *   - 按月：同月的所有日期合并成一张月卡片（月 → 天 → 提交 共三层），
 *           展开月卡片先看到该月每天一个可点的日按钮，再点某一天才展开当天的提交列表；
 *   - 按天：同一天的提交聚合成一张日卡片，点击展开显示当日完整提交（两层）。
 * 两档共用同一套日聚合逻辑，口径一致，不会出现"某天数字对不上"。
 * 没有提交的日子不会显示卡片。
 *
 * 为什么走同源 API 而不是浏览器直连 GitHub：
 *   GitHub token 只能存在服务端才安全。前端读不到 Cloudflare 的运行时环境变量
 *   （`import.meta.env.PUBLIC_*` 只会构建期内联成公开字符串），
 *   所以由 Worker（worker/index.js）带上 Secret 里的 GITHUB_TOKEN 回源，
 *   顺带在边缘做缓存，多个访客共享同一份限额。
 *   若托管平台没有这个 Worker（纯静态部署），会自动回落到浏览器直连 GitHub 的匿名模式。
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
	/** stats 是否真的取到了；false 时显示 — ，避免与真实的 +0 -0 混淆 */
	hasStats: boolean;
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
	/** 当日所有提交的 stats 是否都已取到；false 时该日显示 — 而非合计值 */
	statsLoaded: boolean;
}

/** 按月聚合后的结构：一个月一张卡片，内部仍保留日分组 */
interface MonthGroup {
	/** 月份键，格式 YYYY-MM */
	month: string;
	/** 展示用标题，如「2026 年 9 月」 */
	label: string;
	/** 月内按天聚合的结果（倒序），展开后逐天展示 */
	days: DayGroup[];
	/** 该月提交总数 */
	commitCount: number;
	/** 该月出现的提交类型集合 */
	kinds: CommitKind[];
	/** 该月增删行数合计 */
	totalAdditions: number;
	totalDeletions: number;
	/** 该月所有提交的 stats 是否都已取到；false 时显示 — 而非合计值 */
	statsLoaded: boolean;
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
	itemsPerPage?: number;
	maxItems?: number;
	statsLimit?: number;
	showBody?: boolean;
	showStats?: boolean;
	webBase?: string;
}

let {
	repo = changelogConfig.repo,
	branch = changelogConfig.branch,
	itemsPerPage = changelogConfig.itemsPerPage,
	maxItems = changelogConfig.maxItems,
	statsLimit = changelogConfig.statsLimit ?? 300,
	showBody = changelogConfig.showBody,
	showStats = changelogConfig.showStats,
	webBase = changelogConfig.webBase,
}: Props = $props();

let commits = $state<CommitItem[]>([]);
let loading = $state(true);
let failed = $state(false);
let currentPage = $state(1);
let activeKind = $state<CommitKind | "all">("all");
/** 分组粒度：按月或按天，默认按月（同月合并成一张卡片） */
let groupMode = $state<"day" | "month">("month");
/** 当前展开的日期键，null 表示全部收起 */
let expandedDate = $state<string | null>(null);
/** 当前展开的月份键（按月视图），格式 YYYY-MM，null 表示全部收起 */
let expandedMonth = $state<string | null>(null);
/**
 * 按月视图里，月内当前展开的那一天，格式 YYYY-MM-DD，null 表示该月内各天全部收起。
 * 与按天视图的 expandedDate 分开维护 —— 两档视图的"展开"语义不同，
 * 共用同一个变量会让切视图时出现串台。
 */
let expandedSubday = $state<string | null>(null);

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
		// 列表接口不返回 stats，这里一律标记未加载，由 loadStats 补齐
		hasStats: Boolean(raw.stats),
		url: raw.html_url || `${base}/${repo}/commit/${sha}`,
	};
}

/** 同源代理不可用时的直连地址（纯静态托管场景，匿名限流 60 次/小时/IP） */
const GITHUB_API = "https://api.github.com";

/**
 * 代理可用性：null 未知，true 可用，false 已确认不可用（后续不再重试）
 * 只有「路由不存在」才判定为不可用；限流 / 凭据错误会照常抛出，不做静默降级。
 */
let proxyAvailable: boolean | null = null;

async function requestViaProxy(path: string): Promise<Response | null> {
	if (proxyAvailable === false) return null;
	const response = await fetch(path, {
		headers: { Accept: "application/json" },
	});
	if (response.status === 404 || response.status === 405 || response.status === 501) {
		proxyAvailable = false;
		console.warn(
			"[changelog] 同源代理 /api/commits 不可用（当前托管平台未部署 worker/index.js），已回落到浏览器直连 GitHub，匿名限流 60 次/小时/IP",
		);
		return null;
	}
	proxyAvailable = true;
	return response;
}

/**
 * 拉取最新 N 条 commits（N = maxItems）
 * 走同源代理 `/api/commits`，GitHub 单页上限 100，配置超过 100 会自动分页累积拉取。
 */
async function fetchAllCommits(): Promise<GithubCommit[]> {
	const perPage = 100;
	const pages = Math.ceil(maxItems / perPage);
	const all: GithubCommit[] = [];

	for (let page = 1; page <= pages; page++) {
		const query = `per_page=${perPage}&page=${page}${branch ? `&sha=${encodeURIComponent(branch)}` : ""}`;

		let response = await requestViaProxy(`/api/commits?${query}`);
		if (!response) {
			response = await fetch(`${GITHUB_API}/repos/${repo}/commits?${query}`, {
				headers: { Accept: "application/vnd.github+json" },
			});
		}
		if (!response.ok) throw new Error(`changelog API ${response.status}`);

		const batch = (await response.json()) as GithubCommit[];
		if (batch.length === 0) break; // 没有更多提交了
		all.push(...batch);
		if (all.length >= maxItems) break;
	}

	// 截断到 maxItems 条
	return all.slice(0, maxItems);
}

/**
 * 每批带多少个 sha。必须与 Worker 端的 STATS_BATCH_MAX 保持一致：
 * 那一边是按「subrequest + Cache API 调用共享 50 次/请求」的配额反推出来的。
 */
const STATS_BATCH_SIZE = 15;

/** 没有 Worker 可回落时，匿名直连最多补多少条（匿名额度仅 60 次/小时） */
const ANON_STATS_LIMIT = 50;

/**
 * 批量取增删行数，返回 { sha: {additions, deletions} }。
 * 返回 null 表示同源代理不可用（纯静态部署），调用方据此回落到逐条直连；
 * 返回 {} 表示代理在但这次没拿到数据，此时保留「未加载」状态。
 */
async function fetchStatsBatch(
	shas: string[],
): Promise<Record<string, { additions: number; deletions: number }> | null> {
	const response = await requestViaProxy(
		`/api/commits/stats?shas=${shas.join(",")}`,
	);
	if (!response) return null;
	if (!response.ok) return {};

	const data = await response.json();
	return data && typeof data === "object" ? data : {};
}

/** 获取单个 commit 的 stats（additions/deletions），走同源代理并带长缓存 */
async function fetchCommitStats(
	sha: string,
): Promise<{ additions: number; deletions: number } | null> {
	let response = await requestViaProxy(`/api/commits/${sha}`);
	if (!response) {
		response = await fetch(`${GITHUB_API}/repos/${repo}/commits/${sha}`, {
			headers: { Accept: "application/vnd.github+json" },
		});
	}
	if (!response.ok) return null;

	const data = await response.json();
	if (!data?.stats) return null;
	return {
		additions: data.stats.additions ?? 0,
		deletions: data.stats.deletions ?? 0,
	};
}

/** 回落路径：逐条直连 GitHub 补 stats，受匿名限流约束，只用于没有 Worker 的部署 */
async function fetchStatsIndividually(items: CommitItem[]): Promise<void> {
	const batchSize = 5;
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (commit) => {
				const stats = await fetchCommitStats(commit.sha);
				if (!stats) return;
				commit.additions = stats.additions;
				commit.deletions = stats.deletions;
				commit.hasStats = true;
			}),
		);
		if (i + batchSize < items.length) {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
}

/**
 * 补齐所有 commit 的增删行数。批量优先，任何一批失败都不影响页面渲染 ——
 * 拿不到的行会保持 hasStats=false，界面上显示为 — ，而不是假的 +0 -0。
 */
async function loadStats(items: CommitItem[]): Promise<void> {
	const pending = items.filter((item) => !item.hasStats);
	if (pending.length === 0) return;

	for (let i = 0; i < pending.length; i += STATS_BATCH_SIZE) {
		const batch = pending.slice(i, i + STATS_BATCH_SIZE);
		const map = await fetchStatsBatch(batch.map((item) => item.sha));

		if (map === null) {
			// 同源代理不存在（纯静态托管）：回落到匿名直连，只补前 N 条
			await fetchStatsIndividually(pending.slice(0, ANON_STATS_LIMIT));
			return;
		}

		for (const commit of batch) {
			const stats: { additions: number; deletions: number } | undefined =
				map[commit.sha] ?? map[commit.sha.toLowerCase()];
			if (!stats) continue;
			commit.additions = stats.additions ?? 0;
			commit.deletions = stats.deletions ?? 0;
			commit.hasStats = true;
		}
	}
}

async function loadCommits(): Promise<void> {
	loading = true;
	failed = false;
	try {
		// 第一步：分页拉取所有 commits
		const allRaw = await fetchAllCommits();

		// 归一化所有 commits
		const normalized = allRaw.map((item) => normalize(item, webBase));

		// 第二步：批量补齐 stats —— 仅取最新 statsLimit 条（列表展示全部，统计有限）
		await loadStats(normalized.slice(0, statsLimit));

		commits = normalized;
		currentPage = 1;
		collapseAll();
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

/**
 * 把一组 commits 按天聚合，返回倒序排列的日分组。
 * 按月视图复用同一段逻辑（月卡片内部的日分段），两档粒度的口径完全一致。
 */
function groupDays(items: CommitItem[]): DayGroup[] {
	const groups: Record<string, CommitItem[]> = {};
	for (const commit of items) {
		const key = formatDate(commit.date);
		if (!groups[key]) groups[key] = [];
		groups[key].push(commit);
	}
	return Object.entries(groups)
		.map(([date, dayCommits]) => {
			const kindSet = new Set<CommitKind>();
			let totalAdd = 0;
			let totalDel = 0;
			let statsLoaded = true;
			for (const c of dayCommits) {
				kindSet.add(c.kind);
				totalAdd += c.additions;
				totalDel += c.deletions;
				// 同一天只要有一条没取到 stats，当日合计就不可信，直接显示 —
				if (!c.hasStats) statsLoaded = false;
			}
			return {
				date,
				commits: dayCommits,
				kinds: [...kindSet],
				totalAdditions: totalAdd,
				totalDeletions: totalDel,
				statsLoaded,
			} as DayGroup;
		})
		.sort((a, b) => b.date.localeCompare(a.date));
}

/** 按天聚合（按天视图）：一天一张卡片 */
const groupedByDate = $derived(groupDays(filtered));

/**
 * 按月聚合（按月视图）：同月的所有日期合并成一张月卡片。
 * 月内仍保留日分组，展开后按天分段展示，信息量与按天视图一致。
 */
const groupedByMonth = $derived.by(() => {
	const buckets: Record<string, CommitItem[]> = {};
	for (const commit of filtered) {
		const key = `${commit.date.getFullYear()}-${padStart2(commit.date.getMonth() + 1)}`;
		if (!buckets[key]) buckets[key] = [];
		buckets[key].push(commit);
	}
	return Object.entries(buckets)
		.map(([month, monthCommits]) => {
			const days = groupDays(monthCommits);
			const kindSet = new Set<CommitKind>();
			let totalAdd = 0;
			let totalDel = 0;
			let statsLoaded = true;
			for (const c of monthCommits) {
				kindSet.add(c.kind);
				totalAdd += c.additions;
				totalDel += c.deletions;
				if (!c.hasStats) statsLoaded = false;
			}
			const [year, monthNumber] = month.split("-");
			return {
				month,
				label: `${year} 年 ${Number(monthNumber)} 月`,
				days,
				commitCount: monthCommits.length,
				kinds: [...kindSet],
				totalAdditions: totalAdd,
				totalDeletions: totalDel,
				statsLoaded,
			} as MonthGroup;
		})
		.sort((a, b) => b.month.localeCompare(a.month));
});

/** 分页基于"组"：按月视图是月数，按天视图是天数 */
const groupCount = $derived(
	groupMode === "month" ? groupedByMonth.length : groupedByDate.length,
);
const pagedDays = $derived(
	groupedByDate.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
);
const pagedMonths = $derived(
	groupedByMonth.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
);

/** 只保留实际出现过的类型，避免空筛选按钮 */
const availableKinds = $derived(
	(Object.keys(KIND_META) as CommitKind[]).filter((kind) =>
		commits.some((item) => item.kind === kind),
	),
);

/** 收起所有已展开的卡片（切筛选 / 切粒度 / 翻页时统一处理） */
function collapseAll(): void {
	expandedDate = null;
	expandedMonth = null;
	expandedSubday = null;
}

function selectKind(kind: CommitKind | "all"): void {
	activeKind = kind;
	currentPage = 1;
	collapseAll();
}

/** 切换分组粒度。两档的"组数"不同，所以顺带回到第一页 */
function selectGroupMode(mode: "day" | "month"): void {
	if (groupMode === mode) return;
	groupMode = mode;
	currentPage = 1;
	collapseAll();
}

function toggleDay(date: string): void {
	expandedDate = expandedDate === date ? null : date;
}

function toggleMonth(month: string): void {
	const next = expandedMonth === month ? null : month;
	expandedMonth = next;
	// 收起该月（或换到别的月）时，把月内展开的那一天一并复位，
	// 否则下次展开该月会"莫名其妙已经展开了一天"
	if (next !== month) expandedSubday = null;
}

/** 月内某一天的展开/收起：月 → 天 → 提交 三层里的中间那层 */
function toggleSubday(date: string): void {
	expandedSubday = expandedSubday === date ? null : date;
}

function padStart2(value: number): string {
	return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
	return `${date.getFullYear()}-${padStart2(date.getMonth() + 1)}-${padStart2(date.getDate())}`;
}

function handlePageChange(page: number): void {
	currentPage = page;
	collapseAll();
	// 翻页后回到列表顶部，避免停在半空
	document
		.querySelector(".changelog-page")
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<!--
	单条提交卡片。按天视图与按月视图的日分段共用同一个 snippet，
	避免两处渲染逻辑漂移（改了一处忘了另一处）。
-->
{#snippet commitCard(commit: CommitItem)}
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
					{#if commit.hasStats}
						<em>+{commit.additions}</em>
						<i>-{commit.deletions}</i>
					{:else}
						<span class="changelog-stats-pending">—</span>
					{/if}
				</span>
			{/if}
		</footer>
	</article>
{/snippet}

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
	<!-- 类型筛选 + 分组粒度切换 -->
	<div class="changelog-toolbar">
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

		<!-- 分组粒度：按月把同月的日期合并成一张卡片，按天则一天一张 -->
		<div class="changelog-view" role="group" aria-label="分组方式">
			<button
				type="button"
				class="changelog-pill"
				data-active={groupMode === "month" ? "" : undefined}
				aria-pressed={groupMode === "month"}
				onclick={() => selectGroupMode("month")}
			>
				按月
			</button>
			<button
				type="button"
				class="changelog-pill"
				data-active={groupMode === "day" ? "" : undefined}
				aria-pressed={groupMode === "day"}
				onclick={() => selectGroupMode("day")}
			>
				按天
			</button>
		</div>
	</div>

	<div class="changelog-day-list">
		{#if groupMode === "month"}
			<!-- 月卡片：同月的所有日期合并成一张，展开后按天分段展示 -->
			{#each pagedMonths as month (month.month)}
				<section
					class="changelog-day changelog-month card-base"
					class:is-expanded={expandedMonth === month.month}
				>
					<button
						type="button"
						class="changelog-day-header"
						onclick={() => toggleMonth(month.month)}
						aria-expanded={expandedMonth === month.month}
					>
						<time class="changelog-day-date" datetime={month.month}>
							{month.label}
						</time>
						<span class="changelog-day-count">
							{month.commitCount} 次提交 · {month.days.length} 天有改动
						</span>
						<!-- 该月出现过的类型徽章 -->
						<span class="changelog-day-kinds">
							{#each month.kinds as kind (kind)}
								<span class="changelog-kind" data-kind={kind}>
									<Icon icon={KIND_META[kind].icon} />
									{KIND_META[kind].label}
								</span>
							{/each}
						</span>
						{#if showStats}
							<span class="changelog-day-stats">
								{#if month.statsLoaded}
									<em>+{month.totalAdditions}</em>
									<i>-{month.totalDeletions}</i>
								{:else}
									<span
										class="changelog-stats-pending"
										title="增删行数未取到，显示为 — 以区别于真实的 0"
									>—</span>
								{/if}
							</span>
						{/if}
						<!-- 展开/收起指示器 -->
						<span class="changelog-day-chevron" aria-hidden="true">
							<Icon icon="material-symbols:keyboard-arrow-down" />
						</span>
					</button>

					{#if expandedMonth === month.month}
						<div class="changelog-day-body changelog-month-body">
							{#each month.days as day (day.date)}
								<!-- 月内某一天：再折叠一层，点开后才显示当天的提交详情 -->
								<section
									class="changelog-subday"
									class:is-expanded={expandedSubday === day.date}
								>
									<button
										type="button"
										class="changelog-subday-header"
										onclick={() => toggleSubday(day.date)}
										aria-expanded={expandedSubday === day.date}
									>
										<time class="changelog-subday-date" datetime={day.date}>
											{day.date.slice(5)}
										</time>
										<span class="changelog-day-count">
											{day.commits.length} 次提交
										</span>
										<!-- 当天出现过的类型徽章 -->
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
												{#if day.statsLoaded}
													<em>+{day.totalAdditions}</em>
													<i>-{day.totalDeletions}</i>
												{:else}
													<span
														class="changelog-stats-pending"
														title="增删行数未取到，显示为 — 以区别于真实的 0"
													>—</span>
												{/if}
											</span>
										{/if}
										<span class="changelog-day-chevron" aria-hidden="true">
											<Icon icon="material-symbols:keyboard-arrow-down" />
										</span>
									</button>
								
								{#if expandedSubday === day.date}
									<div class="changelog-subday-body">
										{#each day.commits as commit (commit.sha)}
											{@render commitCard(commit)}
										{/each}
									</div>
								{/if}
								</section>
							{/each}
						</div>
					{/if}
				</section>
			{/each}
		{:else}
			<!-- 日卡片列表：同一天的提交聚合成一张卡片，点击展开 -->
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
								{#if day.statsLoaded}
									<em>+{day.totalAdditions}</em>
									<i>-{day.totalDeletions}</i>
								{:else}
									<span
										class="changelog-stats-pending"
										title="增删行数未取到，显示为 — 以区别于真实的 0"
									>—</span>
								{/if}
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
								{@render commitCard(commit)}
							{/each}
						</div>
					{/if}
				</section>
			{/each}
		{/if}
	</div>

	<!-- 分页：按月视图按月数分页，按天视图按天数分页 -->
	<ClientPagination
		totalItems={groupCount}
		{itemsPerPage}
		{currentPage}
		onPageChange={handlePageChange}
	/>
{/if}
