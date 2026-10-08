/// <reference types="mdast" />
import { visit } from "unist-util-visit";
import { parseGithubRepository } from "../utils/github-card-utils.ts";

// 只匹配「仓库根」的 GitHub 链接：github.com/owner/repo（允许结尾 .git 或 /）。
// 不匹配 issue / PR / 文件树 / 头像页等带更深路径的链接，避免误伤。
const GITHUB_REPO_HREF =
	/^https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/i;

/**
 * 把「独占一行的 GitHub 仓库链接」自动改写成 <github> 卡片元素，
 * 交给已有的 rehypeComponents（github -> GithubCardComponent）渲染成卡片。
 *
 * 这样无论用哪个编辑器（ink-studio 等）粘贴仓库链接，
 * 都会被自动识别成与 `::github{repo="owner/repo"}` 指令相同的卡片。
 *
 * 处理两种独占一行的写法：
 *   1. Markdown 链接 / 自动链接：[text](https://github.com/owner/repo) 或 <https://...>
 *   2. 纯文本裸 URL：https://github.com/owner/repo（未被链接化时仍是 text 节点）
 *
 * 行内混排（如「开源地址：[xxx](url)」）保持原样，避免吞掉前面的文字。
 *
 * @returns {import('unified').Plugin}
 */
export function rehypeGithubCardAuto() {
	return (tree) => {
		visit(tree, "element", (node) => {
			if (node.tagName !== "p") return;
			// 仅处理「段落里只有这一个节点」的情况
			if (node.children.length !== 1) return;

			const child = node.children[0];
			let candidate = null;

			if (child.type === "element" && child.tagName === "a") {
				const href = child.properties?.href;
				if (typeof href === "string" && GITHUB_REPO_HREF.test(href))
					candidate = href;
			} else if (child.type === "text") {
				const value = child.value.trim();
				if (GITHUB_REPO_HREF.test(value)) candidate = value;
			}

			if (!candidate) return;

			const repo = parseGithubRepository(candidate);
			if (!repo) return;

			// 把整个段落原地改写成 <github> 卡片元素
			node.tagName = "github";
			node.properties = { repo };
			node.children = [];
		});
	};
}
