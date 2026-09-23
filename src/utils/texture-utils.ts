/**
 * 背景纹理（纯色模式下叠加在页面上的 SVG mask 图案）
 * 图案与动画实现借鉴自 Shirone (https://github.com/LyraVoid/Shirone) 的 textures.css
 */

export const TEXTURE_PRESETS = [
	"none",
	"starlight",
	"cyber-dots",
	"topography",
	"geometric",
	"sakura",
] as const;

export type TexturePreset = (typeof TEXTURE_PRESETS)[number];

export const TEXTURE_PRESET_KEY = "texturePreset";

/** 面板关闭或越界时的兜底值 */
export const DEFAULT_TEXTURE_PRESET: TexturePreset = "none";

function isValidPreset(value: string | null): value is TexturePreset {
	return (
		!!value && (TEXTURE_PRESETS as readonly string[]).includes(value)
	);
}

export function getStoredTexturePreset(): TexturePreset {
	if (typeof localStorage === "undefined") {
		return DEFAULT_TEXTURE_PRESET;
	}
	const stored = localStorage.getItem(TEXTURE_PRESET_KEY);
	return isValidPreset(stored) ? stored : DEFAULT_TEXTURE_PRESET;
}

/** 把预设写到 <html data-texture-preset>，样式规则见 src/styles/textures.css */
export function applyTexturePresetToDocument(preset: TexturePreset): void {
	if (typeof document === "undefined") {
		return;
	}
	if (preset === "none") {
		document.documentElement.removeAttribute("data-texture-preset");
	} else {
		document.documentElement.dataset.texturePreset = preset;
	}
}

export function setTexturePreset(preset: TexturePreset): void {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(TEXTURE_PRESET_KEY, preset);
	}
	applyTexturePresetToDocument(preset);
}

export function resetTexturePreset(): void {
	if (typeof localStorage !== "undefined") {
		localStorage.removeItem(TEXTURE_PRESET_KEY);
	}
	applyTexturePresetToDocument(DEFAULT_TEXTURE_PRESET);
}
