/**
 * Cloudflare Worker 入口
 *
 * 职责有两件事：
 *   1. /api/commits（以及 /api/commits/{sha}）—— 代浏览器向 GitHub REST API 取数据，
 *      在服务端附上 GITHUB_TOKEN，token 不会出现在任何前端产物里。
 *   2. 其余请求全部透传给静态资源绑定，行为与纯静态资源部署保持一致。
 *
 * 为什么需要它：
 *   更新日志是浏览器端渲染的，而 `import.meta.env.PUBLIC_*` 只能靠构建期内联，
 *   前端永远读不到 Cloudflare 的「变量和机密」（那是 Worker 运行时环境变量）。
 *   把取数搬到服务端后，token 存在 Secret 里即可生效，也不会被访客从 JS 里抓走。
 *
 * 路由约定（前端 src/components/pages/changelog/ChangelogFeed.svelte 依赖）：
 *   GET /api/commits?per_page=100&page=1     -> GitHub commits 列表原始 JSON 数组
 *   GET /api/commits/{sha}                   -> 单个 commit 详情（含 stats 增删行数）
 *   GET /api/commits/stats?shas=a,b,c        -> 批量取 stats，形如 { sha: { additions, deletions } }
 *
 * 可用环境变量：
 *   GITHUB_TOKEN   建议用 wrangler secret put GITHUB_TOKEN 写入；缺省则匿名请求（60 次/小时/边缘 IP）
 *   GITHUB_REPO    目标仓库，默认 Bingak/Lonely-blog（客户端不允许覆盖，避免变成公开代理）
 *   GITHUB_BRANCH  默认分支，默认 main；客户端可用 ?sha= 指定同一仓库的其它分支/引用
 */

const GITHUB_API = "https://api.github.com";

const DEFAULT_REPO = "Bingak/Lonely-blog";
const DEFAULT_BRANCH = "main";

/** 列表数据缓存 5 分钟：GitHub 有新提交后最多 5 分钟即可见 */
const LIST_TTL = 300;
/** 单个 commit 的 stats 一经产生就不会变，缓存 7 天 */
const COMMIT_TTL = 604800;

/**
 * 批量 stats 接口单次允许的 sha 数量。
 *
 * 为什么是 15：Free 计划下 subrequest 与 Cache API 调用**共享** 50 次/请求的配额
 * （Workers Limits → Cache API limits：「shares the same quota as subrequests (fetch())」）。
 * 每个 sha 在最坏情况下要花 3 次：cache.match + fetch + cache.put，
 * 15 × 3 = 45，留出余量给静态资源绑定等其它调用。
 * 修大这个值时务必同步改前端 ChangelogFeed.svelte 的 STATS_BATCH_SIZE。
 */
const STATS_BATCH_MAX = 15;

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,100}$/;

/** 统一的 JSON 响应构造 */
function jsonResponse(data, status, extraHeaders) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...extraHeaders,
		},
	});
}

/** 解析仓库与分支：仓库只认环境变量，不接受客户端传参，避免被当成通用 GitHub 代理 */
function resolveTarget(env, clientBranch) {
	const repo = env.GITHUB_REPO && REPO_RE.test(env.GITHUB_REPO) ? env.GITHUB_REPO : DEFAULT_REPO;
	const fromEnv = env.GITHUB_BRANCH && REF_RE.test(env.GITHUB_BRANCH) ? env.GITHUB_BRANCH : DEFAULT_BRANCH;
	// 分支允许客户端指定（只能读同一个公开仓库的其它引用，无滥用风险），非法则回落到配置值
	const branch = clientBranch && REF_RE.test(clientBranch) ? clientBranch : fromEnv;
	return { repo, branch };
}

/** 构造带鉴权头的上游请求头 */
function upstreamHeaders(token) {
	const headers = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		// GitHub 要求带 UA，否则部分接口会拒绝
		"User-Agent": "lonely-blog-changelog",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

/** 把上游响应转成我们自己的响应：成功透传 JSON，失败给出可读错误 */
function toClientResponse(upstream, authMode) {
	const base = { "X-Changelog-Auth": authMode };
	if (upstream.ok) {
		return new Response(upstream.body, {
			status: 200,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				...base,
			},
		});
	}
	if (upstream.status === 401) {
		return jsonResponse(
			{ error: "GitHub 拒绝了凭据，请检查 GITHUB_TOKEN 是否有效或已被撤销", status: 401 },
			401,
			base,
		);
	}
	if (upstream.status === 403 || upstream.status === 429) {
		return jsonResponse(
			{
				error: authMode === "token" ? "GitHub 限流" : "GitHub 匿名限流（未配置 GITHUB_TOKEN）",
				status: upstream.status,
			},
			503,
			base,
		);
	}
	return jsonResponse({ error: "GitHub 上游异常", status: upstream.status }, 502, base);
}

