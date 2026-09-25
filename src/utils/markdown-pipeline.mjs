import katex from "katex";
import "katex/dist/contrib/mhchem.mjs"; // 加载 mhchem 扩展
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCallouts from "rehype-callouts";
import rehypeCodeGroup from "rehype-code-group"; /* Tab 代码块 */
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkAdmonitionToBlockquoteCallout from "remark-admonition-to-blockquote-callout";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { mermaidConfig, plantumlConfig, siteConfig } from "../config";
import { GithubCardComponent } from "../plugins/rehype-component-github-card.mjs";
import { rehypeDiagramPanZoom } from "../plugins/rehype-diagram-panzoom.mjs";
import rehypeEmailProtection from "../plugins/rehype-email-protection.mjs";
import rehypeExternalLinks from "../plugins/rehype-external-links.mjs";
import rehypeFigure from "../plugins/rehype-figure.mjs";
import rehypeImageReferrerPolicy from "../plugins/rehype-image-referrerpolicy.mjs";
import { rehypeMermaid } from "../plugins/rehype-mermaid.mjs";
import { rehypePlantuml } from "../plugins/rehype-plantuml.mjs";
import { parseDirectiveNode } from "../plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "../plugins/remark-excerpt.js";
import { remarkImageGrid } from "../plugins/remark-image-grid.js";
import { remarkMark } from "../plugins/remark-mark.js";
import { remarkMermaid } from "../plugins/remark-mermaid.js";
import { remarkPlantuml } from "../plugins/remark-plantuml.js";
import { remarkReadingTime } from "../plugins/remark-reading-time.mjs";
import { remarkWikiLink } from "../plugins/remark-wiki-link.js";

/**
 * 博客统一的 Markdown 插件管线（astro.config 与 /api/dynamic.json 等共用），
 * 保证文章页、动态页等所有渲染入口支持同一套扩展语法：
 * :spoiler[] / ==高亮== / 提示块 / 指令组件 / 公式 / 图表 / wiki 链接 / 图片画廊 等。
 */
export const markdownRemarkPlugins = [
	...(siteConfig.post.rehypeCallouts.enablePythonMarkdownAdmonitions !== false
		? [remarkAdmonitionToBlockquoteCallout]
		: []),
	remarkMath,
	remarkReadingTime,
	remarkWikiLink,
	remarkImageGrid,
	remarkExcerpt,
	remarkDirective,
	remarkSectionize,
	parseDirectiveNode,
	remarkMark,
	remarkMermaid,
	[remarkPlantuml, plantumlConfig],
];

export const markdownRehypePlugins = [
	[rehypeKatex, { katex }],
	[rehypeCallouts, { theme: siteConfig.post.rehypeCallouts.theme }],
	rehypeSlug,
	rehypeCodeGroup,
	[rehypeMermaid, mermaidConfig],
	rehypePlantuml,
	rehypeDiagramPanZoom,
	rehypeFigure,
	[
		rehypeImageReferrerPolicy,
		{ domains: siteConfig.imageOptimization?.noReferrerDomains || [] },
	],
	[rehypeExternalLinks, { siteUrl: siteConfig.site_url }],
	[rehypeEmailProtection, { method: "base64" }], // 邮箱保护插件，支持 'base64' 或 'rot13'
	[
		rehypeComponents,
		{
			components: {
				github: GithubCardComponent,
			},
		},
	],
	[
		rehypeAutolinkHeadings,
		{
			behavior: "append",
			properties: {
				className: ["anchor"],
			},
			content: {
				type: "element",
				tagName: "span",
				properties: {
					className: ["anchor-icon"],
					"data-pagefind-ignore": true,
				},
				children: [
					{
						type: "text",
						value: "#",
					},
				],
			},
		},
	],
];
