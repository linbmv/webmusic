# CLAUDE.md — music 项目本地准则

## 强制架构事实

- 原站 `https://ios.25pan.com/music` 的首页外层不是音乐 App 本体，而是 Tabos 系统的桌面壳。
- 音乐应用是 `/music` 路由下按需加载的独立 chunk：`MusicView` 动态加载 `FreeMusicApp`。
- 这是后续所有复刻、审查、调试与计划调整的准则级事实；不得再次把原站首页桌面壳当成音乐应用本体来分析或实现。
- 复刻目标应锁定 `FreeMusicApp` 及其相关懒加载 chunk，例如 `RecommendView`、`FreeMusicToplist`、`PlayerBar`、`FullPlayer`、`SettingsView` 等。
- 不得把原站桌面壳、全站导航、登录壳或系统级布局误认为音乐模块的核心 UI。
- 做 1:1 复刻判断时，必须以已下载的音乐 chunk 和 `.claude/context-summary-music-clone.md` 为依据，而不是凭首页第一屏印象推断。

## 对后续开发的约束

- 首版目标是复刻音乐模块本体，不是复刻整个 Tabos 桌面系统。
- 前端结构应优先对应 `FreeMusicApp` 的页面、组件、弹窗和播放器层级。
- 若需要处理外层壳，只保留承载音乐模块所必需的最小容器，不主动扩展桌面系统能力。
- 审查或规划时，如发现把桌面壳当作音乐 App 的设计依据，必须标为方向错误并修正。

## 证据来源

- `.claude/context-summary-music-clone.md`：逆向确认 `/music` 路由、`MusicView`、`FreeMusicApp` 和相关 chunk。
- `.claude/plan/music-clone.md`：当前实施计划，首版为音乐模块 1:1 复刻优先。
