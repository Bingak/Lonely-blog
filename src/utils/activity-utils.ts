/**
 * 活动统计（文章 + 动态）共用工具。
 *
 * 日历热力图（侧边栏 Calendar 与导航栏资料卡 NavbarProfileCard）的格子口径为
 * 「月内第 N 周」，两处必须共用同一套聚合方式与文案模板，否则会出现
 * 同一天在两处显示不同数字、不同措辞的问题。这里统一提供：
 * - 日期键 / 周序号计算（1-7、8-14、15-21、22-月末，与 12×4 布局一致）
 * - 标签文案：周格沿用原本的「10月第2周」，日格用「10月1日」
 * - 统一文案模板的占位符替换（{range} / {posts} / {dyn}）
 */

export interface ActivityCounts {
	posts: number;
	dynamics: number;
}

/** key 为 `YYYY-MM-DD` */
export type ActivityDateMap = Record<string, ActivityCounts>;

export interface ActivityRangeStyle {
	/** 月份后缀，如「月」；为空表示走数字日期格式 */
	monthSuffix: string;
	/** 日期后缀，如「日」 */
	daySuffix: string;
	/** 起止分隔符 */
	sep: string;
}

export function activityPad2(value: number): string {
	return String(value).padStart(2, "0");
}

/** 生成本地时区的 `YYYY-MM-DD` 键，避免 toISOString 的 UTC 偏移导致跨日 */
export function activityDateKey(date: Date): string {
	return `${date.getFullYear()}-${activityPad2(date.getMonth() + 1)}-${activityPad2(date.getDate())}`;
}

/** 月内周序号：1-7 → 0，8-14 → 1，15-21 → 2，22 以后 → 3 */
export function activityWeekIndex(day: number): number {
	return Math.min(3, Math.floor((day - 1) / 7));
}

/** 取日期范围样式；中文 / 日文用「M月D日」，其余语言用 MM/DD */
export function activityRangeStyle(lang: string): ActivityRangeStyle {
	const normalized = (lang || "").toLowerCase();
	if (normalized.startsWith("zh") || normalized.startsWith("ja")) {
		return { monthSuffix: "月", daySuffix: "日", sep: "–" };
	}
	if (normalized.startsWith("ko")) {
		return { monthSuffix: "월 ", daySuffix: "일", sep: "–" };
	}
	return { monthSuffix: "", daySuffix: "", sep: "–" };
}

/**
 * 周标签：保持日历原本的「月-周」口径，不改成日期区间
 * zh / ja / ru「10月第2周」、ko「10월 2주차」，其余语言回退到英文写法「Week 2 of 10」
 */
export function activityWeekLabel(
	month: number,
	week: number,
	lang: string,
): string {
	const normalized = (lang || "").toLowerCase();
	if (normalized.startsWith("ko")) return `${month + 1}월 ${week + 1}주차`;
	if (
		normalized.startsWith("zh") ||
		normalized.startsWith("ja") ||
		normalized.startsWith("ru")
	) {
		return `${month + 1}月第${week + 1}周`;
	}
	return `Week ${week + 1} of ${month + 1}`;
}

/** 统一文案：`{range}：{posts}篇文章，{dyn}条动态`，数量为 0 时同样输出 0 */
export function formatActivityLabel(
	template: string,
	range: string,
	counts: ActivityCounts,
): string {
	return template
		.replace("{range}", range)
		.replace("{posts}", String(counts.posts))
		.replace("{dyn}", String(counts.dynamics));
}

/** 按「月-周」累计计数，供热力图色阶与提示文案使用 */
export function accumulateWeekActivity(
	target: Map<string, ActivityCounts>,
	date: Date,
	kind: keyof ActivityCounts,
): void {
	const key = `${date.getMonth()}-${activityWeekIndex(date.getDate())}`;
	const current = target.get(key) ?? { posts: 0, dynamics: 0 };
	current[kind] += 1;
	target.set(key, current);
}

export function emptyActivityCounts(): ActivityCounts {
	return { posts: 0, dynamics: 0 };
}
