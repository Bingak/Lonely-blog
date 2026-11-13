declare module "@/utils/markdown-pipeline.mjs" {
	import type {
		RehypePlugins,
		RemarkPlugins,
	} from "@astrojs/markdown-remark";

	export const markdownRemarkPlugins: RemarkPlugins;
	export const markdownRehypePlugins: RehypePlugins;
}
