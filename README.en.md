# Lonely-blog

> A personal blog forked from [Firefly](https://github.com/CuteLeaf/Firefly) `V6.16.8` · Live at: [lonelybing.top](https://lonelybing.top/)

![Node.js >= 22](https://img.shields.io/badge/node.js-%3E%3D22-brightgreen)
![pnpm >= 11](https://img.shields.io/badge/pnpm-%3E%3D11-blue)
![Astro](https://img.shields.io/badge/Astro-7.x-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![Svelte](https://img.shields.io/badge/Svelte-5.x-%23FF3E00)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.x-%2306B6D4)
![Biome](https://img.shields.io/badge/Biome-2.x-%2360A5FA)
![Pagefind](https://img.shields.io/badge/Pagefind-1.x-%234B5563)

## Page Previews

<table width="100%" align="center">
  <tr>
    <td align="center"><img src="./docs/images/1.webp"><br>Banner Mode</td>
    <td align="center"><img src="./docs/images/2.webp"><br>Full-screen Wallpaper Mode (Default)</td>
  </tr>
  <tr>
    <td align="center"><img src="./docs/images/3.webp"><br>Transparent Overlay Mode</td>
    <td align="center"><img src="./docs/images/4.webp"><br>Solid Color Mode</td>
  </tr>
</table>

<img alt="Lighthouse" src="./docs/images/Lighthouse.png" />

> The original theme is [CuteLeaf](https://github.com/CuteLeaf)'s [Firefly](https://github.com/CuteLeaf/Firefly), which itself is based on [saicaca](https://github.com/saicaca)'s [Fuwari](https://github.com/saicaca/fuwari) — they built the engine, I just tuned the handling (lol). Most of the customization process is documented as [blog posts](https://lonelybing.top/), feel free to check them out~

## Overview

A heavily customized fork based on Firefly V6.16.8. Key changes include:

- **Capsule Navbar**: Menu items housed in a capsule container with a sliding indicator that smoothly follows the mouse on hover. Built-in mouse spotlight effect, plus rounded-to-capsule transition animations on hover with press feedback.
- **Hover Profile Card**: Hovering over the site name (top-left) pops up a floating card — avatar / nickname / bio / social links, plus a yearly contribution heatmap (12 months × 5 weeks, color-coded by article publish dates during build), real-time site uptime counter (years/months/days/hours/minutes/seconds, refreshing every second), and month/year progress bars. Clicking the avatar area navigates to the About page.
- **Global Theme Color System**: Built on the `oklch()` color space — a single `hue` variable in `siteConfig.ts` controls the entire site's color scheme. Change one number to shift the whole palette (currently set to cyan-blue, hue 200).
- **Blue Card Borders**: Homepage post cards feature a 1.5px cyan-blue border (`oklch()` adaptive for light/dark mode), adding visual depth against the wallpaper background.
- **Busuanzi Visitor Stats**: Footer shows site-wide PV / UV, article pages show per-post read counts, plus a real-time "Site alive for X days X hours X minutes X seconds" counter (counting from 2026.9.12). All zero-backend implementation.
- **Project Page Comments**: Project showcase page integrates a comment system, each project can toggle comments individually via `comment` field in frontmatter.
- **Full-screen Random Wallpaper + Quotes**: Full-screen wallpaper mode pulls from multiple random image APIs, refreshing on each page load, with a random Chinese quote at the bottom.
- **Online Writing**: Configured with `.pages.yml` (Pages CMS) — write articles and post updates directly from GitHub's web UI.
- **Changelog Page**: Client-side component fetches commit records from the GitHub REST API, with lenient classification (supports multiple Chinese/English commit prefixes for features/fixes/optimizations etc.) and pagination. No rebuild needed to see latest changes. Setting `PUBLIC_CHANGELOG_GITHUB_TOKEN` as a build-time environment variable raises the API rate limit from 60 to 5,000 requests/hour.
- **Personalized Config**: Gallery, sponsor page, live2d widget, comment section, etc. all replaced with custom content and accounts.

Note: This repo is a customization log, not a theme distribution. For the original theme, visit [Firefly](https://github.com/CuteLeaf/Firefly). Documentation at [docs-firefly.cuteleaf.cn](https://docs-firefly.cuteleaf.cn/).

## Common Commands

| Purpose | Command |
|---------|---------|
| Install dependencies | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Preview build output | `pnpm preview` |
| Astro type check | `pnpm check` |
| TypeScript type check | `pnpm type-check` |
| Format code | `pnpm format` |
| Lint + auto-fix | `pnpm lint` |
| New blog post | `pnpm new-post <filename>` |
| Create a memo/update | `pnpm new-d <content>` |
| Regenerate LQIP placeholders | `pnpm lqips` |
| Regenerate GitHub repo cards | `pnpm github-cards` |

Requirements: Node.js ≥ 22.23.0, package manager locked to pnpm (the `preinstall` script runs `only-allow pnpm`, so npm/yarn will be rejected — don't ask how I found out).

`pnpm build` runs a full pipeline: generates GitHub repo card data and LQIP placeholders, then runs the Astro build, followed by live2d asset trimming, font subsetting, inline script compression, and Pagefind indexing.

## Configuration System

All configuration is centralized in `src/config/`, imported via `@/config` (barrel file `index.ts` with unified exports).

| Config File | Purpose |
|-------------|---------|
| `siteConfig.ts` | Core config: language, theme color, page toggles, post list layout, pagination, analytics, image optimization, fonts |
| `sidebarConfig.ts` | Sidebar layout and widget configuration |
| `navBarConfig.ts` | Navbar link configuration (dynamically generated based on page toggles) |
| `profileConfig.ts` | User profile: avatar, nickname, bio, social links |
| `backgroundWallpaper.ts` | Wallpaper mode config (this site uses full-screen random images + quotes, heavily customized) |
| `commentConfig.ts` | Comment system config (Waline/Twikoo/Giscus/Artalk/Disqus) |
| `FooterConfig.html` | Footer HTML injection (includes Busuanzi stats and uptime timer) |
| `musicConfig.ts` | Music player config (Meting API / local music) |
| `pioConfig.ts` | Live2D / Spine widget config |
| `fontConfig.ts` | Custom font config |
| `galleryConfig.ts` | Gallery config |
| `friendsConfig.ts` | Friend links config |
| `sponsorConfig.ts` | Sponsor page config |
| `announcementConfig.ts` | Announcement bar config |
| `dynamicConfig.ts` | Dynamic/memos page config (with Memos data source integration) |
| `changelogConfig.ts` | Changelog config (GitHub repo / branch / pagination / Token) |
| `booknavConfig.ts` | Bookmark navigation config |
| `licenseConfig.ts` | Article license config |
| `coverImageConfig.ts` | Cover image config |
| `expressiveCodeConfig.ts` | Code block rendering config |
| `mermaidConfig.ts` | Mermaid diagram config |
| `plantumlConfig.ts` | PlantUML config |
| `effectsConfig.ts` | Animation effects config |
| `displaySettingsConfig.ts` | Display settings panel config |
| `analyticsConfig.ts` | Analytics config |

## Cover Images & LQIP

The `image` field in article frontmatter supports three formats: relative paths under `src` (optimized at build time via Astro image service, producing multi-format `srcset`), `/`-prefixed `public` assets (referenced as-is), or remote URLs (referenced as-is).

`pnpm build` runs the LQIP generation script first (`scripts/generate-lqips.ts`): shrinks each image to 2×2, extracts corner colors, compresses to 18-character hex stored in `src/constants/lqips.json`. At render time, these are decoded into CSS gradients as placeholder backgrounds — no extra requests. The script is incremental; just rebuild after adding or replacing images, or run `pnpm lqips` separately.

## Deployment Checklist

| Item | Notes |
|------|-------|
| Hosting | Build output `dist/` is a pure static site, deployable to Vercel, Cloudflare Pages, Netlify, Nginx, etc. |
| Comment system | This site uses Giscus, repo pointing to `Bingak/Lonely-blog`, configure in `src/config/commentConfig.ts` |
| Visitor stats | Busuanzi PV/UV and uptime timer are zero-backend solutions, no deployment needed; finer analytics can be added via `siteConfig.ts` analytics settings |
| Content writing | `.pages.yml` configured — write articles online via GitHub web UI with Pages CMS |
| Changelog | Client-side GitHub commit fetching, anonymous rate limit 60 req/hour/IP. For frequent errors, set `PUBLIC_CHANGELOG_GITHUB_TOKEN` as a **build environment variable** (note: must be a Build env var, not a runtime var, since `PUBLIC_*` prefixed variables are inlined into JS at build time) |

## Static Deployment

No server-side dependencies: no Cloudflare Workers, D1, vector databases, etc. Just drop the `dist/` folder to any static hosting platform. This site is currently deployed on a static hosting platform with a custom domain.

## Live2D Copyright Notice

The Live2D model is from Bilibili user [木果阿木果](https://space.bilibili.com/886695)'s Firefly Spine slice data. Usage requires:

- Author's permission must be obtained before use
- Author credit and source must be displayed
- Model design copyright belongs to Kuro Games
- Model may be used for Wuthering Waves related videos and streams (with source credit)
- Commercial use prohibited, re-uploading/redirection for traffic prohibited

## Inspiration Projects

- [Firefly](https://github.com/CuteLeaf/Firefly) — Theme used by this site (customization baseline)
- [fuwari](https://github.com/saicaca/fuwari) — Firefly's upstream template
- [hexo-theme-shoka](https://github.com/amehime/hexo-theme-shoka)
- [astro-koharu](https://github.com/cosZone/astro-koharu)
- [Mizuki](https://github.com/matsuzaka-yuki/Mizuki)

## License

This project is licensed under the [MIT license](https://mit-license.org/), see [LICENSE](./LICENSE) for details.

**Copyright Notices:**

- Copyright (c) 2024 [saicaca](https://github.com/saicaca) - [fuwari](https://github.com/saicaca/fuwari)
- Copyright (c) 2025 [CuteLeaf](https://github.com/CuteLeaf) - [Firefly](https://github.com/CuteLeaf/Firefly)
- Copyright (c) 2026 [LonelyBing](https://github.com/Bingak) - Customizations in this repository

Under the MIT license, you are free to use, modify, and distribute the code, provided the above copyright notices are retained.
