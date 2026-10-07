import type { AnalyticsConfig } from "../types/analyticsConfig";

export const analyticsConfig: AnalyticsConfig = {
	// Google Analytics ID
	googleAnalyticsId: "",
	// Microsoft Clarity ID
	microsoftClarityId: "",
	// Umami 统计配置
	umamiAnalytics: {
		// Umami Website ID
		websiteId: "a228e7c9-6234-4d07-98a5-8aa8c6c501da",
		// Umami JS地址，支持使用自建
		// 走本站域名的 Worker 反代（见 worker/index.js 的 /umami 路由），避免大陆访客直连 cloud.umami.is 超时丢数据
		scriptUrl: "https://lonelybing.top/umami/script.js",
		// 上报端点前缀：必须指向反代。
		// Umami Cloud 的 script.js 里写死了默认端点 https://gateway.umami.is，不会跟随 scriptUrl 推导，
		// 不显式指定的话数据仍然会直连境外域名，反代就白做了
		hostUrl: "https://lonelybing.top/umami",
		// Umami 会话回放脚本地址，支持使用自建
		replaysScriptUrl: "https://lonelybing.top/umami/recorder.js",
		// 是否追踪出站链接
		trackOutboundLinks: true,
		// 是否收集浏览器性能指标
		collectWebVitals: false,
		// 会话回放配置
		replays: {
			// 是否启用会话回放
			enabled: false,
			// 录制会话采样率，范围 0-1，例如 0.15 表示记录 15% 的会话
			sampleRate: 0.15,
			// 隐私遮罩级别："moderate" 会遮罩所有输入框；"strict" 额外遮罩页面全部文本
			maskLevel: "moderate",
			// 单次录制最大时长（毫秒）
			maxDuration: 300000,
			// 需要排除录制的元素 CSS 选择器，例如 ".sensitive-widget"
			blockSelector: "",
		},
	},
	// 51la 统计配置
	la51Analytics: {
		// 51la 统计 ID
		Id: "",
		// 自定义 SDK JS 地址，防止 DNS 污染，留空使用默认地址
		sdkUrl: "",
		// 多个统计 ID 的数据分离标识，留空则使用 Id
		ck: "",
		// 是否开启事件分析功能
		autoTrack: false,
		//  Hash路由模式, 项目使用History API路由, 所以不必开启默认false
		hashMode: false,
		// 是否开启网站录屏功能
		screenRecord: true,
	},
};
