import { visit } from "unist-util-visit";

/**
 * ==高亮== → <mark>高亮</mark>
 * 仅处理文本节点中的成对 ==，空内容（====）不匹配。
 */
export function remarkMark() {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || index == null) return;
			const value = node.value;
			if (!value.includes("==")) return;

			const re = /==([^=\n]+)==/g;
			const parts = [];
			let last = 0;
			let m;
			while ((m = re.exec(value))) {
				if (m.index > last)
					parts.push({ type: "text", value: value.slice(last, m.index) });
				parts.push({
					type: "mark",
					data: { hName: "mark" },
					children: [{ type: "text", value: m[1] }],
				});
				last = m.index + m[0].length;
			}
			if (!parts.length) return;
			if (last < value.length)
				parts.push({ type: "text", value: value.slice(last) });

			parent.children.splice(index, 1, ...parts);
			return [index + parts.length];
		});
	};
}
