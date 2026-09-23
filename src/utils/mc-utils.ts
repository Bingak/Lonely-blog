/**
 * Material 3 动态配色引擎。
 *
 * 实现借鉴自 [Shirone](https://github.com/LyraVoid/Shirone) 的 mc-utils.ts：
 * 对 Google `@material/material-color-utilities`（HCT 色空间）的薄封装，
 * 让 MD3（2021）与 M3 Expressive（2025）两套配色规范、以及 9 种配色风格
 * （TonalSpot、Vibrant、Content、Expressive……）都能解析出真实的 HCT 色调板。
 *
 * 种子色由现有的 `--hue`（0-360）派生，色相滑条因此保持原有行为；
 * 引擎为每个 M3 角色返回具体的 hex 值。
 */
import {
	type DynamicColor,
	type DynamicScheme,
	Hct,
	type MaterialDynamicColors,
	SchemeContent,
	SchemeExpressive,
	SchemeFidelity,
	SchemeFruitSalad,
	SchemeMonochrome,
	SchemeNeutral,
	SchemeRainbow,
	SchemeTonalSpot,
	SchemeVibrant,
} from "@material/material-color-utilities";

/** 配色风格 —— 对应 `com.materialkolor.PaletteStyle`。 */
export const MC_STYLES = [
	"tonalSpot",
	"vibrant",
	"content",
	"expressive",
	"rainbow",
	"fruitSalad",
	"monochrome",
	"neutral",
	"fidelity",
] as const;
export type McStyle = (typeof MC_STYLES)[number];

/** 配色规范版本 —— 对应 `ColorSpec.SpecVersion`。 */
export const MC_SPECS = ["2021", "2025"] as const;
export type McSpec = (typeof MC_SPECS)[number];

/** 动态引擎种子色使用的色度/色调（中色调、中等色度）。 */
const SEED_CHROMA = 60;
const SEED_TONE = 50;

/**
 * 由色相（0-360）构建种子 ARGB。固定色度/色调，保证任何色相都能得到
 * 可用、鲜艳但不浑浊的种子色。
 */
export function seedFromHue(hue: number): number {
	return Hct.from(hue, SEED_CHROMA, SEED_TONE).toInt();
}

/** 把每个 M3/M3E 颜色角色映射到其 DynamicColor 解析器。 */
const roleMap: Record<string, DynamicColor | undefined> = {
	primary: undefined,
	onPrimary: undefined,
	primaryContainer: undefined,
	onPrimaryContainer: undefined,
	inversePrimary: undefined,
	primaryFixed: undefined,
	primaryFixedDim: undefined,
	onPrimaryFixed: undefined,
	onPrimaryFixedVariant: undefined,
	secondary: undefined,
	onSecondary: undefined,
	secondaryContainer: undefined,
	onSecondaryContainer: undefined,
	secondaryFixed: undefined,
	secondaryFixedDim: undefined,
	onSecondaryFixed: undefined,
	onSecondaryFixedVariant: undefined,
	tertiary: undefined,
	onTertiary: undefined,
	tertiaryContainer: undefined,
	onTertiaryContainer: undefined,
	tertiaryFixed: undefined,
	tertiaryFixedDim: undefined,
	onTertiaryFixed: undefined,
	onTertiaryFixedVariant: undefined,
	error: undefined,
	onError: undefined,
	errorContainer: undefined,
	onErrorContainer: undefined,
	surface: undefined,
	surfaceDim: undefined,
	surfaceBright: undefined,
	surfaceContainerLowest: undefined,
	surfaceContainerLow: undefined,
	surfaceContainer: undefined,
	surfaceContainerHigh: undefined,
	surfaceContainerHighest: undefined,
	onSurface: undefined,
	surfaceVariant: undefined,
	onSurfaceVariant: undefined,
	outline: undefined,
	outlineVariant: undefined,
	inverseSurface: undefined,
	inverseOnSurface: undefined,
	shadow: undefined,
	scrim: undefined,
	surfaceTint: undefined,
	primaryDim: undefined,
	secondaryDim: undefined,
	tertiaryDim: undefined,
	errorDim: undefined,
};

