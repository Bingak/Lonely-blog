/// <reference types="mdast" />
import { parseGithubRepository } from "../utils/github-card-utils.ts";

const GITHUB_REPO_HREF =
	/^https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/i;

/**
 * 递归清理树的 children：剔除 null / undefined / 稀疏空洞（hole）/ 非对象项。
 *
 * 这些坏节点来自个别 MDX/JSX 或 rehype 转换后残留的 undefined 子节点，
 * unist-util-visit / visit-parents 的索引遍历对 undefined 子节点零容忍
 * （visit-parents/lib/index.js:354 的 `if ('children' in node && node.children)`
 *  在 node 为 undefined 时直接抛 `Cannot use 'in' operator`）。
 *
 * 用 `for…of` 遍历：稀疏空洞会被迭代器自动跳过（不会产出 undefined），
 * 再用 `child && typeof child === 'object'` 兜底过滤掉显式 undefined / null / 原始值，
 * 保证下游 rehypeComponents 与任何遍历都拿到一棵完全干净的树。
 */
function sanitizeTree(tree) {
	const clean = (node) => {
		if (!node || typeof node !== "object") return;
		const children = node.children;
		if (Array.isArray(children)) {
			const next = [];
			for (const child of children) {
				if (child && typeof child === "object") {
					next.push(child);
					clean(child);
				}
				// 其余（undefined / null / 空洞 / 原始值）一律丢弃
			}
			node.children = next;
		}
	};
	clean(tree);
}

/**
 * 自定义的 undefined 安全的深度优先遍历。
 * 不依赖 unist-util-visit，因此对坏节点天然免疫；
 * 即使 sanitizeTree 之后仍有遗漏，这里也不会抛错。
 */
function walk(node, fn) {
	if (!node || typeof node !== "object") return;
	fn(node);
	const children = node.children;
	if (Array.isArray(children)) {
		for (const child of children) {
			walk(child, fn);
		}
	}
}

export function rehypeGithubCardAuto() {
	return (tree) => {
		// 1) 先彻底清理坏 children，保护本插件与下游插件
		sanitizeTree(tree);

		// 2) 再做转换；整体包一层 try/catch 作为最后兜底，确保构建永不因此插件失败
		try {
			walk(tree, (node) => {
				if (node.type !== "element" || node.tagName !== "p") return;
				if (!Array.isArray(node.children) || node.children.length !== 1) return;
				const child = node.children[0];
				let candidate = null;
				if (child.type === "element" && child.tagName === "a") {
					const href = child.properties?.href;
					if (typeof href === "string" && GITHUB_REPO_HREF.test(href)) candidate = href;
				} else if (child.type === "text") {
					const value = child.value.trim();
					if (GITHUB_REPO_HREF.test(value)) candidate = value;
				}
				if (!candidate) return;
				const repo = parseGithubRepository(candidate);
				if (!repo) return;
				node.tagName = "github";
				node.properties = { repo };
				node.children = [];
			});
		} catch (err) {
			console.error("[rehypeGithubCardAuto] transform skipped due to error:", err);
		}
	};
}