/**
 * 带边缘缓存的取数：命中直接返回，未命中执行 producer 并写回缓存。
 * 只有成功响应才写缓存，避免把 401/限流结果缓存住。
 */
async function withCache(request, ctx, ttl, producer) {
	const cache = caches.default;
	const cacheKey = new Request(request.url, { method: "GET" });

	let hit = null;
	try {
		hit = await cache.match(cacheKey);
	} catch {
		// 缓存读取异常不应影响功能，直接回源
	}
	if (hit) return hit;

	const response = await producer();
	if (!response.ok) return response;

	// 重新包一层以便单独设置缓存策略；clone() 会 tee 出独立的数据流
	const cacheable = new Response(response.body, response);
	cacheable.headers.set("Cache-Control", `public, max-age=${ttl}`);
	ctx.waitUntil(cache.put(cacheKey, cacheable.clone()).catch(() => {}));
	return cacheable;
}

/** 解析数字型查询参数并夹到合法区间 */
function intParam(value, fallback, min, max) {
	const n = Number.parseInt(value ?? "", 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/** GET /api/commits —— commits 列表（分页，可选 sha/ref 指定分支） */
function handleList(request, env, ctx) {
	const url = new URL(request.url);
	const perPage = intParam(url.searchParams.get("per_page"), 100, 1, 100);
	const page = intParam(url.searchParams.get("page"), 1, 1, 100);

	const clientBranch = url.searchParams.get("sha") || url.searchParams.get("branch");
	const { repo, branch } = resolveTarget(env, clientBranch);
	const token = env.GITHUB_TOKEN;
	const authMode = token ? "token" : "anonymous";

	const upstreamUrl =
		`${GITHUB_API}/repos/${repo}/commits?per_page=${perPage}&page=${page}` +
		(branch ? `&sha=${encodeURIComponent(branch)}` : "");

	return withCache(request, ctx, LIST_TTL, async () => {
		const upstream = await fetch(upstreamUrl, { headers: upstreamHeaders(token) });
		return toClientResponse(upstream, authMode);
	});
}

/** GET /api/commits/{sha} —— 单个 commit 详情，用于取 additions/deletions */
function handleCommit(request, env, ctx, sha) {
	const { repo } = resolveTarget(env, null);
	const token = env.GITHUB_TOKEN;
	const authMode = token ? "token" : "anonymous";

	const upstreamUrl = `${GITHUB_API}/repos/${repo}/commits/${sha}`;

	// 缓存键用规范化后的短 sha，避免大小写/长度不同导致重复回源
	return withCache(request, ctx, COMMIT_TTL, async () => {
		const upstream = await fetch(upstreamUrl, { headers: upstreamHeaders(token) });
		return toClientResponse(upstream, authMode);
	});
}

/**
 * 取单个 commit 的 stats，优先复用 7 天边缘缓存。
 * 缓存键与 /api/commits/{sha} 完全一致（同一个 origin + 路径），因此两条路由共享缓存条目。
 * 返回 null 表示拿不到（上游异常 / 非 2xx），调用方据此把该 sha 从结果里省略。
 */
async function fetchStatsForSha(origin, repo, token, sha) {
	const cache = caches.default;
	const key = new Request(`${origin}/api/commits/${sha}`, { method: "GET" });

	try {
		const hit = await cache.match(key);
		if (hit) {
			const data = await hit.json();
			return {
				additions: data?.stats?.additions ?? 0,
				deletions: data?.stats?.deletions ?? 0,
			};
		}
	} catch {
		// 缓存读取异常不应影响功能，继续回源
	}

	const upstream = await fetch(`${GITHUB_API}/repos/${repo}/commits/${sha}`, {
		headers: upstreamHeaders(token),
	});
	if (!upstream.ok) return null;

	const raw = await upstream.text();
	let data;
	try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}

	// 用字符串构造 Response：长度已知 → 不是 chunked → 并发的 cache.put 不会被串行阻塞
	const cacheable = new Response(raw, {
		status: 200,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": `public, max-age=${COMMIT_TTL}`,
		},
	});
	// 必须用 try/catch 包住：Cloudflare 的 cache.put 在部分情况下是**同步抛错**的，
	// 写成 `cache.put(...).catch(() => {})` 兜不住 —— 异常会直接冒出本函数，
	// 被调用方的 catch 吞成 null，结果就是「取了半天数据却一条都没返回」。
	ctx.waitUntil(
		(async () => {
			try {
				await cache.put(key, cacheable);
			} catch {
				// 写缓存失败不影响本次返回
			}
		})(),
	);

	return {
		additions: data?.stats?.additions ?? 0,
		deletions: data?.stats?.deletions ?? 0,
	};
}