function initRoleMap(colors: MaterialDynamicColors) {
	roleMap.primary = colors.primary();
	roleMap.onPrimary = colors.onPrimary();
	roleMap.primaryContainer = colors.primaryContainer();
	roleMap.onPrimaryContainer = colors.onPrimaryContainer();
	roleMap.inversePrimary = colors.inversePrimary();
	roleMap.primaryFixed = colors.primaryFixed();
	roleMap.primaryFixedDim = colors.primaryFixedDim();
	roleMap.onPrimaryFixed = colors.onPrimaryFixed();
	roleMap.onPrimaryFixedVariant = colors.onPrimaryFixedVariant();
	roleMap.secondary = colors.secondary();
	roleMap.onSecondary = colors.onSecondary();
	roleMap.secondaryContainer = colors.secondaryContainer();
	roleMap.onSecondaryContainer = colors.onSecondaryContainer();
	roleMap.secondaryFixed = colors.secondaryFixed();
	roleMap.secondaryFixedDim = colors.secondaryFixedDim();
	roleMap.onSecondaryFixed = colors.onSecondaryFixed();
	roleMap.onSecondaryFixedVariant = colors.onSecondaryFixedVariant();
	roleMap.tertiary = colors.tertiary();
	roleMap.onTertiary = colors.onTertiary();
	roleMap.tertiaryContainer = colors.tertiaryContainer();
	roleMap.onTertiaryContainer = colors.onTertiaryContainer();
	roleMap.tertiaryFixed = colors.tertiaryFixed();
	roleMap.tertiaryFixedDim = colors.tertiaryFixedDim();
	roleMap.onTertiaryFixed = colors.onTertiaryFixed();
	roleMap.onTertiaryFixedVariant = colors.onTertiaryFixedVariant();
	roleMap.error = colors.error();
	roleMap.onError = colors.onError();
	roleMap.errorContainer = colors.errorContainer();
	roleMap.onErrorContainer = colors.onErrorContainer();
	roleMap.surface = colors.surface();
	roleMap.surfaceDim = colors.surfaceDim();
	roleMap.surfaceBright = colors.surfaceBright();
	roleMap.surfaceContainerLowest = colors.surfaceContainerLowest();
	roleMap.surfaceContainerLow = colors.surfaceContainerLow();
	roleMap.surfaceContainer = colors.surfaceContainer();
	roleMap.surfaceContainerHigh = colors.surfaceContainerHigh();
	roleMap.surfaceContainerHighest = colors.surfaceContainerHighest();
	roleMap.onSurface = colors.onSurface();
	roleMap.surfaceVariant = colors.surfaceVariant();
	roleMap.onSurfaceVariant = colors.onSurfaceVariant();
	roleMap.outline = colors.outline();
	roleMap.outlineVariant = colors.outlineVariant();
	roleMap.inverseSurface = colors.inverseSurface();
	roleMap.inverseOnSurface = colors.inverseOnSurface();
	roleMap.shadow = colors.shadow();
	roleMap.scrim = colors.scrim();
	roleMap.surfaceTint = colors.surfaceTint();
	roleMap.primaryDim = colors.primaryDim();
	roleMap.secondaryDim = colors.secondaryDim();
	roleMap.tertiaryDim = colors.tertiaryDim();
	roleMap.errorDim = colors.errorDim();
}

/** 为指定风格构建 DynamicScheme。 */
function buildScheme(
	style: McStyle,
	isDark: boolean,
	seed: number,
	spec: McSpec,
): DynamicScheme {
	const hct = Hct.fromInt(seed);
	switch (style) {
		case "content":
			return new SchemeContent(hct, isDark, 0, spec);
		case "expressive":
			return new SchemeExpressive(hct, isDark, 0, spec);
		case "fidelity":
			return new SchemeFidelity(hct, isDark, 0, spec);
		case "fruitSalad":
			return new SchemeFruitSalad(hct, isDark, 0, spec);
		case "monochrome":
			return new SchemeMonochrome(hct, isDark, 0, spec);
		case "neutral":
			return new SchemeNeutral(hct, isDark, 0, spec);
		case "rainbow":
			return new SchemeRainbow(hct, isDark, 0, spec);
		case "vibrant":
			return new SchemeVibrant(hct, isDark, 0, spec);
		case "tonalSpot":
		default:
			return new SchemeTonalSpot(hct, isDark, 0, spec);
	}
}

function argbToHex(argb: number): string {
	return `#${[16, 8, 0]
		.map((shift) => ((argb >> shift) & 0xff).toString(16).padStart(2, "0"))
		.join("")}`;
}

export type McScheme = Record<string, string | null>;

/**
 * 把每个 M3/M3E 颜色角色解析为 hex，输入为种子色相、风格、规范与明暗模式。
 *
 * 关于 spec（2021 vs 2025）：在 @material/material-color-utilities@0.4.0 中
 * `MaterialDynamicColors.colorSpec` 是静态属性、模块加载时固定为 2025 版委托，
 * 因此所有角色在 2021 与 2025 下都会解析出值；2021/2025 的实际差异仅在
 * 调色板派生层（DynamicSchemePalettesDelegateImpl2021 vs 2025），不影响角色集。
 * 仅当角色的 DynamicColor resolver 为 undefined 时才返回 null（防御性保留）。
 */
export function resolveScheme(
	hue: number,
	isDark: boolean,
	style: McStyle,
	spec: McSpec,
): McScheme {
	const scheme = buildScheme(style, isDark, seedFromHue(hue), spec);
	initRoleMap(scheme.colors);
	const out: McScheme = {};
	for (const name of Object.keys(roleMap)) {
		const dc = roleMap[name];
		if (!dc) {
			out[name] = null;
			continue;
		}
		const argb = dc.getArgb(scheme);
		out[name] = argbToHex(argb);
	}
	return out;
}
