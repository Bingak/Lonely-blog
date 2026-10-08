/// <reference types="mdast" />

/**
 * 末尾兜底清理：递归剔除任意 children 数组里的
 * null / undefined / 稀疏空洞（hole）/ 非对象项。
 *
 * 为什么需要它：rehype 链表里 `rehypeComponents`（渲染 <github> 卡片）
 * 与链表末尾的 `rehypeAutolinkHeadings`（内部用 unist-util-visit 遍历）
 * 都可能在某些环境 / 并行条件下产出或遇到带 undefined 子节点的树。
 * unist-util-visit 对 undefined 子节点零容忍，会在
 * visit-parents/lib/index.js:354 抛 `Cannot use 'in' operator to search for 'children' in undefined`。
 *
 * 把它放在 rehype 链表的【最后、rehypeAutolinkHeadings 之前】，
 * 即可保证任何上游插件（含 rehypeComponents 渲染产物）引入的坏节点
 * 都不会传到那个 final visitor。
 *
 * 用 `for…of` 遍历：稀疏空洞会被迭代器自动跳过（不产出 undefined），
 * 再用 `child && typeof child === 'object'` 兜底过滤显式 undefined / null / 原始值。
 */
export function rehypeSanitizeTree() {
	return (tree) => {
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
	};
}