/**
 * GET /api/commits/stats?shas=a,b,c —— 批量取多个 commit 的增删行数。
 *
 * 存在的理由：GitHub 的 commits **列表**接口不返回 stats，前端只能逐条补；
 * 200 条提交就是 200 个请求。这里合并成「一次请求带一批 sha」，
 * 前端从 200 次请求降到十几次。
 *
 * 结果里只包含成功取到的 sha —— 拿不到的直接省略，
 * 让前端能区分「这个提交确实是 0 行改动」和「没取到数据」，后者会显示为 —。
 */
async function handleStatsBatch(env, ctx, url) {
	const raw = url.searchParams.get("shas") || "";
	const seen = new Set();
	const shas = [];
	for (const part of raw.split(",")) {
		const sha = part.trim().toLowerCase();
		if (!SHA_RE.test(sha) || seen.has(sha)) continue;
		seen.add(sha);
		shas.push(sha);
		if (shas.length >= STATS_BATCH_MAX) break;
	}

	if (shas.length === 0) {
		return jsonResponse({ error: `缺少合法的 shas 参数（逗号分隔的 sha，最多 ${STATS_BATCH_MAX} 个）` }, 400);
	}

	const { repo } = resolveTarget(env, null);
	const token = env.GITHUB_TOKEN;
	const authMode = token ? "token" : "anonymous";

	// 临时诊断分支：?debug=1 时只查第一个 sha 并回传每一步的结果
	if (url.searchParams.get("debug") === "1") {
		const probe = await probeSha(url.origin, repo, token, shas[0]);
		return jsonResponse({ authMode, statLen: (token || "").length, probe }, 200, { "X-Changelog-Auth": authMode });
	}

	const results = await Promise.all(
		shas.map(async (sha) => {
			try {
				const stats = await fetchStatsForSha(url.origin, repo, token, sha);
				return stats ? [sha, stats] : null;
			} catch {
				return null;
			}
		}),
	);

	const payload = {};
	for (const entry of results) {
		if (entry) payload[entry[0]] = entry[1];
	}

	// 聚合结果本身不进边缘缓存：每个 sha 已有 7 天缓存，再缓存一层只会增加失效面。
	// 给浏览器一个短 TTL，避免同一次会话里反复问。
	return jsonResponse(payload, 200, { "X-Changelog-Auth": authMode, "Cache-Control": `public, max-age=${LIST_TTL}` });
}

/** 临时诊断：把回源链路上每一步的真实结果吐出来，定位完即删 */
async function probeSha(origin, repo, token, sha) {
	const out = { sha: sha.slice(0, 7), steps: [] };
	const cache = caches.default;
	const key = new Request(`${origin}/api/commits/${sha}`, { method: "GET" });
	try {
		const hit = await cache.match(key);
		out.steps.push("match=" + (hit ? "HIT" : "MISS"));
		if (hit) {
			out.stats = (await hit.json()).stats;
			return out;
		}
	} catch (e) {
		out.steps.push("match_err=" + (e && e.message ? e.message : String(e)));
	}
	try {
		const r = await fetch(`${GITHUB_API}/repos/${repo}/commits/${sha}`, { headers: upstreamHeaders(token) });
		out.steps.push(`fetch=${r.status}`);
		const raw = await r.text();
		out.steps.push("bytes=" + raw.length);
		if (!r.ok) {
			out.steps.push("errbody=" + raw.slice(0, 180));
			return out;
		}
		const d = JSON.parse(raw);
		out.stats = d.stats;
		out.steps.push("parsed=ok");

		const cacheable = new Response(raw, {
			status: 200,
			headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${COMMIT_TTL}` },
		});
		try {
			await cache.put(key, cacheable);
			out.steps.push("put=ok");
		} catch (e) {
			out.steps.push("put_err=" + (e && e.message ? e.message : String(e)));
		}
	} catch (e) {
		out.steps.push("fetch_err=" + (e && e.message ? e.message : String(e)));
	}
	return out;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/api/commits" || url.pathname.startsWith("/api/commits/")) {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return jsonResponse({ error: "仅支持 GET" }, 405, { Allow: "GET, HEAD" });
			}

			const rest = url.pathname.slice("/api/commits".length).replace(/^\//, "");
			// 批量 stats：必须在 sha 校验之前拦下，"stats" 不是合法 sha
			if (rest === "stats") {
				return handleStatsBatch(env, ctx, url);
			}
			if (rest) {
				if (!SHA_RE.test(rest)) {
					return jsonResponse({ error: "sha 格式不合法" }, 400);
				}
				return handleCommit(request, env, ctx, rest);
			}
			return handleList(request, env, ctx);
		}

		// 静态资源默认已被优先匹配；走到这里说明没有对应文件，
		// 交给资源绑定按 not_found_handling 规则响应（与改造前行为一致）
		return env.ASSETS.fetch(request);
	},
};
