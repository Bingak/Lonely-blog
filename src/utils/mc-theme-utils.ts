/**
 * M3 配色方案的应用层：读写风格/规范偏好，并把解析出的角色色写到 :root 的
 * CSS 变量上，供 variables.styl 里的 `var(--mc-*, oklch 回退)` 消费。
 *
 * 实现借鉴自 [Shirone](https://github.com/LyraVoid/Shirone) 的 theme-utils.ts。
 * 与 Shirone 的差异：默认（配置里的 style + spec）不注入任何覆盖变量，
 * 站点保持主题原生的 oklch 观感；只有用户切换到非默认风格/规范时才启用 M3 配色。
 */
import { siteConfig } from "@/config";
import {
	MC_SPECS,
	MC_STYLES,
	type McSpec,
	type McStyle,
	resolveScheme,
} from "@utils/mc-utils";

const STYLE_KEY = "mc-style";
const SPEC_KEY = "mc-spec";

/** 本站 token 消费的角色 → CSS 变量名。 */
const ROLE_TO_CSS: Record<string, string> = {
	primary: "--mc-primary",
	secondaryContainer: "--mc-secondary-container",
};

export function isMcStyle(v: string): v is McStyle {
	return (MC_STYLES as readonly string[]).includes(v);
}

export function isMcSpec(v: string): v is McSpec {
	return (MC_SPECS as readonly string[]).includes(v);
}

export function getDefaultStyle(): McStyle {
	const configured = siteConfig.themeColor.style;
	return configured && isMcStyle(configured) ? configured : "tonalSpot";
}

export function getDefaultSpec(): McSpec {
	const configured = siteConfig.themeColor.spec;
	return configured && isMcSpec(configured) ? configured : "2025";
}

export function getStyle(): McStyle {
	if (typeof localStorage === "undefined") return getDefaultStyle();
	const stored = localStorage.getItem(STYLE_KEY);
	return stored && isMcStyle(stored) ? stored : getDefaultStyle();
}

export function getSpec(): McSpec {
	if (typeof localStorage === "undefined") return getDefaultSpec();
	const stored = localStorage.getItem(SPEC_KEY);
	return stored && isMcSpec(stored) ? stored : getDefaultSpec();
}

export function setStyle(style: McStyle): void {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(STYLE_KEY, style);
	}
	applyCurrentScheme();
}

export function setSpec(spec: McSpec): void {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(SPEC_KEY, spec);
	}
	applyCurrentScheme();
}

function clearMcVars(root: HTMLElement): void {
	for (const cssVar of Object.values(ROLE_TO_CSS)) {
		root.style.removeProperty(cssVar);
	}
}

/**
 * 按当前色相、明暗、风格、规范重新计算 M3/M3E 配色，把具体 hex 值写到
 * `:root` 的 CSS 变量上。默认风格/规范下清除覆盖变量，回退到主题原生配色。
 */
export function applyCurrentScheme(): void {
	if (typeof document === "undefined") return;
	const root = document.querySelector(":root") as HTMLElement | null;
	if (!root) return;

	if (getStyle() === getDefaultStyle() && getSpec() === getDefaultSpec()) {
		clearMcVars(root);
		return;
	}

	const hue = Number.parseInt(
		root.style.getPropertyValue("--hue") ||
			String(siteConfig.themeColor.hue ?? 250),
		10,
	);
	const isDark = root.classList.contains("dark");
	const scheme = resolveScheme(hue, isDark, getStyle(), getSpec());

	for (const [role, cssVar] of Object.entries(ROLE_TO_CSS)) {
		const value = scheme[role];
		if (value) {
			root.style.setProperty(cssVar, value);
		} else {
			root.style.removeProperty(cssVar);
		}
	}
}
