# gj-submit —— 梗鲸投稿 CLI（给人，也给 AI）

向 [梗鲸 aigengtu.com](https://aigengtu.com)（中英双语 AI meme 表情包图库）投稿的命令行工具。三种用法一套代码：

| 形态 | 适用 | 一行上手 |
| --- | --- | --- |
| **CLI** | 任何人 / 任何能跑 shell 的 AI agent | `npx -y github:the-beating-light-of-the-nail/gj-submit guide` |
| **MCP server** | Claude Code / Cursor 等 MCP 客户端 | `claude mcp add gj-submit -- npx -y github:the-beating-light-of-the-nail/gj-submit mcp` |
| **Agent Skill** | Claude Code / Cursor / Codex 等 75+ agent | `npx skills add the-beating-light-of-the-nail/gj-submit` |

> npm 包 `gj-submit` 发布后短命令 `npx -y gj-submit@latest` 同样可用（更快）；当前 github: 直跑形式无需 npm 账号、始终最新。

## 三条投稿线

```bash
# 1. 图片表情包 → 终审通过入馆藏（/meme/编号）
npx -y github:the-beating-light-of-the-nail/gj-submit image ./表情包.png --quote "图内台词照抄优先" --nickname "作者" --note "出处"

# 2. 人设卡 → 上人设卡页社区区（.md 支持 YAML frontmatter 自动预填）
npx -y github:the-beating-light-of-the-nail/gj-submit persona ./人设卡.md
npx -y github:the-beating-light-of-the-nail/gj-submit persona --title "傲娇深海研究员鲸鱼娘" --prompt "<人设全文>" --tags "傲娇 群聊"

# 3. AI 聊天截图 → 上「鲸言鲸语」瀑布流（真人头像/昵称/群名必须先打码）
npx -y github:the-beating-light-of-the-nail/gj-submit chat ./截图.png --title "一句话概括笑点" --model deepseek --scene qqgroup
```

投稿成功返回编号（`sub_` / `psub_` / `csub_` 前缀）。收录由维护者人工终审，之后回查：

```bash
npx -y github:the-beating-light-of-the-nail/gj-submit status sub_0123456789ab
# → pending（待审）/ approved（已收录）/ rejected（未收录）
```

## 给 AI 的用法

- **标注规范**（收录口径 / 字段怎么填 / 隐私红线 / 限频）：`gj-submit guide` 输出全文，AI 投稿前必读
- **机器可读输出**：任何命令加 `--json`，结果为纯 JSON（含 `ok` / `id` / `message` / 错误语义）
- **MCP 工具集**：`submission_guidelines` / `submit_meme` / `submit_persona` / `submit_chat` / `check_status`
- CLI 会在本地预校验全部约束（魔数 / 大小 / 字数 / 白名单），不浪费服务端限频额度（每 IP 每小时 3 次）

## 选项

```
--api <url>   站点地址（默认 https://aigengtu.com）
--json        机器可读输出
```

## 下载与安装

- **零安装直跑（推荐）**：`npx -y github:the-beating-light-of-the-nail/gj-submit guide`——npx 直接从 GitHub 拉最新版
- npm（发布后）：[gj-submit](https://www.npmjs.com/package/gj-submit)（`npx -y gj-submit@latest`；`npm i -g gj-submit` 装全局）
- 源码 zip：GitHub 页面绿色 **Code → Download ZIP**，解压后 `npm install && npm link`
- 要求 Node ≥ 18（预览图生成依赖 [sharp](https://github.com/lovell/sharp)，安装时自动拉平台二进制）

## 约束速查（服务端口径）

| 线 | 原图 | 必填 | 可选 |
| --- | --- | --- | --- |
| image | ≤10MB jpeg/png/gif/webp | 图片 | quote≤60、nickname≤20、note≤300 |
| persona | .md≤1MB / .zip≤5MB | title≤40 + 正文 500B–100KB | description≤80、tags≤4×12字、author≤20 |
| chat | ≤10MB | title≤40 | model 七选一、scene 五选一、author≤20 |

重复内容（同图 / 同文）会被 SHA-256 / 感知指纹拦截（HTTP 409），不要原样重试。

## License

MIT © [the-beating-light-of-the-nail](https://github.com/the-beating-light-of-the-nail)
