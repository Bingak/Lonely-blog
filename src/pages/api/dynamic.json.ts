import { getCollection } from "astro:content";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import {
	dynamicSearchText,
	dynamicSlug,
	sortDynamics,
} from "@/utils/dynamic-utils";
import {
	markdownRehypePlugins,
	markdownRemarkPlugins,
} from "@/utils/markdown-pipeline.mjs";

const markdownImagePattern = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;

export async function GET(): Promise<Response> {
	// 与文章页共用同一套 Markdown 插件管线，
	// 保证 :spoiler[] / ==高亮== / 提示块 / 公式 / 图表 / wiki 链接 等扩展语法在动态页同样生效
	const processor = await createMarkdownProcessor({
		remarkPlugins: markdownRemarkPlugins,
		rehypePlugins: markdownRehypePlugins,
	});
	const dynamics = sortDynamics(await getCollection("dynamic"));
	const data = await Promise.all(
		dynamics.map(async (entry) => {
			const images: Array<{ alt: string; src: string; title?: string }> = [];
			const markdown = (entry.body || "").replace(
				markdownImagePattern,
				(_match, alt: string, src: string, title?: string) => {
					images.push({ alt, src, ...(title ? { title } : {}) });
					return "";
				},
			);
			const rendered = await processor.render(markdown);

			return {
				id: dynamicSlug(entry.id),
				published: entry.data.published.getTime(),
				html: rendered.code,
				images,
				searchText: dynamicSearchText(entry),
				pinned: entry.data.pinned || false,
				location: entry.data.location.trim(),
			};
		}),
	);

	return new Response(JSON.stringify(data), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}
