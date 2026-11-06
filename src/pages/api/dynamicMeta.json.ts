import { getCollection } from "astro:content";
import { dynamicSlug, sortDynamics } from "@/utils/dynamic-utils";

/**
 * 动态的轻量元数据（不含渲染后的 HTML）。
 * 日历热力图只需要按日期计数，这条接口比 /api/dynamic.json 小得多，
 * 避免为了统计数量把每条动态的正文一起拉下来。
 */
export async function GET(): Promise<Response> {
	const dynamics = sortDynamics(await getCollection("dynamic"));

	const data = dynamics.map((entry) => ({
		id: dynamicSlug(entry.id),
		published: entry.data.published.getTime(),
		pinned: entry.data.pinned || false,
	}));

	return new Response(JSON.stringify(data), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}
