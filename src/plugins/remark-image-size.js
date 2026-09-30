import { visit } from "unist-util-visit";

/**
 * Typora 风格的图片尺寸标注：在图片 URL 后以引号 title 追加 `=…` 控制显示大小。
 *
 * - `![alt](url "=x400")`    → 宽 400px（高度自适应）
 * - `![alt](url "=400x300")` → 宽 400px、高 300px
 * - `![alt](url "=60%")`     → 宽度为内容区的 60%
 *
 * remark 会把引号内的 `=x400` 解析成图片的 title，这里识别并转成
 * img 元素的 width/height/style 属性，未匹配的 title（如普通引号标题）原样保留。
 *
 * @returns {import('unified').Plugin}
 */

// =x400 / =400 / =400x300 / =60%
const SIZE_SYNTAX_RE =
	/^=(?:x(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?|(\d+(?:\.\d+)?)%)$/;

export function remarkImageSize() {
	return (tree) => {
		visit(tree, "image", (node) => {
			const title = typeof node.title === "string" ? node.title.trim() : "";
			if (!title) return;

			const m = SIZE_SYNTAX_RE.exec(title);
			if (!m) return;

			const [, widthOnly, widthA, height, percent] = m;
			const width = widthOnly || widthA;

			node.data = node.data || {};
			node.data.hProperties = node.data.hProperties || {};

			if (percent) {
				node.data.hProperties.style = `width:${percent}%;max-width:100%;`;
			} else if (width) {
				node.data.hProperties.width = width;
				if (height) node.data.hProperties.height = height;
			}

			// 尺寸标注不是真正的标题，消费掉避免渲染成 title 属性
			node.title = null;
		});
	};
}
